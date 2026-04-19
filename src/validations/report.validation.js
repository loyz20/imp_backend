const { query } = require('express-validator');
const {
  SO_STATUS,
  PO_STATUS,
  PRODUCT_CATEGORY,
  GOLONGAN_OBAT,
} = require('../constants');

// ─── Common validators ───

const periodValidator = query('period')
  .optional({ values: 'falsy' })
  .isIn(['daily', 'weekly', 'monthly', 'yearly', 'custom'])
  .withMessage('Period harus daily, weekly, monthly, yearly, atau custom');

const dateFromValidator = query('dateFrom')
  .optional({ values: 'falsy' })
  .isISO8601()
  .withMessage('dateFrom harus format ISO date (YYYY-MM-DD)');

const dateToValidator = query('dateTo')
  .optional({ values: 'falsy' })
  .isISO8601()
  .withMessage('dateTo harus format ISO date (YYYY-MM-DD)');

const pageValidator = query('page')
  .optional({ values: 'falsy' })
  .isInt({ min: 1 })
  .withMessage('Page harus angka positif');

const limitValidator = query('limit')
  .optional({ values: 'falsy' })
  .isInt({ min: 1, max: 100 })
  .withMessage('Limit harus antara 1-100');

const searchValidator = query('search')
  .optional({ values: 'falsy' })
  .trim()
  .isLength({ max: 100 })
  .withMessage('Search maksimal 100 karakter');

const sortValidator = query('sort')
  .optional({ values: 'falsy' })
  .trim();

// ─── Sales ───

const getSalesReport = [
  pageValidator,
  limitValidator,
  periodValidator,
  dateFromValidator,
  dateToValidator,
  searchValidator,
  sortValidator,
  query('status')
    .optional({ values: 'falsy' })
    .isIn(Object.values(SO_STATUS))
    .withMessage('Status SO tidak valid'),
  query('customerId')
    .optional({ values: 'falsy' })
    .isUUID()
    .withMessage('customerId tidak valid'),
];

const getSalesStats = [
  periodValidator,
  dateFromValidator,
  dateToValidator,
  query('status').optional({ values: 'falsy' }).isIn(Object.values(SO_STATUS)).withMessage('Status SO tidak valid'),
  query('customerId').optional({ values: 'falsy' }).isUUID().withMessage('customerId tidak valid'),
];

const getSalesChart = [...getSalesStats];

const exportSales = [
  periodValidator,
  dateFromValidator,
  dateToValidator,
  searchValidator,
  query('status').optional({ values: 'falsy' }).isIn(Object.values(SO_STATUS)).withMessage('Status SO tidak valid'),
  query('customerId').optional({ values: 'falsy' }).isUUID().withMessage('customerId tidak valid'),
];

// ─── Purchases ───

const getPurchasesReport = [
  pageValidator,
  limitValidator,
  periodValidator,
  dateFromValidator,
  dateToValidator,
  searchValidator,
  sortValidator,
  query('status')
    .optional({ values: 'falsy' })
    .isIn(Object.values(PO_STATUS))
    .withMessage('Status PO tidak valid'),
  query('supplierId')
    .optional({ values: 'falsy' })
    .isUUID()
    .withMessage('supplierId tidak valid'),
];

const getPurchasesStats = [
  periodValidator,
  dateFromValidator,
  dateToValidator,
  query('status').optional({ values: 'falsy' }).isIn(Object.values(PO_STATUS)).withMessage('Status PO tidak valid'),
  query('supplierId').optional({ values: 'falsy' }).isUUID().withMessage('supplierId tidak valid'),
];

const getPurchasesChart = [...getPurchasesStats];

const exportPurchases = [
  periodValidator,
  dateFromValidator,
  dateToValidator,
  searchValidator,
  query('status').optional({ values: 'falsy' }).isIn(Object.values(PO_STATUS)).withMessage('Status PO tidak valid'),
  query('supplierId').optional({ values: 'falsy' }).isUUID().withMessage('supplierId tidak valid'),
];

// ─── Stock ───

