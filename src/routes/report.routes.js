const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const { auth, authorize } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const reportValidation = require('../validations/report.validation');
const { USER_ROLES } = require('../constants');

const { ADMIN, KEUANGAN, SALES, GUDANG, APOTEKER } = USER_ROLES;

// All report routes require authentication
router.use(auth);

// ═══════════════════════════════════════════════════════════════
// ─── 13.1 LAPORAN PENJUALAN ───
// ═══════════════════════════════════════════════════════════════
router.get(
  '/sales',
  authorize(ADMIN, SALES, KEUANGAN),
  validate(reportValidation.getSalesReport),
  reportController.getSalesReport,
);
router.get(
  '/sales/stats',
  authorize(ADMIN, SALES, KEUANGAN),
  validate(reportValidation.getSalesStats),
  reportController.getSalesStats,
);
router.get(
  '/sales/chart',
  authorize(ADMIN, SALES, KEUANGAN),
  validate(reportValidation.getSalesChart),
  reportController.getSalesChart,
);
router.get(
  '/sales/export',
  authorize(ADMIN, SALES, KEUANGAN),
  validate(reportValidation.exportSales),
  reportController.exportSalesExcel,
);
router.get(
  '/sales/pdf',
  authorize(ADMIN, SALES, KEUANGAN),
  validate(reportValidation.exportSales),
  reportController.exportSalesPdf,
);

// ═══════════════════════════════════════════════════════════════
// ─── 13.2 LAPORAN PEMBELIAN ───
// ═══════════════════════════════════════════════════════════════
router.get(
  '/purchases',
  authorize(ADMIN, GUDANG, KEUANGAN),
  validate(reportValidation.getPurchasesReport),
  reportController.getPurchasesReport,
);
router.get(
  '/purchases/stats',
  authorize(ADMIN, GUDANG, KEUANGAN),
  validate(reportValidation.getPurchasesStats),
  reportController.getPurchasesStats,
);
router.get(
  '/purchases/chart',
  authorize(ADMIN, GUDANG, KEUANGAN),
  validate(reportValidation.getPurchasesChart),
  reportController.getPurchasesChart,
);
router.get(
  '/purchases/export',
  authorize(ADMIN, GUDANG, KEUANGAN),
  validate(reportValidation.exportPurchases),
  reportController.exportPurchasesExcel,
);
router.get(
  '/purchases/pdf',
  authorize(ADMIN, GUDANG, KEUANGAN),
  validate(reportValidation.exportPurchases),
  reportController.exportPurchasesPdf,
);

// ═══════════════════════════════════════════════════════════════
// ─── 13.3 LAPORAN STOK ───
// ═══════════════════════════════════════════════════════════════
router.get(
  '/stock',
  authorize(ADMIN, GUDANG, APOTEKER),
  validate(reportValidation.getStockReport),
  reportController.getStockReport,
);
router.get(
  '/stock/stats',
  authorize(ADMIN, GUDANG, APOTEKER),
  validate(reportValidation.getStockStats),
  reportController.getStockStats,
);
router.get(
  '/stock/chart',
  authorize(ADMIN, GUDANG, APOTEKER),
  validate(reportValidation.getStockChart),
  reportController.getStockChart,
);
router.get(
  '/stock/export',
  authorize(ADMIN, GUDANG, APOTEKER),
  validate(reportValidation.exportStock),
  reportController.exportStockExcel,
);
router.get(
  '/stock/pdf',
  authorize(ADMIN, GUDANG, APOTEKER),
  validate(reportValidation.exportStock),
  reportController.exportStockPdf,
);

// ═══════════════════════════════════════════════════════════════
// ─── 13.4 LAPORAN KEUANGAN ───
// ═══════════════════════════════════════════════════════════════
router.get(
  '/finance',
  authorize(ADMIN, KEUANGAN),
  validate(reportValidation.getFinanceReport),
  reportController.getFinanceReport,
);
router.get(
  '/finance/stats',
  authorize(ADMIN, KEUANGAN),
  validate(reportValidation.getFinanceStats),
  reportController.getFinanceStats,
);
router.get(
  '/finance/chart',
  authorize(ADMIN, KEUANGAN),
  validate(reportValidation.getFinanceChart),
  reportController.getFinanceChart,
);
router.get(
  '/finance/export',
  authorize(ADMIN, KEUANGAN),
  validate(reportValidation.exportFinance),
  reportController.exportFinanceExcel,
);
router.get(
  '/finance/pdf',
  authorize(ADMIN, KEUANGAN),
  validate(reportValidation.exportFinance),
  reportController.exportFinancePdf,
);

// ═══════════════════════════════════════════════════════════════
// ─── 13.5 LAPORAN OBAT KADALUARSA ───
// ═══════════════════════════════════════════════════════════════
router.get(
  '/expired',
  authorize(ADMIN, GUDANG, APOTEKER),
  validate(reportValidation.getExpiredReport),
  reportController.getExpiredReport,
);
router.get(
  '/expired/stats',
  authorize(ADMIN, GUDANG, APOTEKER),
  validate(reportValidation.getExpiredStats),
  reportController.getExpiredStats,
);
router.get(
  '/expired/chart',
  authorize(ADMIN, GUDANG, APOTEKER),
  validate(reportValidation.getExpiredChart),
  reportController.getExpiredChart,
);
router.get(
  '/expired/export',
  authorize(ADMIN, GUDANG, APOTEKER),
  validate(reportValidation.exportExpired),
  reportController.exportExpiredExcel,
);
router.get(
  '/expired/pdf',
  authorize(ADMIN, GUDANG, APOTEKER),
  validate(reportValidation.exportExpired),
  reportController.exportExpiredPdf,
);

module.exports = router;
