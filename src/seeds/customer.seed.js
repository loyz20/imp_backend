const mongoose = require('mongoose');
const config = require('../config');
const Customer = require('../models/Customer');
const { CUSTOMER_TYPE } = require('../constants');
const logger = require('../utils/logger');

const customers = [
  {
    name: 'Apotek Sehat Selalu',
    type: CUSTOMER_TYPE.APOTEK,
    contactPerson: 'dr. Siti Aminah',
    phone: '021-7654321',
    email: 'order@apoteksehat.co.id',
    website: 'https://www.apoteksehat.co.id',
    address: {
      street: 'Jl. Kesehatan No. 10',
      city: 'Jakarta Selatan',
      province: 'DKI Jakarta',
      postalCode: '12340',
    },
    siaLicense: { number: 'SIA-2024-001234', expiryDate: new Date('2029-06-30') },
    pharmacist: { name: 'apt. Rina Wijaya, S.Farm', sipaNumber: 'SIPA-2024-005678' },
    paymentTermDays: 30,
    creditLimit: 50000000,
    bankAccount: { bankName: 'BCA', accountNumber: '9876543210', accountName: 'Apotek Sehat Selalu' },
    npwp: '02.345.678.9-012.000',
    notes: 'Pelanggan prioritas, order rutin tiap minggu',
  },
  {
    name: 'Apotek Kimia Farma 128',
    type: CUSTOMER_TYPE.APOTEK,
    contactPerson: 'apt. Dwi Hartono',
    phone: '021-5501234',
    email: 'kf128@kimiafarma.co.id',
    address: {
      street: 'Jl. Thamrin No. 5',
      city: 'Jakarta Pusat',
      province: 'DKI Jakarta',
      postalCode: '10230',
    },
    siaLicense: { number: 'SIA-2024-002345', expiryDate: new Date('2029-03-15') },
    pharmacist: { name: 'apt. Dwi Hartono, S.Farm', sipaNumber: 'SIPA-2024-006789' },
    paymentTermDays: 30,
    creditLimit: 75000000,
    bankAccount: { bankName: 'Mandiri', accountNumber: '1234567890', accountName: 'Apotek Kimia Farma 128' },
    npwp: '03.456.789.0-013.000',
  },
  {
    name: 'Apotek Century Healthcare',
    type: CUSTOMER_TYPE.APOTEK,
    contactPerson: 'apt. Maria Lestari',
    phone: '021-7890123',
    email: 'procurement@century.co.id',
    website: 'https://www.century.co.id',
    address: {
      street: 'Jl. Gatot Subroto Kav. 18',
      city: 'Jakarta Selatan',
      province: 'DKI Jakarta',
      postalCode: '12930',
    },
    siaLicense: { number: 'SIA-2024-003456', expiryDate: new Date('2028-12-31') },
    pharmacist: { name: 'apt. Maria Lestari, S.Farm', sipaNumber: 'SIPA-2024-007890' },
    paymentTermDays: 45,
    creditLimit: 100000000,
    npwp: '04.567.890.1-014.000',
  },
  {
    name: 'RS Pondok Indah',
    type: CUSTOMER_TYPE.RUMAH_SAKIT,
    contactPerson: 'dr. Ahmad Fauzi, Sp.PD',
    phone: '021-7657525',
    email: 'farmasi@rspondokindah.co.id',
    website: 'https://www.rspondokindah.co.id',
    address: {
      street: 'Jl. Metro Duta Kav. UE',
      city: 'Jakarta Selatan',
      province: 'DKI Jakarta',
      postalCode: '12310',
    },
    siaLicense: { number: 'SIA-RS-2024-001122', expiryDate: new Date('2029-09-30') },
    pharmacist: { name: 'apt. Endang Susilowati, S.Farm', sipaNumber: 'SIPA-2024-008901' },
    paymentTermDays: 60,
    creditLimit: 200000000,
    bankAccount: { bankName: 'BCA', accountNumber: '5678901234', accountName: 'RS Pondok Indah' },
    npwp: '05.678.901.2-015.000',
    notes: 'Rumah sakit swasta premium, volume order besar',
  },
  {
    name: 'RS Siloam Hospitals Kebon Jeruk',
    type: CUSTOMER_TYPE.RUMAH_SAKIT,
    contactPerson: 'apt. Yuliana Tan',
    phone: '021-25677888',
    email: 'pharmacy@siloamhospitals.com',
    website: 'https://www.siloamhospitals.com',
    address: {
      street: 'Jl. Raya Perjuangan Kav. 8',
      city: 'Jakarta Barat',
      province: 'DKI Jakarta',
      postalCode: '11530',
    },
    siaLicense: { number: 'SIA-RS-2024-002233', expiryDate: new Date('2028-06-15') },
    pharmacist: { name: 'apt. Yuliana Tan, S.Farm', sipaNumber: 'SIPA-2024-009012' },
    paymentTermDays: 60,
    creditLimit: 250000000,
    npwp: '06.789.012.3-016.000',
  },
  {
    name: 'Klinik Pratama Medika Utama',
    type: CUSTOMER_TYPE.KLINIK,
    contactPerson: 'dr. Bambang Supriadi',
    phone: '022-4210567',
    email: 'admin@klinikmediautama.co.id',
    address: {
      street: 'Jl. Ir. H. Juanda No. 45',
      city: 'Bandung',
      province: 'Jawa Barat',
      postalCode: '40116',
    },
    siaLicense: { number: 'SIA-KL-2024-003344', expiryDate: new Date('2029-01-31') },
    pharmacist: { name: 'apt. Niken Ayu, S.Farm', sipaNumber: 'SIPA-2024-010123' },
    paymentTermDays: 30,
    creditLimit: 25000000,
  },
  {
    name: 'Klinik Utama Sentosa',
    type: CUSTOMER_TYPE.KLINIK,
    contactPerson: 'dr. Rina Handayani',
    phone: '031-5678901',
    email: 'farmasi@kliniksentosa.co.id',
    address: {
      street: 'Jl. Pemuda No. 30',
      city: 'Surabaya',
      province: 'Jawa Timur',
      postalCode: '60271',
    },
    siaLicense: { number: 'SIA-KL-2024-004455', expiryDate: new Date('2028-11-30') },
    pharmacist: { name: 'apt. Dian Purnama, S.Farm', sipaNumber: 'SIPA-2024-011234' },
    paymentTermDays: 14,
    creditLimit: 20000000,
  },
  {
    name: 'Puskesmas Kecamatan Tebet',
    type: CUSTOMER_TYPE.PUSKESMAS,
    contactPerson: 'dr. Nurul Hidayat',
    phone: '021-8301245',
    email: 'puskesmas.tebet@jakarta.go.id',
    address: {
      street: 'Jl. Prof. Dr. Soepomo SH No. 54',
      city: 'Jakarta Selatan',
      province: 'DKI Jakarta',
      postalCode: '12810',
    },
    siaLicense: { number: 'SIA-PKM-2024-005566', expiryDate: new Date('2029-04-30') },
    pharmacist: { name: 'apt. Fitri Rahayu, S.Farm', sipaNumber: 'SIPA-2024-012345' },
    paymentTermDays: 30,
    creditLimit: 30000000,
  },
  {
    name: 'Puskesmas Kecamatan Cimahi Selatan',
    type: CUSTOMER_TYPE.PUSKESMAS,
    contactPerson: 'dr. Hasan Basri',
    phone: '022-6654321',
    email: 'puskesmas.cimahiselatan@jawabarat.go.id',
    address: {
      street: 'Jl. Raya Cimahi No. 120',
      city: 'Cimahi',
      province: 'Jawa Barat',
      postalCode: '40533',
    },
    siaLicense: { number: 'SIA-PKM-2024-006677', expiryDate: new Date('2028-08-31') },
    pharmacist: { name: 'apt. Sri Mulyani, S.Farm', sipaNumber: 'SIPA-2024-013456' },
    paymentTermDays: 30,
    creditLimit: 25000000,
  },
  {
    name: 'Toko Obat Sumber Waras',
    type: CUSTOMER_TYPE.TOKO_OBAT,
    contactPerson: 'Haji Mahmud',
    phone: '024-3512345',
    email: 'sumberwaras@gmail.com',
    address: {
      street: 'Jl. Pandanaran No. 78',
      city: 'Semarang',
      province: 'Jawa Tengah',
      postalCode: '50134',
    },
    paymentTermDays: 7,
    creditLimit: 10000000,
    notes: 'Toko obat berizin, hanya obat bebas dan bebas terbatas',
  },
  {
    name: 'Toko Obat Murah Jaya',
    type: CUSTOMER_TYPE.TOKO_OBAT,
    contactPerson: 'Bapak Sutrisno',
    phone: '0274-512345',
    email: 'murahjaya@gmail.com',
    address: {
      street: 'Jl. Malioboro No. 55',
      city: 'Yogyakarta',
      province: 'DI Yogyakarta',
      postalCode: '55213',
    },
    paymentTermDays: 0,
    creditLimit: 5000000,
  },
  {
    name: 'PT Mensa Bina Sukses',
    type: CUSTOMER_TYPE.PBF_LAIN,
    contactPerson: 'Hendri Kurniawan',
    phone: '021-4507890',
    email: 'order@mensabina.co.id',
    website: 'https://www.mensabina.co.id',
    address: {
      street: 'Jl. Raya Bekasi Km. 28',
      city: 'Bekasi',
      province: 'Jawa Barat',
      postalCode: '17132',
    },
    siaLicense: { number: 'PBF-2024-007788', expiryDate: new Date('2029-02-28') },
    pharmacist: { name: 'apt. Teguh Prasetyo, S.Farm', sipaNumber: 'SIPA-2024-014567' },
    paymentTermDays: 30,
    creditLimit: 75000000,
    bankAccount: { bankName: 'BRI', accountNumber: '3456789012', accountName: 'PT Mensa Bina Sukses' },
    npwp: '07.890.123.4-017.000',
  },
  {
    name: 'Apotek Bunda Farma',
    type: CUSTOMER_TYPE.APOTEK,
    contactPerson: 'apt. Kartini Wulandari',
    phone: '061-4567890',
    email: 'order@bundafarma.co.id',
    address: {
      street: 'Jl. Gatot Subroto No. 112',
      city: 'Medan',
      province: 'Sumatera Utara',
      postalCode: '20123',
    },
    siaLicense: { number: 'SIA-2024-008899', expiryDate: new Date('2026-05-15') },
    pharmacist: { name: 'apt. Kartini Wulandari, S.Farm', sipaNumber: 'SIPA-2024-015678' },
    paymentTermDays: 30,
    creditLimit: 40000000,
    notes: 'SIA mendekati expired, perlu follow up perpanjangan',
  },
  {
    name: 'RS Hermina Bekasi',
    type: CUSTOMER_TYPE.RUMAH_SAKIT,
    contactPerson: 'apt. Lina Marlina',
    phone: '021-88852121',
    email: 'farmasi@herminabekasi.co.id',
    website: 'https://www.herminahospitals.com',
    address: {
      street: 'Jl. Kemakmuran No. 39-42',
      city: 'Bekasi',
      province: 'Jawa Barat',
      postalCode: '17114',
    },
    siaLicense: { number: 'SIA-RS-2024-009900', expiryDate: new Date('2029-07-31') },
    pharmacist: { name: 'apt. Lina Marlina, S.Farm', sipaNumber: 'SIPA-2024-016789' },
    paymentTermDays: 45,
    creditLimit: 150000000,
    npwp: '08.901.234.5-018.000',
  },
  {
    name: 'Apotek Roxy Farma',
    type: CUSTOMER_TYPE.APOTEK,
    contactPerson: 'apt. Steven Halim',
    phone: '021-6321456',
    email: 'roxyfarma@gmail.com',
    address: {
      street: 'Jl. KH Hasyim Ashari No. 88',
      city: 'Jakarta Pusat',
      province: 'DKI Jakarta',
      postalCode: '10150',
    },
    siaLicense: { number: 'SIA-2024-010011', expiryDate: new Date('2026-04-10') },
    pharmacist: { name: 'apt. Steven Halim, S.Farm', sipaNumber: 'SIPA-2024-017890' },
    paymentTermDays: 14,
    creditLimit: 30000000,
    isActive: false,
    notes: 'SIA hampir expired, nonaktif sementara',
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
