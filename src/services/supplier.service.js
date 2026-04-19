const ApiError = require('../utils/ApiError');
const { SUPPLIER_TYPE } = require('../constants');
const { getMySQLPool } = require('../config/database');
const { randomUUID } = require('crypto');

const supplierTypes = Object.values(SUPPLIER_TYPE);

// ─── MySQL Helpers ───

const mapSupplierRow = (row) => {
  if (!row) return null;
  return {
    id: row.id, _id: row.id,
    name: row.name, code: row.code, type: row.type,
    phone: row.phone, fax: row.fax,
    address: { street: row.address_street, city: row.address_city, province: row.address_province },
    izinSarana: { number: row.izin_sarana_number, expiryDate: row.izin_sarana_expiry_date },
    cdobCdakb: { number: row.cdob_cdakb_number, expiryDate: row.cdob_cdakb_expiry_date },
    sipSik: { number: row.sip_sik_number, expiryDate: row.sip_sik_expiry_date },
    paymentTermDays: row.payment_term_days,
    bankAccount: { bankName: row.bank_name, accountNumber: row.bank_account_number, accountName: row.bank_account_name },
    notes: row.notes,
    isActive: row.is_active === 1,
    createdBy: row.created_by ? { _id: row.created_by, name: row.created_by_name || null } : null,
    updatedBy: row.updated_by ? { _id: row.updated_by, name: row.updated_by_name || null } : null,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
};

const generateSupplierCode = async (pool) => {
  const prefix = 'S';
  const [rows] = await pool.query('SELECT code FROM suppliers WHERE code REGEXP ? ORDER BY code DESC LIMIT 1', ['^S[0-9]+$']);
  let seq = rows.length > 0 ? parseInt(rows[0].code.replace(prefix, ''), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

// ─── MySQL Implementations ───

const mysqlGetSuppliers = async (queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');

  const { page = 1, limit = 10, search, type, city, isActive } = queryParams;
  const offset = (Number(page) - 1) * Number(limit);
  const whereClauses = []; const params = [];

  if (search) {
    whereClauses.push('(s.name LIKE ? OR s.code LIKE ? OR s.phone LIKE ?)');
    const sl = `%${search}%`; params.push(sl, sl, sl);
  }
  if (type) { whereClauses.push('s.type = ?'); params.push(type); }
  if (city) { whereClauses.push('s.address_city LIKE ?'); params.push(`%${city}%`); }
  if (isActive !== undefined) { whereClauses.push('s.is_active = ?'); params.push(isActive === 'true' || isActive === true ? 1 : 0); }

  const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM suppliers s ${where}`, params);
  const [rows] = await pool.query(
    `SELECT s.*, u1.name as created_by_name, u2.name as updated_by_name FROM suppliers s LEFT JOIN users u1 ON s.created_by = u1.id LEFT JOIN users u2 ON s.updated_by = u2.id ${where} ORDER BY s.created_at DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), offset],
  );
  return { docs: rows.map(mapSupplierRow), pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } };
};

const mysqlGetStats = async () => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const now = new Date();
  const ninetyDays = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
  const [[countRow], [typeRows], [expiredRow], [nearRow], [cityRows]] = await Promise.all([
    pool.query('SELECT COUNT(*) as total, SUM(is_active) as active, SUM(1-is_active) as inactive FROM suppliers'),
    pool.query('SELECT type, COUNT(*) as count FROM suppliers GROUP BY type'),
    pool.query('SELECT COUNT(*) as count FROM suppliers WHERE izin_sarana_expiry_date < ? AND izin_sarana_expiry_date IS NOT NULL', [now]),
    pool.query('SELECT COUNT(*) as count FROM suppliers WHERE izin_sarana_expiry_date >= ? AND izin_sarana_expiry_date <= ?', [now, ninetyDays]),
    pool.query('SELECT address_city, COUNT(*) as count FROM suppliers WHERE address_city IS NOT NULL AND address_city != "" GROUP BY address_city ORDER BY count DESC LIMIT 10'),
  ]);
  const typeStats = {}; for (const t of supplierTypes) typeStats[t] = 0;
  for (const tc of typeRows) { if (tc.type) typeStats[tc.type] = tc.count; }
  const byCity = {};
  cityRows.slice(0, 7).forEach((c) => { byCity[c.address_city] = c.count; });
  return { total: Number(countRow.total || 0), active: Number(countRow.active || 0), inactive: Number(countRow.inactive || 0), ...typeStats, expiredLicense: Number(expiredRow.count || 0), nearExpiryLicense: Number(nearRow.count || 0), byCity };
};

const mysqlGetSupplierById = async (id) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [rows] = await pool.query(
    'SELECT s.*, u1.name as created_by_name, u2.name as updated_by_name FROM suppliers s LEFT JOIN users u1 ON s.created_by = u1.id LEFT JOIN users u2 ON s.updated_by = u2.id WHERE s.id = ? LIMIT 1',
    [id],
  );
  if (rows.length === 0) throw ApiError.notFound('Supplier tidak ditemukan');
  return mapSupplierRow(rows[0]);
};

