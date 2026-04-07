const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/ApiResponse');
const regulationService = require('../services/regulation.service');

// ─── SURAT PESANAN KHUSUS ───

const getSPList = catchAsync(async (req, res) => {
  const result = await regulationService.getSPList(req.query);
  ApiResponse.success(res, {
    message: 'Daftar Surat Pesanan retrieved successfully',
    data: result.docs,
    meta: { pagination: result.pagination },
  });
});

const getSPStats = catchAsync(async (req, res) => {
  // Auto-expire overdue SP before returning stats
  await regulationService.expireOverdueSP();
  const stats = await regulationService.getSPStats();
  ApiResponse.success(res, {
    data: stats,
  });
});

const getSPById = catchAsync(async (req, res) => {
  const sp = await regulationService.getSPById(req.params.id);
  ApiResponse.success(res, {
    data: sp,
  });
});

const createSP = catchAsync(async (req, res) => {
  const sp = await regulationService.createSP(req.body, req.user.id);
  ApiResponse.created(res, {
    message: 'Surat Pesanan berhasil dibuat',
    data: sp,
  });
});

const updateSPStatus = catchAsync(async (req, res) => {
  const sp = await regulationService.updateSPStatus(
    req.params.id,
    req.body.status,
    req.user.id,
    req.body.rejectReason,
  );
  ApiResponse.success(res, {
    message: 'Status Surat Pesanan berhasil diperbarui',
    data: sp,
  });
});

// ─── E-REPORT BPOM ───

const getEReports = catchAsync(async (req, res) => {
  const result = await regulationService.getEReports(req.query);
  ApiResponse.success(res, {
    message: 'Daftar e-Report retrieved successfully',
    data: result.docs,
    meta: { pagination: result.pagination },
  });
});

const getEReportStats = catchAsync(async (req, res) => {
  const stats = await regulationService.getEReportStats();
  ApiResponse.success(res, {
    data: stats,
  });
});

const generateEReport = catchAsync(async (req, res) => {
  const report = await regulationService.generateEReport(req.body, req.user.id);
  ApiResponse.created(res, {
    message: 'e-Report berhasil di-generate',
    data: report,
  });
});

const submitEReport = catchAsync(async (req, res) => {
  const report = await regulationService.submitEReport(req.params.id, req.user.id);
  ApiResponse.success(res, {
    message: 'e-Report berhasil di-submit ke BPOM',
    data: report,
  });
});

// ─── DOKUMEN PERIZINAN ───

const getDocuments = catchAsync(async (req, res) => {
  const documents = await regulationService.getDocuments();
  ApiResponse.success(res, {
    data: documents,
  });
});

const getDocStats = catchAsync(async (req, res) => {
  const stats = await regulationService.getDocStats();
  ApiResponse.success(res, {
    data: stats,
  });
});

const uploadDocument = catchAsync(async (req, res) => {
  if (!req.file) {
    const ApiError = require('../utils/ApiError');
    throw ApiError.badRequest('File wajib diunggah');
  }
  const doc = await regulationService.uploadDocument(req.params.id, req.file, req.user.id);
  ApiResponse.success(res, {
    message: 'Dokumen berhasil diunggah',
    data: doc,
  });
});

module.exports = {
  getSPList,
  getSPStats,
  getSPById,
  createSP,
  updateSPStatus,
  getEReports,
  getEReportStats,
  generateEReport,
  submitEReport,
  getDocuments,
  getDocStats,
  uploadDocument,
};
