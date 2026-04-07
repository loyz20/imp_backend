const reportService = require('../services/report.service');
const ApiResponse = require('../utils/ApiResponse');
const catchAsync = require('../utils/catchAsync');

// ─── Sales ───
const getSalesReport = catchAsync(async (req, res) => {
  const result = await reportService.getSalesReport(req.query);
  ApiResponse.success(res, { data: result.docs, message: 'Berhasil mengambil laporan penjualan', meta: { pagination: result.pagination } });
});

const getSalesStats = catchAsync(async (req, res) => {
  const data = await reportService.getSalesStats(req.query);
  ApiResponse.success(res, { data, message: 'Berhasil mengambil statistik penjualan' });
});

const getSalesChart = catchAsync(async (req, res) => {
  const data = await reportService.getSalesChart(req.query);
  ApiResponse.success(res, { data, message: 'Berhasil mengambil chart penjualan' });
});

const exportSalesExcel = catchAsync(async (req, res) => {
  const workbook = await reportService.exportSalesExcel(req.query);
  const filename = `laporan-penjualan-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
});

const exportSalesPdf = catchAsync(async (req, res) => {
  const doc = await reportService.exportSalesPdf(req.query);
  const filename = `laporan-penjualan-${new Date().toISOString().slice(0, 10)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
});

// ─── Purchases ───
const getPurchasesReport = catchAsync(async (req, res) => {
  const result = await reportService.getPurchasesReport(req.query);
  ApiResponse.success(res, { data: result.docs, message: 'Berhasil mengambil laporan pembelian', meta: { pagination: result.pagination } });
});

const getPurchasesStats = catchAsync(async (req, res) => {
  const data = await reportService.getPurchasesStats(req.query);
  ApiResponse.success(res, { data, message: 'Berhasil mengambil statistik pembelian' });
});

const getPurchasesChart = catchAsync(async (req, res) => {
  const data = await reportService.getPurchasesChart(req.query);
  ApiResponse.success(res, { data, message: 'Berhasil mengambil chart pembelian' });
});

const exportPurchasesExcel = catchAsync(async (req, res) => {
  const workbook = await reportService.exportPurchasesExcel(req.query);
  const filename = `laporan-pembelian-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
});

const exportPurchasesPdf = catchAsync(async (req, res) => {
  const doc = await reportService.exportPurchasesPdf(req.query);
  const filename = `laporan-pembelian-${new Date().toISOString().slice(0, 10)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
});

// ─── Stock ───
const getStockReport = catchAsync(async (req, res) => {
  const result = await reportService.getStockReport(req.query);
  ApiResponse.success(res, { data: result.docs, message: 'Berhasil mengambil laporan stok', meta: { pagination: result.pagination } });
});

const getStockStats = catchAsync(async (req, res) => {
  const data = await reportService.getStockStats(req.query);
  ApiResponse.success(res, { data, message: 'Berhasil mengambil statistik stok' });
});

const getStockChart = catchAsync(async (req, res) => {
  const data = await reportService.getStockChart(req.query);
  ApiResponse.success(res, { data, message: 'Berhasil mengambil chart stok' });
});

const exportStockExcel = catchAsync(async (req, res) => {
  const workbook = await reportService.exportStockExcel(req.query);
  const filename = `laporan-stok-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
});

const exportStockPdf = catchAsync(async (req, res) => {
  const doc = await reportService.exportStockPdf(req.query);
  const filename = `laporan-stok-${new Date().toISOString().slice(0, 10)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
});

// ─── Finance ───
const getFinanceReport = catchAsync(async (req, res) => {
  const data = await reportService.getFinanceReport(req.query);
  ApiResponse.success(res, { data, message: 'Berhasil mengambil laporan keuangan' });
});

const getFinanceStats = catchAsync(async (req, res) => {
  const data = await reportService.getFinanceStats(req.query);
  ApiResponse.success(res, { data, message: 'Berhasil mengambil statistik keuangan' });
});

const getFinanceChart = catchAsync(async (req, res) => {
  const data = await reportService.getFinanceChart(req.query);
  ApiResponse.success(res, { data, message: 'Berhasil mengambil chart keuangan' });
});

const exportFinanceExcel = catchAsync(async (req, res) => {
  const workbook = await reportService.exportFinanceExcel(req.query);
  const filename = `laporan-keuangan-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
});

const exportFinancePdf = catchAsync(async (req, res) => {
  const doc = await reportService.exportFinancePdf(req.query);
  const filename = `laporan-keuangan-${new Date().toISOString().slice(0, 10)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
});

// ─── Expired ───
const getExpiredReport = catchAsync(async (req, res) => {
  const result = await reportService.getExpiredReport(req.query);
  ApiResponse.success(res, { data: result.docs, message: 'Berhasil mengambil laporan obat kadaluarsa', meta: { pagination: result.pagination } });
});

const getExpiredStats = catchAsync(async (req, res) => {
  const data = await reportService.getExpiredStats(req.query);
  ApiResponse.success(res, { data, message: 'Berhasil mengambil statistik kadaluarsa' });
});

const getExpiredChart = catchAsync(async (req, res) => {
  const data = await reportService.getExpiredChart(req.query);
  ApiResponse.success(res, { data, message: 'Berhasil mengambil chart kadaluarsa' });
});

const exportExpiredExcel = catchAsync(async (req, res) => {
  const workbook = await reportService.exportExpiredExcel(req.query);
  const filename = `laporan-expired-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
});

const exportExpiredPdf = catchAsync(async (req, res) => {
  const doc = await reportService.exportExpiredPdf(req.query);
  const filename = `laporan-expired-${new Date().toISOString().slice(0, 10)}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);
});

module.exports = {
  getSalesReport,
  getSalesStats,
  getSalesChart,
  exportSalesExcel,
  exportSalesPdf,
  getPurchasesReport,
  getPurchasesStats,
  getPurchasesChart,
  exportPurchasesExcel,
  exportPurchasesPdf,
  getStockReport,
  getStockStats,
  getStockChart,
  exportStockExcel,
  exportStockPdf,
  getFinanceReport,
  getFinanceStats,
  getFinanceChart,
  exportFinanceExcel,
  exportFinancePdf,
  getExpiredReport,
  getExpiredStats,
  getExpiredChart,
  exportExpiredExcel,
  exportExpiredPdf,
};
