const mongoose = require('mongoose');
const { Schema } = mongoose;
const { OPNAME_STATUS, OPNAME_SCOPE } = require('../constants');

const opnameStatuses = Object.values(OPNAME_STATUS);
const opnameScopes = Object.values(OPNAME_SCOPE);

const opnameItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    batchId: { type: Schema.Types.ObjectId, ref: 'StockBatch', required: true },
    batchNumber: { type: String, required: true },
    expiryDate: { type: Date },

    systemQty: { type: Number, required: true, min: 0 },
    actualQty: { type: Number, default: null },
    difference: { type: Number, default: null },
    notes: { type: String, default: '' },
  },
  { _id: true }
);

const stockOpnameSchema = new Schema(
  {
    // ── Identitas Opname ──
    opnameNumber: {
      type: String,
      unique: true,
    },
    status: {
      type: String,
      enum: opnameStatuses,
      default: OPNAME_STATUS.DRAFT,
      index: true,
    },

    // ── Periode ──
    opnameDate: { type: Date, required: true },
    completedAt: { type: Date, default: null },

    // ── Scope ──
    scope: {
      type: String,
      enum: opnameScopes,
      default: OPNAME_SCOPE.ALL,
    },
    scopeFilter: { type: Schema.Types.Mixed, default: null },

    // ── Items ──
    items: [opnameItemSchema],

    // ── Summary ──
    totalItems: { type: Number, default: 0 },
    matchedItems: { type: Number, default: 0 },
    discrepancyItems: { type: Number, default: 0 },
    totalDiscrepancyQty: { type: Number, default: 0 },

    // ── Personnel ──
    assignedTo: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    notes: { type: String, default: '' },

    // ── Metadata ──
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: true,
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret.__v;
      },
    },
  }
);

// ── Auto-generate opname number ──
stockOpnameSchema.pre('save', async function () {
  if (this.isNew && !this.opnameNumber) {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const prefix = `OPN-${dateStr}-`;

    const last = await this.constructor
      .findOne({ opnameNumber: { $regex: `^${prefix}` } })
      .sort({ opnameNumber: -1 })
      .select('opnameNumber')
      .lean();

    let seq = 1;
    if (last) {
      const lastSeq = parseInt(last.opnameNumber.split('-').pop(), 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }

    this.opnameNumber = `${prefix}${String(seq).padStart(4, '0')}`;
  }
});

// ── Indexes ──
stockOpnameSchema.index({ opnameDate: -1 });
stockOpnameSchema.index({ opnameNumber: 'text' }, { name: 'opname_text_search' });

const StockOpname = mongoose.model('StockOpname', stockOpnameSchema);

module.exports = StockOpname;
