const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const config = require('../config');
const MySQLAuthService = require('./auth.service.mysql');

// ─── Token Generation ───

const generateTokens = (userId, role) => {
  const accessToken = jwt.sign({ id: userId, role }, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
  const refreshToken = jwt.sign({ id: userId, role }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
  });
  return { accessToken, refreshToken };
};

// ─── Mongo Implementations ───

const mongoRegister = async ({ name, email, password }) => {
  const existingUser = await User.findByEmail(email);
  if (existingUser) {
    throw ApiError.conflict('Email already registered');
  }

  const user = await User.create({ name, email, password });
  const tokens = generateTokens(user._id, user.role);

  user.refreshToken = tokens.refreshToken;
  const emailVerificationToken = user.createEmailVerificationToken();
  await user.save({ validateBeforeSave: false });

  return { user, tokens, emailVerificationToken };
};

const mongoLogin = async ({ email, password, ip }) => {
  const user = await User.findOne({ email }).select(
    '+password +loginAttempts +lockUntil +refreshToken',
  );

  if (!user) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  if (user.isLocked) {
    throw ApiError.forbidden(
      'Account is temporarily locked due to too many failed login attempts. Please try again later.',
    );
  }

  if (!user.isActive) {
    throw ApiError.forbidden('Your account has been deactivated. Please contact support.');
  }

  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    await user.incrementLoginAttempts();
    throw ApiError.unauthorized('Invalid email or password');
  }

  await user.resetLoginAttempts();
  const tokens = generateTokens(user._id, user.role);

  user.refreshToken = tokens.refreshToken;
  user.lastLoginAt = new Date();
  user.lastLoginIp = ip;
  await user.save({ validateBeforeSave: false });

  return { user, tokens };
};

const mongoLogout = async (userId) => {
  await User.findByIdAndUpdate(userId, {
    $unset: { refreshToken: 1 },
  });
};

const mongoRefreshToken = async (token) => {
  let decoded;
  try {
    decoded = jwt.verify(token, config.jwt.refreshSecret);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const user = await User.findById(decoded.id).select('+refreshToken');
  if (!user) {
    throw ApiError.unauthorized('User not found');
  }

  if (user.refreshToken !== token) {
    user.refreshToken = undefined;
    await user.save({ validateBeforeSave: false });
    throw ApiError.unauthorized('Token reuse detected. Please login again.');
  }

  const tokens = generateTokens(user._id, user.role);
  user.refreshToken = tokens.refreshToken;
  await user.save({ validateBeforeSave: false });

  return tokens;
};

const mongoGetMe = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  return user;
};

const mongoUpdateProfile = async (userId, updateData) => {
  const allowedFields = ['name', 'phone', 'address'];
  const filteredData = {};

  for (const key of allowedFields) {
    if (updateData[key] !== undefined) {
      filteredData[key] = updateData[key];
    }
  }

  const user = await User.findByIdAndUpdate(userId, filteredData, {
    new: true,
    runValidators: true,
  });

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  return user;
};

const mongoChangePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await User.findById(userId).select('+password');
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    throw ApiError.badRequest('Current password is incorrect');
  }

  user.password = newPassword;
  user.refreshToken = undefined;
  await user.save();

  const tokens = generateTokens(user._id, user.role);
  user.refreshToken = tokens.refreshToken;
  await user.save({ validateBeforeSave: false });

  return tokens;
};

const mongoForgotPassword = async (email) => {
  const user = await User.findByEmail(email);
  if (!user) {
    return null;
  }

  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  return { resetToken, user };
};

const mongoResetPassword = async (token, newPassword) => {
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw ApiError.badRequest('Token is invalid or has expired');
  }

  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  user.refreshToken = undefined;
  await user.save();

  return user;
};

const mongoVerifyEmail = async (token) => {
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');

  const user = await User.findOne({
    emailVerificationToken: hashedToken,
    emailVerificationExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw ApiError.badRequest('Verification token is invalid or has expired');
  }

  user.isEmailVerified = true;
  user.emailVerificationToken = undefined;
  user.emailVerificationExpires = undefined;
  await user.save({ validateBeforeSave: false });

  return user;
};

const mongoResendEmailVerification = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  if (user.isEmailVerified) {
    throw ApiError.badRequest('Email is already verified');
  }

  const emailVerificationToken = user.createEmailVerificationToken();
  await user.save({ validateBeforeSave: false });

  return { emailVerificationToken, user };
};

// ─── Exported Functions with Provider Branching ───

const register = async (data) => {
  if (config.dbProvider === 'mysql') {
    return MySQLAuthService.register(data);
  }
  return mongoRegister(data);
};

const login = async (data) => {
  if (config.dbProvider === 'mysql') {
    return MySQLAuthService.login(data);
  }
  return mongoLogin(data);
};

const logout = async (userId) => {
  if (config.dbProvider === 'mysql') {
    return MySQLAuthService.logout(userId);
  }
  return mongoLogout(userId);
};

const refreshToken = async (token) => {
  if (config.dbProvider === 'mysql') {
    return MySQLAuthService.refreshToken(token);
  }
  return mongoRefreshToken(token);
};

const getMe = async (userId) => {
  if (config.dbProvider === 'mysql') {
    return MySQLAuthService.getMe(userId);
  }
  return mongoGetMe(userId);
};

const updateProfile = async (userId, updateData) => {
  if (config.dbProvider === 'mysql') {
    return MySQLAuthService.updateProfile(userId, updateData);
  }
  return mongoUpdateProfile(userId, updateData);
};

const changePassword = async (userId, data) => {
  if (config.dbProvider === 'mysql') {
    return MySQLAuthService.changePassword(userId, data);
  }
  return mongoChangePassword(userId, data);
};

const forgotPassword = async (email) => {
  if (config.dbProvider === 'mysql') {
    return MySQLAuthService.forgotPassword(email);
  }
  return mongoForgotPassword(email);
};

const resetPassword = async (token, newPassword) => {
  if (config.dbProvider === 'mysql') {
    return MySQLAuthService.resetPassword(token, newPassword);
  }
  return mongoResetPassword(token, newPassword);
};

const verifyEmail = async (token) => {
  if (config.dbProvider === 'mysql') {
    return MySQLAuthService.verifyEmail(token);
  }
  return mongoVerifyEmail(token);
};

const resendEmailVerification = async (userId) => {
  if (config.dbProvider === 'mysql') {
    return MySQLAuthService.resendEmailVerification(userId);
  }
  return mongoResendEmailVerification(userId);
};

module.exports = {
  register,
  login,
  logout,
  refreshToken,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  resendEmailVerification,
};
