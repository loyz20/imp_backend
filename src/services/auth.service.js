const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const config = require('../config');

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

// ─── Register ───

const register = async ({ name, email, password }) => {
  const existingUser = await User.findByEmail(email);
  if (existingUser) {
    throw ApiError.conflict('Email already registered');
  }

  const user = await User.create({ name, email, password });
  const tokens = generateTokens(user._id, user.role);

  // Store refresh token
  user.refreshToken = tokens.refreshToken;
  const emailVerificationToken = user.createEmailVerificationToken();
  await user.save({ validateBeforeSave: false });

  return {
    user,
    tokens,
    emailVerificationToken,
  };
};

// ─── Login ───

const login = async ({ email, password, ip }) => {
  const user = await User.findOne({ email }).select(
    '+password +loginAttempts +lockUntil +refreshToken',
  );

  if (!user) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  // Check if account is locked
  if (user.isLocked) {
    throw ApiError.forbidden(
      'Account is temporarily locked due to too many failed login attempts. Please try again later.',
    );
  }

  // Check if account is active
  if (!user.isActive) {
    throw ApiError.forbidden('Your account has been deactivated. Please contact support.');
  }

  // Verify password
  const isPasswordValid = await user.comparePassword(password);
  if (!isPasswordValid) {
    await user.incrementLoginAttempts();
    throw ApiError.unauthorized('Invalid email or password');
  }

  // Reset login attempts on successful login
  await user.resetLoginAttempts();

  // Generate tokens
  const tokens = generateTokens(user._id, user.role);

  // Update login tracking
  user.refreshToken = tokens.refreshToken;
  user.lastLoginAt = new Date();
  user.lastLoginIp = ip;
  await user.save({ validateBeforeSave: false });

  return { user, tokens };
};

// ─── Logout ───

const logout = async (userId) => {
  await User.findByIdAndUpdate(userId, {
    $unset: { refreshToken: 1 },
  });
};

// ─── Refresh Token ───

const refreshToken = async (token) => {
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

  // Verify that the refresh token matches stored token (token rotation)
  if (user.refreshToken !== token) {
    // Possible token reuse attack — clear all tokens
    user.refreshToken = undefined;
    await user.save({ validateBeforeSave: false });
    throw ApiError.unauthorized('Token reuse detected. Please login again.');
  }

  const tokens = generateTokens(user._id, user.role);

  // Rotate refresh token
  user.refreshToken = tokens.refreshToken;
  await user.save({ validateBeforeSave: false });

  return tokens;
};

// ─── Get Me ───

const getMe = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  return user;
};

// ─── Update Profile ───

const updateProfile = async (userId, updateData) => {
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

// ─── Change Password ───

const changePassword = async (userId, { currentPassword, newPassword }) => {
  const user = await User.findById(userId).select('+password');
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    throw ApiError.badRequest('Current password is incorrect');
  }

  user.password = newPassword;
  user.refreshToken = undefined; // Invalidate all sessions
  await user.save();

  const tokens = generateTokens(user._id, user.role);
  user.refreshToken = tokens.refreshToken;
  await user.save({ validateBeforeSave: false });

  return tokens;
};

// ─── Forgot Password ───

const forgotPassword = async (email) => {
  const user = await User.findByEmail(email);
  if (!user) {
    // Don't reveal whether user exists
    return null;
  }

  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  // Return the plain token — controller/caller is responsible for sending email
  return { resetToken, user };
};

// ─── Reset Password ───

const resetPassword = async (token, newPassword) => {
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
  user.refreshToken = undefined; // Invalidate all sessions
  await user.save();

  return user;
};

// ─── Verify Email ───

const verifyEmail = async (token) => {
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

// ─── Resend Email Verification ───

const resendEmailVerification = async (userId) => {
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
