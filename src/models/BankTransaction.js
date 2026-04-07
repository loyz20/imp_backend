const mongoose = require('mongoose');
const { MATCH_STATUS } = require('../constants');

const bankTransactionSchema = new mongoose.Schema(
  {
    // ── Detail Transaksi ──
    date: {
      type: Date,
      required: [true, 'Transaction date is required'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    type: {
      type: String,
      enum: ['debit', 'credit'],
      required: [true, 'Transaction type is required'],
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [1, 'Amount must be greater than 0'],
    },
    bankAccount: {
      type: String,
      trim: true,
      maxlength: 100,
      default: '',
    },
    reference: {
      type: String,
      trim: true,
      maxlength: 100,
      default: '',
    },

    // ── Matching ──
    matchStatus: {
      type: String,
      enum: Object.values(MATCH_STATUS),
      default: MATCH_STATUS.UNMATCHED,
      index: true,
    },
    matchedPaymentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Payment',
      default: null,
    },
    matchedAt: { type: Date, default: null },
    reconciledAt: { type: Date, default: null },

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
bankTransactionSchema.index({ date: -1 });
bankTransactionSchema.index({ createdAt: -1 });

module.exports = mongoose.model('BankTransaction', bankTransactionSchema);