const mysqlCreateSupplier = async (data, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[nameRow]] = await pool.query('SELECT id FROM suppliers WHERE LOWER(name) = LOWER(?) LIMIT 1', [data.name]);
  if (nameRow) throw ApiError.conflict('Supplier dengan nama tersebut sudah ada');
  if (data.code) {
    const [[codeRow]] = await pool.query('SELECT id FROM suppliers WHERE code = ? LIMIT 1', [data.code]);
    if (codeRow) throw ApiError.conflict('Supplier dengan kode tersebut sudah ada');
  }
  const id = randomUUID();
  const code = data.code || await generateSupplierCode(pool);
  await pool.query(
    `INSERT INTO suppliers (id, code, name, type, phone, fax, address_street, address_city, address_province, izin_sarana_number, izin_sarana_expiry_date, cdob_cdakb_number, cdob_cdakb_expiry_date, sip_sik_number, sip_sik_expiry_date, payment_term_days, bank_name, bank_account_number, bank_account_name, notes, is_active, created_by, updated_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,NOW(),NOW())`,
    [id, code, data.name, data.type, data.phone || null, data.fax || null, data.address?.street || null, data.address?.city || null, data.address?.province || null, data.izinSarana?.number || null, data.izinSarana?.expiryDate || null, data.cdobCdakb?.number || null, data.cdobCdakb?.expiryDate || null, data.sipSik?.number || null, data.sipSik?.expiryDate || null, data.paymentTermDays ?? 30, data.bankAccount?.bankName || null, data.bankAccount?.accountNumber || null, data.bankAccount?.accountName || null, data.notes || null, userId, userId],
  );
  return mysqlGetSupplierById(id);
};

const mysqlUpdateSupplier = async (id, data, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[existing]] = await pool.query('SELECT id FROM suppliers WHERE id = ? LIMIT 1', [id]);
  if (!existing) throw ApiError.notFound('Supplier tidak ditemukan');
  if (data.name) {
    const [[nr]] = await pool.query('SELECT id FROM suppliers WHERE LOWER(name) = LOWER(?) AND id != ? LIMIT 1', [data.name, id]);
    if (nr) throw ApiError.conflict('Supplier dengan nama tersebut sudah ada');
  }
  if (data.code) {
    const [[cr]] = await pool.query('SELECT id FROM suppliers WHERE code = ? AND id != ? LIMIT 1', [data.code, id]);
    if (cr) throw ApiError.conflict('Supplier dengan kode tersebut sudah ada');
  }
  const fieldMap = { name: 'name', code: 'code', type: 'type', phone: 'phone', fax: 'fax', paymentTermDays: 'payment_term_days', notes: 'notes' };
  const setClauses = ['updated_by = ?', 'updated_at = NOW()']; const values = [userId];
  for (const [key, col] of Object.entries(fieldMap)) { if (data[key] !== undefined) { setClauses.push(`${col} = ?`); values.push(data[key]); } }
  if (data.address) { const a = data.address; for (const [k, c] of [['street','address_street'],['city','address_city'],['province','address_province']]) { if (a[k] !== undefined) { setClauses.push(`${c} = ?`); values.push(a[k]); } } }
  if (data.izinSarana) { for (const [k, c] of [['number','izin_sarana_number'],['expiryDate','izin_sarana_expiry_date']]) { if (data.izinSarana[k] !== undefined) { setClauses.push(`${c} = ?`); values.push(data.izinSarana[k]); } } }
  if (data.cdobCdakb) { for (const [k, c] of [['number','cdob_cdakb_number'],['expiryDate','cdob_cdakb_expiry_date']]) { if (data.cdobCdakb[k] !== undefined) { setClauses.push(`${c} = ?`); values.push(data.cdobCdakb[k]); } } }
  if (data.sipSik) { for (const [k, c] of [['number','sip_sik_number'],['expiryDate','sip_sik_expiry_date']]) { if (data.sipSik[k] !== undefined) { setClauses.push(`${c} = ?`); values.push(data.sipSik[k]); } } }
  if (data.bankAccount) { for (const [k, c] of [['bankName','bank_name'],['accountNumber','bank_account_number'],['accountName','bank_account_name']]) { if (data.bankAccount[k] !== undefined) { setClauses.push(`${c} = ?`); values.push(data.bankAccount[k]); } } }
  values.push(id);
  await pool.query(`UPDATE suppliers SET ${setClauses.join(', ')} WHERE id = ?`, values);
  return mysqlGetSupplierById(id);
};

const mysqlDeleteSupplier = async (id) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[existing]] = await pool.query('SELECT id FROM suppliers WHERE id = ? LIMIT 1', [id]);
  if (!existing) throw ApiError.notFound('Supplier tidak ditemukan');
  await pool.query('DELETE FROM suppliers WHERE id = ?', [id]);
};

const mysqlChangeStatus = async (id, isActive, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[existing]] = await pool.query('SELECT id FROM suppliers WHERE id = ? LIMIT 1', [id]);
  if (!existing) throw ApiError.notFound('Supplier tidak ditemukan');
  await pool.query('UPDATE suppliers SET is_active = ?, updated_by = ?, updated_at = NOW() WHERE id = ?', [isActive ? 1 : 0, userId, id]);
  return mysqlGetSupplierById(id);
};

const getSuppliers = (q) => mysqlGetSuppliers(q);
const getStats = () => mysqlGetStats();
const getSupplierById = (id) => mysqlGetSupplierById(id);
const createSupplier = (data, userId) => mysqlCreateSupplier(data, userId);
const updateSupplier = (id, data, userId) => mysqlUpdateSupplier(id, data, userId);
const deleteSupplier = (id) => mysqlDeleteSupplier(id);
const changeStatus = (id, isActive, userId) => mysqlChangeStatus(id, isActive, userId);

module.exports = { getSuppliers, getStats, getSupplierById, createSupplier, updateSupplier, deleteSupplier, changeStatus };

