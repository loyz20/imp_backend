const mongoose = require('../utils/mongooseShim');
const { MEMO_TYPE, MEMO_STATUS } = require('../constants');

const memoItemSchema = new mongoose.Schema({
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    maxlength: 500,
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [1, 'Amount must be greater than 0'],
  },
});

const memoSchema = new mongoose.Schema(
  {
    // ── Identitas Memo ──
    memoNumber: {
      type: String,
      unique: true,
      trim: true,
    },
    type: {
      type: String,
      enum: Object.values(MEMO_TYPE),
      required: [true, 'Memo type is required'],
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(MEMO_STATUS),
      default: MEMO_STATUS.DRAFT,
      index: true,
    },

    // ── Referensi Invoice ──
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
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

    // ── Tanggal ──
    memoDate: {
      type: Date,
      required: [true, 'Memo date is required'],
    },
    approvedAt: { type: Date, default: null },
    postedAt: { type: Date, default: null },

    // ── Items ──
    items: {
      type: [memoItemSchema],
      validate: {
        validator: (v) => v.length > 0,
        message: 'Minimal 1 item harus ditambahkan',
      },
    },

    // ── Finansial ──
    totalAmount: { type: Number, default: 0, min: 0 },

    // ── Approval ──
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvalNotes: { type: String, trim: true, maxlength: 500, default: '' },

    // ── Notes ──
    notes: { type: String, trim: true, maxlength: 1000, default: '' },
    reason: { type: String, trim: true, maxlength: 500, default: '' },

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
memoSchema.index({ createdAt: -1 });
memoSchema.index({ memoDate: -1 });
memoSchema.index(
  { memoNumber: 'text' },
  { name: 'memo_search' },
);

// ─── Pre-save: Auto-generate Memo Number & calculate total ───
memoSchema.pre('save', async function () {
  // Calculate totalAmount
  if (this.items && this.items.length > 0) {
    this.totalAmount = this.items.reduce((sum, item) => sum + item.amount, 0);
  }

  if (this.isNew && !this.memoNumber) {
    const now = new Date();
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const typePrefix = this.type === MEMO_TYPE.CREDIT_MEMO ? 'CM' : 'DM';
    const prefix = `${typePrefix}-${ymd}-`;

    const last = await this.constructor
      .findOne({ memoNumber: { $regex: `^${prefix}` } })
      .sort({ memoNumber: -1 })
      .select('memoNumber')
      .lean();

    let nextNum = 1;
    if (last) {
      const lastNum = parseInt(last.memoNumber.replace(prefix, ''), 10);
      nextNum = lastNum + 1;
    }
    this.memoNumber = `${prefix}${String(nextNum).padStart(4, '0')}`;
  }
});

module.exports = mongoose.model('Memo', memoSchema);

