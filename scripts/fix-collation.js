const config = require('../src/config');
const mysql = require('mysql2/promise');

(async () => {
  const pool = mysql.createPool({
    host: config.mysql.host,
    port: config.mysql.port,
    user: config.mysql.user,
    password: config.mysql.password,
    database: config.mysql.database,
  });

  const tables = ['surat_pesanan_khusus', 'sp_items', 'e_reports', 'e_report_items', 'regulation_documents'];
  for (const t of tables) {
    await pool.query(`ALTER TABLE ${t} CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
    console.log(`Converted ${t} to utf8mb4_general_ci`);
  }

  await pool.end();
})();
