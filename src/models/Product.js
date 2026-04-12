const mongoose = require('mongoose');
const {
  PRODUCT_CATEGORY,
  ALL_GOLONGAN,
  BENTUK_SEDIAAN,
  SATUAN,
} = require('../constants');

const productSchema = new mongoose.Schema(
  {
    // ─── Informasi Umum ───
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      minlength: 2,
      maxlength: 200,
    },
    sku: {
      type: String,
      unique: true,
      trim: true,
    },
    barcode: {
      type: String,
      trim: true,
      default: null,
      set: (v) => (!v ? null : v),
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: Object.values(PRODUCT_CATEGORY),
      index: true,
    },
    golongan: {
      type: String,
      required: [true, 'Golongan is required'],
      enum: Object.values(ALL_GOLONGAN),
      index: true,
    },

    // ─── Regulasi & Registrasi ───
    nie: {
      type: String,
      trim: true,
      default: null,
    },
    noBpom: {
      type: String,
      trim: true,
      default: null,
    },

    // ─── Informasi Farmasi ───
    bentukSediaan: {
      type: String,
      enum: BENTUK_SEDIAAN,
      default: null,
    },
    zatAktif: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    // ─── Satuan & Konversi ───
    satuan: {
      type: String,
      enum: SATUAN,
      default: 'Box',
    },
    satuanKecil: {
      type: String,
      trim: true,
      maxlength: 50,
      default: null,
    },
    isiPerSatuan: {
      type: Number,
      min: 1,
      default: null,
    },

    // ─── Harga ───
    ppn: {
      type: Boolean,
      default: true,
    },

    // ─── Stok & Penyimpanan ───
    stokMinimum: {
      type: Number,
      min: 0,
      default: 0,
    },

    // ─── Produsen ───
    manufacturer: {
      type: String,
      trim: true,
      maxlength: 200,
      default: null,
    },

    // ─── Lainnya ───
    keterangan: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // ─── Metadata ───
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
productSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });
productSchema.index({ barcode: 1 }, { sparse: true });
productSchema.index({ createdAt: -1 });
productSchema.index({ manufacturer: 1 });
productSchema.index(
  { name: 'text', sku: 'text', nie: 'text', barcode: 'text', zatAktif: 'text' },
  { name: 'product_search' },
);

// ─── Pre-save: Auto-generate SKU ───
productSchema.pre('save', async function () {
  if (this.isNew && !this.sku) {
    // F0001 for obat, A0001 for alat_kesehatan
    const prefix = this.category === 'alat_kesehatan' ? 'A' : 'F';

    const lastProduct = await this.constructor
      .findOne({ sku: { $regex: `^${prefix}\\d+$` } })
      .sort({ sku: -1 })
      .select('sku')
      .lean();

    let nextNum = 1;
    if (lastProduct) {
      const lastNum = parseInt(lastProduct.sku.replace(prefix, ''), 10);
      if (Number.isFinite(lastNum)) nextNum = lastNum + 1;
    }
    this.sku = `${prefix}${String(nextNum).padStart(4, '0')}`;
  }
});

// ─── Statics ───
productSchema.statics.findBySku = function (sku) {
  return this.findOne({ sku });
};

module.exports = mongoose.model('Product', productSchema);
