const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const { auth, authorize } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const reportValidation = require('../validations/report.validation');
const { USER_ROLES } = require('../constants');

const { SUPERADMIN, ADMIN, KEUANGAN, SALES, GUDANG, APOTEKER } = USER_ROLES;

// All report routes require authentication
router.use(auth);

// ═══════════════════════════════════════════════════════════════
// ─── 13.1 LAPORAN PENJUALAN ───
// ═══════════════════════════════════════════════════════════════
router.get(
  '/sales',
  authorize(SUPERADMIN, ADMIN, SALES, KEUANGAN),
  validate(reportValidation.getSalesReport),
  reportController.getSalesReport,
);
router.get(
  '/sales/stats',
  authorize(SUPERADMIN, ADMIN, SALES, KEUANGAN),
  validate(reportValidation.getSalesStats),
  reportController.getSalesStats,
);
router.get(
  '/sales/chart',
  authorize(SUPERADMIN, ADMIN, SALES, KEUANGAN),
  validate(reportValidation.getSalesChart),
  reportController.getSalesChart,
);
router.get(
  '/sales/export',
  authorize(SUPERADMIN, ADMIN, SALES, KEUANGAN),
  validate(reportValidation.exportSales),
  reportController.exportSalesExcel,
);
router.get(
  '/sales/pdf',
  authorize(SUPERADMIN, ADMIN, SALES, KEUANGAN),
  validate(reportValidation.exportSales),
  reportController.exportSalesPdf,
);

// ═══════════════════════════════════════════════════════════════
// ─── 13.2 LAPORAN PEMBELIAN ───
// ═══════════════════════════════════════════════════════════════
router.get(
  '/purchases',
  authorize(SUPERADMIN, ADMIN, GUDANG, KEUANGAN),
  validate(reportValidation.getPurchasesReport),
  reportController.getPurchasesReport,
);
router.get(
  '/purchases/stats',
  authorize(SUPERADMIN, ADMIN, GUDANG, KEUANGAN),
  validate(reportValidation.getPurchasesStats),
  reportController.getPurchasesStats,
);
router.get(
  '/purchases/chart',
  authorize(SUPERADMIN, ADMIN, GUDANG, KEUANGAN),
  validate(reportValidation.getPurchasesChart),
  reportController.getPurchasesChart,
);
router.get(
  '/purchases/export',
  authorize(SUPERADMIN, ADMIN, GUDANG, KEUANGAN),
  validate(reportValidation.exportPurchases),
  reportController.exportPurchasesExcel,
);
router.get(
  '/purchases/pdf',
  authorize(SUPERADMIN, ADMIN, GUDANG, KEUANGAN),
  validate(reportValidation.exportPurchases),
  reportController.exportPurchasesPdf,
);

// ═══════════════════════════════════════════════════════════════
// ─── 13.3 LAPORAN STOK ───
// ═══════════════════════════════════════════════════════════════
router.get(
  '/stock',
  authorize(SUPERADMIN, ADMIN, GUDANG, APOTEKER),
  validate(reportValidation.getStockReport),
  reportController.getStockReport,
);
router.get(
  '/stock/stats',
  authorize(SUPERADMIN, ADMIN, GUDANG, APOTEKER),
  validate(reportValidation.getStockStats),
  reportController.getStockStats,
);
router.get(
  '/stock/chart',
  authorize(SUPERADMIN, ADMIN, GUDANG, APOTEKER),
  validate(reportValidation.getStockChart),
  reportController.getStockChart,
);
router.get(
  '/stock/export',
  authorize(SUPERADMIN, ADMIN, GUDANG, APOTEKER),
  validate(reportValidation.exportStock),
  reportController.exportStockExcel,
);
router.get(
  '/stock/pdf',
  authorize(SUPERADMIN, ADMIN, GUDANG, APOTEKER),
  validate(reportValidation.exportStock),
  reportController.exportStockPdf,
);

// ═══════════════════════════════════════════════════════════════
// ─── 13.4 LAPORAN KEUANGAN ───
// ═══════════════════════════════════════════════════════════════
router.get(
  '/finance',
  authorize(SUPERADMIN, ADMIN, KEUANGAN),
  validate(reportValidation.getFinanceReport),
  reportController.getFinanceReport,
);
router.get(
  '/finance/stats',
  authorize(SUPERADMIN, ADMIN, KEUANGAN),
  validate(reportValidation.getFinanceStats),
  reportController.getFinanceStats,
);
router.get(
  '/finance/chart',
  authorize(SUPERADMIN, ADMIN, KEUANGAN),
  validate(reportValidation.getFinanceChart),
  reportController.getFinanceChart,
);
router.get(
  '/finance/export',
  authorize(SUPERADMIN, ADMIN, KEUANGAN),
  validate(reportValidation.exportFinance),
  reportController.exportFinanceExcel,
);
router.get(
  '/finance/pdf',
  authorize(SUPERADMIN, ADMIN, KEUANGAN),
  validate(reportValidation.exportFinance),
  reportController.exportFinancePdf,
);

// ═══════════════════════════════════════════════════════════════
// ─── 13.5 LAPORAN OBAT KADALUARSA ───
// ═══════════════════════════════════════════════════════════════
router.get(
  '/expired',
  authorize(SUPERADMIN, ADMIN, GUDANG, APOTEKER),
  validate(reportValidation.getExpiredReport),
  reportController.getExpiredReport,
);
router.get(
  '/expired/stats',
  authorize(SUPERADMIN, ADMIN, GUDANG, APOTEKER),
  validate(reportValidation.getExpiredStats),
  reportController.getExpiredStats,
);
router.get(
  '/expired/chart',
  authorize(SUPERADMIN, ADMIN, GUDANG, APOTEKER),
  validate(reportValidation.getExpiredChart),
  reportController.getExpiredChart,
);
router.get(
  '/expired/export',
  authorize(SUPERADMIN, ADMIN, GUDANG, APOTEKER),
  validate(reportValidation.exportExpired),
  reportController.exportExpiredExcel,
);
router.get(
  '/expired/pdf',
  authorize(SUPERADMIN, ADMIN, GUDANG, APOTEKER),
  validate(reportValidation.exportExpired),
  reportController.exportExpiredPdf,
);

module.exports = router;
