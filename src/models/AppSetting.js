const mongoose = require('mongoose');
const { Schema } = mongoose;
const { encrypt } = require('../utils/crypto');

// Sub-Schemas

const addressSchema = new Schema(
  {
    street: { type: String, default: '' },
    city: { type: String, default: '' },
    province: { type: String, default: '' },
    postalCode: { type: String, default: '' },
    country: { type: String, default: 'Indonesia' },
  },
  { _id: false }
);

const licenseSchema = new Schema(
  {
    number: { type: String, default: '' },
    issuedDate: { type: Date, default: null },
    expiryDate: { type: Date, default: null },
    document: { type: String, default: null },
  },
  { _id: false }
);

const pharmacistSchema = new Schema(
  {
    name: { type: String, default: '' },
    sipaNumber: { type: String, default: '' },
    straNumber: { type: String, default: '' },
    sipaExpiry: { type: Date, default: null },
    straExpiry: { type: Date, default: null },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
  },
  { _id: false }
);

const taxSchema = new Schema(
  {
    npwp: { type: String, default: '' },
    isPkp: { type: Boolean, default: false },
    defaultPpnRate: { type: Number, default: 11, min: 0, max: 100 },
  },
  { _id: false }
);

const bankAccountSchema = new Schema(
  {
    bankName: { type: String, required: true },
    accountNumber: { type: String, required: true },
    accountName: { type: String, required: true },
  },
  { _id: false }
);

const temperatureZoneSchema = new Schema(
  {
    name: { type: String, required: true },
    minTemp: { type: Number, required: true, min: -50, max: 50 },
    maxTemp: { type: Number, required: true, min: -50, max: 50 },
  },
  { _id: false }
);

const docCounterSchema = new Schema(
  {
    current: { type: Number, default: 0 },
    lastReset: { type: Date, default: Date.now },
  },
  { _id: false }
);

// Main Settings Schema - Singleton

