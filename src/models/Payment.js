const mongoose = require('../utils/mongooseShim');
const {
  FINANCE_PAYMENT_STATUS,
  PAYMENT_TYPE,
  PAYMENT_SOURCE_TYPE,
  PAYMENT_METHOD,
} = require('../constants');

const paymentSchema = new mongoose.Schema(
  {
    // ── Identitas Pembayaran ──
    paymentNumber: {
      type: String,
      unique: true,
      trim: true,
    },
    status: {
      type: String,
      enum: Object.values(FINANCE_PAYMENT_STATUS),
      default: FINANCE_PAYMENT_STATUS.PENDING,
      index: true,
    },

    // ── Tipe ──
    type: {
      type: String,
      enum: Object.values(PAYMENT_TYPE),
      required: [true, 'Payment type is required'],
      index: true,
    },
    sourceType: {
      type: String,
      enum: Object.values(PAYMENT_SOURCE_TYPE),
      default: null,
      index: true,
    },

    // ── Referensi Invoice ──
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      default: null,
      index: true,
    },

    // ── Referensi PO (untuk pembayaran ke supplier) ──
    purchaseOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PurchaseOrder',
      default: null,
      index: true,
    },

    // ── Pelanggan / Supplier ──
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      default: null,
      index: true,
    },
    supplierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      default: null,
      index: true,
    },

    // ── Detail Pembayaran ──
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [1, 'Amount must be greater than 0'],
    },
    paymentDate: {
      type: Date,
      required: [true, 'Payment date is required'],
    },
    paymentMethod: {
      type: String,
      enum: Object.values(PAYMENT_METHOD),
      required: [true, 'Payment method is required'],
    },
    referenceNumber: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
    bankAccount: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },

    // ── Verifikasi ──
    verifiedAt: { type: Date, default: null },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verificationNotes: { type: String, trim: true, maxlength: 500, default: '' },

    // ── Notes ──
    notes: { type: String, trim: true, maxlength: 1000, default: '' },

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
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ paymentDate: -1 });
paymentSchema.index(
  { paymentNumber: 'text' },
  { name: 'payment_search' },
);

// ─── Pre-save: Auto-generate Payment Number ───
paymentSchema.pre('save', async function () {
  if (this.isNew && !this.sourceType) {
    if (this.invoiceId) {
      const Invoice = require('./Invoice');
      const invoice = await Invoice.findById(this.invoiceId).select('invoiceType').lean();
      this.sourceType = invoice?.invoiceType === 'purchase'
        ? PAYMENT_SOURCE_TYPE.PURCHASE_INVOICE
        : PAYMENT_SOURCE_TYPE.SALES_INVOICE;
    } else if (this.purchaseOrderId) this.sourceType = PAYMENT_SOURCE_TYPE.PURCHASE_ORDER;
    else if (this.type === PAYMENT_TYPE.INCOMING) this.sourceType = PAYMENT_SOURCE_TYPE.OTHER_INCOMING;
    else this.sourceType = PAYMENT_SOURCE_TYPE.OTHER_OUTGOING;
  }

  if (this.isNew && !this.paymentNumber) {
    const now = new Date();
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const prefix = `PAY-${ymd}-`;

    const last = await this.constructor
      .findOne({ paymentNumber: { $regex: `^${prefix}` } })
      .sort({ paymentNumber: -1 })
      .select('paymentNumber')
      .lean();

    let nextNum = 1;
    if (last) {
      const lastNum = parseInt(last.paymentNumber.replace(prefix, ''), 10);
      nextNum = lastNum + 1;
    }
    this.paymentNumber = `${prefix}${String(nextNum).padStart(4, '0')}`;
  }
});

module.exports = mongoose.model('Payment', paymentSchema);

