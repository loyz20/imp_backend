const mongoose = require('mongoose');
const { INVOICE_STATUS, SATUAN } = require('../constants');

const invoiceItemSchema = new mongoose.Schema({
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
    default: 0,
    min: 0,
  },
  subtotal: {
    type: Number,
    default: 0,
    min: 0,
  },
  batchNumber: {
    type: String,
    trim: true,
    maxlength: 50,
    default: null,
  },
  expiryDate: {
    type: Date,
    default: null,
  },
});

const invoiceSchema = new mongoose.Schema(
  {
    // ── Identitas Invoice ──
    invoiceNumber: {
      type: String,
      unique: true,
      trim: true,
    },
    invoiceType: {
      type: String,
      enum: ['sales', 'purchase'],
      default: 'sales',
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(INVOICE_STATUS),
      default: INVOICE_STATUS.DRAFT,
      index: true,
    },

    // ── Referensi Penjualan (SO) ──
    salesOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SalesOrder',
      index: true,
    },

    // ── Referensi Pembelian (PO & GR) ──
    purchaseOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PurchaseOrder',
      index: true,
    },
    goodsReceivingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GoodsReceiving',
      index: true,
    },

    // ── Pelanggan (sales) ──
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      index: true,
    },

    // ── Supplier (purchase) ──
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      index: true,
    },

    // ── Tanggal ──
    invoiceDate: {
      type: Date,
      required: [true, 'Invoice date is required'],
    },
    dueDate: {
      type: Date,
      required: [true, 'Due date is required'],
    },
    sentAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },

    // ── Items ──
    items: {
      type: [invoiceItemSchema],
      validate: {
        validator: (v) => v.length > 0,
        message: 'Minimal 1 item harus ditambahkan',
      },
    },

    // ── Finansial ──
    subtotal: { type: Number, default: 0, min: 0 },
    ppnRate: { type: Number, default: 11, min: 0, max: 100 },
    ppnAmount: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, default: 0, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    remainingAmount: { type: Number, default: 0, min: 0 },

    // ── Payment Terms ──
    paymentTermDays: { type: Number, default: 30, min: 0, max: 365 },

    // ── Pembatalan ──
    cancelReason: { type: String, trim: true, maxlength: 500, default: null },
    cancelledAt: { type: Date, default: null },

    // ── Notes ──
    notes: { type: String, trim: true, maxlength: 1000, default: '' },

    // ── Dokumen Invoice ──
    documentFileName: { type: String, trim: true, default: null },
    documentFilePath: { type: String, trim: true, default: null },
    documentMimeType: { type: String, trim: true, default: null },
    documentUploadedAt: { type: Date, default: null },

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
invoiceSchema.index({ createdAt: -1 });
invoiceSchema.index({ invoiceDate: -1 });
invoiceSchema.index({ dueDate: 1 });
invoiceSchema.index(
  { invoiceNumber: 'text' },
  { name: 'invoice_search' },
);

// ─── Pre-save: Auto-generate Invoice Number ───
invoiceSchema.pre('save', async function () {
  if (this.isNew && !this.invoiceNumber) {
    const now = new Date();
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const tag = this.invoiceType === 'purchase' ? 'PINV' : 'INV';
    const prefix = `${tag}-${ymd}-`;

    const last = await this.constructor
      .findOne({ invoiceNumber: { $regex: `^${prefix}` } })
      .sort({ invoiceNumber: -1 })
      .select('invoiceNumber')
      .lean();

    let nextNum = 1;
    if (last) {
      const lastNum = parseInt(last.invoiceNumber.replace(prefix, ''), 10);
      nextNum = lastNum + 1;
    }
    this.invoiceNumber = `${prefix}${String(nextNum).padStart(4, '0')}`;
  }
});

module.exports = mongoose.model('Invoice', invoiceSchema);
