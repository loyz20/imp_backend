/* eslint-disable no-console */
require('dotenv').config();

const mongoose = require('mongoose');
const mysql = require('mysql2/promise');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/app-iko';
const MYSQL_HOST = process.env.MYSQL_HOST || 'localhost';
const MYSQL_PORT = Number(process.env.MYSQL_PORT || 3306);
const MYSQL_USER = process.env.MYSQL_USER || 'root';
const MYSQL_PASSWORD = process.env.MYSQL_PASSWORD || '';
const MYSQL_DATABASE = process.env.MYSQL_DATABASE || 'app_iko';
const MYSQL_CHARSET = process.env.MYSQL_CHARSET || 'utf8mb4';

const SHOULD_TRUNCATE = process.argv.includes('--truncate');

const toDate = (value) => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

const ensureSchema = async (conn) => {
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\` CHARACTER SET ${MYSQL_CHARSET}`);
  await conn.query(`USE \`${MYSQL_DATABASE}\``);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS users (
      id VARCHAR(24) NOT NULL,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(191) NOT NULL,
      phone VARCHAR(50) NULL,
      avatar VARCHAR(500) NULL,
      password_hash VARCHAR(255) NOT NULL,
      role VARCHAR(50) NOT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      is_email_verified TINYINT(1) NOT NULL DEFAULT 0,
      refresh_token TEXT NULL,
      password_reset_token VARCHAR(255) NULL,
      password_reset_expires DATETIME NULL,
      email_verification_token VARCHAR(255) NULL,
      email_verification_expires DATETIME NULL,
      password_changed_at DATETIME NULL,
      last_login_at DATETIME NULL,
      last_login_ip VARCHAR(100) NULL,
      login_attempts INT NOT NULL DEFAULT 0,
      lock_until DATETIME NULL,
      address_street VARCHAR(255) NULL,
      address_city VARCHAR(120) NULL,
      address_province VARCHAR(120) NULL,
      address_postal_code VARCHAR(20) NULL,
      address_country VARCHAR(120) NULL,
      created_at DATETIME NULL,
      updated_at DATETIME NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_users_email (email),
      KEY idx_users_role (role),
      KEY idx_users_is_active (is_active),
      KEY idx_users_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS products (
      id VARCHAR(24) NOT NULL,
      name VARCHAR(200) NOT NULL,
      sku VARCHAR(100) NULL,
      barcode VARCHAR(100) NULL,
      category VARCHAR(100) NOT NULL,
      golongan VARCHAR(100) NOT NULL,
      nie VARCHAR(100) NULL,
      no_bpom VARCHAR(100) NULL,
      bentuk_sediaan VARCHAR(100) NULL,
      zat_aktif VARCHAR(500) NULL,
      satuan VARCHAR(50) NULL,
      satuan_kecil VARCHAR(50) NULL,
      isi_per_satuan INT NULL,
      ppn TINYINT(1) NOT NULL DEFAULT 1,
      stok_minimum INT NOT NULL DEFAULT 0,
      manufacturer VARCHAR(200) NULL,
      keterangan TEXT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_by VARCHAR(24) NULL,
      updated_by VARCHAR(24) NULL,
      created_at DATETIME NULL,
      updated_at DATETIME NULL,
      PRIMARY KEY (id),
      UNIQUE KEY uq_products_name_ci (name),
      UNIQUE KEY uq_products_sku (sku),
      KEY idx_products_barcode (barcode),
      KEY idx_products_category (category),
      KEY idx_products_golongan (golongan),
      KEY idx_products_is_active (is_active),
      KEY idx_products_created_at (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  // ─── Customers ───
  await conn.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id VARCHAR(24) NOT NULL,
      code VARCHAR(50) NULL, name VARCHAR(200) NOT NULL, type VARCHAR(50) NULL,
      owner_name VARCHAR(200) NULL, owner_address VARCHAR(500) NULL,
      contact_person VARCHAR(200) NULL, phone VARCHAR(50) NULL,
      address_street VARCHAR(255) NULL, address_city VARCHAR(120) NULL, address_province VARCHAR(120) NULL,
      izin_sarana_number VARCHAR(100) NULL, izin_sarana_expiry_date DATETIME NULL,
      apoteker_name VARCHAR(200) NULL, apoteker_address VARCHAR(500) NULL,
      sipa_number VARCHAR(100) NULL, sipa_expiry_date DATETIME NULL,
      bank_name VARCHAR(100) NULL, bank_account_number VARCHAR(100) NULL, bank_account_name VARCHAR(200) NULL,
      credit_limit DECIMAL(18,2) NOT NULL DEFAULT 0, outstanding_balance DECIMAL(18,2) NOT NULL DEFAULT 0,
      payment_term_days INT NOT NULL DEFAULT 30,
      npwp_number VARCHAR(30) NULL, npwp_name VARCHAR(200) NULL, npwp_address VARCHAR(500) NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1, notes TEXT NULL,
      created_by VARCHAR(24) NULL, updated_by VARCHAR(24) NULL, created_at DATETIME NULL, updated_at DATETIME NULL,
      PRIMARY KEY (id), UNIQUE KEY uq_customers_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  // ─── Suppliers ───
  await conn.query(`
    CREATE TABLE IF NOT EXISTS suppliers (
      id VARCHAR(24) NOT NULL,
      code VARCHAR(50) NULL, name VARCHAR(200) NOT NULL, type VARCHAR(50) NULL,
      phone VARCHAR(50) NULL, fax VARCHAR(50) NULL,
      address_street VARCHAR(255) NULL, address_city VARCHAR(120) NULL, address_province VARCHAR(120) NULL,
      izin_sarana_number VARCHAR(100) NULL, izin_sarana_expiry_date DATETIME NULL,
      cdob_cdakb_number VARCHAR(100) NULL, cdob_cdakb_expiry_date DATETIME NULL,
      sip_sik_number VARCHAR(100) NULL, sip_sik_expiry_date DATETIME NULL,
      bank_name VARCHAR(100) NULL, bank_account_number VARCHAR(100) NULL, bank_account_name VARCHAR(200) NULL,
      payment_term_days INT NOT NULL DEFAULT 30,
      is_active TINYINT(1) NOT NULL DEFAULT 1, notes TEXT NULL,
      created_by VARCHAR(24) NULL, updated_by VARCHAR(24) NULL, created_at DATETIME NULL, updated_at DATETIME NULL,
      PRIMARY KEY (id), UNIQUE KEY uq_suppliers_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  // ─── Purchase Orders ───
  await conn.query(`
    CREATE TABLE IF NOT EXISTS purchase_orders (
      id VARCHAR(24) NOT NULL, po_number VARCHAR(100) NULL, po_category VARCHAR(10) NULL, status VARCHAR(50) NOT NULL DEFAULT 'draft',
      supplier_id VARCHAR(24) NULL, order_date DATETIME NULL, expected_delivery_date DATETIME NULL,
      subtotal DECIMAL(18,2) NOT NULL DEFAULT 0, tax_amount DECIMAL(18,2) NOT NULL DEFAULT 0, total_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      paid_amount DECIMAL(18,2) NOT NULL DEFAULT 0, remaining_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      notes TEXT NULL, payment_term_days INT NOT NULL DEFAULT 30,
      approved_by VARCHAR(24) NULL, approved_at DATETIME NULL, sent_at DATETIME NULL,
      created_by VARCHAR(24) NULL, updated_by VARCHAR(24) NULL, created_at DATETIME NULL, updated_at DATETIME NULL,
      PRIMARY KEY (id), KEY idx_po_supplier (supplier_id), KEY idx_po_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS purchase_order_items (
      id VARCHAR(24) NOT NULL, purchase_order_id VARCHAR(24) NOT NULL,
      product_id VARCHAR(24) NOT NULL, satuan VARCHAR(50) NULL,
      quantity INT NOT NULL, received_qty INT NOT NULL DEFAULT 0,
      unit_price DECIMAL(18,2) NOT NULL DEFAULT 0, discount DECIMAL(5,2) NOT NULL DEFAULT 0, subtotal DECIMAL(18,2) NOT NULL DEFAULT 0,
      notes TEXT NULL, sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id), KEY idx_poi_po (purchase_order_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS purchase_order_approvals (
      id VARCHAR(24) NOT NULL, purchase_order_id VARCHAR(24) NOT NULL,
      action VARCHAR(50) NOT NULL, notes TEXT NULL,
      approved_by VARCHAR(24) NULL, approved_at DATETIME NULL,
      PRIMARY KEY (id), KEY idx_poa_po (purchase_order_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  // ─── Sales Orders ───
  await conn.query(`
    CREATE TABLE IF NOT EXISTS sales_orders (
      id VARCHAR(24) NOT NULL, surat_jalan_number VARCHAR(100) NULL, faktur_number VARCHAR(100) NULL,
      so_category VARCHAR(10) NULL, status VARCHAR(50) NOT NULL DEFAULT 'draft', customer_id VARCHAR(24) NULL,
      order_date DATETIME NULL, delivery_date DATETIME NULL, payment_term_days INT NOT NULL DEFAULT 30,
      shipping_address TEXT NULL,
      subtotal DECIMAL(18,2) NOT NULL DEFAULT 0, ppn_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
      ppn_amount DECIMAL(18,2) NOT NULL DEFAULT 0, total_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      paid_amount DECIMAL(18,2) NOT NULL DEFAULT 0, remaining_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      notes TEXT NULL, shipped_at DATETIME NULL,
      completed_at DATETIME NULL, returned_at DATETIME NULL,
      created_by VARCHAR(24) NULL, updated_by VARCHAR(24) NULL, created_at DATETIME NULL, updated_at DATETIME NULL,
      PRIMARY KEY (id), KEY idx_so_customer (customer_id), KEY idx_so_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS sales_order_items (
      id VARCHAR(24) NOT NULL, sales_order_id VARCHAR(24) NOT NULL, product_id VARCHAR(24) NOT NULL,
      satuan VARCHAR(50) NULL, quantity INT NOT NULL, unit_price DECIMAL(18,2) NOT NULL DEFAULT 0,
      discount DECIMAL(5,2) NOT NULL DEFAULT 0, subtotal DECIMAL(18,2) NOT NULL DEFAULT 0,
      batch_number VARCHAR(100) NULL, expiry_date DATETIME NULL, notes TEXT NULL, sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id), KEY idx_soi_so (sales_order_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  // ─── Goods Receiving ───
  await conn.query(`
    CREATE TABLE IF NOT EXISTS goods_receivings (
      id VARCHAR(24) NOT NULL, gr_number VARCHAR(100) NULL, invoice_number VARCHAR(100) NULL,
      delivery_note VARCHAR(100) NULL, status VARCHAR(50) NOT NULL DEFAULT 'draft',
      supplier_id VARCHAR(24) NULL, purchase_order_id VARCHAR(24) NULL,
      receiving_date DATETIME NOT NULL,
      received_by VARCHAR(24) NULL, verified_by VARCHAR(24) NULL, verified_at DATETIME NULL, verification_notes TEXT NULL,
      subtotal DECIMAL(18,2) NOT NULL DEFAULT 0, ppn_amount DECIMAL(18,2) NOT NULL DEFAULT 0, grand_total DECIMAL(18,2) NOT NULL DEFAULT 0,
      notes TEXT NULL,
      created_by VARCHAR(24) NULL, updated_by VARCHAR(24) NULL, created_at DATETIME NULL, updated_at DATETIME NULL,
      PRIMARY KEY (id), KEY idx_gr_supplier (supplier_id), KEY idx_gr_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS gr_items (
      id VARCHAR(24) NOT NULL, goods_receiving_id VARCHAR(24) NOT NULL, product_id VARCHAR(24) NOT NULL,
      batch_number VARCHAR(100) NULL, expiry_date DATE NULL, manufacturing_date DATE NULL,
      received_qty INT NOT NULL DEFAULT 0, ordered_qty INT NOT NULL DEFAULT 0,
      unit_price DECIMAL(18,2) NOT NULL DEFAULT 0, discount DECIMAL(5,2) NOT NULL DEFAULT 0, subtotal DECIMAL(18,2) NOT NULL DEFAULT 0,
      condition_status VARCHAR(50) NULL DEFAULT 'baik', notes TEXT NULL, sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id), KEY idx_gri_gr (goods_receiving_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  // ─── Stock Batches ───
  await conn.query(`
    CREATE TABLE IF NOT EXISTS stock_batches (
      id VARCHAR(24) NOT NULL, product_id VARCHAR(24) NOT NULL,
      batch_number VARCHAR(100) NOT NULL, quantity INT NOT NULL DEFAULT 0, initial_quantity INT NOT NULL DEFAULT 0,
      expiry_date DATE NULL, manufacturing_date DATE NULL, received_date DATETIME NULL,
      storage_condition VARCHAR(100) NULL DEFAULT 'Suhu Kamar',
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      goods_receiving_id VARCHAR(24) NULL, supplier_id VARCHAR(24) NULL,
      unit_price DECIMAL(18,2) NOT NULL DEFAULT 0,
      created_by VARCHAR(24) NULL, created_at DATETIME NULL, updated_at DATETIME NULL,
      PRIMARY KEY (id), KEY idx_sb_product (product_id), KEY idx_sb_status (status),
      KEY idx_sb_expiry (expiry_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  // ─── Stock Mutations ───
  await conn.query(`
    CREATE TABLE IF NOT EXISTS stock_mutations (
      id VARCHAR(24) NOT NULL, mutation_date DATETIME NOT NULL,
      type VARCHAR(50) NOT NULL, product_id VARCHAR(24) NOT NULL, batch_id VARCHAR(24) NULL,
      batch_number VARCHAR(100) NULL,
      quantity INT NOT NULL, balance_before INT NOT NULL DEFAULT 0, balance_after INT NOT NULL DEFAULT 0,
      reference_type VARCHAR(50) NULL, reference_id VARCHAR(24) NULL, reference_number VARCHAR(100) NULL,
      reason VARCHAR(255) NULL, notes TEXT NULL,
      created_by VARCHAR(24) NULL, created_at DATETIME NULL, updated_at DATETIME NULL,
      PRIMARY KEY (id), KEY idx_sm_product (product_id), KEY idx_sm_type (type), KEY idx_sm_date (mutation_date),
      KEY idx_sm_reference (reference_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  // ─── Stock Opnames ───
  await conn.query(`
    CREATE TABLE IF NOT EXISTS stock_opnames (
      id VARCHAR(24) NOT NULL, opname_number VARCHAR(100) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'draft',
      opname_date DATETIME NOT NULL, completed_at DATETIME NULL,
      scope VARCHAR(50) NULL DEFAULT 'all', scope_filter TEXT NULL,
      total_items INT NOT NULL DEFAULT 0, matched_items INT NOT NULL DEFAULT 0,
      discrepancy_items INT NOT NULL DEFAULT 0, total_discrepancy_qty INT NOT NULL DEFAULT 0,
      assigned_to VARCHAR(24) NULL, verified_by VARCHAR(24) NULL,
      notes TEXT NULL,
      created_by VARCHAR(24) NULL, updated_by VARCHAR(24) NULL, created_at DATETIME NULL, updated_at DATETIME NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS stock_opname_items (
      id VARCHAR(24) NOT NULL, opname_id VARCHAR(24) NOT NULL,
      product_id VARCHAR(24) NOT NULL, batch_id VARCHAR(24) NULL, batch_number VARCHAR(100) NULL,
      expiry_date DATE NULL, system_qty INT NOT NULL DEFAULT 0, actual_qty INT NULL, difference INT NULL,
      notes TEXT NULL,
      PRIMARY KEY (id), KEY idx_soi_opname (opname_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  // ─── Returns ───
  await conn.query(`
    CREATE TABLE IF NOT EXISTS returns (
      id VARCHAR(24) NOT NULL, return_number VARCHAR(100) NULL,
      return_type VARCHAR(50) NULL, status VARCHAR(50) NOT NULL DEFAULT 'draft',
      customer_id VARCHAR(24) NULL, supplier_id VARCHAR(24) NULL, sales_order_id VARCHAR(24) NULL,
      return_date DATETIME NOT NULL, reason TEXT NULL, notes TEXT NULL,
      approved_at DATETIME NULL, received_at DATETIME NULL, inspected_at DATETIME NULL, completed_at DATETIME NULL,
      created_by VARCHAR(24) NULL, updated_by VARCHAR(24) NULL, created_at DATETIME NULL, updated_at DATETIME NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS return_items (
      id VARCHAR(24) NOT NULL, return_id VARCHAR(24) NOT NULL, product_id VARCHAR(24) NOT NULL,
      batch_number VARCHAR(100) NULL, quantity_returned INT NOT NULL DEFAULT 0,
      \`condition\` VARCHAR(50) NULL, disposition VARCHAR(50) NULL,
      reason TEXT NULL, expiry_date DATE NULL, notes TEXT NULL, sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id), KEY idx_ri_return (return_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS return_status_history (
      id VARCHAR(24) NOT NULL, return_id VARCHAR(24) NOT NULL,
      status VARCHAR(50) NOT NULL, notes TEXT NULL, changed_by VARCHAR(24) NULL, date DATETIME NOT NULL,
      PRIMARY KEY (id), KEY idx_rsh_return (return_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  // ─── Finance: Invoices ───
  await conn.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id VARCHAR(24) NOT NULL, invoice_number VARCHAR(100) NULL,
      invoice_type VARCHAR(20) NOT NULL DEFAULT 'sales',
      invoice_category VARCHAR(10) NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'draft',
      sales_order_ids TEXT NULL, purchase_order_id VARCHAR(24) NULL,
      goods_receiving_id VARCHAR(24) NULL, customer_id VARCHAR(24) NULL, supplier_id VARCHAR(24) NULL,
      invoice_date DATETIME NULL, sent_at DATETIME NULL, due_date DATETIME NULL,
      subtotal DECIMAL(18,2) NOT NULL DEFAULT 0, ppn_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
      ppn_amount DECIMAL(18,2) NOT NULL DEFAULT 0, discount DECIMAL(18,2) NOT NULL DEFAULT 0,
      total_amount DECIMAL(18,2) NOT NULL DEFAULT 0, paid_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
      remaining_amount DECIMAL(18,2) NOT NULL DEFAULT 0, payment_term_days INT NOT NULL DEFAULT 30,
      notes TEXT NULL,
      created_by VARCHAR(24) NULL, updated_by VARCHAR(24) NULL, created_at DATETIME NULL, updated_at DATETIME NULL,
      PRIMARY KEY (id), UNIQUE KEY uq_invoices_number (invoice_number),
      KEY idx_inv_type (invoice_type), KEY idx_inv_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS invoice_items (
      id VARCHAR(24) NOT NULL, invoice_id VARCHAR(24) NOT NULL, product_id VARCHAR(24) NULL,
      satuan VARCHAR(50) NULL, quantity INT NOT NULL DEFAULT 0,
      unit_price DECIMAL(18,2) NOT NULL DEFAULT 0, discount DECIMAL(18,2) NOT NULL DEFAULT 0,
      subtotal DECIMAL(18,2) NOT NULL DEFAULT 0,
      batch_number VARCHAR(100) NULL, expiry_date DATE NULL, sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id), KEY idx_invitems_inv (invoice_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS payments (
      id VARCHAR(24) NOT NULL, invoice_id VARCHAR(24) NOT NULL, amount DECIMAL(18,2) NOT NULL,
      payment_date DATETIME NOT NULL, payment_method VARCHAR(100) NULL,
      reference_number VARCHAR(200) NULL, notes TEXT NULL,
      created_by VARCHAR(24) NULL, created_at DATETIME NULL, updated_at DATETIME NULL,
      PRIMARY KEY (id), KEY idx_pay_invoice (invoice_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS memos (
      id VARCHAR(24) NOT NULL, type VARCHAR(50) NOT NULL, invoice_id VARCHAR(24) NULL,
      amount DECIMAL(18,2) NOT NULL DEFAULT 0, reason TEXT NULL, status VARCHAR(50) NOT NULL DEFAULT 'pending',
      approval_notes TEXT NULL, approved_by VARCHAR(24) NULL, approved_at DATETIME NULL,
      created_by VARCHAR(24) NULL, updated_by VARCHAR(24) NULL, created_at DATETIME NULL, updated_at DATETIME NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  // ─── Finance: Chart of Accounts ───
  await conn.query(`
    CREATE TABLE IF NOT EXISTS chart_of_accounts (
      id VARCHAR(24) NOT NULL, code VARCHAR(20) NOT NULL, name VARCHAR(200) NOT NULL,
      category VARCHAR(50) NOT NULL, level TINYINT NOT NULL DEFAULT 0,
      parent_id VARCHAR(24) NULL, description VARCHAR(500) NULL,
      balance DECIMAL(18,2) NOT NULL DEFAULT 0,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_by VARCHAR(24) NULL, updated_by VARCHAR(24) NULL, created_at DATETIME NULL, updated_at DATETIME NULL,
      PRIMARY KEY (id), UNIQUE KEY uq_coa_code (code), KEY idx_coa_parent (parent_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  // ─── Finance: Journal Entries ───
  await conn.query(`
    CREATE TABLE IF NOT EXISTS journal_entries (
      id VARCHAR(24) NOT NULL, journal_number VARCHAR(100) NULL,
      date DATETIME NOT NULL, description TEXT NULL,
      source VARCHAR(50) NULL, source_id VARCHAR(24) NULL, source_number VARCHAR(200) NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'posted',
      approved_by VARCHAR(24) NULL, approved_at DATETIME NULL, approval_notes TEXT NULL,
      created_by VARCHAR(24) NULL, created_at DATETIME NULL, updated_at DATETIME NULL,
      PRIMARY KEY (id), KEY idx_je_date (date), KEY idx_je_source (source), KEY idx_je_source_id (source_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS journal_entry_lines (
      id VARCHAR(24) NOT NULL, journal_entry_id VARCHAR(24) NOT NULL, account_id VARCHAR(24) NOT NULL,
      debit DECIMAL(18,2) NOT NULL DEFAULT 0, credit DECIMAL(18,2) NOT NULL DEFAULT 0,
      description TEXT NULL, sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id), KEY idx_jel_je (journal_entry_id), KEY idx_jel_account (account_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  // ─── Finance: Bank Transactions ───
  await conn.query(`
    CREATE TABLE IF NOT EXISTS bank_transactions (
      id VARCHAR(24) NOT NULL, transaction_date DATETIME NOT NULL,
      type VARCHAR(50) NOT NULL, amount DECIMAL(18,2) NOT NULL,
      description TEXT NULL, reference_number VARCHAR(200) NULL,
      created_by VARCHAR(24) NULL, updated_by VARCHAR(24) NULL, created_at DATETIME NULL, updated_at DATETIME NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  // ─── App Settings ───
  await conn.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      id VARCHAR(24) NOT NULL, setting_key VARCHAR(100) NOT NULL, setting_value MEDIUMTEXT NULL,
      created_at DATETIME NULL, updated_at DATETIME NULL,
      PRIMARY KEY (id), UNIQUE KEY uq_app_settings_key (setting_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  // ─── Regulation: Surat Pesanan Khusus ───
  await conn.query(`
    CREATE TABLE IF NOT EXISTS surat_pesanan_khusus (
      id VARCHAR(24) NOT NULL, sp_number VARCHAR(100) NULL, date DATETIME NULL,
      type VARCHAR(50) NOT NULL, supplier_id VARCHAR(24) NOT NULL,
      valid_until DATETIME NOT NULL, status VARCHAR(50) NOT NULL DEFAULT 'draft',
      notes TEXT NULL, reject_reason TEXT NULL,
      created_by VARCHAR(24) NULL, approved_by VARCHAR(24) NULL, approved_at DATETIME NULL,
      created_at DATETIME NULL, updated_at DATETIME NULL,
      PRIMARY KEY (id), UNIQUE KEY uq_sp_number (sp_number), KEY idx_spk_type (type), KEY idx_spk_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS sp_items (
      id VARCHAR(24) NOT NULL, sp_id VARCHAR(24) NOT NULL,
      product_id VARCHAR(24) NOT NULL, qty INT NOT NULL DEFAULT 0, unit VARCHAR(50) NOT NULL,
      sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id), KEY idx_spi_sp (sp_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  // ─── Regulation: E-Reports ───
  await conn.query(`
    CREATE TABLE IF NOT EXISTS e_reports (
      id VARCHAR(24) NOT NULL, report_number VARCHAR(100) NULL,
      period VARCHAR(10) NOT NULL, type VARCHAR(50) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'draft',
      reject_reason TEXT NULL,
      created_by VARCHAR(24) NULL, submitted_by VARCHAR(24) NULL,
      submitted_at DATETIME NULL, received_at DATETIME NULL,
      created_at DATETIME NULL, updated_at DATETIME NULL,
      PRIMARY KEY (id), UNIQUE KEY uq_ereport_period_type (period, type), KEY idx_er_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  await conn.query(`
    CREATE TABLE IF NOT EXISTS e_report_items (
      id VARCHAR(24) NOT NULL, report_id VARCHAR(24) NOT NULL,
      product_id VARCHAR(24) NOT NULL, product_name VARCHAR(200) NULL,
      qty_in INT NOT NULL DEFAULT 0, qty_out INT NOT NULL DEFAULT 0, stock_end INT NOT NULL DEFAULT 0,
      sort_order INT NOT NULL DEFAULT 0,
      PRIMARY KEY (id), KEY idx_eri_report (report_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);

  // ─── Regulation: Regulation Documents ───
  await conn.query(`
    CREATE TABLE IF NOT EXISTS regulation_documents (
      id VARCHAR(24) NOT NULL, category VARCHAR(50) NOT NULL, type VARCHAR(50) NOT NULL,
      number VARCHAR(100) NULL, issued_date DATETIME NULL, expiry_date DATETIME NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      file_name VARCHAR(500) NULL, file_path VARCHAR(500) NULL, holder VARCHAR(200) NULL,
      entity_id VARCHAR(24) NULL, entity_model VARCHAR(50) NULL, entity_name VARCHAR(200) NULL,
      updated_by VARCHAR(24) NULL, uploaded_at DATETIME NULL,
      created_at DATETIME NULL, updated_at DATETIME NULL,
      PRIMARY KEY (id), KEY idx_rd_category (category), KEY idx_rd_type (type)
    ) ENGINE=InnoDB DEFAULT CHARSET=${MYSQL_CHARSET}
  `);
};

const migrateUsers = async (mongoDb, mysqlConn) => {
  const users = await mongoDb.collection('users').find({}).toArray();
  console.log(`users: ${users.length}`);

  for (const u of users) {
    // eslint-disable-next-line no-await-in-loop
    await mysqlConn.query(
      `
        INSERT INTO users (
          id, name, email, phone, avatar, password_hash, role,
          is_active, is_email_verified, refresh_token,
          password_reset_token, password_reset_expires,
          email_verification_token, email_verification_expires,
          password_changed_at, last_login_at, last_login_ip,
          login_attempts, lock_until,
          address_street, address_city, address_province, address_postal_code, address_country,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          email = VALUES(email),
          phone = VALUES(phone),
          avatar = VALUES(avatar),
          password_hash = VALUES(password_hash),
          role = VALUES(role),
          is_active = VALUES(is_active),
          is_email_verified = VALUES(is_email_verified),
          refresh_token = VALUES(refresh_token),
          password_reset_token = VALUES(password_reset_token),
          password_reset_expires = VALUES(password_reset_expires),
          email_verification_token = VALUES(email_verification_token),
          email_verification_expires = VALUES(email_verification_expires),
          password_changed_at = VALUES(password_changed_at),
          last_login_at = VALUES(last_login_at),
          last_login_ip = VALUES(last_login_ip),
          login_attempts = VALUES(login_attempts),
          lock_until = VALUES(lock_until),
          address_street = VALUES(address_street),
          address_city = VALUES(address_city),
          address_province = VALUES(address_province),
          address_postal_code = VALUES(address_postal_code),
          address_country = VALUES(address_country),
          created_at = VALUES(created_at),
          updated_at = VALUES(updated_at)
      `,
      [
        String(u._id),
        u.name,
        u.email,
        u.phone || null,
        u.avatar || null,
        u.password,
        u.role,
        u.isActive ? 1 : 0,
        u.isEmailVerified ? 1 : 0,
        u.refreshToken || null,
        u.passwordResetToken || null,
        toDate(u.passwordResetExpires),
        u.emailVerificationToken || null,
        toDate(u.emailVerificationExpires),
        toDate(u.passwordChangedAt),
        toDate(u.lastLoginAt),
        u.lastLoginIp || null,
        Number(u.loginAttempts || 0),
        toDate(u.lockUntil),
        u.address?.street || null,
        u.address?.city || null,
        u.address?.province || null,
        u.address?.postalCode || null,
        u.address?.country || null,
        toDate(u.createdAt),
        toDate(u.updatedAt),
      ],
    );
  }
};

const migrateProducts = async (mongoDb, mysqlConn) => {
  const products = await mongoDb.collection('products').find({}).toArray();
  console.log(`products: ${products.length}`);

  for (const p of products) {
    // eslint-disable-next-line no-await-in-loop
    await mysqlConn.query(
      `
        INSERT INTO products (
          id, name, sku, barcode, category, golongan,
          nie, no_bpom, bentuk_sediaan, zat_aktif,
          satuan, satuan_kecil, isi_per_satuan, ppn,
          stok_minimum, manufacturer,
          keterangan, is_active, created_by, updated_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          sku = VALUES(sku),
          barcode = VALUES(barcode),
          category = VALUES(category),
          golongan = VALUES(golongan),
          nie = VALUES(nie),
          no_bpom = VALUES(no_bpom),
          bentuk_sediaan = VALUES(bentuk_sediaan),
          zat_aktif = VALUES(zat_aktif),
          satuan = VALUES(satuan),
          satuan_kecil = VALUES(satuan_kecil),
          isi_per_satuan = VALUES(isi_per_satuan),
          ppn = VALUES(ppn),
          stok_minimum = VALUES(stok_minimum),
          manufacturer = VALUES(manufacturer),
          keterangan = VALUES(keterangan),
          is_active = VALUES(is_active),
          created_by = VALUES(created_by),
          updated_by = VALUES(updated_by),
          created_at = VALUES(created_at),
          updated_at = VALUES(updated_at)
      `,
      [
        String(p._id),
        p.name,
        p.sku || null,
        p.barcode || null,
        p.category,
        p.golongan,
        p.nie || null,
        p.noBpom || null,
        p.bentukSediaan || null,
        p.zatAktif || null,
        p.satuan || null,
        p.satuanKecil || null,
        p.isiPerSatuan ?? null,
        p.ppn ? 1 : 0,
        Number(p.stokMinimum || 0),
        p.manufacturer || null,
        p.keterangan || null,
        p.isActive ? 1 : 0,
        p.createdBy ? String(p.createdBy) : null,
        p.updatedBy ? String(p.updatedBy) : null,
        toDate(p.createdAt),
        toDate(p.updatedAt),
      ],
    );
  }
};

const main = async () => {
  let mysqlConn;

  try {
    await mongoose.connect(MONGO_URI);
    mysqlConn = await mysql.createConnection({
      host: MYSQL_HOST,
      port: MYSQL_PORT,
      user: MYSQL_USER,
      password: MYSQL_PASSWORD,
      multipleStatements: false,
    });

    await ensureSchema(mysqlConn);
    await mysqlConn.query(`USE \`${MYSQL_DATABASE}\``);

    if (SHOULD_TRUNCATE) {
      await mysqlConn.query('SET FOREIGN_KEY_CHECKS=0');
      await mysqlConn.query('TRUNCATE TABLE products');
      await mysqlConn.query('TRUNCATE TABLE users');
      await mysqlConn.query('SET FOREIGN_KEY_CHECKS=1');
    }

    await migrateUsers(mongoose.connection.db, mysqlConn);
    await migrateProducts(mongoose.connection.db, mysqlConn);

    console.log('Core migration completed');
  } catch (error) {
    console.error('Core migration failed:', error?.message || error);
    if (error?.code) console.error('code:', error.code);
    if (error?.errno) console.error('errno:', error.errno);
    if (error?.sqlMessage) console.error('sqlMessage:', error.sqlMessage);
    if (error?.stack) console.error(error.stack);
    process.exitCode = 1;
  } finally {
    if (mysqlConn) await mysqlConn.end();
    await mongoose.disconnect();
  }
};

main();
