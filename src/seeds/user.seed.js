const mongoose = require('mongoose');
const config = require('../config');
const User = require('../models/User');
const { USER_ROLES } = require('../constants');
const logger = require('../utils/logger');

const users = [
  // ─── Superadmin ───
  {
    name: 'Super Admin',
    email: 'superadmin@pbf.co.id',
    phone: '081200000001',
    password: 'Admin@1234',
    role: USER_ROLES.SUPERADMIN,
    isActive: true,
    isEmailVerified: true,
    address: {
      street: 'Jl. Industri Farmasi No. 1',
      city: 'Jakarta Pusat',
      province: 'DKI Jakarta',
      postalCode: '10110',
      country: 'Indonesia',
    },
  },

  // ─── Admin ───
  {
    name: 'Admin PBF',
    email: 'admin@pbf.co.id',
    phone: '081200000002',
    password: 'Admin@1234',
    role: USER_ROLES.ADMIN,
    isActive: true,
    isEmailVerified: true,
    address: {
      street: 'Jl. Industri Farmasi No. 1',
      city: 'Jakarta Pusat',
      province: 'DKI Jakarta',
      postalCode: '10110',
      country: 'Indonesia',
    },
  },

  // ─── Apoteker ───
  {
    name: 'Apt. Siti Rahmawati',
    email: 'apoteker@pbf.co.id',
    phone: '081200000003',
    password: 'Admin@1234',
    role: USER_ROLES.APOTEKER,
    isActive: true,
    isEmailVerified: true,
    address: {
      street: 'Jl. Industri Farmasi No. 1',
      city: 'Jakarta Pusat',
      province: 'DKI Jakarta',
      postalCode: '10110',
      country: 'Indonesia',
    },
  },

  // ─── Keuangan ───
  {
    name: 'Budi Hartono',
    email: 'keuangan@pbf.co.id',
    phone: '081200000004',
    password: 'Admin@1234',
    role: USER_ROLES.KEUANGAN,
    isActive: true,
    isEmailVerified: true,
    address: {
      street: 'Jl. Industri Farmasi No. 1',
      city: 'Jakarta Pusat',
      province: 'DKI Jakarta',
      postalCode: '10110',
      country: 'Indonesia',
    },
  },

  // ─── Gudang ───
  {
    name: 'Andi Prasetyo',
    email: 'gudang@pbf.co.id',
    phone: '081200000005',
    password: 'Admin@1234',
    role: USER_ROLES.GUDANG,
    isActive: true,
    isEmailVerified: true,
    address: {
      street: 'Jl. Industri Farmasi No. 1',
      city: 'Jakarta Pusat',
      province: 'DKI Jakarta',
      postalCode: '10110',
      country: 'Indonesia',
    },
  },

  // ─── Sales ───
  {
    name: 'Dewi Lestari',
    email: 'sales@pbf.co.id',
    phone: '081200000006',
    password: 'Admin@1234',
    role: USER_ROLES.SALES,
    isActive: true,
    isEmailVerified: true,
    address: {
      street: 'Jl. Industri Farmasi No. 1',
      city: 'Jakarta Pusat',
      province: 'DKI Jakarta',
      postalCode: '10110',
      country: 'Indonesia',
    },
  },
];

const seedUsers = async () => {
  try {
    await mongoose.connect(config.mongo.uri);
    logger.info('MongoDB connected for seeding');

    // Check if users already exist
    const existingCount = await User.countDocuments();
    if (existingCount > 0) {
      logger.warn(`Database already has ${existingCount} users. Use --force to reseed.`);
      if (!process.argv.includes('--force')) {
        process.exit(0);
      }
      logger.info('Force flag detected. Clearing existing users...');
      await User.deleteMany({});
    }

    // Insert users (password will be hashed by pre-save hook)
    const created = await User.create(users);
    logger.info(`✓ Seeded ${created.length} users successfully`);

    created.forEach((user) => {
      logger.info(`  - ${user.name} (${user.email}) [${user.role}]`);
    });

    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
    process.exit(0);
  } catch (error) {
    logger.error(`Seeding failed: ${error.message}`);
    await mongoose.disconnect();
    process.exit(1);
  }
};

seedUsers();
