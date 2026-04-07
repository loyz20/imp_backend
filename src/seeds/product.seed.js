const mongoose = require('mongoose');
const config = require('../config');
const Product = require('../models/Product');
const { PRODUCT_CATEGORY, GOLONGAN_OBAT, SUHU_PENYIMPANAN } = require('../constants');
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
    kekuatan: '500mg',
    zatAktif: 'Amoxicillin trihydrate setara Amoxicillin 500mg',
    golonganTerapi: 'Antibiotik',
    satuan: 'Box',
    satuanKecil: 'Kapsul',
    isiPerSatuan: 100,
    hna: 85000,
    het: 95000,
    hargaBeli: 80000,
    hargaJual: 92000,
    ppn: true,
    stokMinimum: 50,
    suhuPenyimpanan: SUHU_PENYIMPANAN.RUANGAN,
    manufacturer: 'PT Sanbe Farma',
    countryOfOrigin: 'Indonesia',
  },
  {
    name: 'Cefadroxil 500mg Kapsul',
    category: PRODUCT_CATEGORY.OBAT,
    golongan: GOLONGAN_OBAT.OBAT_KERAS,
    nie: 'DKL0987654321B1',
    bentukSediaan: 'Kapsul',
    kekuatan: '500mg',
    zatAktif: 'Cefadroxil monohydrate setara Cefadroxil 500mg',
    golonganTerapi: 'Antibiotik',
    satuan: 'Box',
    satuanKecil: 'Kapsul',
    isiPerSatuan: 50,
    hna: 120000,
    het: 135000,
    hargaBeli: 110000,
    hargaJual: 130000,
    ppn: true,
    stokMinimum: 30,
    suhuPenyimpanan: SUHU_PENYIMPANAN.RUANGAN,
    manufacturer: 'PT Indofarma Tbk',
    countryOfOrigin: 'Indonesia',
  },
  {
    name: 'Metformin 500mg Tablet',
    category: PRODUCT_CATEGORY.OBAT,
    golongan: GOLONGAN_OBAT.OBAT_KERAS,
    nie: 'DKL1122334455C1',
    bentukSediaan: 'Tablet',
    kekuatan: '500mg',
    zatAktif: 'Metformin hydrochloride 500mg',
    golonganTerapi: 'Antidiabetik',
    satuan: 'Box',
    satuanKecil: 'Tablet',
    isiPerSatuan: 100,
    hna: 25000,
    het: 32000,
    hargaBeli: 22000,
    hargaJual: 30000,
    ppn: true,
    stokMinimum: 100,
    suhuPenyimpanan: SUHU_PENYIMPANAN.RUANGAN,
    manufacturer: 'PT Kimia Farma Tbk',
    countryOfOrigin: 'Indonesia',
  },

  // ─── Narkotika ───
  {
    name: 'Codein 10mg Tablet',
    category: PRODUCT_CATEGORY.OBAT,
    golongan: GOLONGAN_OBAT.NARKOTIKA,
    nie: 'DKL5566778899D1',
    bentukSediaan: 'Tablet',
    kekuatan: '10mg',
    zatAktif: 'Codein phosphate 10mg',
    golonganTerapi: 'Analgesik Opioid',
    satuan: 'Box',
    satuanKecil: 'Tablet',
    isiPerSatuan: 100,
    hna: 45000,
    het: 55000,
    hargaBeli: 40000,
    hargaJual: 52000,
    ppn: true,
    stokMinimum: 10,
    suhuPenyimpanan: SUHU_PENYIMPANAN.RUANGAN,
    manufacturer: 'PT Kimia Farma Tbk',
    countryOfOrigin: 'Indonesia',
  },

  // ─── Psikotropika ───
  {
    name: 'Diazepam 5mg Tablet',
    category: PRODUCT_CATEGORY.OBAT,
    golongan: GOLONGAN_OBAT.PSIKOTROPIKA,
    nie: 'DKL6677889900E1',
    bentukSediaan: 'Tablet',
    kekuatan: '5mg',
    zatAktif: 'Diazepam 5mg',
    golonganTerapi: 'Anxiolitik',
    satuan: 'Box',
    satuanKecil: 'Tablet',
    isiPerSatuan: 100,
    hna: 35000,
    het: 42000,
    hargaBeli: 30000,
    hargaJual: 40000,
    ppn: true,
    stokMinimum: 10,
    suhuPenyimpanan: SUHU_PENYIMPANAN.RUANGAN,
    manufacturer: 'PT Mersi Farma',
    countryOfOrigin: 'Indonesia',
  },

  // ─── Obat Bebas Terbatas ───
  {
    name: 'Paracetamol 500mg Tablet',
    category: PRODUCT_CATEGORY.OBAT,
    golongan: GOLONGAN_OBAT.OBAT_BEBAS_TERBATAS,
    nie: 'DBL7788990011F1',
    bentukSediaan: 'Tablet',
    kekuatan: '500mg',
    zatAktif: 'Paracetamol 500mg',
    golonganTerapi: 'Analgesik - Antipiretik',
    satuan: 'Box',
    satuanKecil: 'Tablet',
    isiPerSatuan: 100,
    hna: 12000,
    het: 15000,
    hargaBeli: 10000,
    hargaJual: 14000,
    ppn: true,
    stokMinimum: 200,
    suhuPenyimpanan: SUHU_PENYIMPANAN.RUANGAN,
    manufacturer: 'PT Tempo Scan Pacific Tbk',
    countryOfOrigin: 'Indonesia',
  },

  // ─── Sirup (Cold Chain) ───
  {
    name: 'Insulin Glargine 100 IU/mL',
    category: PRODUCT_CATEGORY.OBAT,
    golongan: GOLONGAN_OBAT.OBAT_KERAS,
    nie: 'DKI9900112233G1',
    bentukSediaan: 'Injeksi',
    kekuatan: '100 IU/mL',
    zatAktif: 'Insulin glargine 100 IU/mL',
    golonganTerapi: 'Antidiabetik',
    satuan: 'Box',
    satuanKecil: 'Vial',
    isiPerSatuan: 5,
    hna: 450000,
    het: 520000,
    hargaBeli: 420000,
    hargaJual: 500000,
    ppn: true,
    stokMinimum: 20,
    suhuPenyimpanan: SUHU_PENYIMPANAN.DINGIN,
    manufacturer: 'Sanofi-Aventis',
    countryOfOrigin: 'Jerman',
  },

  // ─── Alat Kesehatan ───
  {
    name: 'Syringe Disposable 3mL',
    category: PRODUCT_CATEGORY.ALKES,
    golongan: GOLONGAN_OBAT.NON_OBAT,
    nie: 'AKL2233445566H1',
    bentukSediaan: 'Alat Kesehatan',
    satuan: 'Box',
    satuanKecil: 'Pcs',
    isiPerSatuan: 100,
    hna: 75000,
    het: 90000,
    hargaBeli: 70000,
    hargaJual: 85000,
    ppn: true,
    stokMinimum: 50,
    suhuPenyimpanan: SUHU_PENYIMPANAN.RUANGAN,
    manufacturer: 'PT Oneject Indonesia',
    countryOfOrigin: 'Indonesia',
  },

  // ─── BHP ───
  {
    name: 'Kasa Steril 16x16cm',
    category: PRODUCT_CATEGORY.BHP,
    golongan: GOLONGAN_OBAT.NON_OBAT,
    bentukSediaan: 'Alat Kesehatan',
    satuan: 'Box',
    satuanKecil: 'Lembar',
    isiPerSatuan: 16,
    hna: 18000,
    het: 22000,
    hargaBeli: 15000,
    hargaJual: 20000,
    ppn: true,
    stokMinimum: 100,
    suhuPenyimpanan: SUHU_PENYIMPANAN.RUANGAN,
    manufacturer: 'PT Suryamas',
    countryOfOrigin: 'Indonesia',
  },

  // ─── Suplemen ───
  {
    name: 'Vitamin C 1000mg Tablet Effervescent',
    category: PRODUCT_CATEGORY.SUPLEMEN,
    golongan: GOLONGAN_OBAT.NON_OBAT,
    nie: 'SD3344556677I1',
    bentukSediaan: 'Tablet',
    kekuatan: '1000mg',
    zatAktif: 'Ascorbic acid 1000mg',
    golonganTerapi: 'Vitamin',
    satuan: 'Tube',
    satuanKecil: 'Tablet',
    isiPerSatuan: 10,
    hna: 35000,
    het: 45000,
    hargaBeli: 30000,
    hargaJual: 42000,
    ppn: true,
    stokMinimum: 80,
    suhuPenyimpanan: SUHU_PENYIMPANAN.RUANGAN,
    manufacturer: 'PT Bayer Indonesia',
    countryOfOrigin: 'Indonesia',
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
