const mongoose = require('mongoose');
const { ACCOUNT_CATEGORY } = require('../constants');

const chartOfAccountSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Account code is required'],
      unique: true,
      trim: true,
      maxlength: 20,
    },
    name: {
      type: String,
      required: [true, 'Account name is required'],
      trim: true,
      maxlength: 200,
    },
    category: {
      type: String,
      enum: Object.values(ACCOUNT_CATEGORY),
      required: [true, 'Account category is required'],
      index: true,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ChartOfAccount',
      default: null,
    },
    level: {
      type: Number,
      default: 0,
      min: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    balance: {
      type: Number,
      default: 0,
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
chartOfAccountSchema.index({ parentId: 1 });

module.exports = mongoose.model('ChartOfAccount', chartOfAccountSchema);
