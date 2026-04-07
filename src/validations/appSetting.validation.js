const { body, param } = require('express-validator');
const { SELF_INSPECTION_SCHEDULE, CUSTOMER_TYPES, TIMEZONES, DATE_FORMATS, LANGUAGES, DOCUMENT_TYPES } = require('../constants');

// ── Address fields helper ──
const addressFields = (prefix) => [
  body(`${prefix}.street`).optional().isString().trim(),
  body(`${prefix}.city`).optional().isString().trim(),
  body(`${prefix}.province`).optional().isString().trim(),
  body(`${prefix}.postalCode`).optional().isString().trim(),
  body(`${prefix}.country`).optional().isString().trim(),
];

// ── License fields helper ──
const licenseFields = (prefix) => [
  body(`${prefix}.number`).optional().isString().trim(),
  body(`${prefix}.issuedDate`).optional().isISO8601().toDate(),
  body(`${prefix}.expiryDate`).optional().isISO8601().toDate(),
  body(`${prefix}.document`).optional().isString().trim(),
];

const updateCompany = [
  body('name').optional().isString().trim().isLength({ min: 1, max: 200 }).withMessage('Nama perusahaan harus 1-200 karakter'),
  body('logo').optional().isString().trim(),
  body('phone').optional().isString().trim().isLength({ max: 20 }),
  body('email').optional().isEmail().withMessage('Format email tidak valid').normalizeEmail(),
  body('website').optional().isString().trim(),
  ...addressFields('officeAddress'),
  ...addressFields('warehouseAddress'),
];

const updateLicenses = [
  ...licenseFields('pbf'),
  ...licenseFields('siup'),
  ...licenseFields('tdp'),
  body('nib.number').optional().isString().trim(),
  ...licenseFields('cdob'),
];

const updatePharmacist = [
  body('name').optional().isString().trim().isLength({ max: 200 }),
  body('sipaNumber').optional().isString().trim(),
  body('straNumber').optional().isString().trim(),
  body('sipaExpiry').optional().isISO8601().toDate(),
  body('straExpiry').optional().isISO8601().toDate(),
  body('phone').optional().isString().trim(),
  body('email').optional().isEmail().normalizeEmail(),
];

const updateTax = [
  body('npwp').optional().isString().trim(),
  body('isPkp').optional().isBoolean(),
  body('defaultPpnRate').optional().isFloat({ min: 0, max: 100 }).withMessage('Tarif PPN harus antara 0-100'),
];

const updateInvoice = [
  body('prefix').optional().isString().trim().isLength({ min: 1, max: 10 }).withMessage('Prefix harus 1-10 karakter'),
  body('autoNumber').optional().isBoolean(),
  body('defaultPaymentTermDays').optional().isInt({ min: 0, max: 365 }).withMessage('Payment term harus 0-365 hari'),
];

const updatePurchaseOrder = [
  body('prefix').optional().isString().trim().isLength({ min: 1, max: 10 }),
  body('autoNumber').optional().isBoolean(),
  body('requireApproval').optional().isBoolean(),
  body('approvalLevels').optional().isInt({ min: 1, max: 5 }).withMessage('Approval levels harus 1-5'),
];

const updateDeliveryOrder = [
  body('prefix').optional().isString().trim().isLength({ min: 1, max: 10 }),
  body('autoNumber').optional().isBoolean(),
];

const updateReturnOrder = [
  body('prefix').optional().isString().trim().isLength({ min: 1, max: 10 }),
  body('autoNumber').optional().isBoolean(),
  body('maxReturnDays').optional().isInt({ min: 1, max: 365 }).withMessage('Max return days harus 1-365'),
];

const updateInventory = [
  body('enableBatchTracking').optional().isBoolean(),
  body('enableExpiryDate').optional().isBoolean(),
  body('useFEFO').optional().isBoolean(),
  body('lowStockThreshold').optional().isInt({ min: 0, max: 99999 }).withMessage('Low stock threshold harus 0-99999'),
  body('temperatureZones').optional().isArray(),
  body('temperatureZones.*.name').optional().notEmpty().withMessage('Nama zona wajib diisi').isString().trim().isLength({ max: 100 }),
  body('temperatureZones.*.minTemp').optional().isFloat({ min: -50, max: 50 }).withMessage('Min temp harus -50 s.d. 50'),
  body('temperatureZones.*.maxTemp').optional().isFloat({ min: -50, max: 50 }).withMessage('Max temp harus -50 s.d. 50'),
  body('temperatureZones').optional().custom((zones) => {
    if (!Array.isArray(zones)) return true;
    for (const zone of zones) {
      if (typeof zone.minTemp === 'number' && typeof zone.maxTemp === 'number' && zone.maxTemp <= zone.minTemp) {
        throw new Error('maxTemp harus lebih besar dari minTemp');
      }
    }
    return true;
  }),
];

