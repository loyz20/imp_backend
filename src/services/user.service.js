const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { paginate } = require('../helpers');
const config = require('../config');
const MySQLUserService = require('./user.service.mysql');

// ─── Mongo Implementations ───

const mongoGetUsers = async (queryParams) => {
  const { page, limit, search, role, isActive, sort } = queryParams;

  const filter = {};

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  if (role) filter.role = role;

  if (typeof isActive !== 'undefined') {
    filter.isActive = isActive === 'true' || isActive === true;
  }

  return paginate(User, {
    filter,
    page,
    limit,
    sort: sort || '-createdAt',
    select: '-password -refreshToken -passwordResetToken -passwordResetExpires -emailVerificationToken -emailVerificationExpires',
  });
};

const mongoGetUserById = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  return user;
};

const mongoCreateUser = async (userData) => {
  const existing = await User.findOne({ email: userData.email.toLowerCase() });
  if (existing) {
    throw ApiError.conflict('Email already registered');
  }

  const user = await User.create(userData);
  return user;
};

const mongoUpdateUser = async (userId, updateData) => {
  delete updateData.password;
  delete updateData.refreshToken;
  delete updateData.passwordResetToken;
  delete updateData.passwordResetExpires;
  delete updateData.emailVerificationToken;
  delete updateData.emailVerificationExpires;
  delete updateData.loginAttempts;
  delete updateData.lockUntil;

  if (updateData.email) {
    const existing = await User.findOne({
      email: updateData.email.toLowerCase(),
      _id: { $ne: userId },
    });
    if (existing) {
      throw ApiError.conflict('Email already in use by another user');
    }
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: updateData },
    { new: true, runValidators: true },
  );

  if (!user) {
    throw ApiError.notFound('User not found');
  }

  return user;
};

const mongoDeleteUser = async (userId, currentUserId) => {
  if (userId === currentUserId) {
    throw ApiError.badRequest('You cannot delete your own account');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  user.isActive = false;
  user.refreshToken = undefined;
  await user.save({ validateModifiedOnly: true });

  return user;
};

const mongoChangeRole = async (userId, role, currentUserId) => {
  if (userId === currentUserId) {
    throw ApiError.badRequest('You cannot change your own role');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  user.role = role;
  await user.save({ validateModifiedOnly: true });

  return user;
};

const mongoChangeStatus = async (userId, isActive, currentUserId) => {
  if (userId === currentUserId) {
    throw ApiError.badRequest('You cannot change your own status');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  user.isActive = isActive;

  if (!isActive) {
    user.refreshToken = undefined;
  }

  await user.save({ validateModifiedOnly: true });

  return user;
};

const mongoGetUserStats = async () => {
  const [total, active, inactive, roleStats] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ isActive: true }),
    User.countDocuments({ isActive: false }),
    User.aggregate([
      { $group: { _id: '$role', count: { $sum: 1 } } },
    ]),
  ]);

  const byRole = {};
  roleStats.forEach((r) => {
    byRole[r._id] = r.count;
  });

  return { total, active, inactive, byRole };
};

// ─── Exported Functions with Provider Branching ───

const getUsers = async (queryParams) => {
  if (config.dbProvider === 'mysql') {
    return MySQLUserService.getUsers(queryParams);
  }
  return mongoGetUsers(queryParams);
};

const getUserById = async (userId) => {
  if (config.dbProvider === 'mysql') {
    return MySQLUserService.getUserById(userId);
  }
  return mongoGetUserById(userId);
};

const createUser = async (userData) => {
  if (config.dbProvider === 'mysql') {
    return MySQLUserService.createUser(userData);
  }
  return mongoCreateUser(userData);
};

const updateUser = async (userId, updateData) => {
  if (config.dbProvider === 'mysql') {
    return MySQLUserService.updateUser(userId, updateData);
  }
  return mongoUpdateUser(userId, updateData);
};

const deleteUser = async (userId, currentUserId) => {
  if (config.dbProvider === 'mysql') {
    return MySQLUserService.deleteUser(userId, currentUserId);
  }
  return mongoDeleteUser(userId, currentUserId);
};

const changeRole = async (userId, role, currentUserId) => {
  if (config.dbProvider === 'mysql') {
    return MySQLUserService.changeRole(userId, role, currentUserId);
  }
  return mongoChangeRole(userId, role, currentUserId);
};

const changeStatus = async (userId, isActive, currentUserId) => {
  if (config.dbProvider === 'mysql') {
    return MySQLUserService.changeStatus(userId, isActive, currentUserId);
  }
  return mongoChangeStatus(userId, isActive, currentUserId);
};

const getUserStats = async () => {
  if (config.dbProvider === 'mysql') {
    return MySQLUserService.getUserStats();
  }
  return mongoGetUserStats();
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  changeRole,
  changeStatus,
  getUserStats,
};
