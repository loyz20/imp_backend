const mongoose = require('../utils/mongooseShim');
const { GR_STATUS, GR_CONDITION_STATUS, GR_STORAGE_CONDITION, SATUAN } = require('../constants');

const grItemSchema = new mongoose.Schema({
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
  unitPrice: {
    type: Number,
    required: [true, 'Harga satuan is required'],
    min: 0,
  },
  discount: {
    type: Number,
    min: 0,
    max: 100,
    default: 0,
  },
  orderedQty: {
    type: Number,
    min: 0,
    default: 0,
  },
  receivedQty: {
    type: Number,
    required: [true, 'Received quantity is required'],
    min: 1,
  },
  batchNumber: {
    type: String,
    required: [true, 'Batch number is required (CDOB)'],
    trim: true,
    minlength: 1,
    maxlength: 50,
  },
  expiryDate: {
    type: Date,
    required: [true, 'Expiry date is required (CDOB)'],
  },
  manufacturingDate: {
    type: Date,
    default: null,
  },
  storageCondition: {
    type: String,
    enum: GR_STORAGE_CONDITION,
    default: 'Suhu Kamar',
  },
  conditionStatus: {
    type: String,
    enum: Object.values(GR_CONDITION_STATUS),
    default: GR_CONDITION_STATUS.BAIK,
  },
  notes: {
    type: String,
    trim: true,
    maxlength: 500,
    default: '',
  },
});

const goodsReceivingSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      required: [true, 'Invoice number is required'],
      unique: true,
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(GR_STATUS),
      default: GR_STATUS.DRAFT,
      index: true,
    },

    // ── Referensi PO ──
    purchaseOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PurchaseOrder',
      default: null,
      index: true,
    },

    // ── Supplier ──
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: [true, 'Supplier is required'],
      index: true,
    },

    // ── Tanggal & Dokumen ──
    receivingDate: {
      type: Date,
      required: [true, 'Receiving date is required'],
    },
    deliveryNote: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },

    // ── Items ──
    items: {
      type: [grItemSchema],
      validate: {
        validator: (v) => v.length > 0,
        message: 'Minimal 1 item harus ditambahkan',
      },
    },

    // ── Finansial ──
    subtotal: { type: Number, min: 0, default: 0 },
    ppnAmount: { type: Number, min: 0, default: 0 },
    grandTotal: { type: Number, min: 0, default: 0 },

    // ── Catatan ──
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },

    // ── Verifikasi ──
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date, default: null },
    verificationNotes: { type: String, trim: true, maxlength: 1000, default: '' },

    // ── Penerima ──
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

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
goodsReceivingSchema.index({ createdAt: -1 });
goodsReceivingSchema.index({ receivingDate: -1 });
goodsReceivingSchema.index(
  { invoiceNumber: 'text', deliveryNote: 'text' },
  { name: 'gr_search' },
);

module.exports = mongoose.model('GoodsReceiving', goodsReceivingSchema);

