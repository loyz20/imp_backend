const AppSetting = require('../models/AppSetting');
const ApiError = require('../utils/ApiError');
const { VALID_SECTIONS } = require('../constants');
const config = require('../config');
const { getMySQLPool } = require('../config/database');
const mongoose = require('mongoose');

// ── Helper: Flatten nested object for $set operations ──
function flattenObject(obj, prefix = '', result = {}) {
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    const val = obj[key];

    if (
      val !== null &&
      val !== undefined &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      !(val instanceof Date)
    ) {
      flattenObject(val, fullKey, result);
    } else {
      result[fullKey] = val;
    }
  }
  return result;
}

// ── Helper: deep merge (target ← source) ──
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

// ── Helper: set nested value by dotted path ──
function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (!cur[keys[i]] || typeof cur[keys[i]] !== 'object') cur[keys[i]] = {};
    cur = cur[keys[i]];
  }
  cur[keys[keys.length - 1]] = value;
}

// ── Mongo Helper: ensure settings exist ──
async function ensureSettings() {
  const settings = await AppSetting.findOne();
  if (!settings) {
    throw ApiError.notFound('Settings belum di-initialize. Jalankan POST /settings/initialize terlebih dahulu.');
  }
  return settings;
}

function getSanitizedSection(settings, section) {
  const serialized = settings.toJSON();
  return serialized[section];
}

// ─── Mongo Implementations ───

const mongoGetSettings = async () => {
  return ensureSettings();
};

const mongoGetSection = async (section) => {
  if (!VALID_SECTIONS.includes(section)) {
    throw ApiError.badRequest(`Section '${section}' tidak valid`);
  }
  const settings = await ensureSettings();
  const data = settings.toJSON();
  if (data[section] === undefined) {
    throw ApiError.notFound(`Section '${section}' tidak ditemukan`);
  }
  return data[section];
};

const mongoInitializeSettings = async () => {
  const existing = await AppSetting.findOne();
  if (existing) {
    throw ApiError.conflict('Settings sudah diinisialisasi');
  }
  const settings = await AppSetting.create({});
  return settings;
};

const mongoUpdateAll = async (data) => {
  await ensureSettings();
  const flattened = flattenObject(data);
  const settings = await AppSetting.findOneAndUpdate(
    {},
    { $set: flattened },
    { new: true, runValidators: true }
  );
  return settings;
};

const mongoUpdateCompany = async (data) => {
  await ensureSettings();
  const flattened = flattenObject(data, 'company');
  const settings = await AppSetting.findOneAndUpdate(
    {},
    { $set: flattened },
    { new: true, runValidators: true }
  );
  return getSanitizedSection(settings, 'company');
};

const mongoUpdateLicenses = async (data) => {
  await ensureSettings();
  const flattened = flattenObject(data, 'company.licenses');
  const settings = await AppSetting.findOneAndUpdate(
    {},
    { $set: flattened },
    { new: true, runValidators: true }
  );
  return getSanitizedSection(settings, 'company').licenses;
};

const mongoUpdatePharmacist = async (data) => {
  await ensureSettings();
  const flattened = flattenObject(data, 'company.responsiblePharmacist');
  const settings = await AppSetting.findOneAndUpdate(
    {},
    { $set: flattened },
    { new: true, runValidators: true }
  );
  return getSanitizedSection(settings, 'company').responsiblePharmacist;
};

const mongoUpdatePharmacistObat = async (data) => {
  await ensureSettings();
  const flattened = flattenObject(data, 'company.pharmacistObat');
  const settings = await AppSetting.findOneAndUpdate(
    {},
    { $set: flattened },
    { new: true, runValidators: true }
  );
  return getSanitizedSection(settings, 'company').pharmacistObat;
};

const mongoUpdatePharmacistAlkes = async (data) => {
  await ensureSettings();
  const flattened = flattenObject(data, 'company.pharmacistAlkes');
  const settings = await AppSetting.findOneAndUpdate(
    {},
    { $set: flattened },
    { new: true, runValidators: true }
  );
  return getSanitizedSection(settings, 'company').pharmacistAlkes;
};

const mongoUpdateTax = async (data) => {
  await ensureSettings();
  const flattened = flattenObject(data, 'company.tax');
  const settings = await AppSetting.findOneAndUpdate(
    {},
    { $set: flattened },
    { new: true, runValidators: true }
  );
  return getSanitizedSection(settings, 'company').tax;
};

const mongoUpdateDocSection = async (section, data) => {
  await ensureSettings();
  const flattened = flattenObject(data, section);
  const settings = await AppSetting.findOneAndUpdate(
    {},
    { $set: flattened },
    { new: true, runValidators: true }
  );
  return getSanitizedSection(settings, section);
};

const mongoUpdateOperationalSection = async (section, data) => {
  await ensureSettings();
  const setData = {};
  for (const [key, val] of Object.entries(data)) {
    if (Array.isArray(val)) {
      setData[`${section}.${key}`] = val;
    } else if (val !== null && val !== undefined && typeof val === 'object' && !(val instanceof Date)) {
      const sub = flattenObject(val, `${section}.${key}`);
      Object.assign(setData, sub);
    } else {
      setData[`${section}.${key}`] = val;
    }
  }
  const settings = await AppSetting.findOneAndUpdate(
    {},
    { $set: setData },
    { new: true, runValidators: true }
  );
  return getSanitizedSection(settings, section);
};

