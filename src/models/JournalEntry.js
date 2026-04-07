const mongoose = require('mongoose');
const { JOURNAL_SOURCE, JOURNAL_STATUS } = require('../constants');

const journalLineSchema = new mongoose.Schema({
  accountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChartOfAccount',
    required: [true, 'Account is required'],
  },
  debit: {
    type: Number,
    default: 0,
    min: 0,
  },
  credit: {
    type: Number,
    default: 0,
    min: 0,
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500,
    default: '',
  },
});

const journalEntrySchema = new mongoose.Schema(
  {
    journalNumber: {
      type: String,
      unique: true,
      trim: true,
    },
    date: {
      type: Date,
      required: [true, 'Journal date is required'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    source: {
      type: String,
      enum: Object.values(JOURNAL_SOURCE),
      required: [true, 'Journal source is required'],
      index: true,
    },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    sourceNumber: {
      type: String,
      trim: true,
      default: null,
    },
    status: {
      type: String,
      enum: Object.values(JOURNAL_STATUS),
      default: JOURNAL_STATUS.POSTED,
      index: true,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvalNotes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },

    // ── Detail Jurnal ──
    entries: {
      type: [journalLineSchema],
      validate: {
        validator: (v) => v.length >= 2,
        message: 'Minimal 2 baris jurnal (debit & credit)',
      },
    },

    totalDebit: { type: Number, default: 0, min: 0 },
    totalCredit: { type: Number, default: 0, min: 0 },

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
journalEntrySchema.index({ date: -1 });
journalEntrySchema.index({ createdAt: -1 });
journalEntrySchema.index(
  { journalNumber: 'text', description: 'text' },
  { name: 'journal_search' },
);

// ─── Pre-save: Auto-generate Journal Number & calculate totals ───
journalEntrySchema.pre('save', async function () {
  // Calculate totals
  if (this.entries && this.entries.length > 0) {
    this.totalDebit = this.entries.reduce((sum, e) => sum + (e.debit || 0), 0);
    this.totalCredit = this.entries.reduce((sum, e) => sum + (e.credit || 0), 0);
  }

  if (this.isNew && !this.journalNumber) {
    const now = new Date();
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const prefix = `JRN-${ymd}-`;

    const last = await this.constructor
      .findOne({ journalNumber: { $regex: `^${prefix}` } })
      .sort({ journalNumber: -1 })
      .select('journalNumber')
      .lean();

    let nextNum = 1;
    if (last) {
      const lastNum = parseInt(last.journalNumber.replace(prefix, ''), 10);
      nextNum = lastNum + 1;
    }
    this.journalNumber = `${prefix}${String(nextNum).padStart(4, '0')}`;
  }
});

module.exports = mongoose.model('JournalEntry', journalEntrySchema);
