const AppSetting = require('../models/AppSetting');
const ApiError = require('../utils/ApiError');
const { VALID_SECTIONS } = require('../constants');

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

// ── Helper: ensure settings exist ──
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

const getSettings = async () => {
  return ensureSettings();
};

const getSection = async (section) => {
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

const initializeSettings = async () => {
  const existing = await AppSetting.findOne();
  if (existing) {
    throw ApiError.conflict('Settings sudah diinisialisasi');
  }
  const settings = await AppSetting.create({});
  return settings;
};

const updateAll = async (data) => {
  await ensureSettings();
  const flattened = flattenObject(data);
  const settings = await AppSetting.findOneAndUpdate(
    {},
    { $set: flattened },
    { new: true, runValidators: true }
  );
  return settings;
};

// ── Per-section update helpers ──

const updateCompany = async (data) => {
  await ensureSettings();
  const flattened = flattenObject(data, 'company');
  const settings = await AppSetting.findOneAndUpdate(
    {},
    { $set: flattened },
    { new: true, runValidators: true }
  );
  return getSanitizedSection(settings, 'company');
};

const updateLicenses = async (data) => {
  await ensureSettings();
  const flattened = flattenObject(data, 'company.licenses');
  const settings = await AppSetting.findOneAndUpdate(
    {},
    { $set: flattened },
    { new: true, runValidators: true }
  );
  return getSanitizedSection(settings, 'company').licenses;
};

const updatePharmacist = async (data) => {
  await ensureSettings();
  const flattened = flattenObject(data, 'company.responsiblePharmacist');
  const settings = await AppSetting.findOneAndUpdate(
    {},
    { $set: flattened },
    { new: true, runValidators: true }
  );
  return getSanitizedSection(settings, 'company').responsiblePharmacist;
};

const updateTax = async (data) => {
  await ensureSettings();
  const flattened = flattenObject(data, 'company.tax');
  const settings = await AppSetting.findOneAndUpdate(
    {},
    { $set: flattened },
    { new: true, runValidators: true }
  );
  return getSanitizedSection(settings, 'company').tax;
};

const updateDocSection = async (section, data) => {
  await ensureSettings();
  const flattened = flattenObject(data, section);
  const settings = await AppSetting.findOneAndUpdate(
    {},
    { $set: flattened },
    { new: true, runValidators: true }
  );
  return getSanitizedSection(settings, section);
};

const updateInvoice = (data) => updateDocSection('invoice', data);
const updatePurchaseOrder = (data) => updateDocSection('purchaseOrder', data);
const updateDeliveryOrder = (data) => updateDocSection('deliveryOrder', data);
const updateReturnOrder = (data) => updateDocSection('returnOrder', data);

const updateOperationalSection = async (section, data) => {
  await ensureSettings();
  // Arrays (temperatureZones, customerTypes, bankAccounts) need full replace, not flatten
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

const updateInventory = (data) => updateOperationalSection('inventory', data);
const updateCdob = (data) => updateOperationalSection('cdob', data);
const updateMedication = (data) => updateOperationalSection('medication', data);
const updateCustomer = (data) => updateOperationalSection('customer', data);
const updatePayment = (data) => updateOperationalSection('payment', data);
const updateNotification = (data) => updateOperationalSection('notification', data);
const updateReporting = (data) => updateOperationalSection('reporting', data);
const updateGeneral = (data) => updateOperationalSection('general', data);

const generateDocNumber = async (type) => {
  await ensureSettings();
  const result = await AppSetting.generateDocNumber(type);
  if (!result) {
    throw ApiError.badRequest(`Auto-number tidak aktif untuk ${type}`);
  }
  return result;
};

const resetDocNumber = async (type) => {
  const settings = await ensureSettings();
  if (!settings[type]) {
    throw ApiError.badRequest(`Tipe dokumen '${type}' tidak valid`);
  }

  await AppSetting.findOneAndUpdate(
    {},
    {
      $set: {
        [`documentCounters.${type}.current`]: 0,
        [`documentCounters.${type}.lastReset`]: new Date(),
      },
    }
  );

  return { message: `Counter ${type} berhasil di-reset` };
};

const getLicenseWarnings = async () => {
  const settings = await AppSetting.findOne();
  if (!settings) return [];
  return settings.getLicenseWarnings();
};

const testSmtp = async (testEmail) => {
  const settings = await ensureSettings();
  const smtp = settings.notification?.smtp;
  if (!smtp?.host || !smtp?.port) {
    throw ApiError.badRequest('SMTP belum dikonfigurasi');
  }

  
  return { message: 'SMTP configuration is valid (test mode)' };
};

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
