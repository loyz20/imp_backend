const mongoose = require('mongoose');
const { PO_STATUS, SATUAN } = require('../constants');

const approvalHistorySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, enum: ['approved', 'rejected'], required: true },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
    date: { type: Date, default: Date.now },
    level: { type: Number, default: 1 },
  },
  { _id: false },
);

const poItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: [true, 'Product is required'],
  },
  satuan: {
    type: String,
    enum: SATUAN,
    required: [true, 'Satuan is required'],
  },
  quantity: {
    type: Number,
    required: [true, 'Quantity is required'],
    min: 1,
  },
  unitPrice: {
    type: Number,
    required: [true, 'Unit price is required'],
    min: 0,
  },
  discount: {
    type: Number,
    min: 0,
    max: 100,
    default: 0,
  },
  subtotal: {
    type: Number,
    default: 0,
  },
  receivedQty: {
    type: Number,
    default: 0,
    min: 0,
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500,
    default: '',
  },
});

const purchaseOrderSchema = new mongoose.Schema(
  {
    poNumber: {
      type: String,
      unique: true,
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(PO_STATUS),
      default: PO_STATUS.DRAFT,
      index: true,
    },

    // ── Supplier ──
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: [true, 'Supplier is required'],
      index: true,
    },

    // ── Tanggal ──
    orderDate: {
      type: Date,
      required: [true, 'Order date is required'],
    },
    expectedDeliveryDate: {
      type: Date,
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    sentAt: {
      type: Date,
      default: null,
    },

    // ── Pembayaran ──
    paymentTermDays: {
      type: Number,
      min: 0,
      max: 365,
      default: 30,
    },

    // ── Items ──
    items: {
      type: [poItemSchema],
      validate: {
        validator: (v) => v.length > 0,
        message: 'Minimal 1 item harus ditambahkan',
      },
    },

    // ── Kalkulasi ──
    subtotal: { type: Number, default: 0 },
    ppnAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    remainingAmount: { type: Number, default: 0, min: 0 },

    // ── Catatan ──
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },

    // ── Approval ──
    approvalHistory: [approvalHistorySchema],

    // ── Metadata ──
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
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
purchaseOrderSchema.index({ createdAt: -1 });
purchaseOrderSchema.index({ orderDate: -1 });
purchaseOrderSchema.index(
  { poNumber: 'text' },
  { name: 'po_search' },
);

// ─── Calculate totals ───
purchaseOrderSchema.methods.calculateTotals = function (ppnRate) {
  for (const item of this.items) {
    item.subtotal = Math.round(item.quantity * item.unitPrice * (1 - item.discount / 100));
  }
  this.subtotal = this.items.reduce((sum, item) => sum + item.subtotal, 0);
  const rate = ppnRate !== undefined ? ppnRate : 11;
  this.ppnAmount = Math.round(this.subtotal * rate / 100);
  this.totalAmount = this.subtotal + this.ppnAmount;
  this.remainingAmount = Math.max(0, this.totalAmount - (this.paidAmount || 0));
};

// ─── Pre-save: Auto-generate PO Number & calculate totals ───
purchaseOrderSchema.pre('save', async function () {
  // Auto-generate PO number
  if (this.isNew && !this.poNumber) {
    const now = new Date();
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const prefix = `SP-${ymd}-`;

    const last = await this.constructor
      .findOne({ poNumber: { $regex: `^${prefix}` } })
      .sort({ poNumber: -1 })
      .select('poNumber')
      .lean();

    let nextNum = 1;
    if (last) {
      const lastNum = parseInt(last.poNumber.replace(prefix, ''), 10);
      nextNum = lastNum + 1;
    }
    this.poNumber = `${prefix}${String(nextNum).padStart(4, '0')}`;
  }

  // Calculate totals using PPN rate from settings
  if (this.isModified('items') || this.isNew) {
    const AppSetting = require('./AppSetting');
    const settings = await AppSetting.getSettings();
    const isPkp = settings?.company?.tax?.isPkp !== false;
    const ppnRate = isPkp ? (settings?.company?.tax?.defaultPpnRate ?? 11) : 0;
    this.calculateTotals(ppnRate);
  }
});

module.exports = mongoose.model('PurchaseOrder', purchaseOrderSchema);
