const { body, param, query } = require('express-validator');
const {
  RETURN_STATUS,
  RETURN_TYPE,
  RETURN_REASONS,
  ITEM_CONDITION,
  DISPOSITION,
  SATUAN,
} = require('../constants');

const returnStatuses = Object.values(RETURN_STATUS);
const returnTypes = Object.values(RETURN_TYPE);
const itemConditions = Object.values(ITEM_CONDITION);
const dispositions = Object.values(DISPOSITION);
const satuanValues = SATUAN;

const returnIdParam = [
  param('id').isMongoId().withMessage('Invalid return ID'),
];

const createReturn = [
  body('returnNumber')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Return number must be max 50 characters'),
  body('returnType')
    .notEmpty()
    .withMessage('Tipe retur wajib dipilih')
    .isIn(returnTypes)
    .withMessage(`Tipe retur harus salah satu dari: ${returnTypes.join(', ')}`),
    body('customerId')
    .optional()
    .isMongoId()
    .withMessage('Invalid customer ID'),
  body('supplierId')
    .optional()
    .isMongoId()
    .withMessage('Invalid supplier ID'),
  body('returnDate')
    .notEmpty()
    .withMessage('Tanggal retur wajib diisi')
    .isISO8601()
    .withMessage('Format tanggal retur tidak valid'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Alasan retur maksimal 500 karakter'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Catatan maksimal 1000 karakter'),

  // Items
  body('items')
    .isArray({ min: 1 })
    .withMessage('Minimal 1 item retur harus ditambahkan'),
  body('items.*.productId')
    .optional()
    .isMongoId()
    .withMessage('Invalid product ID'),
  body('items.*.satuan')
    .notEmpty()
    .withMessage('Satuan wajib diisi')
    .isIn(satuanValues)
    .withMessage(`Satuan harus salah satu dari: ${satuanValues.join(', ')}`),
  body('items.*.quantityReturned')
    .notEmpty()
    .withMessage('Jumlah retur wajib diisi')
    .isInt({ min: 1 })
    .withMessage('Jumlah retur minimal 1'),
  body('items.*.batchNumber')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Batch number maksimal 50 karakter'),
  body('items.*.expiryDate')
    .optional()
    .isISO8601()
    .withMessage('Format expiry date tidak valid'),
  body('items.*.condition')
    .notEmpty()
    .withMessage('Kondisi item wajib diisi')
    .isIn(itemConditions)
    .withMessage(`Kondisi harus salah satu dari: ${itemConditions.join(', ')}`),
  body('items.*.returnReason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Alasan item maksimal 500 karakter'),
  body('items.*.notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Catatan item maksimal 500 karakter'),
];

const updateReturn = [
  param('id').isMongoId().withMessage('Invalid return ID'),
  body('returnNumber')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Return number must be max 50 characters'),
  body('returnDate')
    .optional()
    .isISO8601()
    .withMessage('Format tanggal retur tidak valid'),
  body('reason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Alasan retur maksimal 500 karakter'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Catatan maksimal 1000 karakter'),
  body('supplierId')
    .optional()
    .isMongoId()
    .withMessage('Invalid supplier ID'),

  // Items (optional on update)
  body('items')
    .optional()
    .isArray({ min: 1 })
    .withMessage('Minimal 1 item retur harus ditambahkan'),
  body('items.*.productId')
    .optional()
    .isMongoId()
    .withMessage('Invalid product ID'),
  body('items.*.satuan')
    .optional()
    .isIn(satuanValues)
    .withMessage(`Satuan harus salah satu dari: ${satuanValues.join(', ')}`),
  body('items.*.quantityReturned')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Jumlah retur minimal 1'),
  body('items.*.batchNumber')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Batch number maksimal 50 karakter'),
  body('items.*.expiryDate')
    .optional()
    .isISO8601()
    .withMessage('Format expiry date tidak valid'),
  body('items.*.condition')
    .optional()
    .isIn(itemConditions)
    .withMessage(`Kondisi harus salah satu dari: ${itemConditions.join(', ')}`),
  body('items.*.returnReason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Alasan item maksimal 500 karakter'),
  body('items.*.disposition')
    .optional()
    .isIn(dispositions)
    .withMessage(`Disposisi harus salah satu dari: ${dispositions.join(', ')}`),
  body('items.*.dispositionNotes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Catatan disposisi maksimal 500 karakter'),
  body('items.*.notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Catatan item maksimal 500 karakter'),
];

const changeStatus = [
  param('id').isMongoId().withMessage('Invalid return ID'),
  body('status')
    .notEmpty()
    .withMessage('Status wajib diisi')
    .isIn(returnStatuses)
    .withMessage(`Status harus salah satu dari: ${returnStatuses.join(', ')}`),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Catatan maksimal 1000 karakter'),
];

const getReturns = [
  query('page')
    .optional({ values: 'falsy' })
    .isInt({ min: 1 })
    .withMessage('Page harus bilangan bulat positif'),
  query('limit')
    .optional({ values: 'falsy' })
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit harus antara 1-100'),
  query('search')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 100 })
    .withMessage('Search maksimal 100 karakter'),
  query('status')
    .optional({ values: 'falsy' })
    .trim(),
  query('returnType')
    .optional({ values: 'falsy' })
    .isIn(returnTypes)
    .withMessage(`Tipe retur harus salah satu dari: ${returnTypes.join(', ')}`),
  query('customerId')
    .optional({ values: 'falsy' })
    .isMongoId()
    .withMessage('Invalid customer ID'),
  query('supplierId')
    .optional({ values: 'falsy' })
    .isMongoId()
    .withMessage('Invalid supplier ID'),
  query('dateFrom')
    .optional({ values: 'falsy' })
    .isISO8601()
    .withMessage('Format dateFrom tidak valid'),
  query('dateTo')
    .optional({ values: 'falsy' })
    .isISO8601()
    .withMessage('Format dateTo tidak valid'),
  query('sort')
    .optional({ values: 'falsy' })
    .trim(),
];

module.exports = {
  returnIdParam,
  createReturn,
  updateReturn,
  changeStatus,
  getReturns,
};
