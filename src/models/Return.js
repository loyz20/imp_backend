const mongoose = require('mongoose');
const {
  RETURN_STATUS,
  RETURN_TYPE,
  RETURN_REASONS,
  ITEM_CONDITION,
  DISPOSITION,
  SATUAN,
} = require('../constants');

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, required: true },
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    date: { type: Date, default: Date.now },
  },
  { _id: false },
);

const returnItemSchema = new mongoose.Schema({
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
  },
  satuan: {
    type: String,
    enum: SATUAN,
    required: [true, 'Satuan is required'],
  },
  quantityDelivered: {
    type: Number,
    default: 0,
    min: 0,
  },
  quantityReturned: {
    type: Number,
    required: [true, 'Quantity returned is required'],
    min: 1,
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
  condition: {
    type: String,
    enum: Object.values(ITEM_CONDITION),
    required: [true, 'Condition is required'],
  },
  returnReason: {
    type: String,
    trim: true,
    maxlength: 500,
    default: '',
  },
  disposition: {
    type: String,
    enum: [...Object.values(DISPOSITION), null],
    default: null,
  },
  dispositionNotes: {
    type: String,
    trim: true,
    maxlength: 500,
    default: '',
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500,
    default: '',
  },
});

const returnSchema = new mongoose.Schema(
  {
    // ── Identitas Retur ──
    returnNumber: {
      type: String,
      unique: true,
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(RETURN_STATUS),
      default: RETURN_STATUS.DRAFT,
      index: true,
    },
    returnType: {
      type: String,
      enum: Object.values(RETURN_TYPE),
      required: [true, 'Return type is required'],
      index: true,
    },

    
    // ── Pelanggan (customer_return) ──
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
      index: true,
    },

    // ── Supplier (supplier_return) ──
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      default: null,
      index: true,
    },
    supplierName: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },

    // ── Tanggal ──
    returnDate: {
      type: Date,
      required: [true, 'Return date is required'],
    },
    approvedAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null },
    inspectedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },

    // ── Alasan Retur ──
    reason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    // ── Items ──
    items: {
      type: [returnItemSchema],
      validate: {
        validator: (v) => v.length > 0,
        message: 'Minimal 1 item harus ditambahkan',
      },
    },

    // ── Catatan ──
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },

    // ── Riwayat Status ──
    statusHistory: [statusHistorySchema],

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
returnSchema.index({ createdAt: -1 });
returnSchema.index({ returnDate: -1 });
returnSchema.index(
  { returnNumber: 'text' },
  { name: 'return_search' },
);

// ─── Pre-save: Auto-generate Return Number ───
returnSchema.pre('save', async function () {
  if (this.isNew && !this.returnNumber) {
    const now = new Date();
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const prefix = `RTN-${ymd}-`;

    const last = await this.constructor
      .findOne({ returnNumber: { $regex: `^${prefix}` } })
      .sort({ returnNumber: -1 })
      .select('returnNumber')
      .lean();

    let nextNum = 1;
    if (last) {
      const lastNum = parseInt(last.returnNumber.replace(prefix, ''), 10);
      nextNum = lastNum + 1;
    }
    this.returnNumber = `${prefix}${String(nextNum).padStart(4, '0')}`;
  }
});

module.exports = mongoose.model('Return', returnSchema);
