const financeService = require('../services/finance.service');
const ApiResponse = require('../utils/ApiResponse');
const catchAsync = require('../utils/catchAsync');

// ─── AR ───
const getReceivables = catchAsync(async (req, res) => {
  const result = await financeService.getReceivables(req.query);
  ApiResponse.success(res, {
    data: result.docs,
    message: 'Berhasil mengambil daftar piutang',
    meta: { pagination: result.pagination },
  });
});

const createReceivablePayment = catchAsync(async (req, res) => {
  const data = await financeService.createReceivablePayment(req.body, req.user._id);
  ApiResponse.created(res, { data, message: 'Draft pembayaran piutang berhasil dibuat' });
});

const payReceivable = catchAsync(async (req, res) => {
  const data = await financeService.payReceivable(req.params.id, req.body, req.user._id);
  ApiResponse.success(res, { data, message: 'Pelunasan piutang berhasil diposting' });
});

// ─── AP ───
const getPayables = catchAsync(async (req, res) => {
  const result = await financeService.getPayables(req.query);
  ApiResponse.success(res, {
    data: result.docs,
    message: 'Berhasil mengambil daftar hutang',
    meta: { pagination: result.pagination },
  });
});

const createPayablePayment = catchAsync(async (req, res) => {
  const data = await financeService.createPayablePayment(req.body, req.user._id);
  ApiResponse.created(res, { data, message: 'Draft pembayaran hutang berhasil dibuat' });
});

const payPayable = catchAsync(async (req, res) => {
  const data = await financeService.payPayable(req.params.id, req.body, req.user._id);
  ApiResponse.success(res, { data, message: 'Pelunasan hutang berhasil diposting' });
});

// ─── GL ───
const getChartOfAccounts = catchAsync(async (req, res) => {
  const data = await financeService.getChartOfAccounts(req.query);
  ApiResponse.success(res, { data, message: 'Berhasil mengambil chart of accounts' });
});

const createChartOfAccount = catchAsync(async (req, res) => {
  const data = await financeService.createChartOfAccount(req.body, req.user._id);
  ApiResponse.created(res, { data, message: 'Akun COA berhasil dibuat' });
});

const updateChartOfAccount = catchAsync(async (req, res) => {
  const data = await financeService.updateChartOfAccount(req.params.id, req.body, req.user._id);
  ApiResponse.success(res, { data, message: 'Akun COA berhasil diperbarui' });
});

const deleteChartOfAccount = catchAsync(async (req, res) => {
  await financeService.deleteChartOfAccount(req.params.id);
  ApiResponse.success(res, { message: 'Akun COA berhasil dihapus' });
});

const getJournalEntries = catchAsync(async (req, res) => {
  const result = await financeService.getJournalEntries(req.query);
  ApiResponse.success(res, {
    data: result.docs,
    message: 'Berhasil mengambil jurnal',
    meta: { pagination: result.pagination },
  });
});

const createManualJournal = catchAsync(async (req, res) => {
  const data = await financeService.createManualJournal(req.body, req.user._id);
  ApiResponse.created(res, { data, message: 'Jurnal manual berhasil diajukan untuk approval' });
});

const approveManualJournal = catchAsync(async (req, res) => {
  const approvalNotes = req.body.notes || '';
  const data = await financeService.approveManualJournal(req.params.id, approvalNotes, req.user._id);
  ApiResponse.success(res, { data, message: 'Jurnal manual berhasil di-approve dan diposting' });
});

const getLedger = catchAsync(async (req, res) => {
  const data = await financeService.getLedger(req.query);
  ApiResponse.success(res, { data, message: 'Berhasil mengambil buku besar' });
});

// ─── Reports ───
const getBalanceSheetReport = catchAsync(async (req, res) => {
  const data = await financeService.getBalanceSheetReport(req.query);
  ApiResponse.success(res, { data, message: 'Berhasil mengambil laporan neraca' });
});

const getProfitLossReport = catchAsync(async (req, res) => {
  const data = await financeService.getProfitLossReport(req.query);
  ApiResponse.success(res, { data, message: 'Berhasil mengambil laporan laba rugi' });
});

const getCashFlowReport = catchAsync(async (req, res) => {
  const data = await financeService.getCashFlowReport(req.query);
  ApiResponse.success(res, { data, message: 'Berhasil mengambil laporan arus kas' });
});

// ─── Bank Transactions ───
const getBankTransactions = catchAsync(async (req, res) => {
  const result = await financeService.getBankTransactions(req.query);
  ApiResponse.success(res, {
    data: result.docs,
    message: 'Berhasil mengambil transaksi bank',
    meta: { pagination: result.pagination },
  });
});

const createBankTransaction = catchAsync(async (req, res) => {
  const data = await financeService.createBankTransaction(req.body, req.user._id);
  ApiResponse.created(res, { data, message: 'Transaksi bank berhasil dibuat' });
});

const getInvoiceById = catchAsync(async (req, res) => {
  const data = await financeService.getInvoiceById(req.params.id);
  ApiResponse.success(res, { data, message: 'Berhasil mengambil detail invoice' });
});

module.exports = {
  getReceivables,
  createReceivablePayment,
  payReceivable,
  getPayables,
  createPayablePayment,
  payPayable,
  getChartOfAccounts,
  createChartOfAccount,
  updateChartOfAccount,
  deleteChartOfAccount,
  getJournalEntries,
  createManualJournal,
  approveManualJournal,
  getLedger,
  getBalanceSheetReport,
  getProfitLossReport,
  getCashFlowReport,
  getBankTransactions,
  createBankTransaction,
  getInvoiceById,
};