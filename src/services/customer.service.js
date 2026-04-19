const ApiError = require('../utils/ApiError');
const { CUSTOMER_TYPE } = require('../constants');
const { getMySQLPool } = require('../config/database');
const { randomUUID } = require('crypto');

const customerTypes = Object.values(CUSTOMER_TYPE);

// ─── MySQL Helpers ───

const mapCustomerRow = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    _id: row.id,
    name: row.name,
    code: row.code,
    type: row.type,
    ownerName: row.owner_name,
    ownerAddress: row.owner_address,
    contactPerson: row.contact_person,
    phone: row.phone,
    eReportCode: row.e_report_code,
    bpomCode: row.bpom_code,
    address: {
      street: row.address_street,
      city: row.address_city,
      province: row.address_province,
    },
    izinSarana: {
      number: row.izin_sarana_number,
      expiryDate: row.izin_sarana_expiry_date,
    },
    apoteker: {
      name: row.apoteker_name,
      address: row.apoteker_address,
    },
    sipa: {
      number: row.sipa_number,
      expiryDate: row.sipa_expiry_date,
    },
    paymentTermDays: row.payment_term_days,
    creditLimit: Number(row.credit_limit),
    outstandingBalance: Number(row.outstanding_balance || 0),
    bankAccount: {
      bankName: row.bank_name,
      accountNumber: row.bank_account_number,
      accountName: row.bank_account_name,
    },
    npwp: {
      number: row.npwp_number,
      name: row.npwp_name,
      address: row.npwp_address,
    },
    notes: row.notes,
    isActive: row.is_active === 1,
    createdBy: row.created_by ? { _id: row.created_by, name: row.created_by_name || null } : null,
    updatedBy: row.updated_by ? { _id: row.updated_by, name: row.updated_by_name || null } : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const generateCustomerCode = async (pool) => {
  const [rows] = await pool.query(
    "SELECT code FROM customers WHERE code REGEXP '^C[0-9]+$' ORDER BY code DESC LIMIT 1",
  );
  let seq = 1;
  if (rows.length > 0) {
    seq = parseInt(rows[0].code.slice(1), 10) + 1;
  }
  return `C${String(seq).padStart(4, '0')}`;
};

// ─── MySQL Implementations ───