const mongoGenerateDocNumber = async (type) => {
  await ensureSettings();
  const result = await AppSetting.generateDocNumber(type);
  if (!result) {
    throw ApiError.badRequest(`Auto-number tidak aktif untuk ${type}`);
  }
  return result;
};

const mongoResetDocNumber = async (type) => {
  const settings = await ensureSettings();
  if (!settings[type]) {
    throw ApiError.badRequest(`Tipe dokumen '${type}' tidak valid`);
  }
  await AppSetting.findOneAndUpdate(
    {},
    { $set: { [`documentCounters.${type}.current`]: 0, [`documentCounters.${type}.lastReset`]: new Date() } }
  );
  return { message: `Counter ${type} berhasil di-reset` };
};

const mongoGetLicenseWarnings = async () => {
  const settings = await AppSetting.findOne();
  if (!settings) return [];
  return settings.getLicenseWarnings();
};

const mongoTestSmtp = async () => {
  const settings = await ensureSettings();
  const smtp = settings.notification?.smtp;
  if (!smtp?.host || !smtp?.port) {
    throw ApiError.badRequest('SMTP belum dikonfigurasi');
  }
  return { message: 'SMTP configuration is valid (test mode)' };
};

// ─── MySQL Helpers ───

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
  await pool.query('UPDATE app_settings SET setting_value = ?, updated_at = NOW() WHERE setting_key = ?', [JSON.stringify(settings), SETTINGS_KEY]);
  return settings;
};

// ─── MySQL Implementations ───

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
  const id = new mongoose.Types.ObjectId().toString();
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

const mysqlUpdateCompany = (data) => mysqlUpdateSection('company', data);

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
      warnings.push({ license: name, number: license.number || '-', expiryDate: license.expiryDate, status: daysUntilExpiry < 0 ? 'expired' : 'expiring_soon', daysUntilExpiry });
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

// ─── Exported Functions with Provider Branching ───

const isMysql = () => config.dbProvider === 'mysql';

const getSettings = () => isMysql() ? mysqlGetSettings() : mongoGetSettings();
const getSection = (section) => isMysql() ? mysqlGetSection(section) : mongoGetSection(section);
const initializeSettings = () => isMysql() ? mysqlInitializeSettings() : mongoInitializeSettings();
const updateAll = (data) => isMysql() ? mysqlUpdateAll(data) : mongoUpdateAll(data);
const updateCompany = (data) => isMysql() ? mysqlUpdateCompany(data) : mongoUpdateCompany(data);
const updateLicenses = (data) => isMysql() ? mysqlUpdateLicenses(data) : mongoUpdateLicenses(data);
const updatePharmacist = (data) => isMysql() ? mysqlUpdatePharmacist(data) : mongoUpdatePharmacist(data);
const updatePharmacistObat = (data) => isMysql() ? mysqlUpdatePharmacistObat(data) : mongoUpdatePharmacistObat(data);
const updatePharmacistAlkes = (data) => isMysql() ? mysqlUpdatePharmacistAlkes(data) : mongoUpdatePharmacistAlkes(data);
const updateTax = (data) => isMysql() ? mysqlUpdateTax(data) : mongoUpdateTax(data);
const updateInvoice = (data) => isMysql() ? mysqlUpdateSection('invoice', data) : mongoUpdateDocSection('invoice', data);
const updatePurchaseOrder = (data) => isMysql() ? mysqlUpdateSection('purchaseOrder', data) : mongoUpdateDocSection('purchaseOrder', data);
const updateDeliveryOrder = (data) => isMysql() ? mysqlUpdateSection('deliveryOrder', data) : mongoUpdateDocSection('deliveryOrder', data);
const updateReturnOrder = (data) => isMysql() ? mysqlUpdateSection('returnOrder', data) : mongoUpdateDocSection('returnOrder', data);
const updateInventory = (data) => isMysql() ? mysqlUpdateSection('inventory', data) : mongoUpdateOperationalSection('inventory', data);
const updateCdob = (data) => isMysql() ? mysqlUpdateSection('cdob', data) : mongoUpdateOperationalSection('cdob', data);
const updateMedication = (data) => isMysql() ? mysqlUpdateSection('medication', data) : mongoUpdateOperationalSection('medication', data);
const updateCustomer = (data) => isMysql() ? mysqlUpdateSection('customer', data) : mongoUpdateOperationalSection('customer', data);
const updatePayment = (data) => isMysql() ? mysqlUpdateSection('payment', data) : mongoUpdateOperationalSection('payment', data);
const updateNotification = (data) => isMysql() ? mysqlUpdateSection('notification', data) : mongoUpdateOperationalSection('notification', data);
const updateReporting = (data) => isMysql() ? mysqlUpdateSection('reporting', data) : mongoUpdateOperationalSection('reporting', data);
const updateGeneral = (data) => isMysql() ? mysqlUpdateSection('general', data) : mongoUpdateOperationalSection('general', data);
const generateDocNumber = (type) => isMysql() ? mysqlGenerateDocNumber(type) : mongoGenerateDocNumber(type);
const resetDocNumber = (type) => isMysql() ? mysqlResetDocNumber(type) : mongoResetDocNumber(type);
const getLicenseWarnings = () => isMysql() ? mysqlGetLicenseWarnings() : mongoGetLicenseWarnings();
const testSmtp = (testEmail) => isMysql() ? mysqlTestSmtp(testEmail) : mongoTestSmtp(testEmail);

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
