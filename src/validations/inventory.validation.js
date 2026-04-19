const { query, body, param } = require('express-validator');
const { MUTATION_TYPE, OPNAME_STATUS, OPNAME_SCOPE, BATCH_STATUS, EXPIRY_STATUS } = require('../constants');

const mutationTypes = Object.values(MUTATION_TYPE);
const manualMutationTypes = [MUTATION_TYPE.ADJUSTMENT, MUTATION_TYPE.DISPOSAL, MUTATION_TYPE.TRANSFER];
const batchStatuses = Object.values(BATCH_STATUS);
const opnameStatuses = Object.values(OPNAME_STATUS);
const opnameScopes = Object.values(OPNAME_SCOPE);
const expiryStatuses = Object.values(EXPIRY_STATUS);

// ─── Shared ───

const productIdParam = [
  param('productId').isUUID().withMessage('Invalid product ID'),
];

const idParam = [
  param('id').isUUID().withMessage('Invalid ID'),
];

// ─── Stock ───

const getStock = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page harus bilangan positif'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit harus antara 1 dan 100'),
  query('search').optional().trim().isLength({ max: 200 }).withMessage('Search maksimal 200 karakter'),
  query('kategori').optional({ values: 'falsy' }).trim(),
  query('golongan').optional({ values: 'falsy' }).trim(),
  query('stockStatus').optional({ values: 'falsy' }).isIn(['normal', 'low', 'out_of_stock', 'overstock']).withMessage('stockStatus tidak valid'),
  query('sort').optional().trim().isLength({ max: 50 }),
];

const getProductBatches = [
  ...productIdParam,
  query('page').optional().isInt({ min: 1 }).withMessage('Page harus bilangan positif'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit harus antara 1 dan 100'),
  query('status').optional({ values: 'falsy' }).custom((value) => {
    const statuses = value.split(',').map((s) => s.trim());
    const invalid = statuses.filter((s) => !batchStatuses.includes(s));
    if (invalid.length) throw new Error(`Status tidak valid: ${invalid.join(', ')}`);
    return true;
  }),
  query('sort').optional().trim().isLength({ max: 50 }),
];

// ─── Mutations ───

const getMutations = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page harus bilangan positif'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit harus antara 1 dan 100'),
  query('search').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
  query('type').optional({ values: 'falsy' }).custom((value) => {
    const types = value.split(',').map((s) => s.trim());
    const invalid = types.filter((s) => !mutationTypes.includes(s));
    if (invalid.length) throw new Error(`Type tidak valid: ${invalid.join(', ')}`);
    return true;
  }),
  query('productId').optional({ values: 'falsy' }).isUUID().withMessage('Invalid product ID'),
  query('dateFrom').optional({ values: 'falsy' }).isISO8601().withMessage('Format dateFrom tidak valid'),
  query('dateTo').optional({ values: 'falsy' }).isISO8601().withMessage('Format dateTo tidak valid'),
  query('sort').optional().trim().isLength({ max: 50 }),
];

const createMutation = [
  body('type')
    .notEmpty().withMessage('Type wajib diisi')
    .isIn(manualMutationTypes).withMessage(`Type harus salah satu dari: ${manualMutationTypes.join(', ')}`),
  body('productId').notEmpty().withMessage('Product ID wajib diisi').isUUID().withMessage('Invalid product ID'),
  body('batchId').notEmpty().withMessage('Batch ID wajib diisi').isUUID().withMessage('Invalid batch ID'),
  body('quantity').notEmpty().withMessage('Quantity wajib diisi').isNumeric().withMessage('Quantity harus berupa angka'),
  body('reason').notEmpty().withMessage('Alasan wajib diisi untuk mutasi manual').isLength({ max: 500 }),
  body('notes').optional().isLength({ max: 1000 }),
];

// ─── Opname ───

const getOpname = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page harus bilangan positif'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit harus antara 1 dan 100'),
  query('search').optional().trim().isLength({ max: 200 }),
  query('status').optional({ values: 'falsy' }).custom((value) => {
    const statuses = value.split(',').map((s) => s.trim());
    const invalid = statuses.filter((s) => !opnameStatuses.includes(s));
    if (invalid.length) throw new Error(`Status tidak valid: ${invalid.join(', ')}`);
    return true;
  }),
  query('dateFrom').optional({ values: 'falsy' }).isISO8601().withMessage('Format dateFrom tidak valid'),
  query('dateTo').optional({ values: 'falsy' }).isISO8601().withMessage('Format dateTo tidak valid'),
  query('sort').optional().trim().isLength({ max: 50 }),
];

const createOpname = [
  body('opnameDate').notEmpty().withMessage('Tanggal opname wajib diisi').isISO8601().withMessage('Format tanggal tidak valid'),
  body('scope').notEmpty().withMessage('Scope wajib diisi').isIn(opnameScopes).withMessage(`Scope harus: ${opnameScopes.join(', ')}`),
  body('scopeFilter').optional().isObject().withMessage('scopeFilter harus berupa object'),
  body('assignedTo').optional().isUUID().withMessage('Invalid user ID'),
  body('notes').optional().isLength({ max: 1000 }),
];

const updateOpname = [
  ...idParam,
  body('status').optional().isIn([OPNAME_STATUS.IN_PROGRESS]).withMessage('Status hanya bisa diubah ke in_progress'),
  body('items').optional().isArray({ min: 1 }).withMessage('Items harus berupa array'),
  body('items.*.productId').optional().isUUID().withMessage('Invalid product ID'),
  body('items.*.batchId').optional().isUUID().withMessage('Invalid batch ID'),
  body('items.*.actualQty').optional().isInt({ min: 0 }).withMessage('Actual qty harus bilangan positif'),
  body('items.*.notes').optional().isLength({ max: 500 }),
  body('notes').optional().isLength({ max: 1000 }),
];

const finalizeOpname = [
  ...idParam,
  body('notes').optional().isLength({ max: 1000 }),
];

// ─── Kartu Stok ───

const getStockCard = [
  ...productIdParam,
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 200 }),
  query('dateFrom').optional({ values: 'falsy' }).isISO8601(),
  query('dateTo').optional({ values: 'falsy' }).isISO8601(),
  query('type').optional({ values: 'falsy' }).custom((value) => {
    const types = value.split(',').map((s) => s.trim());
    const invalid = types.filter((s) => !mutationTypes.includes(s));
    if (invalid.length) throw new Error(`Type tidak valid: ${invalid.join(', ')}`);
    return true;
  }),
];

// ─── Expired ───

const getExpired = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
  query('search').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
  query('expiryStatus').optional({ values: 'falsy' }).custom((value) => {
    const statuses = value.split(',').map((s) => s.trim());
    const invalid = statuses.filter((s) => !expiryStatuses.includes(s));
    if (invalid.length) throw new Error(`expiryStatus tidak valid: ${invalid.join(', ')}`);
    return true;
  }),
  query('kategori').optional({ values: 'falsy' }).trim(),
  query('storageCondition').optional({ values: 'falsy' }).trim(),
  query('sort').optional().trim().isLength({ max: 50 }),
];

module.exports = {
  productIdParam,
  idParam,
  getStock,
  getProductBatches,
  getMutations,
  createMutation,
  getOpname,
  createOpname,
  updateOpname,
  finalizeOpname,
  getStockCard,
  getExpired,
};


