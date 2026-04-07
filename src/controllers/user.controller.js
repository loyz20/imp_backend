const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/ApiResponse');
const userService = require('../services/user.service');

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Get all users (paginated)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 100 }
 *       - in: query
 *         name: search
 *         schema: { type: string }
 *         description: Search by name or email
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: [admin, user] }
 *       - in: query
 *         name: isActive
 *         schema: { type: boolean }
 *       - in: query
 *         name: sort
 *         schema: { type: string, enum: [createdAt, -createdAt, name, -name, email, -email] }
 *     responses:
 *       200:
 *         description: Users retrieved
 */
const getUsers = catchAsync(async (req, res) => {
  const result = await userService.getUsers(req.query);

  return ApiResponse.success(res, {
    message: 'Users retrieved successfully',
    data: result.docs,
    meta: result.pagination,
  });
});

/**
 * @swagger
 * /users/stats:
 *   get:
 *     summary: Get user statistics
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: User stats retrieved
 */
const getUserStats = catchAsync(async (req, res) => {
  const stats = await userService.getUserStats();

  return ApiResponse.success(res, {
    message: 'User statistics retrieved',
    data: stats,
  });
});

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User retrieved
 *       404:
 *         description: User not found
 */
const getUserById = catchAsync(async (req, res) => {
  const user = await userService.getUserById(req.params.id);

  return ApiResponse.success(res, {
    message: 'User retrieved successfully',
    data: user,
  });
});

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Create a new user (admin)
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *               password: { type: string }
 *               role: { type: string, enum: [admin, user] }
 *               phone: { type: string }
 *               isActive: { type: boolean }
 *               isEmailVerified: { type: boolean }
 *     responses:
 *       201:
 *         description: User created
 *       409:
 *         description: Email already exists
 */
const createUser = catchAsync(async (req, res) => {
  const user = await userService.createUser(req.body);

  return ApiResponse.created(res, {
    message: 'User created successfully',
    data: user,
  });
});

/**
 * @swagger
 * /users/{id}:
 *   put:
 *     summary: Update user by ID
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *               phone: { type: string }
 *               role: { type: string, enum: [admin, user] }
 *               isActive: { type: boolean }
 *               isEmailVerified: { type: boolean }
 *               address: { type: object }
 *     responses:
 *       200:
 *         description: User updated
 *       404:
 *         description: User not found
 *       409:
 *         description: Email already in use
 */
const updateUser = catchAsync(async (req, res) => {
  const user = await userService.updateUser(req.params.id, req.body);

  return ApiResponse.success(res, {
    message: 'User updated successfully',
    data: user,
  });
});

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Delete (deactivate) user
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User deactivated
 *       400:
 *         description: Cannot delete own account
 *       404:
 *         description: User not found
 */
const deleteUser = catchAsync(async (req, res) => {
  await userService.deleteUser(req.params.id, req.user.id);

  return ApiResponse.success(res, {
    message: 'User deactivated successfully',
  });
});

/**
 * @swagger
 * /users/{id}/role:
 *   patch:
 *     summary: Change user role
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role]
 *             properties:
 *               role: { type: string, enum: [admin, user] }
 *     responses:
 *       200:
 *         description: Role updated
 *       400:
 *         description: Cannot change own role
 */
const changeRole = catchAsync(async (req, res) => {
  const user = await userService.changeRole(
    req.params.id,
    req.body.role,
    req.user.id,
  );

  return ApiResponse.success(res, {
    message: 'User role updated successfully',
    data: user,
  });
});

/**
 * @swagger
 * /users/{id}/status:
 *   patch:
 *     summary: Change user active status
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [isActive]
 *             properties:
 *               isActive: { type: boolean }
 *     responses:
 *       200:
 *         description: Status updated
 *       400:
 *         description: Cannot change own status
 */
const changeStatus = catchAsync(async (req, res) => {
  const user = await userService.changeStatus(
    req.params.id,
    req.body.isActive,
    req.user.id,
  );

  return ApiResponse.success(res, {
    message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully`,
    data: user,
  });
});

module.exports = {
  getUsers,
  getUserStats,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  changeRole,
  changeStatus,
};
