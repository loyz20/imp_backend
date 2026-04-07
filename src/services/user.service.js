const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const { paginate } = require('../helpers');

/**
 * Get paginated list of users with search & filter
 */
const getUsers = async (queryParams) => {
  const { page, limit, search, role, isActive, sort } = queryParams;

  const filter = {};

  // Search by name or email
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

/**
 * Get single user by ID
 */
const getUserById = async (userId) => {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  return user;
};

/**
 * Create a new user (admin)
 */
const createUser = async (userData) => {
  const existing = await User.findOne({ email: userData.email.toLowerCase() });
  if (existing) {
    throw ApiError.conflict('Email already registered');
  }

  const user = await User.create(userData);
  return user;
};

/**
 * Update user by ID (admin)
 */
const updateUser = async (userId, updateData) => {
  // Prevent password update via this method
  delete updateData.password;
  delete updateData.refreshToken;
  delete updateData.passwordResetToken;
  delete updateData.passwordResetExpires;
  delete updateData.emailVerificationToken;
  delete updateData.emailVerificationExpires;
  delete updateData.loginAttempts;
  delete updateData.lockUntil;

  // Check email uniqueness if email is being updated
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

/**
 * Delete user by ID (soft delete: deactivate)
 */
const deleteUser = async (userId, currentUserId) => {
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

/**
 * Change user role
 */
const changeRole = async (userId, role, currentUserId) => {
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

/**
 * Change user active status
 */
const changeStatus = async (userId, isActive, currentUserId) => {
  if (userId === currentUserId) {
    throw ApiError.badRequest('You cannot change your own status');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }

  user.isActive = isActive;

  // If deactivating, invalidate refresh token
  if (!isActive) {
    user.refreshToken = undefined;
  }

  await user.save({ validateModifiedOnly: true });

  return user;
};

/**
 * Get user stats (dashboard)
 */
const getUserStats = async () => {
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
