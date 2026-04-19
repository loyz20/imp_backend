const mongoose = require('../utils/mongooseShim');
const { REG_DOC_CATEGORY, REG_DOC_TYPE, REG_DOC_STATUS } = require('../constants');

const regulationDocumentSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: Object.values(REG_DOC_CATEGORY),
      index: true,
    },
    type: {
      type: String,
      required: [true, 'Document type is required'],
      enum: Object.values(REG_DOC_TYPE),
    },
    number: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
    issuedDate: {
      type: Date,
      default: null,
    },
    expiryDate: {
      type: Date,
      default: null,
    },
    status: {
      type: String,
      enum: Object.values(REG_DOC_STATUS),
      default: REG_DOC_STATUS.ACTIVE,
      index: true,
    },
    fileName: {
      type: String,
      trim: true,
      default: null,
    },
    filePath: {
      type: String,
      trim: true,
      default: null,
    },
    holder: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },

    // ── Relation to entity (supplier or customer) ──
    entityId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'entityModel',
      default: null,
    },
    entityModel: {
      type: String,
      enum: ['Supplier', 'Customer', null],
      default: null,
    },
    entityName: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },
    customerType: {
      type: String,
      trim: true,
      default: null,
    },
    siaNumber: {
      type: String,
      trim: true,
      maxlength: 100,
      default: null,
    },
    siaExpiry: {
      type: Date,
      default: null,
    },

    // ── Audit ──
    uploadedAt: {
      type: Date,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
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
regulationDocumentSchema.index({ expiryDate: 1 });
regulationDocumentSchema.index({ category: 1, type: 1 });

// ─── Method: compute status from expiry ───
regulationDocumentSchema.methods.computeStatus = function () {
  if (!this.expiryDate) return REG_DOC_STATUS.ACTIVE;
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (this.expiryDate <= now) return REG_DOC_STATUS.EXPIRED;
  if (this.expiryDate <= thirtyDays) return REG_DOC_STATUS.EXPIRING_SOON;
  return REG_DOC_STATUS.ACTIVE;
};

module.exports = mongoose.model('RegulationDocument', regulationDocumentSchema);

