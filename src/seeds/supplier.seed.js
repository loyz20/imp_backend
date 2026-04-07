const mongoose = require('mongoose');
const config = require('../config');
const Supplier = require('../models/Supplier');
const { SUPPLIER_TYPE } = require('../constants');
const logger = require('../utils/logger');

const suppliers = [
  {
    name: 'PT Kimia Farma Trading & Distribution',
    type: SUPPLIER_TYPE.PBF,
    contactPerson: 'Budi Santoso',
    phone: '021-42873888',
    email: 'order@kftd.co.id',
    website: 'https://www.kftd.co.id',
    address: {
      street: 'Jl. Veteran No. 9',
      city: 'Jakarta Pusat',
      province: 'DKI Jakarta',
      postalCode: '10110',
      country: 'Indonesia',
    },
    pbfLicense: { number: 'PBF-2024-001234', expiryDate: new Date('2028-06-30') },
    cdobCertificate: { number: 'CDOB-2024-005678', expiryDate: new Date('2027-12-31') },
    paymentTermDays: 30,
    bankAccount: { bankName: 'BCA', accountNumber: '1234567890', accountName: 'PT Kimia Farma Trading & Distribution' },
    npwp: '01.234.567.8-012.000',
    notes: 'Supplier utama untuk produk generik',
  },
  {
    name: 'PT Enseval Putera Megatrading Tbk',
    type: SUPPLIER_TYPE.PBF,
    contactPerson: 'Siti Aminah',
    phone: '021-5747200',
    email: 'order@enseval.com',
    website: 'https://www.enseval.com',
    address: {
      street: 'Jl. Pulo Lentut No. 10',
      city: 'Jakarta Timur',
      province: 'DKI Jakarta',
      postalCode: '13920',
    },
    pbfLicense: { number: 'PBF-2024-002345', expiryDate: new Date('2028-03-15') },
    cdobCertificate: { number: 'CDOB-2024-006789', expiryDate: new Date('2027-09-30') },
    paymentTermDays: 45,
    bankAccount: { bankName: 'Mandiri', accountNumber: '1234567891', accountName: 'PT Enseval Putera Megatrading Tbk' },
    npwp: '02.345.678.9-013.000',
  },
  {
    name: 'PT Anugrah Argon Medica',
    type: SUPPLIER_TYPE.PBF,
    contactPerson: 'Andi Wijaya',
    phone: '021-4602377',
    email: 'order@aam.co.id',
    address: {
      street: 'Jl. Agung Karya IV B/3',
      city: 'Jakarta Utara',
      province: 'DKI Jakarta',
      postalCode: '14350',
    },
    pbfLicense: { number: 'PBF-2024-003456', expiryDate: new Date('2027-11-20') },
    cdobCertificate: { number: 'CDOB-2024-007890', expiryDate: new Date('2027-06-15') },
    paymentTermDays: 30,
  },
  {
    name: 'PT Sanbe Farma',
    type: SUPPLIER_TYPE.INDUSTRI,
    contactPerson: 'Rini Puspita',
    phone: '022-7805088',
    email: 'marketing@sanbe-farma.com',
    website: 'https://www.sanbe-farma.com',
    address: {
      street: 'Jl. Tamansari No. 10',
      city: 'Bandung',
      province: 'Jawa Barat',
      postalCode: '40116',
    },
    pbfLicense: { number: 'IF-2024-001122', expiryDate: new Date('2029-01-01') },
    cdobCertificate: { number: 'CDOB-2024-008901', expiryDate: new Date('2028-06-30') },
    paymentTermDays: 60,
    npwp: '03.456.789.0-014.000',
  },
  {
    name: 'PT Dexa Medica',
    type: SUPPLIER_TYPE.INDUSTRI,
    contactPerson: 'Hendra Kusuma',
    phone: '0251-8310131',
    email: 'sales@dexa-medica.com',
    website: 'https://www.dexa-medica.com',
    address: {
      street: 'Jl. Jend. Bambang Utoyo No. 138',
      city: 'Palembang',
      province: 'Sumatera Selatan',
      postalCode: '30114',
    },
    cdobCertificate: { number: 'CDOB-2024-009012', expiryDate: new Date('2028-03-31') },
    paymentTermDays: 30,
  },
  {
    name: 'PT Bayer Indonesia',
    type: SUPPLIER_TYPE.IMPORTIR,
    contactPerson: 'Michael Tan',
    phone: '021-25541000',
    email: 'order@bayer.co.id',
    website: 'https://www.bayer.co.id',
    address: {
      street: 'Jl. Jend. Sudirman Kav. 52-53',
      city: 'Jakarta Selatan',
      province: 'DKI Jakarta',
      postalCode: '12190',
    },
    paymentTermDays: 45,
    npwp: '04.567.890.1-015.000',
  },
  {
    name: 'PT Jayamas Medica Industri',
    type: SUPPLIER_TYPE.DISTRIBUTOR_ALKES,
    contactPerson: 'Dewi Lestari',
    phone: '031-8490789',
    email: 'sales@jayamasmedica.com',
    website: 'https://www.jayamasmedica.com',
    address: {
      street: 'Jl. Rungkut Industri II/15',
      city: 'Surabaya',
      province: 'Jawa Timur',
      postalCode: '60293',
    },
    paymentTermDays: 30,
    notes: 'Supplier utama alat kesehatan',
  },
  {
    name: 'PT Indofarma Global Medika',
    type: SUPPLIER_TYPE.PBF,
    contactPerson: 'Agus Prasetyo',
    phone: '021-8832104',
    email: 'order@igm.co.id',
    address: {
      street: 'Jl. Indofarma No. 1',
      city: 'Bekasi',
      province: 'Jawa Barat',
      postalCode: '17530',
    },
    pbfLicense: { number: 'PBF-2024-004567', expiryDate: new Date('2028-09-30') },
    cdobCertificate: { number: 'CDOB-2024-010123', expiryDate: new Date('2028-01-15') },
    paymentTermDays: 30,
    npwp: '05.678.901.2-016.000',
  },
  {
    name: 'CV Sumber Sehat Medika',
    type: SUPPLIER_TYPE.LAINNYA,
    contactPerson: 'Joko Widodo',
    phone: '024-7601234',
    email: 'info@sumbersehat.co.id',
    address: {
      street: 'Jl. MT Haryono No. 25',
      city: 'Semarang',
      province: 'Jawa Tengah',
      postalCode: '50124',
    },
    paymentTermDays: 14,
    notes: 'Supplier BHP dan consumables',
  },
  {
    name: 'PT Millennium Pharmacon International Tbk',
    type: SUPPLIER_TYPE.PBF,
    contactPerson: 'Linda Hartono',
    phone: '021-4504708',
    email: 'order@mpi.co.id',
    website: 'https://www.mfrpharmacon.com',
    address: {
      street: 'Jl. Tanah Abang II No. 4',
      city: 'Jakarta Pusat',
      province: 'DKI Jakarta',
      postalCode: '10160',
    },
    pbfLicense: { number: 'PBF-2024-005678', expiryDate: new Date('2027-12-31') },
    cdobCertificate: { number: 'CDOB-2024-011234', expiryDate: new Date('2027-08-31') },
    paymentTermDays: 30,
    npwp: '06.789.012.3-017.000',
  },
];

const seedSuppliers = async () => {
  try {
    await mongoose.connect(config.mongo.uri);
    logger.info('MongoDB connected for seeding suppliers');

    const existingCount = await Supplier.countDocuments();
    if (existingCount > 0) {
      logger.warn(`Database already has ${existingCount} suppliers. Use --force to reseed.`);
      if (!process.argv.includes('--force')) {
        process.exit(0);
      }
      logger.info('Force flag detected. Clearing existing suppliers...');
      await Supplier.deleteMany({});
    }

    const created = [];
    for (const supplierData of suppliers) {
      const supplier = await Supplier.create(supplierData);
      created.push(supplier);
    }
    logger.info(`✓ Seeded ${created.length} suppliers successfully`);

    created.forEach((supplier) => {
      logger.info(`  - ${supplier.name} (${supplier.code}) [${supplier.type}]`);
    });

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error(`Supplier seeding failed: ${error.message}`);
    await mongoose.disconnect();
    process.exit(1);
  }
};

seedSuppliers();
