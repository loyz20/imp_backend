const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/ApiResponse');
const { getMySQLPool } = require('../config/database');

// List of tables to truncate
const MYSQL_TABLES = [
  'products', 'suppliers', 'customers', 'sales_orders', 'purchase_orders', 'goods_receivings', 'returns', 'invoices', 'payments', 'journal_entries', 'stock_batches', 'stock_mutations', 'stock_opnames',
];

const clearData = catchAsync(async (req, res) => {
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
  ApiResponse.success(res, { message: 'Semua data utama berhasil dikosongkan.' });
});

module.exports = { clearData };
