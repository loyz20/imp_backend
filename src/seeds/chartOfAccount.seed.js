const mongoose = require('mongoose');
const config = require('../config');
const ChartOfAccount = require('../models/ChartOfAccount');
const { getMySQLPool } = require('../config/database');
const logger = require('../utils/logger');

const chartOfAccountSeed = [
  // Level 0 — Header accounts
  { code: '1000', name: 'Aset', category: 'asset', level: 0 },
  { code: '2000', name: 'Kewajiban', category: 'liability', level: 0 },
  { code: '3000', name: 'Ekuitas', category: 'equity', level: 0 },
  { code: '4000', name: 'Pendapatan', category: 'revenue', level: 0 },
  { code: '5000', name: 'Beban', category: 'expense', level: 0 },

  // Level 1 — Sub-headers
  { code: '1100', name: 'Kas & Bank', category: 'asset', parentCode: '1000', level: 1 },
  { code: '1200', name: 'Piutang Usaha', category: 'asset', parentCode: '1000', level: 1 },
  { code: '1300', name: 'Persediaan', category: 'asset', parentCode: '1000', level: 1 },
  { code: '1400', name: 'Pajak Dibayar Dimuka', category: 'asset', parentCode: '1000', level: 1 },
  { code: '2100', name: 'Hutang Usaha', category: 'liability', parentCode: '2000', level: 1 },
  { code: '2110', name: 'PPN Keluaran', category: 'liability', parentCode: '2000', level: 1 },
  { code: '3100', name: 'Modal Disetor', category: 'equity', parentCode: '3000', level: 1 },
  { code: '3200', name: 'Laba Ditahan', category: 'equity', parentCode: '3000', level: 1 },
  { code: '4100', name: 'Pendapatan Penjualan', category: 'revenue', parentCode: '4000', level: 1 },
  { code: '4200', name: 'Pendapatan Lainnya', category: 'revenue', parentCode: '4000', level: 1 },
  { code: '5100', name: 'Harga Pokok Penjualan', category: 'expense', parentCode: '5000', level: 1 },
  { code: '5200', name: 'Beban Operasional', category: 'expense', parentCode: '5000', level: 1 },

  // Level 2 — Detail accounts
  { code: '1110', name: 'Kas', category: 'asset', parentCode: '1100', level: 2 },
  { code: '1120', name: 'Bank', category: 'asset', parentCode: '1100', level: 2 },
  { code: '1210', name: 'Piutang Dagang', category: 'asset', parentCode: '1200', level: 2 },
  { code: '1410', name: 'PPN Masukan', category: 'asset', parentCode: '1400', level: 2 },
  { code: '5210', name: 'Beban Gaji', category: 'expense', parentCode: '5200', level: 2 },
  { code: '5220', name: 'Beban Sewa', category: 'expense', parentCode: '5200', level: 2 },
  { code: '5230', name: 'Beban Utilitas', category: 'expense', parentCode: '5200', level: 2 },
];

const seedChartOfAccounts = async () => {
  if (config.dbProvider === 'mysql') {
    return seedMySQL();
  }
  return seedMongo();
};

// ─── MySQL seed ───
const seedMySQL = async () => {
  const pool = getMySQLPool();
  let createdCount = 0;
  let updatedCount = 0;

  // First pass: create/update accounts
  const codeToId = {};
  for (const acc of chartOfAccountSeed) {
    const [rows] = await pool.query('SELECT id FROM chart_of_accounts WHERE code = ?', [acc.code]);
    if (rows.length) {
      codeToId[acc.code] = rows[0].id;
      await pool.query(
        'UPDATE chart_of_accounts SET name = ?, category = ?, level = ?, is_active = 1, updated_at = NOW() WHERE code = ?',
        [acc.name, acc.category, acc.level, acc.code],
      );
      updatedCount += 1;
    } else {
      const id = new mongoose.Types.ObjectId().toString();
      codeToId[acc.code] = id;
      await pool.query(
        'INSERT INTO chart_of_accounts (id, code, name, category, level, balance, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 1, NOW(), NOW())',
        [id, acc.code, acc.name, acc.category, acc.level],
      );
      createdCount += 1;
    }
  }

  // Second pass: set parent_id
  for (const acc of chartOfAccountSeed) {
    if (acc.parentCode && codeToId[acc.parentCode] && codeToId[acc.code]) {
      await pool.query('UPDATE chart_of_accounts SET parent_id = ? WHERE id = ?', [codeToId[acc.parentCode], codeToId[acc.code]]);
    }
  }

  logger.info(`Chart of Accounts seeded. created=${createdCount}, updated=${updatedCount}, total=${chartOfAccountSeed.length}`);
};

// ─── MongoDB seed ───
const seedMongo = async () => {
  // First pass: create/update accounts without parentId
  const accountMap = {};
  let createdCount = 0;
  let updatedCount = 0;

  for (const acc of chartOfAccountSeed) {
    const data = {
      code: acc.code,
      name: acc.name,
      category: acc.category,
      level: acc.level,
      isActive: true,
    };

    const existing = await ChartOfAccount.findOne({ code: acc.code }).select('_id').lean();
    if (existing) {
      await ChartOfAccount.findByIdAndUpdate(existing._id, { $set: data });
      accountMap[acc.code] = existing._id;
      updatedCount += 1;
    } else {
      const created = await ChartOfAccount.create({
        ...data,
        balance: 0,
      });
      accountMap[acc.code] = created._id;
      createdCount += 1;
    }
  }

  // Second pass: set parentId
  for (const acc of chartOfAccountSeed) {
    if (acc.parentCode && accountMap[acc.parentCode] && accountMap[acc.code]) {
      await ChartOfAccount.findByIdAndUpdate(accountMap[acc.code], {
        parentId: accountMap[acc.parentCode],
      });
    }
  }

  logger.info(`Chart of Accounts seeded. created=${createdCount}, updated=${updatedCount}, total=${chartOfAccountSeed.length}`);
};

module.exports = seedChartOfAccounts;

if (require.main === module) {
  (async () => {
    try {
      await mongoose.connect(config.mongo.uri);
      logger.info('MongoDB connected for COA seeding');
      await seedChartOfAccounts();
      await mongoose.disconnect();
      logger.info('MongoDB disconnected');
      process.exit(0);
    } catch (error) {
      logger.error(`COA seeding failed: ${error.message}`);
      try {
        await mongoose.disconnect();
      } catch {
        // noop
      }
      process.exit(1);
    }
  })();
}
