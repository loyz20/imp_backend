const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/ApiResponse');
const appSettingService = require('../services/appSetting.service');

const getSettings = catchAsync(async (req, res) => {
  const settings = await appSettingService.getSettings();
  ApiResponse.success(res, {
    message: 'Settings berhasil diambil',
    data: settings,
  });
});

const getSection = catchAsync(async (req, res) => {
  const data = await appSettingService.getSection(req.params.section);
  ApiResponse.success(res, {
    message: `Section '${req.params.section}' berhasil diambil`,
    data,
  });
});

const initializeSettings = catchAsync(async (req, res) => {
  const settings = await appSettingService.initializeSettings();
  ApiResponse.created(res, {
    message: 'Settings initialized successfully',
    data: settings,
  });
});

const updateAll = catchAsync(async (req, res) => {
  const settings = await appSettingService.updateAll(req.body);
  ApiResponse.success(res, {
    message: 'Settings updated successfully',
    data: settings,
  });
});

const updateCompany = catchAsync(async (req, res) => {
  const data = await appSettingService.updateCompany(req.body);
  ApiResponse.success(res, {
    message: 'Company information updated successfully',
    data,
  });
});

const updateLicenses = catchAsync(async (req, res) => {
  const data = await appSettingService.updateLicenses(req.body);
  ApiResponse.success(res, {
    message: 'Data perizinan berhasil diperbarui',
    data,
  });
});

const updatePharmacist = catchAsync(async (req, res) => {
  const data = await appSettingService.updatePharmacist(req.body);
  ApiResponse.success(res, {
    message: 'Data apoteker penanggung jawab berhasil diperbarui',
    data,
  });
});

const updateTax = catchAsync(async (req, res) => {
  const data = await appSettingService.updateTax(req.body);
  ApiResponse.success(res, {
    message: 'Pengaturan pajak berhasil diperbarui',
    data,
  });
});

const updateInvoice = catchAsync(async (req, res) => {
  const data = await appSettingService.updateInvoice(req.body);
  ApiResponse.success(res, {
    message: 'Pengaturan invoice berhasil diperbarui',
    data,
  });
});

const updatePurchaseOrder = catchAsync(async (req, res) => {
  const data = await appSettingService.updatePurchaseOrder(req.body);
  ApiResponse.success(res, {
    message: 'Pengaturan surat pesanan berhasil diperbarui',
    data,
  });
});

const updateDeliveryOrder = catchAsync(async (req, res) => {
  const data = await appSettingService.updateDeliveryOrder(req.body);
  ApiResponse.success(res, {
    message: 'Pengaturan surat jalan berhasil diperbarui',
    data,
  });
});

const updateReturnOrder = catchAsync(async (req, res) => {
  const data = await appSettingService.updateReturnOrder(req.body);
  ApiResponse.success(res, {
    message: 'Pengaturan retur berhasil diperbarui',
    data,
  });
});

const updateInventory = catchAsync(async (req, res) => {
  const data = await appSettingService.updateInventory(req.body);
  ApiResponse.success(res, {
    message: 'Pengaturan inventori berhasil diperbarui',
    data,
  });
});

const updateCdob = catchAsync(async (req, res) => {
  const data = await appSettingService.updateCdob(req.body);
  ApiResponse.success(res, {
    message: 'Pengaturan CDOB berhasil diperbarui',
    data,
  });
});

const updateMedication = catchAsync(async (req, res) => {
  const data = await appSettingService.updateMedication(req.body);
  ApiResponse.success(res, {
    message: 'Pengaturan obat berhasil diperbarui',
    data,
  });
});

const updateCustomer = catchAsync(async (req, res) => {
  const data = await appSettingService.updateCustomer(req.body);
  ApiResponse.success(res, {
    message: 'Pengaturan pelanggan berhasil diperbarui',
    data,
  });
});

const updatePayment = catchAsync(async (req, res) => {
  const data = await appSettingService.updatePayment(req.body);
  ApiResponse.success(res, {
    message: 'Pengaturan pembayaran berhasil diperbarui',
    data,
  });
});

const updateNotification = catchAsync(async (req, res) => {
  const data = await appSettingService.updateNotification(req.body);
  ApiResponse.success(res, {
    message: 'Pengaturan notifikasi berhasil diperbarui',
    data,
  });
});

const updateReporting = catchAsync(async (req, res) => {
  const data = await appSettingService.updateReporting(req.body);
  ApiResponse.success(res, {
    message: 'Pengaturan laporan berhasil diperbarui',
    data,
  });
});

const updateGeneral = catchAsync(async (req, res) => {
  const data = await appSettingService.updateGeneral(req.body);
  ApiResponse.success(res, {
    message: 'Pengaturan umum berhasil diperbarui',
    data,
  });
});

const generateDocNumber = catchAsync(async (req, res) => {
  const data = await appSettingService.generateDocNumber(req.params.type);
  ApiResponse.success(res, {
    message: 'Nomor dokumen berhasil di-generate',
    data,
  });
});

const resetDocNumber = catchAsync(async (req, res) => {
  const data = await appSettingService.resetDocNumber(req.params.type);
  ApiResponse.success(res, {
    message: 'Document number counter reset successfully',
    data,
  });
});

const getLicenseWarnings = catchAsync(async (req, res) => {
  const warnings = await appSettingService.getLicenseWarnings();
  ApiResponse.success(res, {
    message: 'License warnings berhasil diambil',
    data: warnings,
  });
});

const testSmtp = catchAsync(async (req, res) => {
  const result = await appSettingService.testSmtp(req.body.testEmail);
  ApiResponse.success(res, {
    message: result.message,
  });
});

module.exports = {
  getSettings,
  getSection,
  initializeSettings,
  updateAll,
  updateCompany,
  updateLicenses,
  updatePharmacist,
  updateTax,
  updateInvoice,
  updatePurchaseOrder,
  updateDeliveryOrder,
  updateReturnOrder,
  updateInventory,
  updateCdob,
  updateMedication,
  updateCustomer,
  updatePayment,
  updateNotification,
  updateReporting,
  updateGeneral,
  generateDocNumber,
  resetDocNumber,
  getLicenseWarnings,
  testSmtp,
};
