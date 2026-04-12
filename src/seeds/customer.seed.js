const mongoose = require('mongoose');
const config = require('../config');
const Customer = require('../models/Customer');
const { CUSTOMER_TYPE } = require('../constants');
const logger = require('../utils/logger');

const customers = [
  {
    name: 'Apotek Sehat Selalu',
    type: CUSTOMER_TYPE.APOTEK,
    ownerName: 'Hj. Siti Aminah',
    ownerAddress: 'Jl. Kesehatan No. 10, Jakarta Selatan',
    contactPerson: 'dr. Siti Aminah',
    phone: '021-7654321',
    address: { street: 'Jl. Kesehatan No. 10', city: 'Jakarta Selatan', province: 'DKI Jakarta' },
    izinSarana: { number: 'SIA-2024-001234', expiryDate: new Date('2029-06-30') },
    apoteker: { name: 'apt. Rina Wijaya, S.Farm', address: 'Jl. Melati No. 5, Jakarta Selatan' },
    sipa: { number: 'SIPA-2024-005678', expiryDate: new Date('2029-06-30') },
    paymentTermDays: 30,
    creditLimit: 50000000,
    bankAccount: { bankName: 'BCA', accountNumber: '9876543210', accountName: 'Apotek Sehat Selalu' },
    npwp: { number: '02.345.678.9-012.000', name: 'Apotek Sehat Selalu', address: 'Jl. Kesehatan No. 10, Jakarta Selatan' },
    notes: 'Pelanggan prioritas, order rutin tiap minggu',
  },
  {
    name: 'Apotek Kimia Farma 128',
    type: CUSTOMER_TYPE.APOTEK,
    ownerName: 'PT Kimia Farma Tbk',
    contactPerson: 'apt. Dwi Hartono',
    phone: '021-5501234',
    address: { street: 'Jl. Thamrin No. 5', city: 'Jakarta Pusat', province: 'DKI Jakarta' },
    izinSarana: { number: 'SIA-2024-002345', expiryDate: new Date('2029-03-15') },
    apoteker: { name: 'apt. Dwi Hartono, S.Farm', address: 'Jl. Salemba No. 12, Jakarta Pusat' },
    sipa: { number: 'SIPA-2024-006789', expiryDate: new Date('2029-03-15') },
    paymentTermDays: 30,
    creditLimit: 75000000,
    bankAccount: { bankName: 'Mandiri', accountNumber: '1234567890', accountName: 'Apotek Kimia Farma 128' },
    npwp: { number: '03.456.789.0-013.000', name: 'PT Kimia Farma Tbk', address: 'Jl. Thamrin No. 5, Jakarta Pusat' },
  },
  {
    name: 'Apotek Century Healthcare',
    type: CUSTOMER_TYPE.APOTEK,
    ownerName: 'PT Century Pharmaceuticals',
    contactPerson: 'apt. Maria Lestari',
    phone: '021-7890123',
    address: { street: 'Jl. Gatot Subroto Kav. 18', city: 'Jakarta Selatan', province: 'DKI Jakarta' },
    izinSarana: { number: 'SIA-2024-003456', expiryDate: new Date('2028-12-31') },
    apoteker: { name: 'apt. Maria Lestari, S.Farm', address: 'Jl. Sudirman No. 20, Jakarta Selatan' },
    sipa: { number: 'SIPA-2024-007890', expiryDate: new Date('2028-12-31') },
    paymentTermDays: 45,
    creditLimit: 100000000,
    npwp: { number: '04.567.890.1-014.000', name: 'PT Century Pharmaceuticals', address: 'Jl. Gatot Subroto Kav. 18, Jakarta Selatan' },
  },
  {
    name: 'RS Pondok Indah',
    type: CUSTOMER_TYPE.RUMAH_SAKIT,
    ownerName: 'PT Pondok Indah Healthcare',
    contactPerson: 'dr. Ahmad Fauzi, Sp.PD',
    phone: '021-7657525',
    address: { street: 'Jl. Metro Duta Kav. UE', city: 'Jakarta Selatan', province: 'DKI Jakarta' },
    izinSarana: { number: 'SIA-RS-2024-001122', expiryDate: new Date('2029-09-30') },
    apoteker: { name: 'apt. Endang Susilowati, S.Farm', address: 'Jl. Pondok Indah No. 3, Jakarta Selatan' },
    sipa: { number: 'SIPA-2024-008901', expiryDate: new Date('2029-09-30') },
    paymentTermDays: 60,
    creditLimit: 200000000,
    bankAccount: { bankName: 'BCA', accountNumber: '5678901234', accountName: 'RS Pondok Indah' },
    npwp: { number: '05.678.901.2-015.000', name: 'PT Pondok Indah Healthcare', address: 'Jl. Metro Duta Kav. UE, Jakarta Selatan' },
    notes: 'Rumah sakit swasta premium, volume order besar',
  },
  {
    name: 'RS Siloam Hospitals Kebon Jeruk',
    type: CUSTOMER_TYPE.RUMAH_SAKIT,
    ownerName: 'PT Siloam International Hospitals',
    contactPerson: 'apt. Yuliana Tan',
    phone: '021-25677888',
    address: { street: 'Jl. Raya Perjuangan Kav. 8', city: 'Jakarta Barat', province: 'DKI Jakarta' },
    izinSarana: { number: 'SIA-RS-2024-002233', expiryDate: new Date('2028-06-15') },
    apoteker: { name: 'apt. Yuliana Tan, S.Farm', address: 'Jl. Kebon Jeruk No. 15, Jakarta Barat' },
    sipa: { number: 'SIPA-2024-009012', expiryDate: new Date('2028-06-15') },
    paymentTermDays: 60,
    creditLimit: 250000000,
    npwp: { number: '06.789.012.3-016.000', name: 'PT Siloam International Hospitals', address: 'Jl. Raya Perjuangan Kav. 8, Jakarta Barat' },
  },
  {
    name: 'Klinik Pratama Medika Utama',
    type: CUSTOMER_TYPE.KLINIK,
    ownerName: 'dr. Bambang Supriadi',
    contactPerson: 'dr. Bambang Supriadi',
    phone: '022-4210567',
    address: { street: 'Jl. Ir. H. Juanda No. 45', city: 'Bandung', province: 'Jawa Barat' },
    izinSarana: { number: 'SIA-KL-2024-003344', expiryDate: new Date('2029-01-31') },
    apoteker: { name: 'apt. Niken Ayu, S.Farm', address: 'Jl. Dago No. 30, Bandung' },
    sipa: { number: 'SIPA-2024-010123', expiryDate: new Date('2029-01-31') },
    paymentTermDays: 30,
    creditLimit: 25000000,
  },
  {
    name: 'Klinik Utama Sentosa',
    type: CUSTOMER_TYPE.KLINIK,
    ownerName: 'dr. Rina Handayani',
    contactPerson: 'dr. Rina Handayani',
    phone: '031-5678901',
    address: { street: 'Jl. Pemuda No. 30', city: 'Surabaya', province: 'Jawa Timur' },
    izinSarana: { number: 'SIA-KL-2024-004455', expiryDate: new Date('2028-11-30') },
    apoteker: { name: 'apt. Dian Purnama, S.Farm', address: 'Jl. Raya Darmo No. 18, Surabaya' },
    sipa: { number: 'SIPA-2024-011234', expiryDate: new Date('2028-11-30') },
    paymentTermDays: 14,
    creditLimit: 20000000,
  },
  {
    name: 'Puskesmas Kecamatan Tebet',
    type: CUSTOMER_TYPE.PUSKESMAS,
    contactPerson: 'dr. Nurul Hidayat',
    phone: '021-8301245',
    address: { street: 'Jl. Prof. Dr. Soepomo SH No. 54', city: 'Jakarta Selatan', province: 'DKI Jakarta' },
    izinSarana: { number: 'SIA-PKM-2024-005566', expiryDate: new Date('2029-04-30') },
    apoteker: { name: 'apt. Fitri Rahayu, S.Farm', address: 'Jl. Tebet Barat No. 7, Jakarta Selatan' },
    sipa: { number: 'SIPA-2024-012345', expiryDate: new Date('2029-04-30') },
    paymentTermDays: 30,
    creditLimit: 30000000,
  },
  {
    name: 'Puskesmas Kecamatan Cimahi Selatan',
    type: CUSTOMER_TYPE.PUSKESMAS,
    contactPerson: 'dr. Hasan Basri',
    phone: '022-6654321',
    address: { street: 'Jl. Raya Cimahi No. 120', city: 'Cimahi', province: 'Jawa Barat' },
    izinSarana: { number: 'SIA-PKM-2024-006677', expiryDate: new Date('2028-08-31') },
    apoteker: { name: 'apt. Sri Mulyani, S.Farm', address: 'Jl. Cimahi Tengah No. 22, Cimahi' },
    sipa: { number: 'SIPA-2024-013456', expiryDate: new Date('2028-08-31') },
    paymentTermDays: 30,
    creditLimit: 25000000,
  },
  {
    name: 'Toko Obat Sumber Waras',
    type: CUSTOMER_TYPE.TOKO_OBAT,
    ownerName: 'Haji Mahmud',
    contactPerson: 'Haji Mahmud',
    phone: '024-3512345',
    address: { street: 'Jl. Pandanaran No. 78', city: 'Semarang', province: 'Jawa Tengah' },
    paymentTermDays: 7,
    creditLimit: 10000000,
    notes: 'Toko obat berizin, hanya obat bebas dan bebas terbatas',
  },
  {
    name: 'Toko Obat Murah Jaya',
    type: CUSTOMER_TYPE.TOKO_OBAT,
    ownerName: 'Bapak Sutrisno',
    contactPerson: 'Bapak Sutrisno',
    phone: '0274-512345',
    address: { street: 'Jl. Malioboro No. 55', city: 'Yogyakarta', province: 'DI Yogyakarta' },
    paymentTermDays: 0,
    creditLimit: 5000000,
  },
  {
    name: 'PT Mensa Bina Sukses',
    type: CUSTOMER_TYPE.PBF_LAIN,
    ownerName: 'Hendri Kurniawan',
    contactPerson: 'Hendri Kurniawan',
    phone: '021-4507890',
    address: { street: 'Jl. Raya Bekasi Km. 28', city: 'Bekasi', province: 'Jawa Barat' },
    izinSarana: { number: 'PBF-2024-007788', expiryDate: new Date('2029-02-28') },
    apoteker: { name: 'apt. Teguh Prasetyo, S.Farm', address: 'Jl. Bekasi Timur No. 45, Bekasi' },
    sipa: { number: 'SIPA-2024-014567', expiryDate: new Date('2029-02-28') },
    paymentTermDays: 30,
    creditLimit: 75000000,
    bankAccount: { bankName: 'BRI', accountNumber: '3456789012', accountName: 'PT Mensa Bina Sukses' },
    npwp: { number: '07.890.123.4-017.000', name: 'PT Mensa Bina Sukses', address: 'Jl. Raya Bekasi Km. 28, Bekasi' },
  },
  {
    name: 'Apotek Bunda Farma',
    type: CUSTOMER_TYPE.APOTEK,
    ownerName: 'apt. Kartini Wulandari',
    contactPerson: 'apt. Kartini Wulandari',
    phone: '061-4567890',
    address: { street: 'Jl. Gatot Subroto No. 112', city: 'Medan', province: 'Sumatera Utara' },
    izinSarana: { number: 'SIA-2024-008899', expiryDate: new Date('2026-05-15') },
    apoteker: { name: 'apt. Kartini Wulandari, S.Farm', address: 'Jl. Gatot Subroto No. 112, Medan' },
    sipa: { number: 'SIPA-2024-015678', expiryDate: new Date('2026-05-15') },
    paymentTermDays: 30,
    creditLimit: 40000000,
    notes: 'Izin Sarana mendekati expired, perlu follow up perpanjangan',
  },
  {
    name: 'RS Hermina Bekasi',
    type: CUSTOMER_TYPE.RUMAH_SAKIT,
    ownerName: 'PT Medikaloka Hermina',
    contactPerson: 'apt. Lina Marlina',
    phone: '021-88852121',
    address: { street: 'Jl. Kemakmuran No. 39-42', city: 'Bekasi', province: 'Jawa Barat' },
    izinSarana: { number: 'SIA-RS-2024-009900', expiryDate: new Date('2029-07-31') },
    apoteker: { name: 'apt. Lina Marlina, S.Farm', address: 'Jl. Kemakmuran No. 39, Bekasi' },
    sipa: { number: 'SIPA-2024-016789', expiryDate: new Date('2029-07-31') },
    paymentTermDays: 45,
    creditLimit: 150000000,
    npwp: { number: '08.901.234.5-018.000', name: 'PT Medikaloka Hermina', address: 'Jl. Kemakmuran No. 39-42, Bekasi' },
  },
  {
    name: 'Apotek Roxy Farma',
    type: CUSTOMER_TYPE.APOTEK,
    ownerName: 'Steven Halim',
    contactPerson: 'apt. Steven Halim',
    phone: '021-6321456',
    address: { street: 'Jl. KH Hasyim Ashari No. 88', city: 'Jakarta Pusat', province: 'DKI Jakarta' },
    izinSarana: { number: 'SIA-2024-010011', expiryDate: new Date('2026-04-10') },
    apoteker: { name: 'apt. Steven Halim, S.Farm', address: 'Jl. KH Hasyim Ashari No. 88, Jakarta Pusat' },
    sipa: { number: 'SIPA-2024-017890', expiryDate: new Date('2026-04-10') },
    paymentTermDays: 14,
    creditLimit: 30000000,
    isActive: false,
    notes: 'Izin Sarana hampir expired, nonaktif sementara',
  },
];

const seedCustomers = async () => {
  try {
    await mongoose.connect(config.mongo.uri);
    logger.info('MongoDB connected for seeding customers');

    const existingCount = await Customer.countDocuments();
    if (existingCount > 0) {
      logger.warn(`Database already has ${existingCount} customers. Use --force to reseed.`);
      if (!process.argv.includes('--force')) {
        process.exit(0);
      }
      logger.info('Force flag detected. Clearing existing customers...');
      await Customer.deleteMany({});
    }

    const created = [];
    for (const customerData of customers) {
      const customer = await Customer.create(customerData);
      created.push(customer);
    }
    logger.info(`✓ Seeded ${created.length} customers successfully`);

    created.forEach((customer) => {
      logger.info(`  - ${customer.name} (${customer.code}) [${customer.type}]`);
    });

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    logger.error(`Customer seeding failed: ${error.message}`);
    await mongoose.disconnect();
    process.exit(1);
  }
};

seedCustomers();
