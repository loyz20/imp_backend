const mongoose = require('mongoose');
const { SP_TYPE, SP_STATUS } = require('../constants');

const spItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product is required'],
    },
    qty: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
    },
    unit: {
      type: String,
      required: [true, 'Unit is required'],
      trim: true,
      maxlength: 50,
    },
  },
  { _id: false },
);

const suratPesananKhususSchema = new mongoose.Schema(
  {
    spNumber: {
      type: String,
      unique: true,
      trim: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    type: {
      type: String,
      required: [true, 'SP type is required'],
      enum: Object.values(SP_TYPE),
      index: true,
    },
    supplier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Supplier',
      required: [true, 'Supplier is required'],
    },
    items: {
      type: [spItemSchema],
      validate: {
        validator: (v) => Array.isArray(v) && v.length > 0,
        message: 'Minimal 1 item diperlukan',
      },
    },
    validUntil: {
      type: Date,
      required: [true, 'Valid until date is required'],
    },
    status: {
      type: String,
      enum: Object.values(SP_STATUS),
      default: SP_STATUS.DRAFT,
      index: true,
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
    rejectReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    // ── Audit ──
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
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
suratPesananKhususSchema.index({ createdAt: -1 });
suratPesananKhususSchema.index({ validUntil: 1 });
suratPesananKhususSchema.index(
  { spNumber: 'text' },
  { name: 'sp_search' },
);

// ─── Pre-save: Auto-generate SP Number ───
suratPesananKhususSchema.pre('save', async function () {
  if (this.isNew && !this.spNumber) {
    const typePrefix = {
      [SP_TYPE.NARKOTIKA]: 'NK',
      [SP_TYPE.PSIKOTROPIKA]: 'PS',
      [SP_TYPE.PREKURSOR]: 'PK',
    };
    const prefix = typePrefix[this.type] || 'SP';
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const datePrefix = `SP-${prefix}/${year}/${month}/`;

    const last = await this.constructor
      .findOne({ spNumber: { $regex: `^${datePrefix.replace(/\//g, '\\/')}` } })
      .sort({ spNumber: -1 })
      .select('spNumber')
      .lean();

    let nextNum = 1;
    if (last) {
      const parts = last.spNumber.split('/');
      const lastNum = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(lastNum)) nextNum = lastNum + 1;
    }
    this.spNumber = `${datePrefix}${String(nextNum).padStart(3, '0')}`;
  }
});

module.exports = mongoose.model('SuratPesananKhusus', suratPesananKhususSchema);