const settingsSchema = new Schema(
  {
    company: {
      name: { type: String, default: '' },
      logo: { type: String, default: null },
      phone: { type: String, default: '' },
      email: { type: String, default: '' },
      website: { type: String, default: '' },
      officeAddress: { type: addressSchema, default: () => ({}) },
      warehouseAddress: { type: addressSchema, default: () => ({}) },
      licenses: {
        pbf: { type: licenseSchema, default: () => ({}) },
        siup: { type: licenseSchema, default: () => ({}) },
        tdp: { type: licenseSchema, default: () => ({}) },
        nib: { number: { type: String, default: '' } },
        cdob: { type: licenseSchema, default: () => ({}) },
      },
      responsiblePharmacist: { type: pharmacistSchema, default: () => ({}) },
      pharmacistObat: { type: pharmacistSchema, default: () => ({}) },
      pharmacistAlkes: { type: pharmacistSchema, default: () => ({}) },
      tax: { type: taxSchema, default: () => ({}) },
    },

    invoice: {
      prefix: { type: String, default: 'INV' },
      autoNumber: { type: Boolean, default: true },
      defaultPaymentTermDays: { type: Number, default: 30, min: 0, max: 365 },
    },
    purchaseOrder: {
      prefix: { type: String, default: 'SP' },
      autoNumber: { type: Boolean, default: true },
      requireApproval: { type: Boolean, default: true },
      approvalLevels: { type: Number, default: 2, min: 1, max: 5 },
    },
    deliveryOrder: {
      prefix: { type: String, default: 'SJ' },
      autoNumber: { type: Boolean, default: true },
    },
    salesOrder: {
      prefix: { type: String, default: 'SO' },
      autoNumber: { type: Boolean, default: true },
    },
    delivery: {
      prefix: { type: String, default: 'DLV' },
      autoNumber: { type: Boolean, default: true },
      requireBatch: { type: Boolean, default: true },
      requireExpiry: { type: Boolean, default: true },
    },
    returnOrder: {
      prefix: { type: String, default: 'RTN' },
      autoNumber: { type: Boolean, default: true },
      maxReturnDays: { type: Number, default: 14, min: 1, max: 365 },
      requireApproval: { type: Boolean, default: true },
      autoRestockGood: { type: Boolean, default: false },
    },
    payment: {
      prefix: { type: String, default: 'PAY' },
      autoNumber: { type: Boolean, default: true },
      bankAccounts: { type: [bankAccountSchema], default: [] },
      allowPartialPayment: { type: Boolean, default: true },
      allowCreditPayment: { type: Boolean, default: true },
      latePenaltyRate: { type: Number, default: 2, min: 0, max: 100 },
    },
    memo: {
      creditPrefix: { type: String, default: 'CM' },
      debitPrefix: { type: String, default: 'DM' },
      autoNumber: { type: Boolean, default: true },
    },
    gl: {
      journalPrefix: { type: String, default: 'JRN' },
      autoNumber: { type: Boolean, default: true },
    },

    inventory: {
      enableBatchTracking: { type: Boolean, default: true },
      enableExpiryDate: { type: Boolean, default: true },
      useFEFO: { type: Boolean, default: true },
      lowStockThreshold: { type: Number, default: 10, min: 0 },
      temperatureZones: {
        type: [temperatureZoneSchema],
        default: () => [
          { name: 'CRT (Controlled Room Temperature)', minTemp: 15, maxTemp: 25 },
          { name: 'Ruang Sejuk', minTemp: 8, maxTemp: 15 },
          { name: 'Lemari Es', minTemp: 2, maxTemp: 8 },
        ],
      },
    },
    cdob: {
      enableTemperatureLog: { type: Boolean, default: true },
      enableRecallManagement: { type: Boolean, default: true },
      enableComplaintTracking: { type: Boolean, default: true },
      selfInspectionSchedule: {
        type: String,
        enum: ['monthly', 'quarterly', 'biannually', 'annually'],
        default: 'quarterly',
      },
      documentRetentionYears: { type: Number, default: 5, min: 1, max: 30 },
    },
    medication: {
      trackNarcotic: { type: Boolean, default: true },
      trackPsychotropic: { type: Boolean, default: true },
      trackPrecursor: { type: Boolean, default: true },
      trackOtc: { type: Boolean, default: false },
      requireSpecialSP: { type: Boolean, default: true },
    },
    customer: {
      requireSIA: { type: Boolean, default: true },
      customerTypes: {
        type: [String],
        enum: ['apotek', 'rumah_sakit', 'klinik', 'puskesmas', 'toko_obat', 'pbf_lain', 'pemerintah'],
        default: ['apotek', 'rumah_sakit', 'klinik', 'puskesmas'],
      },
      defaultCreditLimit: { type: Number, default: 50000000, min: 0 },
    },

    notification: {
      enableEmail: { type: Boolean, default: true },
      enableSMS: { type: Boolean, default: false },
      enableWhatsApp: { type: Boolean, default: false },
      alerts: {
        lowStock: { type: Boolean, default: true },
        nearExpiry: { type: Boolean, default: true },
        overduePayment: { type: Boolean, default: true },
        recall: { type: Boolean, default: true },
        temperatureAlert: { type: Boolean, default: true },
      },
      smtp: {
        host: { type: String, default: '' },
        port: { type: Number, default: 587 },
        user: { type: String, default: '' },
        password: { type: String, default: '', set: encrypt },
        fromName: { type: String, default: '' },
        fromEmail: { type: String, default: '' },
      },
    },
    reporting: {
      bpom: {
        enableEReport: { type: Boolean, default: false },
        apiKey: { type: String, default: '', set: encrypt },
      },
      fiscalYearStart: { type: Number, default: 1, min: 1, max: 12 },
      currency: { type: String, default: 'IDR' },
    },
    general: {
      timezone: {
        type: String,
        enum: ['Asia/Jakarta', 'Asia/Makassar', 'Asia/Jayapura'],
        default: 'Asia/Jakarta',
      },
      dateFormat: {
        type: String,
        enum: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'],
        default: 'DD/MM/YYYY',
      },
      language: { type: String, enum: ['id', 'en'], default: 'id' },
      maintenanceMode: { type: Boolean, default: false },
      sessionTimeoutMinutes: { type: Number, default: 60, min: 5, max: 1440 },
    },

    documentCounters: {
      invoice: { type: docCounterSchema, default: () => ({}) },
      purchaseOrder: { type: docCounterSchema, default: () => ({}) },
      deliveryOrder: { type: docCounterSchema, default: () => ({}) },
      returnOrder: { type: docCounterSchema, default: () => ({}) },
      payment: { type: docCounterSchema, default: () => ({}) },
      memo: { type: docCounterSchema, default: () => ({}) },
      journal: { type: docCounterSchema, default: () => ({}) },
    },
  },
  {
    timestamps: true,
    collection: 'settings',
  }
);