const getStockReport = [
  pageValidator,
  limitValidator,
  searchValidator,
  sortValidator,
  query('kategori')
    .optional({ values: 'falsy' })
    .isIn(Object.values(PRODUCT_CATEGORY))
    .withMessage('Kategori tidak valid'),
  query('golongan')
    .optional({ values: 'falsy' })
    .isIn(Object.values(GOLONGAN_OBAT))
    .withMessage('Golongan tidak valid'),
  query('stockStatus')
    .optional({ values: 'falsy' })
    .isIn(['in_stock', 'low_stock', 'out_of_stock'])
    .withMessage('stockStatus harus in_stock, low_stock, atau out_of_stock'),
];

const getStockStats = [
  query('kategori').optional({ values: 'falsy' }).isIn(Object.values(PRODUCT_CATEGORY)).withMessage('Kategori tidak valid'),
  query('golongan').optional({ values: 'falsy' }).isIn(Object.values(GOLONGAN_OBAT)).withMessage('Golongan tidak valid'),
  query('stockStatus').optional({ values: 'falsy' }).isIn(['in_stock', 'low_stock', 'out_of_stock']).withMessage('stockStatus tidak valid'),
];

const getStockChart = [...getStockStats];

const exportStock = [
  searchValidator,
  query('kategori').optional({ values: 'falsy' }).isIn(Object.values(PRODUCT_CATEGORY)).withMessage('Kategori tidak valid'),
  query('golongan').optional({ values: 'falsy' }).isIn(Object.values(GOLONGAN_OBAT)).withMessage('Golongan tidak valid'),
  query('stockStatus').optional({ values: 'falsy' }).isIn(['in_stock', 'low_stock', 'out_of_stock']).withMessage('stockStatus tidak valid'),
];

// ─── Finance ───

const getFinanceReport = [
  periodValidator,
  dateFromValidator,
  dateToValidator,
];

const getFinanceStats = [...getFinanceReport];
const getFinanceChart = [
  ...getFinanceReport,
  query('months').optional({ values: 'falsy' }).isInt({ min: 1, max: 24 }).withMessage('months harus antara 1-24'),
];
const exportFinance = [...getFinanceReport];

// ─── Expired ───

const getExpiredReport = [
  pageValidator,
  limitValidator,
  searchValidator,
  sortValidator,
  dateFromValidator,
  dateToValidator,
  query('expiryStatus')
    .optional({ values: 'falsy' })
    .isIn(['expired', 'critical', 'warning', 'caution'])
    .withMessage('expiryStatus harus expired, critical, warning, atau caution'),
  query('kategori')
    .optional({ values: 'falsy' })
    .isIn(Object.values(PRODUCT_CATEGORY))
    .withMessage('Kategori tidak valid'),
  query('golongan')
    .optional({ values: 'falsy' })
    .isIn(Object.values(GOLONGAN_OBAT))
    .withMessage('Golongan tidak valid'),
];

const getExpiredStats = [
  dateFromValidator,
  dateToValidator,
  query('expiryStatus').optional({ values: 'falsy' }).isIn(['expired', 'critical', 'warning', 'caution']).withMessage('expiryStatus tidak valid'),
  query('kategori').optional({ values: 'falsy' }).isIn(Object.values(PRODUCT_CATEGORY)).withMessage('Kategori tidak valid'),
  query('golongan').optional({ values: 'falsy' }).isIn(Object.values(GOLONGAN_OBAT)).withMessage('Golongan tidak valid'),
];

const getExpiredChart = [...getExpiredStats];

const exportExpired = [
  searchValidator,
  dateFromValidator,
  dateToValidator,
  query('expiryStatus').optional({ values: 'falsy' }).isIn(['expired', 'critical', 'warning', 'caution']).withMessage('expiryStatus tidak valid'),
  query('kategori').optional({ values: 'falsy' }).isIn(Object.values(PRODUCT_CATEGORY)).withMessage('Kategori tidak valid'),
  query('golongan').optional({ values: 'falsy' }).isIn(Object.values(GOLONGAN_OBAT)).withMessage('Golongan tidak valid'),
];

module.exports = {
  getSalesReport,
  getSalesStats,
  getSalesChart,
  exportSales,
  getPurchasesReport,
  getPurchasesStats,
  getPurchasesChart,
  exportPurchases,
  getStockReport,
  getStockStats,
  getStockChart,
  exportStock,
  getFinanceReport,
  getFinanceStats,
  getFinanceChart,
  exportFinance,
  getExpiredReport,
  getExpiredStats,
  getExpiredChart,
  exportExpired,
};


