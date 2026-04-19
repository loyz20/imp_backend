const express = require('express');

const router = express.Router();
const financeController = require('../controllers/finance.controller');
const reportController = require('../controllers/report.controller');
const { auth, authorize } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const financeValidation = require('../validations/finance.validation');
const reportValidation = require('../validations/report.validation');
const { USER_ROLES } = require('../constants');

const { ADMIN, KEUANGAN, SALES } = USER_ROLES;

// All finance routes require authentication
router.use(auth);

// ─── COA ───
router.get(
  '/gl/accounts',
  authorize(ADMIN, KEUANGAN),
  validate(financeValidation.getAccounts),
  financeController.getChartOfAccounts,
);

router.post(
  '/gl/accounts',
  authorize(ADMIN),
  validate(financeValidation.createAccount),
  financeController.createChartOfAccount,
);

router.put(
  '/gl/accounts/:id',
  authorize(ADMIN),
  validate(financeValidation.updateAccount),
  financeController.updateChartOfAccount,
);

router.delete(
  '/gl/accounts/:id',
  authorize(ADMIN),
  validate(financeValidation.idParam),
  financeController.deleteChartOfAccount,
);

// ─── JOURNAL & LEDGER ───
router.get(
  '/gl/journals',
  authorize(ADMIN, KEUANGAN),
  validate(financeValidation.getJournals),
  financeController.getJournalEntries,
);

router.post(
  '/gl/journals/manual',
  authorize(ADMIN, KEUANGAN),
  validate(financeValidation.createManualJournal),
  financeController.createManualJournal,
);

router.patch(
  '/gl/journals/:id/approve',
  authorize(ADMIN),
  validate(financeValidation.approveManualJournal),
  financeController.approveManualJournal,
);

router.get(
  '/gl/ledger',
  authorize(ADMIN, KEUANGAN),
  validate(financeValidation.getLedger),
  financeController.getLedger,
);

// ─── CASH & BANK ───
router.get(
  '/bank-transactions',
  authorize(ADMIN, KEUANGAN),
  validate(financeValidation.getBankTransactions),
  financeController.getBankTransactions,
);

router.post(
  '/bank-transactions',
  authorize(ADMIN, KEUANGAN),
  validate(financeValidation.createBankTransaction),
  financeController.createBankTransaction,
);

// ─── PAYABLES ───
router.get(
  '/payables',
  authorize(ADMIN, KEUANGAN),
  validate(financeValidation.getPayables),
  financeController.getPayables,
);

// ─── INVOICES ───
router.get(
  '/invoices/by-number',
  authorize(ADMIN, KEUANGAN, SALES),
  financeController.getInvoiceByNumber,
);

router.get(
  '/invoices/:id',
  authorize(ADMIN, KEUANGAN, SALES),
  validate(financeValidation.idParam),
  financeController.getInvoiceById,
);

router.post(
  '/payables',
  authorize(ADMIN, KEUANGAN),
  validate(financeValidation.createPayablePayment),
  financeController.createPayablePayment,
);

router.post(
  '/payables/:id/pay',
  authorize(ADMIN, KEUANGAN),
  validate(financeValidation.payPayable),
  financeController.payPayable,
);

// ─── RECEIVABLES ───
router.get(
  '/receivables',
  authorize(ADMIN, KEUANGAN, SALES),
  validate(financeValidation.getReceivables),
  financeController.getReceivables,
);

router.post(
  '/receivables',
  authorize(ADMIN, KEUANGAN),
  validate(financeValidation.createReceivablePayment),
  financeController.createReceivablePayment,
);

router.post(
  '/receivables/:id/pay',
  authorize(ADMIN, KEUANGAN),
  validate(financeValidation.payReceivable),
  financeController.payReceivable,
);

// ─── REPORTS ───
router.get(
  '/reports/balance-sheet',
  authorize(ADMIN, KEUANGAN),
  validate(financeValidation.getFinanceReport),
  financeController.getBalanceSheetReport,
);

router.get(
  '/reports/profit-loss',
  authorize(ADMIN, KEUANGAN),
  validate(financeValidation.getFinanceReport),
  financeController.getProfitLossReport,
);

router.get(
  '/reports/cash-flow',
  authorize(ADMIN, KEUANGAN),
  validate(financeValidation.getFinanceReport),
  financeController.getCashFlowReport,
);

router.get(
  '/reports/ledger',
  authorize(ADMIN, KEUANGAN),
  validate(financeValidation.getLedger),
  financeController.getLedger,
);

// ─── Dashboard (alias to report endpoints) ───
router.get(
  '/dashboard/stats',
  authorize(ADMIN, KEUANGAN),
  validate(reportValidation.getFinanceStats),
  reportController.getFinanceStats,
);
router.get(
  '/dashboard/chart',
  authorize(ADMIN, KEUANGAN),
  validate(reportValidation.getFinanceChart),
  reportController.getFinanceChart,
);

module.exports = router;
