/**
 * Alter customers table to match new schema:
 * - Drop columns: email, website, address_postal_code
 * - Add: owner_name, owner_address, contact_person
 * - Rename: sia_license_number -> izin_sarana_number
 * - Rename: sia_license_expiry_date -> izin_sarana_expiry_date
 * - Rename: pharmacist_name -> apoteker_name
 * - Replace: pharmacist_sipa -> apoteker_address (type change)
 * - Add: sipa_number, sipa_expiry_date
 * - Replace npwp (single col) with: npwp_number, npwp_name, npwp_address
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
    const [cols] = await conn.query('SHOW COLUMNS FROM customers');
    const colNames = cols.map(c => c.Field);
    console.log('Current columns:', colNames.join(', '));

    const alterClauses = [];

    // Drop old columns
    for (const col of ['email', 'website', 'address_postal_code']) {
      if (colNames.includes(col)) {
        alterClauses.push(`DROP COLUMN \`${col}\``);
      }
    }

    // Add new columns
    if (!colNames.includes('owner_name')) {
      alterClauses.push('ADD COLUMN `owner_name` VARCHAR(200) NULL AFTER `type`');
    }
    if (!colNames.includes('owner_address')) {
      alterClauses.push('ADD COLUMN `owner_address` VARCHAR(500) NULL AFTER `owner_name`');
    }
    if (!colNames.includes('contact_person')) {
      alterClauses.push('ADD COLUMN `contact_person` VARCHAR(200) NULL AFTER `owner_address`');
    }

    // Rename sia_license_number -> izin_sarana_number
    if (colNames.includes('sia_license_number') && !colNames.includes('izin_sarana_number')) {
      alterClauses.push('CHANGE COLUMN `sia_license_number` `izin_sarana_number` VARCHAR(100) NULL');
    }
    // Rename sia_license_expiry_date -> izin_sarana_expiry_date
    if (colNames.includes('sia_license_expiry_date') && !colNames.includes('izin_sarana_expiry_date')) {
      alterClauses.push('CHANGE COLUMN `sia_license_expiry_date` `izin_sarana_expiry_date` DATETIME NULL');
    }

    // Rename pharmacist_name -> apoteker_name
    if (colNames.includes('pharmacist_name') && !colNames.includes('apoteker_name')) {
      alterClauses.push('CHANGE COLUMN `pharmacist_name` `apoteker_name` VARCHAR(200) NULL');
    }
    // Rename pharmacist_sipa -> apoteker_address (different data type/purpose)
    if (colNames.includes('pharmacist_sipa') && !colNames.includes('apoteker_address')) {
      alterClauses.push('CHANGE COLUMN `pharmacist_sipa` `apoteker_address` VARCHAR(500) NULL');
    }

    // Add sipa fields
    if (!colNames.includes('sipa_number')) {
      alterClauses.push('ADD COLUMN `sipa_number` VARCHAR(100) NULL');
    }
    if (!colNames.includes('sipa_expiry_date')) {
      alterClauses.push('ADD COLUMN `sipa_expiry_date` DATETIME NULL');
    }

    // NPWP: rename existing npwp -> npwp_number, add npwp_name, npwp_address
    if (colNames.includes('npwp') && !colNames.includes('npwp_number')) {
      alterClauses.push('CHANGE COLUMN `npwp` `npwp_number` VARCHAR(30) NULL');
    }
    if (!colNames.includes('npwp_name')) {
      alterClauses.push('ADD COLUMN `npwp_name` VARCHAR(200) NULL');
    }
    if (!colNames.includes('npwp_address')) {
      alterClauses.push('ADD COLUMN `npwp_address` VARCHAR(500) NULL');
    }

    if (alterClauses.length === 0) {
      console.log('No changes needed — schema is already up to date.');
    } else {
      const sql = `ALTER TABLE customers\n  ${alterClauses.join(',\n  ')}`;
      console.log('\nExecuting:\n' + sql + '\n');
      await conn.query(sql);
      console.log('ALTER TABLE customers — done (%d changes)', alterClauses.length);
    }

    // Verify
    const [newCols] = await conn.query('SHOW COLUMNS FROM customers');
    console.log('\nUpdated columns:', newCols.map(c => c.Field).join(', '));
  } finally {
    conn.release();
    await pool.end();
  }
}

run().catch(err => { console.error(err); process.exit(1); });
