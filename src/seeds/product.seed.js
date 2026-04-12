const mongoose = require('mongoose');
const config = require('../config');
const Product = require('../models/Product');
const { PRODUCT_CATEGORY, GOLONGAN_OBAT, GOLONGAN_ALKES } = require('../constants');
const logger = require('../utils/logger');

const products = [
  // ─── Obat Keras ───
  {
    name: 'Amoxicillin 500mg Kapsul',
    category: PRODUCT_CATEGORY.OBAT,
    golongan: GOLONGAN_OBAT.OBAT_KERAS,
    nie: 'DKL1234567890A1',
    noBpom: 'GKL1234567890',
    bentukSediaan: 'Kapsul',
    zatAktif: 'Amoxicillin trihydrate setara Amoxicillin 500mg',
    satuan: 'Box',
    satuanKecil: 'Kapsul',
    isiPerSatuan: 100,
    ppn: true,
    stokMinimum: 50,
    manufacturer: 'PT Sanbe Farma',
  },
  {
    name: 'Cefadroxil 500mg Kapsul',
    category: PRODUCT_CATEGORY.OBAT,
    golongan: GOLONGAN_OBAT.OBAT_KERAS,
    nie: 'DKL0987654321B1',
    bentukSediaan: 'Kapsul',
    zatAktif: 'Cefadroxil monohydrate setara Cefadroxil 500mg',
    satuan: 'Box',
    satuanKecil: 'Kapsul',
    isiPerSatuan: 50,
    ppn: true,
    stokMinimum: 30,
    manufacturer: 'PT Indofarma Tbk',
  },
  {
    name: 'Metformin 500mg Tablet',
    category: PRODUCT_CATEGORY.OBAT,
    golongan: GOLONGAN_OBAT.OBAT_KERAS,
    nie: 'DKL1122334455C1',
    bentukSediaan: 'Tablet',
    zatAktif: 'Metformin hydrochloride 500mg',
    satuan: 'Box',
    satuanKecil: 'Tablet',
    isiPerSatuan: 100,
    ppn: true,
    stokMinimum: 100,
    manufacturer: 'PT Kimia Farma Tbk',
  },

  // ─── Prekursor ───
  {
    name: 'Codein 10mg Tablet',
    category: PRODUCT_CATEGORY.OBAT,
    golongan: GOLONGAN_OBAT.PREKURSOR,
    nie: 'DKL5566778899D1',
    bentukSediaan: 'Tablet',
    zatAktif: 'Codein phosphate 10mg',
    satuan: 'Box',
    satuanKecil: 'Tablet',
    isiPerSatuan: 100,
    ppn: true,
    stokMinimum: 10,
    manufacturer: 'PT Kimia Farma Tbk',
  },

  // ─── Obat Tertentu ───
  {
    name: 'Diazepam 5mg Tablet',
    category: PRODUCT_CATEGORY.OBAT,
    golongan: GOLONGAN_OBAT.OBAT_TERTENTU,
    nie: 'DKL6677889900E1',
    bentukSediaan: 'Tablet',
    zatAktif: 'Diazepam 5mg',
    satuan: 'Box',
    satuanKecil: 'Tablet',
    isiPerSatuan: 100,
    ppn: true,
    stokMinimum: 10,
    manufacturer: 'PT Mersi Farma',
  },

  // ─── Obat Bebas Terbatas ───
  {
    name: 'Paracetamol 500mg Tablet',
    category: PRODUCT_CATEGORY.OBAT,
    golongan: GOLONGAN_OBAT.OBAT_BEBAS_TERBATAS,
    nie: 'DBL7788990011F1',
    bentukSediaan: 'Tablet',
    zatAktif: 'Paracetamol 500mg',
    satuan: 'Box',
    satuanKecil: 'Tablet',
    isiPerSatuan: 100,
    ppn: true,
    stokMinimum: 200,
    manufacturer: 'PT Tempo Scan Pacific Tbk',
  },

  // ─── Obat Keras (Injeksi) ───
  {
    name: 'Insulin Glargine 100 IU/mL',
    category: PRODUCT_CATEGORY.OBAT,
    golongan: GOLONGAN_OBAT.OBAT_KERAS,
    nie: 'DKI9900112233G1',
    bentukSediaan: 'Injeksi',
    zatAktif: 'Insulin glargine 100 IU/mL',
    satuan: 'Box',
    satuanKecil: 'Vial',
    isiPerSatuan: 5,
    ppn: true,
    stokMinimum: 20,
    manufacturer: 'Sanofi-Aventis',
  },

  // ─── Alat Kesehatan ───
  {
    name: 'Syringe Disposable 3mL',
    category: PRODUCT_CATEGORY.ALKES,
    golongan: GOLONGAN_ALKES.NON_ELEKTROMEDIK_NON_STERIL,
    nie: 'AKL2233445566H1',
    bentukSediaan: 'Alat Kesehatan',
    satuan: 'Box',
    satuanKecil: 'Pcs',
    isiPerSatuan: 100,
    ppn: true,
    stokMinimum: 50,
    manufacturer: 'PT Oneject Indonesia',
  },
  {
    name: 'Kasa Steril 16x16cm',
    category: PRODUCT_CATEGORY.ALKES,
    golongan: GOLONGAN_ALKES.BMHP,
    bentukSediaan: 'Alat Kesehatan',
    satuan: 'Box',
    satuanKecil: 'Lembar',
    isiPerSatuan: 16,
    ppn: true,
    stokMinimum: 100,
    manufacturer: 'PT Suryamas',
  },

  // ─── Suplemen ───
  {
    name: 'Vitamin C 1000mg Tablet Effervescent',
    category: PRODUCT_CATEGORY.OBAT,
    golongan: GOLONGAN_OBAT.SUPLEMEN,
    nie: 'SD3344556677I1',
    bentukSediaan: 'Tablet',
    zatAktif: 'Ascorbic acid 1000mg',
    satuan: 'Tube',
    satuanKecil: 'Tablet',
    isiPerSatuan: 10,
    ppn: true,
    stokMinimum: 80,
    manufacturer: 'PT Bayer Indonesia',
  },
];

const seedProducts = async () => {
  try {
    await mongoose.connect(config.mongo.uri);
    logger.info('MongoDB connected for seeding products');

    const existingCount = await Product.countDocuments();
    if (existingCount > 0) {
      logger.warn(`Database already has ${existingCount} products. Use --force to reseed.`);
      if (!process.argv.includes('--force')) {
        process.exit(0);
      }
      logger.info('Force flag detected. Clearing existing products...');
      await Product.deleteMany({});
    }

    // Insert sequentially to allow SKU auto-generation
    const created = [];
    for (const productData of products) {
      const product = await Product.create(productData);
      created.push(product);
    }
    logger.info(`✓ Seeded ${created.length} products successfully`);

    created.forEach((product) => {
      logger.info(`  - ${product.name} (${product.sku}) [${product.category}/${product.golongan}]`);
    });

    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
    process.exit(0);
  } catch (error) {
    logger.error(`Product seeding failed: ${error.message}`);
    await mongoose.disconnect();
    process.exit(1);
  }
};

seedProducts();
  