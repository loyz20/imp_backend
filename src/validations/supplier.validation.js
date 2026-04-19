const { body, param, query } = require('express-validator');
const { SUPPLIER_TYPE } = require('../constants');

const supplierTypes = Object.values(SUPPLIER_TYPE);

const supplierIdParam = [
  param('id').isUUID().withMessage('Invalid supplier ID'),
];

const createSupplier = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Supplier name is required')
    .isLength({ min: 2, max: 200 })
    .withMessage('Supplier name must be between 2 and 200 characters'),
  body('code')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Code must be max 50 characters'),
  body('type')
    .trim()
    .notEmpty()
    .withMessage('Supplier type is required')
    .isIn(supplierTypes)
    .withMessage(`Supplier type must be one of: ${supplierTypes.join(', ')}`),
  body('contactPerson')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Contact person must be max 200 characters'),
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
  body('cdobCdakb.number')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('CDOB/CDAKB number must be max 100 characters'),
  body('cdobCdakb.expiryDate')
    .optional()
    .isISO8601()
    .withMessage('CDOB/CDAKB expiry date must be a valid date'),
  body('sipSik.number')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('SIP/SIK number must be max 100 characters'),
  body('sipSik.expiryDate')
    .optional()
    .isISO8601()
    .withMessage('SIP/SIK expiry date must be a valid date'),
  body('paymentTermDays')
    .optional()
    .isInt({ min: 0, max: 365 })
    .withMessage('Payment term must be between 0 and 365 days'),
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
  body('npwp')
    .optional()
    .trim()
    .isLength({ max: 30 })
    .withMessage('NPWP must be max 30 characters'),
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

const updateSupplier = [
  ...supplierIdParam,
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Supplier name cannot be empty')
    .isLength({ min: 2, max: 200 })
    .withMessage('Supplier name must be between 2 and 200 characters'),
  body('type')
    .optional()
    .trim()
    .isIn(supplierTypes)
    .withMessage(`Supplier type must be one of: ${supplierTypes.join(', ')}`),
  body('contactPerson')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Contact person must be max 200 characters'),
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
  body('cdobCdakb.number')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('CDOB/CDAKB number must be max 100 characters'),
  body('cdobCdakb.expiryDate')
    .optional()
    .isISO8601()
    .withMessage('CDOB/CDAKB expiry date must be a valid date'),
  body('sipSik.number')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('SIP/SIK number must be max 100 characters'),
  body('sipSik.expiryDate')
    .optional()
    .isISO8601()
    .withMessage('SIP/SIK expiry date must be a valid date'),
  body('paymentTermDays')
    .optional()
    .isInt({ min: 0, max: 365 })
    .withMessage('Payment term must be between 0 and 365 days'),
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
  body('npwp')
    .optional()
    .trim()
    .isLength({ max: 30 })
    .withMessage('NPWP must be max 30 characters'),
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
  ...supplierIdParam,
  body('isActive')
    .notEmpty()
    .withMessage('isActive is required')
    .isBoolean()
    .withMessage('isActive must be a boolean'),
];

const getSuppliers = [
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
    .trim()
    .isLength({ max: 200 })
    .withMessage('Search query must be max 200 characters'),
  query('type')
    .optional()
    .isIn(supplierTypes)
    .withMessage(`Type must be one of: ${supplierTypes.join(', ')}`),
  query('city')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('City must be max 100 characters'),
  query('isActive')
    .optional()
    .isIn(['true', 'false'])
    .withMessage('isActive must be true or false'),
  query('sort')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Sort must be max 50 characters'),
];

module.exports = {
  supplierIdParam,
  createSupplier,
  updateSupplier,
  changeStatus,
  getSuppliers,
};


