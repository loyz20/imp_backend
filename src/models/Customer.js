const mongoose = require('mongoose');
const { CUSTOMER_TYPE } = require('../constants');

const addressSchema = new mongoose.Schema(
  {
    street: { type: String, trim: true, maxlength: 500, default: null },
    city: { type: String, trim: true, maxlength: 100, default: null },
    province: { type: String, trim: true, maxlength: 100, default: null },
    postalCode: { type: String, trim: true, maxlength: 10, default: null },
    country: { type: String, trim: true, default: 'Indonesia' },
  },
  { _id: false },
);

const siaLicenseSchema = new mongoose.Schema(
  {
    number: { type: String, trim: true, maxlength: 100, default: null },
    expiryDate: { type: Date, default: null },
  },
  { _id: false },
);

const pharmacistSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, maxlength: 200, default: null },
    sipaNumber: { type: String, trim: true, maxlength: 100, default: null },
  },
  { _id: false },
);

const bankAccountSchema = new mongoose.Schema(
  {
    bankName: { type: String, trim: true, maxlength: 100, default: null },
    accountNumber: { type: String, trim: true, maxlength: 50, default: null },
    accountName: { type: String, trim: true, maxlength: 200, default: null },
  },
  { _id: false },
);

const customerSchema = new mongoose.Schema(
  {
    // ── Identitas ──
    name: {
      type: String,
      required: [true, 'Customer name is required'],
      trim: true,
      minlength: 2,
      maxlength: 200,
    },
    code: {
      type: String,
      unique: true,
      trim: true,
    },
    type: {
      type: String,
      required: [true, 'Customer type is required'],
      enum: Object.values(CUSTOMER_TYPE),
      index: true,
    },

    // ── Kontak ──
    contactPerson: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },
    phone: {
      type: String,
      trim: true,
      maxlength: 30,
      default: null,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },
    website: {
      type: String,
      trim: true,
      default: null,
    },

    // ── Alamat ──
    address: {
      type: addressSchema,
      default: () => ({}),
    },

    // ── Perizinan ──
    siaLicense: {
      type: siaLicenseSchema,
      default: () => ({}),
    },

    // ── Apoteker Penanggung Jawab ──
    pharmacist: {
      type: pharmacistSchema,
      default: () => ({}),
    },

    // ── Pembayaran ──
    paymentTermDays: {
      type: Number,
      min: 0,
      max: 365,
      default: 30,
    },
    creditLimit: {
      type: Number,
      min: 0,
      max: 999999999999,
      default: 50000000,
    },
    bankAccount: {
      type: bankAccountSchema,
      default: () => ({}),
    },

    // ── Lainnya ──
    npwp: {
      type: String,
      trim: true,
      default: null,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // ── Metadata ──
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  },
);

// ─── Indexes ───
customerSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
customerSchema.index({ createdAt: -1 });
customerSchema.index({ 'address.city': 1 });
customerSchema.index({ 'siaLicense.expiryDate': 1 });
customerSchema.index(
  { name: 'text', code: 'text', contactPerson: 'text', email: 'text', phone: 'text' },
  { name: 'customer_search' },
);

// ─── Pre-save: Auto-generate Code ───
customerSchema.pre('save', async function () {
  if (this.isNew && !this.code) {
    const now = new Date();
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const prefix = `CUS-${ymd}-`;

    const lastCustomer = await this.constructor
      .findOne({ code: { $regex: `^${prefix}` } })
      .sort({ code: -1 })
      .select('code')
      .lean();

    let nextNum = 1;
    if (lastCustomer) {
      const lastNum = parseInt(lastCustomer.code.replace(prefix, ''), 10);
      nextNum = lastNum + 1;
    }
    this.code = `${prefix}${String(nextNum).padStart(4, '0')}`;
  }
});

module.exports = mongoose.model('Customer', customerSchema);
