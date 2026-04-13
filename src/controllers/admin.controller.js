const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/ApiResponse');
const mongoose = require('mongoose');
const { getMySQLPool } = require('../config/database');
const config = require('../config');

// List of collections/tables to truncate
const MONGO_COLLECTIONS = [
  'products', 'suppliers', 'customers', 'salesorders', 'purchaseorders', 'goodsreceivings', 'returns', 'invoices', 'payments', 'journalentries', 'stockbatches', 'stockmutations', 'stockopnames',
];
const MYSQL_TABLES = [
  'products', 'suppliers', 'customers', 'sales_orders', 'purchase_orders', 'goods_receivings', 'returns', 'invoices', 'payments', 'journal_entries', 'stock_batches', 'stock_mutations', 'stock_opnames',
];

// Regulation tables/collections
const REGULATION_COLLECTIONS = [
  'surat_pesanan_khusus', 'sp_items', 'e_reports', 'e_report_items', 'regulation_documents',
];

const clearData = catchAsync(async (req, res) => {
  if (config.dbProvider === 'mysql') {
    const pool = getMySQLPool();
    for (const table of MYSQL_TABLES) {
      await pool.query(`TRUNCATE TABLE ${table}`);
    }
    await pool.query('TRUNCATE TABLE surat_pesanan_khusus');
    await pool.query('TRUNCATE TABLE sp_items');
    await pool.query('TRUNCATE TABLE e_reports');
    await pool.query('TRUNCATE TABLE e_report_items');
    await pool.query('TRUNCATE TABLE regulation_documents');
    // Reset Chart of Account balances
    await pool.query('UPDATE chart_of_accounts SET balance = 0');
    // Kosongkan bank transactions
    await pool.query('TRUNCATE TABLE bank_transactions');
  } else {
    for (const coll of MONGO_COLLECTIONS) {
      await mongoose.connection.collection(coll).deleteMany({});
    }
    await mongoose.connection.collection('suratpesanankhusus').deleteMany({});
    await mongoose.connection.collection('spitems').deleteMany({});
    await mongoose.connection.collection('ereports').deleteMany({});
    await mongoose.connection.collection('ereportitems').deleteMany({});
    await mongoose.connection.collection('regulationdocuments').deleteMany({});
    // Reset Chart of Account balances
    await mongoose.connection.collection('chartofaccounts').updateMany({}, { $set: { balance: 0 } });
    // Kosongkan bank transactions
    await mongoose.connection.collection('banktransactions').deleteMany({});
  }
  ApiResponse.success(res, { message: 'Semua data utama berhasil dikosongkan.' });
});

module.exports = { clearData };