const updateCdob = [
  body('enableTemperatureLog').optional().isBoolean(),
  body('enableRecallManagement').optional().isBoolean(),
  body('enableComplaintTracking').optional().isBoolean(),
  body('selfInspectionSchedule')
    .optional()
    .isIn(Object.values(SELF_INSPECTION_SCHEDULE))
    .withMessage('Schedule harus: monthly, quarterly, biannually, annually'),
  body('documentRetentionYears').optional().isInt({ min: 1, max: 30 }).withMessage('Document retention harus 1-30 tahun'),
];

const updateMedication = [
  body('trackNarcotic').optional().isBoolean(),
  body('trackPsychotropic').optional().isBoolean(),
  body('trackPrecursor').optional().isBoolean(),
  body('trackOtc').optional().isBoolean(),
  body('requireSpecialSP').optional().isBoolean(),
];

const updateCustomer = [
  body('requireSIA').optional().isBoolean(),
  body('customerTypes')
    .optional()
    .isArray({ min: 1 })
    .withMessage('Customer types minimal 1 item'),
  body('customerTypes.*')
    .optional()
    .isIn(CUSTOMER_TYPES)
    .withMessage(`Tipe pelanggan harus salah satu dari: ${CUSTOMER_TYPES.join(', ')}`),
  body('defaultCreditLimit').optional().isFloat({ min: 0, max: 999999999999 }).withMessage('Credit limit harus 0-999999999999'),
];

const updatePayment = [
  body('bankAccounts').optional().isArray(),
  body('bankAccounts.*.bankName').optional().notEmpty().withMessage('Nama bank wajib diisi').isString().trim().isLength({ max: 100 }),
  body('bankAccounts.*.accountNumber')
    .optional()
    .notEmpty().withMessage('Nomor rekening wajib diisi')
    .isString().trim()
    .isLength({ min: 5, max: 30 }).withMessage('Nomor rekening harus 5-30 karakter'),
  body('bankAccounts.*.accountName').optional().notEmpty().withMessage('Nama pemilik rekening wajib diisi').isString().trim().isLength({ max: 200 }),
  body('allowPartialPayment').optional().isBoolean(),
  body('allowCreditPayment').optional().isBoolean(),
  body('latePenaltyRate').optional().isFloat({ min: 0, max: 100 }).withMessage('Denda keterlambatan harus 0-100%'),
];

const updateNotification = [
  body('enableEmail').optional().isBoolean(),
  body('enableSMS').optional().isBoolean(),
  body('enableWhatsApp').optional().isBoolean(),
  body('alerts.lowStock').optional().isBoolean(),
  body('alerts.nearExpiry').optional().isBoolean(),
  body('alerts.overduePayment').optional().isBoolean(),
  body('alerts.recall').optional().isBoolean(),
  body('alerts.temperatureAlert').optional().isBoolean(),
  body('smtp.host').optional().isString().trim().isLength({ max: 200 }),
  body('smtp.port').optional().isInt({ min: 1, max: 65535 }).withMessage('Port harus 1-65535'),
  body('smtp.user').optional().isString().trim().isLength({ max: 200 }),
  body('smtp.password').optional().isString().isLength({ max: 200 }),
  body('smtp.fromName').optional().isString().trim().isLength({ max: 200 }),
  body('smtp.fromEmail').optional().isEmail().withMessage('Format email pengirim tidak valid'),
];

const updateReporting = [
  body('bpom.enableEReport').optional().isBoolean(),
  body('bpom.apiKey').optional().isString().isLength({ max: 500 }),
  body('fiscalYearStart').optional().isInt({ min: 1, max: 12 }).withMessage('Fiscal year start harus 1-12'),
  body('currency').optional().isString().trim().isLength({ min: 3, max: 3 }).withMessage('Currency harus 3 karakter ISO 4217'),
];

const updateGeneral = [
  body('timezone').optional().isIn(TIMEZONES).withMessage(`Timezone harus salah satu dari: ${TIMEZONES.join(', ')}`),
  body('dateFormat').optional().isIn(DATE_FORMATS).withMessage(`Date format harus salah satu dari: ${DATE_FORMATS.join(', ')}`),
  body('language').optional().isIn(LANGUAGES).withMessage('Language harus: id atau en'),
  body('maintenanceMode').optional().isBoolean(),
  body('sessionTimeoutMinutes').optional().isInt({ min: 5, max: 1440 }).withMessage('Session timeout harus 5-1440 menit'),
];

const generateDocNumber = [
  param('type')
    .isIn(DOCUMENT_TYPES)
    .withMessage(`Type harus: ${DOCUMENT_TYPES.join(', ')}`),
];

const resetDocNumber = [
  param('type')
    .isIn(DOCUMENT_TYPES)
    .withMessage(`Type harus: ${DOCUMENT_TYPES.join(', ')}`),
];

const getSection = [
  param('section')
    .isIn([
      'company', 'invoice', 'purchaseOrder', 'deliveryOrder', 'returnOrder',
      'inventory', 'cdob', 'medication', 'customer', 'payment',
      'notification', 'reporting', 'general',
    ])
    .withMessage('Section tidak valid'),
];

const testSmtp = [
  body('testEmail').optional().isEmail().withMessage('Format email tidak valid'),
];

module.exports = {
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
  getSection,
  testSmtp,
};
