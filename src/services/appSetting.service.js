const ApiError = require('../utils/ApiError');
const { VALID_SECTIONS, UPLOAD } = require('../constants');
const { getMySQLPool } = require('../config/database');
const { randomUUID } = require('crypto');
const fs = require('fs/promises');
const path = require('path');

const COMPANY_LOGO_UPLOAD_DIR = path.join(__dirname, '../../uploads/settings');
const DATA_URL_IMAGE_REGEX = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/;
const COMPANY_LOGO_MAX_SIZE = UPLOAD?.MAX_FILE_SIZE || (5 * 1024 * 1024);

const getImageExtensionFromMime = (mimeType = '') => {
  switch (mimeType.toLowerCase()) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/svg+xml':
      return 'svg';
    default:
      return 'bin';
  }
};

const isLocalCompanyLogoPath = (logoPath) => {
  if (typeof logoPath !== 'string') return false;
  return logoPath.startsWith('/uploads/settings/') || logoPath.startsWith('uploads/settings/');
};

const removeLocalCompanyLogo = async (logoPath) => {
  if (!isLocalCompanyLogoPath(logoPath)) return;
  const normalized = logoPath.replace(/^\/+/, '');
  const fsPath = path.join(__dirname, '../../', normalized.replaceAll('/', path.sep));
  try {
    await fs.unlink(fsPath);
  } catch {
    // ignore when file already missing
  }
};

