const { body, param, query } = require('express-validator');
const { PO_STATUS, SATUAN } = require('../constants');

const poStatuses = Object.values(PO_STATUS);
const satuanValues = SATUAN;

const poIdParam = [
  param('id').isMongoId().withMessage('Invalid purchase order ID'),
];

const createPurchaseOrder = [
  body('supplierId')
    .notEmpty()
    .withMessage('Supplier wajib dipilih')
    .isMongoId()
    .withMessage('Invalid supplier ID'),
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
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Catatan maksimal 1000 karakter'),
  body('items')
    .isArray({ min: 1 })
    .withMessage('Minimal 1 item harus ditambahkan'),
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
  body('items.*.notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Catatan item maksimal 500 karakter'),
];

const updatePurchaseOrder = [
  ...poIdParam,
  body('supplierId')
    .optional()
    .isMongoId()
    .withMessage('Invalid supplier ID'),
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
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Catatan maksimal 1000 karakter'),
  body('items')
    .optional()
    .isArray({ min: 1 })
    .withMessage('Minimal 1 item harus ditambahkan'),
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
  body('items.*.notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Catatan item maksimal 500 karakter'),
];

const changeStatus = [
  ...poIdParam,
  body('status')
    .notEmpty()
    .withMessage('Status wajib diisi')
    .isIn(poStatuses)
    .withMessage(`Status harus salah satu dari: ${poStatuses.join(', ')}`),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Catatan maksimal 1000 karakter'),
];

const getPurchaseOrders = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page harus bilangan positif'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit harus antara 1 dan 100'),
  query('search').optional().trim().isLength({ max: 200 }).withMessage('Search maksimal 200 karakter'),
  query('status').optional({ values: 'falsy' }).custom((value) => {
    const statuses = value.split(',').map((s) => s.trim());
    const invalid = statuses.filter((s) => !poStatuses.includes(s));
    if (invalid.length) throw new Error(`Status tidak valid: ${invalid.join(', ')}. Pilihan: ${poStatuses.join(', ')}`);
    return true;
  }),
  query('supplierId').optional().isMongoId().withMessage('Invalid supplier ID'),
  query('dateFrom').optional().isISO8601().withMessage('Format dateFrom tidak valid'),
  query('dateTo').optional().isISO8601().withMessage('Format dateTo tidak valid'),
  query('sort').optional().trim().isLength({ max: 50 }).withMessage('Sort maksimal 50 karakter'),
];

module.exports = {
  poIdParam,
  createPurchaseOrder,
  updatePurchaseOrder,
  changeStatus,
  getPurchaseOrders,
};
