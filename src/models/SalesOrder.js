const mongoose = require('mongoose');
const { SO_STATUS, SATUAN } = require('../constants');

const soItemSchema = new mongoose.Schema({
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
  notes: {
    type: String,
    trim: true,
    maxlength: 500,
    default: '',
  },
});

const salesOrderSchema = new mongoose.Schema(
  {
    // ── Identitas SO ──
    invoiceNumber: {
      type: String,
      required: [true, 'Invoice number is required'],
      unique: true,
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(SO_STATUS),
      default: SO_STATUS.DRAFT,
      index: true,
    },

    // ── Pelanggan ──
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer is required'],
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
    packedAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    returnedAt: { type: Date, default: null },
    confirmedAt: { type: Date, default: null },
    processedAt: { type: Date, default: null },
    shippedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    // ── Pengiriman ──
    shippingAddress: {
      type: String,
      trim: true,
      maxlength: 500,
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
      type: [soItemSchema],
      validate: {
        validator: (v) => v.length > 0,
        message: 'Minimal 1 item harus ditambahkan',
      },
    },

    // ── Kalkulasi ──
    subtotal: { type: Number, default: 0 },
    ppnAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },

    // ── Catatan ──
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },

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
salesOrderSchema.index({ createdAt: -1 });
salesOrderSchema.index({ orderDate: -1 });
salesOrderSchema.index(
  { invoiceNumber: 'text' },
  { name: 'so_search' },
);

// ─── Calculate totals ───
salesOrderSchema.methods.calculateTotals = function (ppnRate = 0) {
  for (const item of this.items) {
    const qty = Number(item.quantity || 0);
    item.quantity = qty;
    item.subtotal = Math.round(qty * item.unitPrice * (1 - item.discount / 100));
  }
  this.subtotal = this.items.reduce((sum, item) => sum + item.subtotal, 0);
  this.ppnAmount = ppnRate > 0 ? Math.round(this.subtotal * ppnRate / 100) : 0;
  this.totalAmount = this.subtotal + this.ppnAmount;
};

// ─── Calculate totals ───
salesOrderSchema.pre('save', async function () {
  this.calculateTotals();
});

module.exports = mongoose.model('SalesOrder', salesOrderSchema);
