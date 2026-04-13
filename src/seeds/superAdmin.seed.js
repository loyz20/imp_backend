const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../config');
const User = require('../models/User');
const { getMySQLPool } = require('../config/database');
const { USER_ROLES } = require('../constants');
const logger = require('../utils/logger');

const SUPERADMIN = {
  name: 'Super Admin',
  email: 'superadmin@pbf.co.id',
  password: 'Admin@1234',
  role: USER_ROLES.SUPERADMIN,
};

const seedSuperAdmin = async () => {
  if (config.dbProvider === 'mysql') {
    return seedMySQL();
  }
  return seedMongo();
};

const seedMySQL = async () => {
  const pool = getMySQLPool();
  const [[existing]] = await pool.query('SELECT id FROM users WHERE role = ? LIMIT 1', [USER_ROLES.SUPERADMIN]);
  if (existing) {
    logger.info('Superadmin already exists, skipping seed');
    return;
  }
  const id = new mongoose.Types.ObjectId().toString();
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(SUPERADMIN.password, salt);
  await pool.query(
    `INSERT INTO users (id, name, email, password_hash, role, is_active, is_email_verified, login_attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, 1, 0, NOW(), NOW())`,
    [id, SUPERADMIN.name, SUPERADMIN.email, passwordHash, SUPERADMIN.role],
  );
  logger.info(`Superadmin seeded: ${SUPERADMIN.email}`);
};

const seedMongo = async () => {
  const existing = await User.findOne({ role: USER_ROLES.SUPERADMIN }).select('_id').lean();
  if (existing) {
    logger.info('Superadmin already exists, skipping seed');
    return;
  }
  await User.create({
    name: SUPERADMIN.name,
    email: SUPERADMIN.email,
    password: SUPERADMIN.password,
    role: SUPERADMIN.role,
    isActive: true,
    isEmailVerified: true,
  });
  logger.info(`Superadmin seeded: ${SUPERADMIN.email}`);
};

module.exports = seedSuperAdmin;
