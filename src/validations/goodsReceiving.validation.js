const { body, param, query } = require('express-validator');
const { GR_STATUS, GR_CONDITION_STATUS, GR_STORAGE_CONDITION, SATUAN } = require('../constants');

const grStatuses = Object.values(GR_STATUS);
const conditionStatuses = Object.values(GR_CONDITION_STATUS);
const satuanValues = SATUAN;

const grIdParam = [
  param('id').isMongoId().withMessage('Invalid goods receiving ID'),
];

const createGoodsReceiving = [
  body('purchaseOrderId')
    .optional()
    .isMongoId()
    .withMessage('Invalid purchase order ID'),
  body('supplierId')
    .optional()
    .isMongoId()
    .withMessage('Invalid supplier ID'),
  body('receivingDate')
    .notEmpty()
    .withMessage('Tanggal penerimaan wajib diisi')
    .isISO8601()
    .withMessage('Format tanggal penerimaan tidak valid'),
  body('deliveryNote')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Nomor surat jalan maksimal 100 karakter'),
  body('invoiceNumber')
    .notEmpty()
    .withMessage('Invoice number is required')
    .trim()
    .isLength({ max: 100 })
    .withMessage('Invoice number must be max 100 characters'),
  body('subtotal')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Subtotal harus minimal 0'),
  body('ppnAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('PPN harus minimal 0'),
  body('grandTotal')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Grand total harus minimal 0'),
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
  body('items.*.orderedQty')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Ordered qty harus minimal 0'),
  body('items.*.receivedQty')
    .notEmpty()
    .withMessage('Received qty wajib diisi')
    .isInt({ min: 1, max: 999999 })
    .withMessage('Received qty harus antara 1 dan 999999'),
  body('items.*.unitPrice')
    .notEmpty()
    .withMessage('Unit price wajib diisi')
    .isFloat({ min: 0, max: 999999999999 })
    .withMessage('Unit price harus minimal 0'),
  body('items.*.discount')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Discount harus antara 0 sampai 100'),
  body('items.*.batchNumber')
    .trim()
    .notEmpty()
    .withMessage('Nomor batch wajib diisi (CDOB)')
    .isLength({ min: 1, max: 50 })
    .withMessage('Nomor batch harus antara 1 dan 50 karakter'),
  body('items.*.expiryDate')
    .notEmpty()
    .withMessage('Tanggal kedaluwarsa wajib diisi (CDOB)')
    .isISO8601()
    .withMessage('Format tanggal kedaluwarsa tidak valid'),
  body('items.*.manufacturingDate')
    .optional()
    .isISO8601()
    .withMessage('Format tanggal produksi tidak valid'),
  body('items.*.storageCondition')
    .optional()
    .isIn(GR_STORAGE_CONDITION)
    .withMessage(`Kondisi penyimpanan harus salah satu dari: ${GR_STORAGE_CONDITION.join(', ')}`),
  body('items.*.conditionStatus')
    .optional()
    .isIn(conditionStatuses)
    .withMessage(`Kondisi barang harus salah satu dari: ${conditionStatuses.join(', ')}`),
  body('items.*.notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Catatan item maksimal 500 karakter'),
];

const updateGoodsReceiving = [
  ...grIdParam,
  body('purchaseOrderId')
    .optional()
    .isMongoId()
    .withMessage('Invalid purchase order ID'),
  body('supplierId')
    .optional()
    .isMongoId()
    .withMessage('Invalid supplier ID'),
  body('receivingDate')
    .optional()
    .isISO8601()
    .withMessage('Format tanggal penerimaan tidak valid'),
  body('deliveryNote')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Nomor surat jalan maksimal 100 karakter'),
  body('invoiceNumber')
    .notEmpty()
    .withMessage('Invoice number is required')
    .trim()
    .isLength({ max: 100 })
    .withMessage('Invoice number must be max 100 characters'),
  body('subtotal')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Subtotal harus minimal 0'),
  body('ppnAmount')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('PPN harus minimal 0'),
  body('grandTotal')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Grand total harus minimal 0'),
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
  body('items.*.orderedQty')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Ordered qty harus minimal 0'),
  body('items.*.receivedQty')
    .optional()
    .isInt({ min: 1, max: 999999 })
    .withMessage('Received qty harus antara 1 dan 999999'),
  body('items.*.unitPrice')
    .optional()
    .isFloat({ min: 0, max: 999999999999 })
    .withMessage('Unit price harus minimal 0'),
  body('items.*.discount')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Discount harus antara 0 sampai 100'),
  body('items.*.batchNumber')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Nomor batch harus antara 1 dan 50 karakter'),
  body('items.*.expiryDate')
    .optional()
    .isISO8601()
    .withMessage('Format tanggal kedaluwarsa tidak valid'),
  body('items.*.manufacturingDate')
    .optional()
    .isISO8601()
    .withMessage('Format tanggal produksi tidak valid'),
  body('items.*.storageCondition')
    .optional()
    .isIn(GR_STORAGE_CONDITION)
    .withMessage(`Kondisi penyimpanan harus salah satu dari: ${GR_STORAGE_CONDITION.join(', ')}`),
  body('items.*.conditionStatus')
    .optional()
    .isIn(conditionStatuses)
    .withMessage(`Kondisi barang harus salah satu dari: ${conditionStatuses.join(', ')}`),
  body('items.*.notes')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Catatan item maksimal 500 karakter'),
];

const verify = [
  ...grIdParam,
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Catatan verifikasi maksimal 1000 karakter'),
];

const getGoodsReceivings = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page harus bilangan positif'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit harus antara 1 dan 100'),
  query('search').optional().trim().isLength({ max: 200 }).withMessage('Search maksimal 200 karakter'),
  query('status').optional({ values: 'falsy' }).custom((value) => {
    const statuses = value.split(',').map((s) => s.trim());
    const invalid = statuses.filter((s) => !grStatuses.includes(s));
    if (invalid.length) throw new Error(`Status tidak valid: ${invalid.join(', ')}. Pilihan: ${grStatuses.join(', ')}`);
    return true;
  }),
  query('supplierId').optional().isMongoId().withMessage('Invalid supplier ID'),
  query('dateFrom').optional().isISO8601().withMessage('Format dateFrom tidak valid'),
  query('dateTo').optional().isISO8601().withMessage('Format dateTo tidak valid'),
  query('sort').optional().trim().isLength({ max: 50 }).withMessage('Sort maksimal 50 karakter'),
];

const getAvailablePOs = [
  query('search').optional().trim().isLength({ max: 200 }).withMessage('Search maksimal 200 karakter'),
  query('supplierId').optional().isMongoId().withMessage('Invalid supplier ID'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page harus bilangan positif'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit harus antara 1 dan 100'),
];

module.exports = {
  grIdParam,
  createGoodsReceiving,
  updateGoodsReceiving,
  verify,
  getGoodsReceivings,
  getAvailablePOs,
};
