const mongoose = require('../utils/mongooseShim');
const { Schema } = mongoose;
const { MUTATION_TYPE, MUTATION_REFERENCE_TYPE } = require('../constants');

const mutationTypes = Object.values(MUTATION_TYPE);
const referenceTypes = Object.values(MUTATION_REFERENCE_TYPE);

const stockMutationSchema = new Schema(
  {
    // ── Identitas Mutasi ──
    mutationNumber: {
      type: String,
      unique: true,
    },
    mutationDate: { type: Date, required: true, default: Date.now },

    // ── Tipe ──
    type: {
      type: String,
      enum: mutationTypes,
      required: true,
      index: true,
    },

    // ── Referensi Produk ──
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    batchId: {
      type: Schema.Types.ObjectId,
      ref: 'StockBatch',
      default: null,
    },
    batchNumber: { type: String, default: '' },

    // ── Qty ──
    quantity: { type: Number, required: true },
    balanceBefore: { type: Number, required: true, default: 0 },
    balanceAfter: { type: Number, required: true, default: 0 },

    // ── Referensi Dokumen Sumber ──
    referenceType: {
      type: String,
      enum: referenceTypes,
      default: null,
    },
    referenceId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    referenceNumber: { type: String, default: '' },

    // ── Detail ──
    reason: { type: String, default: '' },
    notes: { type: String, default: '' },

    // ── Metadata ──
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform(doc, ret) {
        ret.id = ret._id;
        delete ret.__v;
      },
    },
  }
);

// ── Auto-generate mutation number ──
stockMutationSchema.pre('save', async function () {
  if (this.isNew && !this.mutationNumber) {
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    const prefix = `MUT-${dateStr}-`;

    const last = await this.constructor
      .findOne({ mutationNumber: { $regex: `^${prefix}` } })
      .sort({ mutationNumber: -1 })
      .select('mutationNumber')
      .lean();

    let seq = 1;
    if (last) {
      const lastSeq = parseInt(last.mutationNumber.split('-').pop(), 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }

    this.mutationNumber = `${prefix}${String(seq).padStart(4, '0')}`;
  }
});

// ── Indexes ──
stockMutationSchema.index({ mutationDate: -1 });
stockMutationSchema.index({ productId: 1, mutationDate: -1 });
stockMutationSchema.index({ referenceType: 1, referenceId: 1 });
stockMutationSchema.index(
  { mutationNumber: 'text', batchNumber: 'text', referenceNumber: 'text' },
  { name: 'mutation_text_search' }
);

const StockMutation = mongoose.model('StockMutation', stockMutationSchema);

module.exports = StockMutation;

