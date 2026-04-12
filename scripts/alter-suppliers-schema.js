/**
 * Alter suppliers table to match new schema:
 * - Drop columns: email, website, address_postal_code, address_country
 * - Rename: pbf_license_number -> izin_sarana_number
 * - Rename: pbf_license_expiry -> izin_sarana_expiry_date
 * - Rename: cdob_cert_number -> cdob_cdakb_number
 * - Rename: cdob_cert_expiry -> cdob_cdakb_expiry_date
 * - Add: sip_sik_number, sip_sik_expiry_date
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

async function run() {
  const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'localhost',
    port: Number(process.env.MYSQL_PORT) || 3306,
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE || 'app_iko',
  });

  const conn = await pool.getConnection();
  try {
    // Check which columns currently exist
    const [cols] = await conn.query(`SHOW COLUMNS FROM suppliers`);
    const colNames = cols.map(c => c.Field);
    console.log('Current columns:', colNames.join(', '));

    const alterClauses = [];

    // Drop old columns (if they exist)
    for (const col of ['email', 'website', 'address_postal_code', 'address_country']) {
      if (colNames.includes(col)) {
        alterClauses.push(`DROP COLUMN \`${col}\``);
      }
    }

    // Rename pbf_license_number -> izin_sarana_number
    if (colNames.includes('pbf_license_number') && !colNames.includes('izin_sarana_number')) {
      alterClauses.push(`CHANGE COLUMN \`pbf_license_number\` \`izin_sarana_number\` VARCHAR(100) NULL`);
    }
    // Rename pbf_license_expiry_date -> izin_sarana_expiry_date
    if (colNames.includes('pbf_license_expiry_date') && !colNames.includes('izin_sarana_expiry_date')) {
      alterClauses.push(`CHANGE COLUMN \`pbf_license_expiry_date\` \`izin_sarana_expiry_date\` DATETIME NULL`);
    }

    // Rename cdob_certificate_number -> cdob_cdakb_number
    if (colNames.includes('cdob_certificate_number') && !colNames.includes('cdob_cdakb_number')) {
      alterClauses.push(`CHANGE COLUMN \`cdob_certificate_number\` \`cdob_cdakb_number\` VARCHAR(100) NULL`);
    }
    // Rename cdob_certificate_expiry_date -> cdob_cdakb_expiry_date
    if (colNames.includes('cdob_certificate_expiry_date') && !colNames.includes('cdob_cdakb_expiry_date')) {
      alterClauses.push(`CHANGE COLUMN \`cdob_certificate_expiry_date\` \`cdob_cdakb_expiry_date\` DATETIME NULL`);
    }

    // Add new columns (if not exist)
    if (!colNames.includes('sip_sik_number')) {
      alterClauses.push(`ADD COLUMN \`sip_sik_number\` VARCHAR(100) NULL`);
    }
    if (!colNames.includes('sip_sik_expiry_date')) {
      alterClauses.push(`ADD COLUMN \`sip_sik_expiry_date\` DATETIME NULL`);
    }

    if (alterClauses.length === 0) {
      console.log('No changes needed — schema is already up to date.');
    } else {
      const sql = `ALTER TABLE suppliers\n  ${alterClauses.join(',\n  ')}`;
      console.log('\nExecuting:\n' + sql + '\n');
      await conn.query(sql);
      console.log('ALTER TABLE suppliers — done (%d changes)', alterClauses.length);
    }

    // Verify
    const [newCols] = await conn.query(`SHOW COLUMNS FROM suppliers`);
    console.log('\nUpdated columns:', newCols.map(c => c.Field).join(', '));
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