const mysqlGetCustomers = async (queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');

  const { page = 1, limit = 10, search, type, city, isActive, sort } = queryParams;
  const offset = (Number(page) - 1) * Number(limit);

  const whereClauses = [];
  const params = [];

  if (search) {
    whereClauses.push('(c.name LIKE ? OR c.code LIKE ? OR c.phone LIKE ? OR c.e_report_code LIKE ? OR c.bpom_code LIKE ?)');
    const s = `%${search}%`;
    params.push(s, s, s, s, s);
  }
  if (type) { whereClauses.push('c.type = ?'); params.push(type); }
  if (city) { whereClauses.push('c.address_city LIKE ?'); params.push(`%${city}%`); }
  if (isActive !== undefined && isActive !== '') {
    whereClauses.push('c.is_active = ?');
    params.push(isActive === 'true' || isActive === true ? 1 : 0);
  }

  const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const orderBy = sort
    ? (sort.startsWith('-') ? `ORDER BY c.${sort.slice(1).replace(/([A-Z])/g, '_$1').toLowerCase()} DESC` : `ORDER BY c.${sort.replace(/([A-Z])/g, '_$1').toLowerCase()} ASC`)
    : 'ORDER BY c.created_at DESC';

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM customers c ${where}`, params);

  const [rows] = await pool.query(
    `SELECT c.*, u1.name as created_by_name, u2.name as updated_by_name
     FROM customers c
     LEFT JOIN users u1 ON c.created_by = u1.id
     LEFT JOIN users u2 ON c.updated_by = u2.id
     ${where} ${orderBy} LIMIT ? OFFSET ?`,
    [...params, Number(limit), offset],
  );

  return {
    docs: rows.map(mapCustomerRow),
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  };
};

const mysqlGetStats = async () => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');

  const now = new Date();
  const ninetyDays = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const [[countRow], [typeRows], [expiredRow], [nearExpiryRow], [cityRows]] = await Promise.all([
    pool.query('SELECT SUM(1) as total, SUM(is_active) as active, SUM(1-is_active) as inactive FROM customers'),
    pool.query('SELECT type, COUNT(*) as count FROM customers GROUP BY type'),
    pool.query('SELECT COUNT(*) as count FROM customers WHERE izin_sarana_expiry_date < ? AND izin_sarana_expiry_date IS NOT NULL', [now]),
    pool.query('SELECT COUNT(*) as count FROM customers WHERE izin_sarana_expiry_date >= ? AND izin_sarana_expiry_date <= ? AND izin_sarana_expiry_date IS NOT NULL', [now, ninetyDays]),
    pool.query('SELECT address_city, COUNT(*) as count FROM customers WHERE address_city IS NOT NULL AND address_city != "" GROUP BY address_city ORDER BY count DESC LIMIT 10'),
  ]);

  const typeKeyMap = {
    apotek: 'apotek', rumah_sakit: 'rumahSakit', klinik: 'klinik',
    puskesmas: 'puskesmas', toko_obat: 'tokoObat', pbf_lain: 'pbfLain',
  };
  const typeStats = {};
  for (const t of customerTypes) { typeStats[typeKeyMap[t] || t] = 0; }
  for (const tc of typeRows) {
    if (tc.type && typeKeyMap[tc.type]) typeStats[typeKeyMap[tc.type]] = tc.count;
  }
  const byCity = {};
  cityRows.slice(0, 7).forEach((c) => { byCity[c.address_city] = c.count; });

  return {
    total: Number(countRow.total || 0),
    active: Number(countRow.active || 0),
    inactive: Number(countRow.inactive || 0),
    ...typeStats,
    expiredSIA: Number(expiredRow.count || 0),
    nearExpirySIA: Number(nearExpiryRow.count || 0),
    overCreditLimit: 0,
    byCity,
  };
};

const mysqlGetCustomerById = async (id) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');

  const [rows] = await pool.query(
    `SELECT c.*, u1.name as created_by_name, u2.name as updated_by_name
     FROM customers c
     LEFT JOIN users u1 ON c.created_by = u1.id
     LEFT JOIN users u2 ON c.updated_by = u2.id
     WHERE c.id = ? LIMIT 1`,
    [id],
  );

  if (rows.length === 0) throw ApiError.notFound('Customer tidak ditemukan');

  const customerObj = mapCustomerRow(rows[0]);
  customerObj.transactionSummary = { totalSalesOrders: 0, totalTransactionValue: 0, lastOrderDate: null, outstandingReceivable: 0, creditUtilization: 0 };
  return customerObj;
};

const mysqlCreateCustomer = async (data, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');

  const [[nameRow]] = await pool.query(
    'SELECT id FROM customers WHERE LOWER(name) = LOWER(?) LIMIT 1',
    [data.name],
  );
  if (nameRow) throw ApiError.conflict('Customer dengan nama tersebut sudah ada');

  if (data.code) {
    const [[codeRow]] = await pool.query('SELECT id FROM customers WHERE code = ? LIMIT 1', [data.code]);
    if (codeRow) throw ApiError.conflict('Customer dengan kode tersebut sudah ada');
  }

  const id = randomUUID();
  const code = data.code || await generateCustomerCode(pool);

  await pool.query(
    `INSERT INTO customers (
      id, code, name, type, owner_name, owner_address, contact_person, phone,
      e_report_code, bpom_code,
      address_street, address_city, address_province,
      izin_sarana_number, izin_sarana_expiry_date,
      apoteker_name, apoteker_address, sipa_number, sipa_expiry_date,
      payment_term_days, credit_limit, bank_name, bank_account_number, bank_account_name,
      npwp_number, npwp_name, npwp_address,
      notes, is_active, created_by, updated_by, created_at, updated_at
    ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,NOW(),NOW())`,
    [
      id, code, data.name, data.type,
      data.ownerName || null, data.ownerAddress || null,
      data.contactPerson || null, data.phone || null,
      data.eReportCode || null, data.bpomCode || null,
      data.address?.street || null, data.address?.city || null, data.address?.province || null,
      data.izinSarana?.number || null, data.izinSarana?.expiryDate || null,
      data.apoteker?.name || null, data.apoteker?.address || null,
      data.sipa?.number || null, data.sipa?.expiryDate || null,
      data.paymentTermDays ?? 30, data.creditLimit ?? 50000000,
      data.bankAccount?.bankName || null, data.bankAccount?.accountNumber || null, data.bankAccount?.accountName || null,
      data.npwp?.number ?? data.npwp ?? null,
      data.npwp?.name ?? data.npwpName ?? null,
      data.npwp?.address ?? data.npwpAddress ?? null,
      data.notes || null,
      userId, userId,
    ],
  );

  return mysqlGetCustomerById(id);
};

const mysqlUpdateCustomer = async (id, data, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');

  const [[existing]] = await pool.query('SELECT id FROM customers WHERE id = ? LIMIT 1', [id]);
  if (!existing) throw ApiError.notFound('Customer tidak ditemukan');

  if (data.name) {
    const [[nameRow]] = await pool.query('SELECT id FROM customers WHERE LOWER(name) = LOWER(?) AND id != ? LIMIT 1', [data.name, id]);
    if (nameRow) throw ApiError.conflict('Customer dengan nama tersebut sudah ada');
  }
  if (data.code) {
    const [[codeRow]] = await pool.query('SELECT id FROM customers WHERE code = ? AND id != ? LIMIT 1', [data.code, id]);
    if (codeRow) throw ApiError.conflict('Customer dengan kode tersebut sudah ada');
  }

  const fieldMap = {
    name: 'name', code: 'code', type: 'type',
    ownerName: 'owner_name', ownerAddress: 'owner_address',
    contactPerson: 'contact_person', phone: 'phone',
    eReportCode: 'e_report_code', bpomCode: 'bpom_code',
    paymentTermDays: 'payment_term_days', creditLimit: 'credit_limit',
    notes: 'notes',
  };
  const setClauses = ['updated_by = ?', 'updated_at = NOW()'];
  const values = [userId];

  for (const [key, col] of Object.entries(fieldMap)) {
    if (data[key] !== undefined) { setClauses.push(`${col} = ?`); values.push(data[key]); }
  }
  if (data.address) {
    const a = data.address;
    if (a.street !== undefined) { setClauses.push('address_street = ?'); values.push(a.street); }
    if (a.city !== undefined) { setClauses.push('address_city = ?'); values.push(a.city); }
    if (a.province !== undefined) { setClauses.push('address_province = ?'); values.push(a.province); }
  }
  if (data.izinSarana) {
    if (data.izinSarana.number !== undefined) { setClauses.push('izin_sarana_number = ?'); values.push(data.izinSarana.number); }
    if (data.izinSarana.expiryDate !== undefined) { setClauses.push('izin_sarana_expiry_date = ?'); values.push(data.izinSarana.expiryDate); }
  }
  if (data.apoteker) {
    if (data.apoteker.name !== undefined) { setClauses.push('apoteker_name = ?'); values.push(data.apoteker.name); }
    if (data.apoteker.address !== undefined) { setClauses.push('apoteker_address = ?'); values.push(data.apoteker.address); }
  }
  if (data.sipa) {
    if (data.sipa.number !== undefined) { setClauses.push('sipa_number = ?'); values.push(data.sipa.number); }
    if (data.sipa.expiryDate !== undefined) { setClauses.push('sipa_expiry_date = ?'); values.push(data.sipa.expiryDate); }
  }
  const hasNpwpNested = typeof data.npwp === 'object' && data.npwp !== null;
  const hasNpwpFlat = data.npwp !== undefined || data.npwpName !== undefined || data.npwpAddress !== undefined;
  if (hasNpwpNested || hasNpwpFlat) {
    const npwpNumber = hasNpwpNested ? data.npwp.number : data.npwp;
    const npwpName = hasNpwpNested ? data.npwp.name : data.npwpName;
    const npwpAddress = hasNpwpNested ? data.npwp.address : data.npwpAddress;

    if (npwpNumber !== undefined) { setClauses.push('npwp_number = ?'); values.push(npwpNumber); }
    if (npwpName !== undefined) { setClauses.push('npwp_name = ?'); values.push(npwpName); }
    if (npwpAddress !== undefined) { setClauses.push('npwp_address = ?'); values.push(npwpAddress); }
  }
  if (data.bankAccount) {
    if (data.bankAccount.bankName !== undefined) { setClauses.push('bank_name = ?'); values.push(data.bankAccount.bankName); }
    if (data.bankAccount.accountNumber !== undefined) { setClauses.push('bank_account_number = ?'); values.push(data.bankAccount.accountNumber); }
    if (data.bankAccount.accountName !== undefined) { setClauses.push('bank_account_name = ?'); values.push(data.bankAccount.accountName); }
  }

  values.push(id);
  await pool.query(`UPDATE customers SET ${setClauses.join(', ')} WHERE id = ?`, values);
  return mysqlGetCustomerById(id);
};

const mysqlDeleteCustomer = async (id) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');

  const [[existing]] = await pool.query('SELECT id FROM customers WHERE id = ? LIMIT 1', [id]);
  if (!existing) throw ApiError.notFound('Customer tidak ditemukan');

  await pool.query('DELETE FROM customers WHERE id = ?', [id]);
};

const mysqlChangeStatus = async (id, isActive, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');

  const [[existing]] = await pool.query('SELECT id FROM customers WHERE id = ? LIMIT 1', [id]);
  if (!existing) throw ApiError.notFound('Customer tidak ditemukan');

  await pool.query('UPDATE customers SET is_active = ?, updated_by = ?, updated_at = NOW() WHERE id = ?', [isActive ? 1 : 0, userId, id]);
  return mysqlGetCustomerById(id);
};

const getCustomers = (queryParams) => mysqlGetCustomers(queryParams);
const getStats = () => mysqlGetStats();
const getCustomerById = (id) => mysqlGetCustomerById(id);
const createCustomer = (data, userId) => mysqlCreateCustomer(data, userId);
const updateCustomer = (id, data, userId) => mysqlUpdateCustomer(id, data, userId);
const deleteCustomer = (id) => mysqlDeleteCustomer(id);
const changeStatus = (id, isActive, userId) => mysqlChangeStatus(id, isActive, userId);

module.exports = {
  getCustomers,
  getStats,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  changeStatus,
};

