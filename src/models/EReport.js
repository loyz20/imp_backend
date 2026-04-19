const mongoose = require('../utils/mongooseShim');
const { SP_TYPE, EREPORT_STATUS } = require('../constants');

const ereportItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    productName: {
      type: String,
      trim: true,
    },
    qtyIn: {
      type: Number,
      default: 0,
      min: 0,
    },
    qtyOut: {
      type: Number,
      default: 0,
      min: 0,
    },
    stockEnd: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { _id: false },
);

const ereportSchema = new mongoose.Schema(
  {
    reportNumber: {
      type: String,
      unique: true,
      trim: true,
    },
    period: {
      type: String,
      required: [true, 'Period is required'],
      trim: true,
      match: [/^\d{4}-\d{2}$/, 'Period must be in YYYY-MM format'],
    },
    type: {
      type: String,
      required: [true, 'Report type is required'],
      enum: Object.values(SP_TYPE),
      index: true,
    },
    status: {
      type: String,
      enum: Object.values(EREPORT_STATUS),
      default: EREPORT_STATUS.DRAFT,
      index: true,
    },
    items: {
      type: [ereportItemSchema],
      default: [],
    },
    rejectReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },

    // ── Audit ──
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    submittedAt: {
      type: Date,
      default: null,
    },
    receivedAt: {
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
ereportSchema.index({ period: 1, type: 1 }, { unique: true });
ereportSchema.index({ createdAt: -1 });

// ─── Pre-save: Auto-generate Report Number ───
ereportSchema.pre('save', async function () {
  if (this.isNew && !this.reportNumber) {
    const typePrefix = {
      [SP_TYPE.NARKOTIKA]: 'NK',
      [SP_TYPE.PSIKOTROPIKA]: 'PS',
      [SP_TYPE.PREKURSOR]: 'PK',
    };
    const prefix = typePrefix[this.type] || 'RPT';
    this.reportNumber = `RPT-${prefix}/${this.period.replace('-', '/')}`;
  }
});

module.exports = mongoose.model('EReport', ereportSchema);

