const { body, param, query } = require('express-validator');
const { CUSTOMER_TYPES } = require('../constants');

const customerIdParam = [
  param('id').isMongoId().withMessage('Invalid customer ID'),
];

const createCustomer = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Customer name is required')
    .isLength({ min: 2, max: 200 })
    .withMessage('Customer name must be between 2 and 200 characters'),
  body('code')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Code must be max 50 characters'),
  body('type')
    .trim()
    .notEmpty()
    .withMessage('Customer type is required')
    .isIn(CUSTOMER_TYPES)
    .withMessage(`Customer type must be one of: ${CUSTOMER_TYPES.join(', ')}`),
  body('contactPerson')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Contact person must be max 200 characters'),
  body('ownerName')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Owner name must be max 200 characters'),
  body('ownerAddress')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Owner address must be max 500 characters'),
  body('phone')
    .optional()
    .trim()
    .isLength({ max: 30 })
    .withMessage('Phone must be max 30 characters')
    .matches(/^[0-9+\-\s()]*$/)
    .withMessage('Phone must contain only numbers, +, -, spaces, and parentheses'),
  body('address.street')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Street must be max 500 characters'),
  body('address.city')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('City must be max 100 characters'),
  body('address.province')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Province must be max 100 characters'),
  body('izinSarana.number')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Izin Sarana number must be max 100 characters'),
  body('izinSarana.expiryDate')
    .optional()
    .isISO8601()
    .withMessage('Izin Sarana expiry date must be a valid date'),
  body('apoteker.name')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Apoteker name must be max 200 characters'),
  body('apoteker.address')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Apoteker address must be max 500 characters'),
  body('sipa.number')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('SIPA number must be max 100 characters'),
  body('sipa.expiryDate')
    .optional()
    .isISO8601()
    .withMessage('SIPA expiry date must be a valid date'),
  body('paymentTermDays')
    .optional()
    .isInt({ min: 0, max: 365 })
    .withMessage('Payment term must be between 0 and 365 days'),
  body('creditLimit')
    .optional()
    .isFloat({ min: 0, max: 999999999999 })
    .withMessage('Credit limit must be between 0 and 999999999999'),
  body('bankAccount.bankName')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Bank name must be max 100 characters'),
  body('bankAccount.accountNumber')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Account number must be max 50 characters'),
  body('bankAccount.accountName')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Account name must be max 200 characters'),
  body('npwp.number')
    .optional()
    .trim()
    .isLength({ max: 30 })
    .withMessage('NPWP number must be max 30 characters'),
  body('npwp.name')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('NPWP name must be max 200 characters'),
  body('npwp.address')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('NPWP address must be max 500 characters'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes must be max 1000 characters'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
];

const updateCustomer = [
  ...customerIdParam,
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Customer name cannot be empty')
    .isLength({ min: 2, max: 200 })
    .withMessage('Customer name must be between 2 and 200 characters'),
  body('type')
    .optional()
    .trim()
    .isIn(CUSTOMER_TYPES)
    .withMessage(`Customer type must be one of: ${CUSTOMER_TYPES.join(', ')}`),
  body('contactPerson')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Contact person must be max 200 characters'),
  body('ownerName')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Owner name must be max 200 characters'),
  body('ownerAddress')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Owner address must be max 500 characters'),
  body('phone')
    .optional()
    .trim()
    .isLength({ max: 30 })
    .withMessage('Phone must be max 30 characters')
    .matches(/^[0-9+\-\s()]*$/)
    .withMessage('Phone must contain only numbers, +, -, spaces, and parentheses'),
  body('address.street')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Street must be max 500 characters'),
  body('address.city')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('City must be max 100 characters'),
  body('address.province')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Province must be max 100 characters'),
  body('izinSarana.number')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Izin Sarana number must be max 100 characters'),
  body('izinSarana.expiryDate')
    .optional()
    .isISO8601()
    .withMessage('Izin Sarana expiry date must be a valid date'),
  body('apoteker.name')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Apoteker name must be max 200 characters'),
  body('apoteker.address')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Apoteker address must be max 500 characters'),
  body('sipa.number')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('SIPA number must be max 100 characters'),
  body('sipa.expiryDate')
    .optional()
    .isISO8601()
    .withMessage('SIPA expiry date must be a valid date'),
  body('paymentTermDays')
    .optional()
    .isInt({ min: 0, max: 365 })
    .withMessage('Payment term must be between 0 and 365 days'),
  body('creditLimit')
    .optional()
    .isFloat({ min: 0, max: 999999999999 })
    .withMessage('Credit limit must be between 0 and 999999999999'),
  body('bankAccount.bankName')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Bank name must be max 100 characters'),
  body('bankAccount.accountNumber')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Account number must be max 50 characters'),
  body('bankAccount.accountName')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Account name must be max 200 characters'),
  body('npwp.number')
    .optional()
    .trim()
    .isLength({ max: 30 })
    .withMessage('NPWP number must be max 30 characters'),
  body('npwp.name')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('NPWP name must be max 200 characters'),
  body('npwp.address')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('NPWP address must be max 500 characters'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes must be max 1000 characters'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean'),
];

const changeStatus = [
  ...customerIdParam,
  body('isActive')
    .notEmpty()
    .withMessage('isActive is required')
    .isBoolean()
    .withMessage('isActive must be a boolean'),
];

const getCustomers = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('search')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 200 })
    .withMessage('Search query must be max 200 characters'),
  query('type')
    .optional({ values: 'falsy' })
    .isIn(CUSTOMER_TYPES)
    .withMessage(`Type must be one of: ${CUSTOMER_TYPES.join(', ')}`),
  query('city')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 100 })
    .withMessage('City must be max 100 characters'),
  query('isActive')
    .optional({ values: 'falsy' })
    .isIn(['true', 'false'])
    .withMessage('isActive must be true or false'),
  query('sort')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Sort must be max 50 characters'),
];

module.exports = {
  customerIdParam,
  createCustomer,
  updateCustomer,
  changeStatus,
  getCustomers,
};
