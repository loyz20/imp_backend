const mongoose = require('../utils/mongooseShim');
const { Schema } = mongoose;
const { BATCH_STATUS, GR_STORAGE_CONDITION } = require('../constants');

const batchStatuses = Object.values(BATCH_STATUS);

const stockBatchSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },

    // ── Batch Info ──
    batchNumber: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    initialQuantity: { type: Number, required: true, min: 0 },

    // ── Tanggal ──
    expiryDate: { type: Date, required: true },
    manufacturingDate: { type: Date, default: null },
    receivedDate: { type: Date, required: true },

    // ── Penyimpanan ──
    storageCondition: {
      type: String,
      enum: GR_STORAGE_CONDITION,
      default: 'Suhu Kamar',
    },

    // ── Status ──
    status: {
      type: String,
      enum: batchStatuses,
      default: BATCH_STATUS.ACTIVE,
      index: true,
    },

    // ── Referensi ──
    goodsReceivingId: {
      type: Schema.Types.ObjectId,
      ref: 'GoodsReceiving',
      default: null,
    },
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: 'Supplier',
      default: null,
    },

    // ── Harga ──
    unitPrice: { type: Number, default: 0, min: 0 },

    // ── Metadata ──
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
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

// ── Indexes ──
stockBatchSchema.index({ productId: 1, batchNumber: 1 });
stockBatchSchema.index({ expiryDate: 1 });
stockBatchSchema.index({ status: 1, expiryDate: 1 });

const StockBatch = mongoose.model('StockBatch', stockBatchSchema);

module.exports = StockBatch;