const saveCompanyLogoFromDataUrl = async (logoDataUrl) => {
  const trimmed = logoDataUrl.trim();
  const match = trimmed.match(DATA_URL_IMAGE_REGEX);
  if (!match) {
    throw ApiError.badRequest('Format logo tidak valid');
  }

  const mimeType = match[1].toLowerCase();
  const base64Payload = match[2];
  const imageBuffer = Buffer.from(base64Payload, 'base64');

  if (!imageBuffer.length) {
    throw ApiError.badRequest('File logo tidak valid');
  }

  if (imageBuffer.length > COMPANY_LOGO_MAX_SIZE) {
    throw ApiError.badRequest('Ukuran logo melebihi batas maksimal 5 MB');
  }

  await fs.mkdir(COMPANY_LOGO_UPLOAD_DIR, { recursive: true });
  const ext = getImageExtensionFromMime(mimeType);
  const fileName = `company-logo-${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
  const fullPath = path.join(COMPANY_LOGO_UPLOAD_DIR, fileName);

  await fs.writeFile(fullPath, imageBuffer);
  return `/uploads/settings/${fileName}`;
};

const normalizeCompanyLogoForStorage = async (settings) => {
  if (!settings?.company || typeof settings.company !== 'object') {
    return settings;
  }

  const logo = settings.company.logo;
  if (typeof logo !== 'string') {
    return settings;
  }

  const trimmedLogo = logo.trim();
  if (!trimmedLogo.startsWith('data:image/')) {
    settings.company.logo = trimmedLogo || null;
    return settings;
  }

  settings.company.logo = await saveCompanyLogoFromDataUrl(trimmedLogo);
  return settings;
};

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    const sv = source[key];
    if (
      sv !== null && sv !== undefined && typeof sv === 'object' &&
      !Array.isArray(sv) && !(sv instanceof Date) &&
      typeof target[key] === 'object' && target[key] !== null && !Array.isArray(target[key])
    ) {
      deepMerge(target[key], sv);
    } else {
      target[key] = sv;
    }
  }
  return target;
}

const SETTINGS_KEY = 'main';

const DEFAULT_SETTINGS = {
  company: {
    name: '', logo: null, phone: '', email: '', website: '',
    officeAddress: { street: '', city: '', province: '', postalCode: '', country: 'Indonesia' },
    warehouseAddress: { street: '', city: '', province: '', postalCode: '', country: 'Indonesia' },
    licenses: {
      pbf: { number: '', issuedDate: null, expiryDate: null, document: null },
      siup: { number: '', issuedDate: null, expiryDate: null, document: null },
      tdp: { number: '', issuedDate: null, expiryDate: null, document: null },
      nib: { number: '' },
      cdob: { number: '', issuedDate: null, expiryDate: null, document: null },
    },
    responsiblePharmacist: { name: '', sipaNumber: '', straNumber: '', sipaExpiry: null, straExpiry: null, phone: '', email: '' },
    pharmacistObat: { name: '', sipaNumber: '', straNumber: '', sipaExpiry: null, straExpiry: null, phone: '', email: '' },
    pharmacistAlkes: { name: '', sipaNumber: '', straNumber: '', sipaExpiry: null, straExpiry: null, phone: '', email: '' },
    tax: { npwp: '', isPkp: false, defaultPpnRate: 11 },
  },
  invoice: { prefix: 'INV', autoNumber: true, defaultPaymentTermDays: 30 },
  purchaseOrder: { prefix: 'SP', autoNumber: true, requireApproval: true, approvalLevels: 2 },
  deliveryOrder: { prefix: 'SJ', autoNumber: true },
  salesOrder: { prefix: 'SO', autoNumber: true },
  delivery: { prefix: 'DLV', autoNumber: true, requireBatch: true, requireExpiry: true },
  returnOrder: { prefix: 'RTN', autoNumber: true, maxReturnDays: 14, requireApproval: true, autoRestockGood: false },
  payment: { prefix: 'PAY', autoNumber: true, bankAccounts: [], allowPartialPayment: true, allowCreditPayment: true, latePenaltyRate: 2 },
  memo: { creditPrefix: 'CM', debitPrefix: 'DM', autoNumber: true },
  gl: { journalPrefix: 'JRN', autoNumber: true },
  inventory: { enableBatchTracking: true, enableExpiryDate: true, useFEFO: true, lowStockThreshold: 10, temperatureZones: [{ name: 'CRT (Controlled Room Temperature)', minTemp: 15, maxTemp: 25 }, { name: 'Ruang Sejuk', minTemp: 8, maxTemp: 15 }, { name: 'Lemari Es', minTemp: 2, maxTemp: 8 }] },
  cdob: { enableTemperatureLog: true, enableRecallManagement: true, enableComplaintTracking: true, selfInspectionSchedule: 'quarterly', documentRetentionYears: 5 },
  medication: { trackNarcotic: true, trackPsychotropic: true, trackPrecursor: true, trackOtc: false, requireSpecialSP: true },
  customer: { requireSIA: true, customerTypes: ['apotek', 'rumah_sakit', 'klinik', 'puskesmas'], defaultCreditLimit: 50000000 },
  notification: { enableEmail: true, enableSMS: false, enableWhatsApp: false, alerts: { lowStock: true, nearExpiry: true, overduePayment: true, recall: true, temperatureAlert: true }, smtp: { host: '', port: 587, user: '', password: '', fromName: '', fromEmail: '' } },
  reporting: { bpom: { enableEReport: false, apiKey: '' }, fiscalYearStart: 1, currency: 'IDR' },
  general: { timezone: 'Asia/Jakarta', dateFormat: 'DD/MM/YYYY', language: 'id', maintenanceMode: false, sessionTimeoutMinutes: 60 },
  documentCounters: { invoice: { current: 0, lastReset: null }, purchaseOrder: { current: 0, lastReset: null }, deliveryOrder: { current: 0, lastReset: null }, returnOrder: { current: 0, lastReset: null }, payment: { current: 0, lastReset: null }, memo: { current: 0, lastReset: null }, journal: { current: 0, lastReset: null } },
};

const mysqlSanitize = (settings) => {
  const obj = JSON.parse(JSON.stringify(settings));
  if (obj.notification?.smtp?.password) obj.notification.smtp.password = '********';
  if (obj.reporting?.bpom?.apiKey) obj.reporting.bpom.apiKey = '********';
  delete obj.documentCounters;
  return obj;
};

const mysqlGetRaw = async () => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[row]] = await pool.query('SELECT * FROM app_settings WHERE setting_key = ? LIMIT 1', [SETTINGS_KEY]);
  if (!row) return null;
  return JSON.parse(row.setting_value || '{}');
};

const mysqlEnsureSettings = async () => {
  const s = await mysqlGetRaw();
  if (!s) throw ApiError.notFound('Settings belum di-initialize. Jalankan POST /settings/initialize terlebih dahulu.');
  return s;
};

const mysqlSaveSettings = async (settings) => {
  const pool = getMySQLPool();
  const normalizedSettings = await normalizeCompanyLogoForStorage(settings);
  await pool.query('UPDATE app_settings SET setting_value = ?, updated_at = NOW() WHERE setting_key = ?', [JSON.stringify(normalizedSettings), SETTINGS_KEY]);
  return normalizedSettings;
};

const mysqlGetSettings = async () => {
  const raw = await mysqlEnsureSettings();
  return mysqlSanitize(raw);
};

const mysqlGetSection = async (section) => {
  if (!VALID_SECTIONS.includes(section)) throw ApiError.badRequest(`Section '${section}' tidak valid`);
  const raw = await mysqlEnsureSettings();
  if (raw[section] === undefined) throw ApiError.notFound(`Section '${section}' tidak ditemukan`);
  const sanitized = mysqlSanitize(raw);
  return sanitized[section];
};

const mysqlInitializeSettings = async () => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const existing = await mysqlGetRaw();
  if (existing) throw ApiError.conflict('Settings sudah diinisialisasi');
  const id = randomUUID();
  await pool.query('INSERT INTO app_settings (id, setting_key, setting_value, created_at, updated_at) VALUES (?,?,?,NOW(),NOW())', [id, SETTINGS_KEY, JSON.stringify(DEFAULT_SETTINGS)]);
  return mysqlSanitize(DEFAULT_SETTINGS);
};

const mysqlUpdateAll = async (data) => {
  const raw = await mysqlEnsureSettings();
  deepMerge(raw, data);
  await mysqlSaveSettings(raw);
  return mysqlSanitize(raw);
};

const mysqlUpdateSection = async (section, data) => {
  const raw = await mysqlEnsureSettings();
  if (!raw[section]) raw[section] = {};
  deepMerge(raw[section], data);
  await mysqlSaveSettings(raw);
  const sanitized = mysqlSanitize(raw);
  return sanitized[section];
};

const mysqlUpdateCompany = async (data) => {
  const raw = await mysqlEnsureSettings();
  if (!raw.company) raw.company = {};

  const previousLogo = raw.company.logo;
  deepMerge(raw.company, data);

  await mysqlSaveSettings(raw);

  if (
    Object.prototype.hasOwnProperty.call(data, 'logo') &&
    previousLogo &&
    previousLogo !== raw.company.logo
  ) {
    await removeLocalCompanyLogo(previousLogo);
  }

  return mysqlSanitize(raw).company;
};

const mysqlUpdateLicenses = async (data) => {
  const raw = await mysqlEnsureSettings();
  if (!raw.company) raw.company = {};
  if (!raw.company.licenses) raw.company.licenses = {};
  deepMerge(raw.company.licenses, data);
  await mysqlSaveSettings(raw);
  return mysqlSanitize(raw).company.licenses;
};

const mysqlUpdatePharmacist = async (data) => {
  const raw = await mysqlEnsureSettings();
  if (!raw.company) raw.company = {};
  if (!raw.company.responsiblePharmacist) raw.company.responsiblePharmacist = {};
  deepMerge(raw.company.responsiblePharmacist, data);
  await mysqlSaveSettings(raw);
  return mysqlSanitize(raw).company.responsiblePharmacist;
};

const mysqlUpdatePharmacistObat = async (data) => {
  const raw = await mysqlEnsureSettings();
  if (!raw.company) raw.company = {};
  if (!raw.company.pharmacistObat) raw.company.pharmacistObat = {};
  deepMerge(raw.company.pharmacistObat, data);
  await mysqlSaveSettings(raw);
  return mysqlSanitize(raw).company.pharmacistObat;
};

const mysqlUpdatePharmacistAlkes = async (data) => {
  const raw = await mysqlEnsureSettings();
  if (!raw.company) raw.company = {};
  if (!raw.company.pharmacistAlkes) raw.company.pharmacistAlkes = {};
  deepMerge(raw.company.pharmacistAlkes, data);
  await mysqlSaveSettings(raw);
  return mysqlSanitize(raw).company.pharmacistAlkes;
};

const mysqlUpdateTax = async (data) => {
  const raw = await mysqlEnsureSettings();
  if (!raw.company) raw.company = {};
  if (!raw.company.tax) raw.company.tax = {};
  deepMerge(raw.company.tax, data);
  await mysqlSaveSettings(raw);
  return mysqlSanitize(raw).company.tax;
};

const mysqlGenerateDocNumber = async (type) => {
  const raw = await mysqlEnsureSettings();
  if (!raw[type]) throw ApiError.badRequest(`Setting for ${type} not found`);
  const cfg = raw[type];
  if (!cfg.autoNumber) throw ApiError.badRequest(`Auto-number tidak aktif untuk ${type}`);
  const prefix = cfg.prefix;
  const now = new Date();
  const period = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
  if (!raw.documentCounters) raw.documentCounters = {};
  if (!raw.documentCounters[type]) raw.documentCounters[type] = { current: 0, lastReset: null };
  raw.documentCounters[type].current += 1;
  const counter = raw.documentCounters[type].current;
  await mysqlSaveSettings(raw);
  const documentNumber = `${prefix}/${period}/${String(counter).padStart(6, '0')}`;
  return { documentNumber, type, counter };
};

const mysqlResetDocNumber = async (type) => {
  const raw = await mysqlEnsureSettings();
  if (!raw[type]) throw ApiError.badRequest(`Tipe dokumen '${type}' tidak valid`);
  if (!raw.documentCounters) raw.documentCounters = {};
  raw.documentCounters[type] = { current: 0, lastReset: new Date().toISOString() };
  await mysqlSaveSettings(raw);
  return { message: `Counter ${type} berhasil di-reset` };
};

const mysqlGetLicenseWarnings = async () => {
  const raw = await mysqlGetRaw();
  if (!raw) return [];
  const warnings = [];
  const today = new Date();
  const threshold = 30;

  const checkLicense = (name, license) => {
    if (!license?.expiryDate) return;
    const expiry = new Date(license.expiryDate);
    const daysUntilExpiry = Math.ceil((expiry - today) / (1000 * 60 * 60 * 24));
    if (daysUntilExpiry <= threshold) {
      warnings.push({
        license: name,
        number: license.number || '-',
        expiryDate: license.expiryDate,
        status: daysUntilExpiry < 0 ? 'expired' : 'expiring_soon',
        daysUntilExpiry,
      });
    }
  };

  const lic = raw.company?.licenses;
  checkLicense('PBF', lic?.pbf);
  checkLicense('SIUP', lic?.siup);
  checkLicense('TDP', lic?.tdp);
  checkLicense('CDOB', lic?.cdob);

  const pharm = raw.company?.responsiblePharmacist;
  if (pharm?.sipaExpiry) checkLicense('SIPA', { number: pharm.sipaNumber, expiryDate: pharm.sipaExpiry });
  if (pharm?.straExpiry) checkLicense('STRA', { number: pharm.straNumber, expiryDate: pharm.straExpiry });

  const pharmObat = raw.company?.pharmacistObat;
  if (pharmObat?.sipaExpiry) checkLicense('SIPA (Obat)', { number: pharmObat.sipaNumber, expiryDate: pharmObat.sipaExpiry });
  if (pharmObat?.straExpiry) checkLicense('STRA (Obat)', { number: pharmObat.straNumber, expiryDate: pharmObat.straExpiry });

  const pharmAlkes = raw.company?.pharmacistAlkes;
  if (pharmAlkes?.sipaExpiry) checkLicense('SIPA (Alkes)', { number: pharmAlkes.sipaNumber, expiryDate: pharmAlkes.sipaExpiry });
  if (pharmAlkes?.straExpiry) checkLicense('STRA (Alkes)', { number: pharmAlkes.straNumber, expiryDate: pharmAlkes.straExpiry });

  warnings.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  return warnings;
};

const mysqlTestSmtp = async () => {
  const raw = await mysqlEnsureSettings();
  const smtp = raw.notification?.smtp;
  if (!smtp?.host || !smtp?.port) throw ApiError.badRequest('SMTP belum dikonfigurasi');
  return { message: 'SMTP configuration is valid (test mode)' };
};

const getSettings = () => mysqlGetSettings();
const getSection = (section) => mysqlGetSection(section);
const initializeSettings = () => mysqlInitializeSettings();
const updateAll = (data) => mysqlUpdateAll(data);
const updateCompany = (data) => mysqlUpdateCompany(data);
const updateLicenses = (data) => mysqlUpdateLicenses(data);
const updatePharmacist = (data) => mysqlUpdatePharmacist(data);
const updatePharmacistObat = (data) => mysqlUpdatePharmacistObat(data);
const updatePharmacistAlkes = (data) => mysqlUpdatePharmacistAlkes(data);
const updateTax = (data) => mysqlUpdateTax(data);
const updateInvoice = (data) => mysqlUpdateSection('invoice', data);
const updatePurchaseOrder = (data) => mysqlUpdateSection('purchaseOrder', data);
const updateDeliveryOrder = (data) => mysqlUpdateSection('deliveryOrder', data);
const updateReturnOrder = (data) => mysqlUpdateSection('returnOrder', data);
const updateInventory = (data) => mysqlUpdateSection('inventory', data);
const updateCdob = (data) => mysqlUpdateSection('cdob', data);
const updateMedication = (data) => mysqlUpdateSection('medication', data);
const updateCustomer = (data) => mysqlUpdateSection('customer', data);
const updatePayment = (data) => mysqlUpdateSection('payment', data);
const updateNotification = (data) => mysqlUpdateSection('notification', data);
const updateReporting = (data) => mysqlUpdateSection('reporting', data);
const updateGeneral = (data) => mysqlUpdateSection('general', data);
const generateDocNumber = (type) => mysqlGenerateDocNumber(type);
const resetDocNumber = (type) => mysqlResetDocNumber(type);
const getLicenseWarnings = () => mysqlGetLicenseWarnings();
const testSmtp = () => mysqlTestSmtp();

module.exports = {
  getSettings,
  getSection,
  initializeSettings,
  updateAll,
  updateCompany,
  updateLicenses,
  updatePharmacist,
  updatePharmacistObat,
  updatePharmacistAlkes,
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
