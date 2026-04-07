const { body, param, query } = require('express-validator');
const { USER_ROLES } = require('../constants');

const userIdParam = [
  param('id').isMongoId().withMessage('Invalid user ID format'),
];

const getUsers = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('search')
    .optional()
    .isString()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Search query too long'),
  query('role')
    .optional()
    .isIn(Object.values(USER_ROLES))
    .withMessage('Invalid role'),
  query('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be boolean'),
  query('sort')
    .optional()
    .isIn(['createdAt', '-createdAt', 'name', '-name', 'email', '-email'])
    .withMessage('Invalid sort field'),
];

const createUser = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ max: 100 })
    .withMessage('Name must be at most 100 characters'),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .withMessage('Must be a valid email')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage(
      'Password must contain at least one uppercase, one lowercase, and one number',
    ),
  body('role')
    .optional()
    .isIn(Object.values(USER_ROLES))
    .withMessage('Invalid role'),
  body('phone')
    .optional()
    .trim()
    .isMobilePhone('id-ID')
    .withMessage('Must be a valid phone number'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be boolean'),
  body('isEmailVerified')
    .optional()
    .isBoolean()
    .withMessage('isEmailVerified must be boolean'),
];

const updateUser = [
  ...userIdParam,
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Name cannot be empty')
    .isLength({ max: 100 })
    .withMessage('Name must be at most 100 characters'),
  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Must be a valid email')
    .normalizeEmail(),
  body('phone')
    .optional({ values: 'null' })
    .trim()
    .isMobilePhone('id-ID')
    .withMessage('Must be a valid phone number'),
  body('role')
    .optional()
    .isIn(Object.values(USER_ROLES))
    .withMessage('Invalid role'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be boolean'),
  body('isEmailVerified')
    .optional()
    .isBoolean()
    .withMessage('isEmailVerified must be boolean'),
  body('address.street')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Street too long'),
  body('address.city')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('City too long'),
  body('address.province')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Province too long'),
  body('address.postalCode')
    .optional()
    .trim()
    .isPostalCode('ID')
    .withMessage('Invalid postal code'),
  body('address.country')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Country too long'),
];

const changeRole = [
  ...userIdParam,
  body('role')
    .notEmpty()
    .withMessage('Role is required')
    .isIn(Object.values(USER_ROLES))
    .withMessage('Invalid role'),
];

const changeStatus = [
  ...userIdParam,
  body('isActive')
    .notEmpty()
    .withMessage('isActive is required')
    .isBoolean()
    .withMessage('isActive must be boolean'),
];

module.exports = {
  userIdParam,
  getUsers,
  createUser,
  updateUser,
  changeRole,
  changeStatus,
};
