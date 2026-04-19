const { body, param, query } = require('express-validator');
const { SP_TYPE, SP_STATUS, EREPORT_STATUS } = require('../constants');

const spTypes = Object.values(SP_TYPE);
const spStatuses = Object.values(SP_STATUS);
const ereportStatuses = Object.values(EREPORT_STATUS);

// ═══════════════════════════════════════════════════════════════
// ─── SURAT PESANAN KHUSUS ───
// ═══════════════════════════════════════════════════════════════

const getSPList = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('type')
    .optional()
    .isIn(spTypes)
    .withMessage(`Type must be one of: ${spTypes.join(', ')}`),
  query('status')
    .optional()
    .isIn(spStatuses)
    .withMessage(`Status must be one of: ${spStatuses.join(', ')}`),
  query('search')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Search must be max 100 characters'),
];

const createSP = [
  body('type')
    .trim()
    .notEmpty()
    .withMessage('Type is required')
    .isIn(spTypes)
    .withMessage(`Type must be one of: ${spTypes.join(', ')}`),
  body('supplier')
    .notEmpty()
    .withMessage('Supplier is required')
    .isUUID()
    .withMessage('Invalid supplier ID'),
  body('items')
    .isArray({ min: 1 })
    .withMessage('Minimal 1 item diperlukan'),
  body('items.*.product')
    .notEmpty()
    .withMessage('Product is required')
    .isUUID()
    .withMessage('Invalid product ID'),
  body('items.*.qty')
    .notEmpty()
    .withMessage('Quantity is required')
    .isInt({ min: 1 })
    .withMessage('Quantity must be at least 1'),
  body('items.*.unit')
    .trim()
    .notEmpty()
    .withMessage('Unit is required')
    .isLength({ max: 50 })
    .withMessage('Unit must be max 50 characters'),
  body('validUntil')
    .notEmpty()
    .withMessage('Valid until date is required')
    .isISO8601()
    .withMessage('Valid until must be a valid date'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Notes must be max 1000 characters'),
];

const spIdParam = [
  param('id').isUUID().withMessage('Invalid SP ID'),
];

const updateSPStatus = [
  ...spIdParam,
  body('status')
    .trim()
    .notEmpty()
    .withMessage('Status is required')
    .isIn(spStatuses)
    .withMessage(`Status must be one of: ${spStatuses.join(', ')}`),
  body('rejectReason')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Reject reason must be max 500 characters'),
];

// ═══════════════════════════════════════════════════════════════
// ─── E-REPORT BPOM ───
// ═══════════════════════════════════════════════════════════════

const getEReports = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('type')
    .optional()
    .isIn(spTypes)
    .withMessage(`Type must be one of: ${spTypes.join(', ')}`),
  query('status')
    .optional()
    .isIn(ereportStatuses)
    .withMessage(`Status must be one of: ${ereportStatuses.join(', ')}`),
];

const generateEReport = [
  body('period')
    .trim()
    .notEmpty()
    .withMessage('Period is required')
    .matches(/^\d{4}-\d{2}$/)
    .withMessage('Period must be in YYYY-MM format'),
  body('type')
    .trim()
    .notEmpty()
    .withMessage('Type is required')
    .isIn(spTypes)
    .withMessage(`Type must be one of: ${spTypes.join(', ')}`),
];

const ereportIdParam = [
  param('id').isUUID().withMessage('Invalid e-Report ID'),
];

// ═══════════════════════════════════════════════════════════════
// ─── DOKUMEN PERIZINAN ───
// ═══════════════════════════════════════════════════════════════

const docIdParam = [
  param('id').isUUID().withMessage('Invalid document ID'),
];

module.exports = {
  getSPList,
  createSP,
  spIdParam,
  updateSPStatus,
  getEReports,
  generateEReport,
  ereportIdParam,
  docIdParam,
};