// Statics

settingsSchema.statics.getSettings = async function () {
  return this.findOne();
};

settingsSchema.statics.generateDocNumber = async function (type) {
  const settings = await this.findOne();
  if (!settings || !settings[type]) {
    throw new Error(`Setting for ${type} not found`);
  }

  const config = settings[type];
  if (!config.autoNumber) return null;

  const prefix = config.prefix;
  const now = new Date();
  const period = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  const updated = await this.findOneAndUpdate(
    {},
    { $inc: { [`documentCounters.${type}.current`]: 1 } },
    { new: true }
  );

  const counter = updated.documentCounters[type].current;
  const docNumber = `${prefix}/${period}/${String(counter).padStart(6, '0')}`;

  return { documentNumber: docNumber, type, counter };
};

// Methods

settingsSchema.methods.getLicenseWarnings = function () {
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

  const lic = this.company?.licenses;
  checkLicense('PBF', lic?.pbf);
  checkLicense('SIUP', lic?.siup);
  checkLicense('TDP', lic?.tdp);
  checkLicense('CDOB', lic?.cdob);

  const pharm = this.company?.responsiblePharmacist;
  if (pharm?.sipaExpiry) {
    checkLicense('SIPA', { number: pharm.sipaNumber, expiryDate: pharm.sipaExpiry });
  }
  if (pharm?.straExpiry) {
    checkLicense('STRA', { number: pharm.straNumber, expiryDate: pharm.straExpiry });
  }

  const pharmObat = this.company?.pharmacistObat;
  if (pharmObat?.sipaExpiry) {
    checkLicense('SIPA (Obat)', { number: pharmObat.sipaNumber, expiryDate: pharmObat.sipaExpiry });
  }
  if (pharmObat?.straExpiry) {
    checkLicense('STRA (Obat)', { number: pharmObat.straNumber, expiryDate: pharmObat.straExpiry });
  }

  const pharmAlkes = this.company?.pharmacistAlkes;
  if (pharmAlkes?.sipaExpiry) {
    checkLicense('SIPA (Alkes)', { number: pharmAlkes.sipaNumber, expiryDate: pharmAlkes.sipaExpiry });
  }
  if (pharmAlkes?.straExpiry) {
    checkLicense('STRA (Alkes)', { number: pharmAlkes.straNumber, expiryDate: pharmAlkes.straExpiry });
  }

  warnings.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
  return warnings;
};

// JSON Transform - mask sensitive fields, hide counters

settingsSchema.methods.toJSON = function () {
  const obj = this.toObject();
  if (obj.notification?.smtp?.password) {
    obj.notification.smtp.password = '********';
  }
  if (obj.reporting?.bpom?.apiKey) {
    obj.reporting.bpom.apiKey = '********';
  }
  delete obj.documentCounters;
  delete obj.__v;
  return obj;
};

const AppSetting = mongoose.model('AppSetting', settingsSchema);

module.exports = AppSetting;
