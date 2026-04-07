const { body, param, query } = require('express-validator');
const { SO_STATUS, SATUAN } = require('../constants');

const soStatuses = Object.values(SO_STATUS);
const satuanValues = SATUAN;

const soIdParam = [
  param('id').isMongoId().withMessage('Invalid sales order ID'),
];

const createSalesOrder = [
  body('invoiceNumber')
    .notEmpty()
    .withMessage('Invoice number is required')
    .trim()
    .isLength({ max: 100 })
    .withMessage('Invoice number must be max 100 characters'),
  body('customerId')
    .notEmpty()
    .withMessage('Customer wajib dipilih')
    .isMongoId()
    .withMessage('Invalid customer ID'),
  body('orderDate')
    .notEmpty()
    .withMessage('Tanggal order wajib diisi')
    .isISO8601()
    .withMessage('Format tanggal order tidak valid'),
  body('expectedDeliveryDate')
    .optional()
    .isISO8601()
    .withMessage('Format tanggal pengiriman tidak valid'),
  body('paymentTermDays')
    .optional()
    .isInt({ min: 0, max: 365 })
    .withMessage('Payment term harus antara 0 dan 365 hari'),
  body('shippingAddress')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Alamat pengiriman maksimal 500 karakter'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Catatan maksimal 1000 karakter'),
  body('items')
    .isArray({ min: 1 })
    .withMessage('Minimal 1 item harus ditambahkan'),
  body('items')
    .custom((items) => {
      for (const item of items) {
        if (!Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1) {
          throw new Error('Setiap item harus memiliki quantity minimal 1');
        }
      }
      return true;
    }),
  body('items.*.productId')
    .notEmpty()
    .withMessage('Product wajib dipilih')
    .isMongoId()
    .withMessage('Invalid product ID'),
  body('items.*.satuan')
    .notEmpty()
    .withMessage('Satuan wajib diisi')
    .isIn(satuanValues)
    .withMessage(`Satuan harus salah satu dari: ${satuanValues.join(', ')}`),
  body('items.*.quantity')
    .notEmpty()
    .withMessage('Quantity wajib diisi')
    .isInt({ min: 1, max: 999999 })
    .withMessage('Quantity harus antara 1 dan 999999'),
  body('items.*.unitPrice')
    .notEmpty()
    .withMessage('Harga satuan wajib diisi')
    .isFloat({ min: 0, max: 999999999 })
    .withMessage('Harga satuan harus antara 0 dan 999999999'),
  body('items.*.discount')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Diskon harus antara 0 dan 100'),
  body('items.*.batchNumber')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Batch number maksimal 50 karakter'),
  body('items.*.expiryDate')
    .optional()
    .isISO8601()
    .withMessage('Format expiry date tidak valid'),
  body('items.*.notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Catatan item maksimal 500 karakter'),
];

const updateSalesOrder = [
  ...soIdParam,
  body('invoiceNumber')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Invoice number must be max 100 characters'),
  body('customerId')
    .optional()
    .isMongoId()
    .withMessage('Invalid customer ID'),
  body('orderDate')
    .optional()
    .isISO8601()
    .withMessage('Format tanggal order tidak valid'),
  body('expectedDeliveryDate')
    .optional()
    .isISO8601()
    .withMessage('Format tanggal pengiriman tidak valid'),
  body('paymentTermDays')
    .optional()
    .isInt({ min: 0, max: 365 })
    .withMessage('Payment term harus antara 0 dan 365 hari'),
  body('shippingAddress')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Alamat pengiriman maksimal 500 karakter'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Catatan maksimal 1000 karakter'),
  body('items')
    .optional()
    .isArray({ min: 1 })
    .withMessage('Minimal 1 item harus ditambahkan'),
  body('items')
    .optional()
    .custom((items) => {
      for (const item of items) {
        if (!Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1) {
          throw new Error('Setiap item harus memiliki quantity minimal 1');
        }
      }
      return true;
    }),
  body('items.*.productId')
    .optional()
    .isMongoId()
    .withMessage('Invalid product ID'),
  body('items.*.satuan')
    .optional()
    .isIn(satuanValues)
    .withMessage(`Satuan harus salah satu dari: ${satuanValues.join(', ')}`),
  body('items.*.quantity')
    .optional()
    .isInt({ min: 1, max: 999999 })
    .withMessage('Quantity harus antara 1 dan 999999'),
  body('items.*.unitPrice')
    .optional()
    .isFloat({ min: 0, max: 999999999 })
    .withMessage('Harga satuan harus antara 0 dan 999999999'),
  body('items.*.discount')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Diskon harus antara 0 dan 100'),
  body('items.*.batchNumber')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Batch number maksimal 50 karakter'),
  body('items.*.expiryDate')
    .optional()
    .isISO8601()
    .withMessage('Format expiry date tidak valid'),
  body('items.*.notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Catatan item maksimal 500 karakter'),
];

const changeStatus = [
  ...soIdParam,
  body('status')
    .notEmpty()
    .withMessage('Status wajib diisi')
    .isIn(soStatuses)
    .withMessage(`Status harus salah satu dari: ${soStatuses.join(', ')}`),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Catatan maksimal 1000 karakter'),
];

const getSalesOrders = [
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
  query('status')
    .optional({ values: 'falsy' })
    .custom((value) => {
      const statuses = value.split(',').map((s) => s.trim());
      const invalid = statuses.filter((s) => !soStatuses.includes(s));
      if (invalid.length) throw new Error(`Status tidak valid: ${invalid.join(', ')}`);
      return true;
    }),
  query('customerId')
    .optional({ values: 'falsy' })
    .isMongoId()
    .withMessage('Invalid customer ID'),
  query('dateFrom')
    .optional({ values: 'falsy' })
    .isISO8601()
    .withMessage('Format dateFrom tidak valid'),
  query('dateTo')
    .optional({ values: 'falsy' })
    .isISO8601()
    .withMessage('Format dateTo tidak valid'),
  query('sort')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Sort must be max 50 characters'),
];

module.exports = {
  soIdParam,
  createSalesOrder,
  updateSalesOrder,
  changeStatus,
  getSalesOrders,
};
