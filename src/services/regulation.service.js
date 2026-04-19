const ApiError = require('../utils/ApiError');
const {
  SP_TYPE,
  SP_STATUS,
  SP_STATUS_TRANSITIONS,
  EREPORT_STATUS,
  GOLONGAN_OBAT,
  REG_DOC_CATEGORY,
  REG_DOC_STATUS,
  MUTATION_TYPE,
  BATCH_STATUS,
} = require('../constants');
const { getMySQLPool } = require('../config/database');
const { randomUUID } = require('crypto');

// ═══════════════════════════════════════════════════════════════
// ─── 1. SURAT PESANAN KHUSUS ───
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// ─── MySQL Implementations ───
// ═══════════════════════════════════════════════════════════════

const mapSPRow = (row, items = []) => ({
  id: row.id, _id: row.id,
  spNumber: row.sp_number, date: row.date, type: row.type,
  supplier: row.supplier_id ? { _id: row.supplier_id, id: row.supplier_id, name: row.supplier_name, code: row.supplier_code, phone: row.supplier_phone, address: { street: row.supplier_address_street, city: row.supplier_address_city, province: row.supplier_address_province } } : null,
  validUntil: row.valid_until, status: row.status, notes: row.notes, rejectReason: row.reject_reason,
  items: items.map((i) => ({
    product: { _id: i.product_id, id: i.product_id, name: i.product_name, sku: i.product_sku },
    qty: i.qty, unit: i.unit,
  })),
  createdBy: row.created_by ? { _id: row.created_by, name: row.created_by_name } : null,
  approvedBy: row.approved_by ? { _id: row.approved_by, name: row.approved_by_name } : null,
  approvedAt: row.approved_at,
  createdAt: row.created_at, updatedAt: row.updated_at,
});

const mapEReportRow = (row, items = []) => ({
  id: row.id, _id: row.id,
  reportNumber: row.report_number, period: row.period, type: row.type, status: row.status,
  rejectReason: row.reject_reason,
  items: items.map((i) => ({ product: i.product_id, productName: i.product_name, qtyIn: i.qty_in, qtyOut: i.qty_out, stockEnd: i.stock_end })),
  createdBy: row.created_by ? { _id: row.created_by, name: row.created_by_name } : null,
  submittedBy: row.submitted_by ? { _id: row.submitted_by, name: row.submitted_by_name } : null,
  submittedAt: row.submitted_at, receivedAt: row.received_at,
  createdAt: row.created_at, updatedAt: row.updated_at,
});

const mysqlGetSPWithItems = async (pool, id) => {
  const [[row]] = await pool.query(
    `SELECT sp.*, s.name as supplier_name, s.code as supplier_code, s.phone as supplier_phone, s.address_street as supplier_address_street, s.address_city as supplier_address_city, s.address_province as supplier_address_province, u1.name as created_by_name, u2.name as approved_by_name
     FROM surat_pesanan_khusus sp LEFT JOIN suppliers s ON sp.supplier_id = s.id LEFT JOIN users u1 ON sp.created_by = u1.id LEFT JOIN users u2 ON sp.approved_by = u2.id
     WHERE sp.id = ? LIMIT 1`, [id],
  );
  if (!row) return null;
  const [items] = await pool.query(
    `SELECT si.*, p.name as product_name, p.sku as product_sku
     FROM sp_items si LEFT JOIN products p ON si.product_id = p.id WHERE si.sp_id = ? ORDER BY si.sort_order`, [id],
  );
  return mapSPRow(row, items);
};

const mysqlGetSPList = async (queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const { page = 1, limit = 10, type, status, search } = queryParams;
  const offset = (Number(page) - 1) * Number(limit);
  const where = []; const params = [];
  if (type) { where.push('sp.type = ?'); params.push(type); }
  if (status) { where.push('sp.status = ?'); params.push(status); }
  if (search) { where.push('sp.sp_number LIKE ?'); params.push(`%${search}%`); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM surat_pesanan_khusus sp ${w}`, params);
  const [rows] = await pool.query(
    `SELECT sp.*, s.name as supplier_name, s.code as supplier_code, s.phone as supplier_phone, s.address_street as supplier_address_street, s.address_city as supplier_address_city, s.address_province as supplier_address_province, u1.name as created_by_name, u2.name as approved_by_name
     FROM surat_pesanan_khusus sp LEFT JOIN suppliers s ON sp.supplier_id = s.id LEFT JOIN users u1 ON sp.created_by = u1.id LEFT JOIN users u2 ON sp.approved_by = u2.id
     ${w} ORDER BY sp.created_at DESC LIMIT ? OFFSET ?`, [...params, Number(limit), offset],
  );
  const spIds = rows.map((r) => r.id); let itemsMap = {};
  if (spIds.length > 0) {
    const [allItems] = await pool.query(
      `SELECT si.*, p.name as product_name, p.sku as product_sku
       FROM sp_items si LEFT JOIN products p ON si.product_id = p.id WHERE si.sp_id IN (${spIds.map(() => '?').join(',')}) ORDER BY si.sort_order`, spIds,
    );
    for (const item of allItems) { (itemsMap[item.sp_id] = itemsMap[item.sp_id] || []).push(item); }
  }
  return { docs: rows.map((r) => mapSPRow(r, itemsMap[r.id] || [])), pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } };
};

const mysqlGetSPStats = async () => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [typeRows] = await pool.query('SELECT type, COUNT(*) as count FROM surat_pesanan_khusus GROUP BY type');
  const [statusRows] = await pool.query('SELECT status, COUNT(*) as count FROM surat_pesanan_khusus GROUP BY status');
  const typeStats = {}; for (const t of Object.values(SP_TYPE)) typeStats[t] = 0;
  for (const tc of typeRows) if (tc.type) typeStats[tc.type] = tc.count;
  const byStatus = {}; for (const s of Object.values(SP_STATUS)) byStatus[s] = 0;
  let total = 0; for (const sc of statusRows) { if (sc.status) { byStatus[sc.status] = sc.count; total += sc.count; } }
  return { total, ...typeStats, byStatus };
};

const mysqlGetSPById = async (id) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const sp = await mysqlGetSPWithItems(pool, id);
  if (!sp) throw ApiError.notFound('Surat Pesanan tidak ditemukan');
  return sp;
};

const mysqlGenerateSPNumber = async (pool, type) => {
  const typePrefix = { [SP_TYPE.NARKOTIKA]: 'NK', [SP_TYPE.PSIKOTROPIKA]: 'PS', [SP_TYPE.PREKURSOR]: 'PK' };
  const prefix = typePrefix[type] || 'SP';
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const datePrefix = `SP-${prefix}/${year}/${month}/`;
  const [rows] = await pool.query('SELECT sp_number FROM surat_pesanan_khusus WHERE sp_number LIKE ? ORDER BY sp_number DESC LIMIT 1', [`${datePrefix}%`]);
  let nextNum = 1;
  if (rows.length > 0) { const parts = rows[0].sp_number.split('/'); const last = parseInt(parts[parts.length - 1], 10); if (!isNaN(last)) nextNum = last + 1; }
  return `${datePrefix}${String(nextNum).padStart(3, '0')}`;
};

const mysqlCreateSP = async (data, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[supplier]] = await pool.query('SELECT id, name FROM suppliers WHERE id = ? LIMIT 1', [data.supplier]);
  if (!supplier) throw ApiError.notFound('Supplier tidak ditemukan');
  const golonganMap = { [SP_TYPE.NARKOTIKA]: GOLONGAN_OBAT.NARKOTIKA, [SP_TYPE.PSIKOTROPIKA]: GOLONGAN_OBAT.PSIKOTROPIKA };
  const requiredGolongan = golonganMap[data.type];
  for (const item of data.items) {
    const [[product]] = await pool.query('SELECT id, name, golongan FROM products WHERE id = ? LIMIT 1', [item.product]);
    if (!product) throw ApiError.notFound(`Produk dengan ID ${item.product} tidak ditemukan`);
    if (requiredGolongan && product.golongan !== requiredGolongan) throw ApiError.badRequest(`Produk "${product.name}" bukan golongan ${data.type}. Golongan produk: ${product.golongan}`);
  }
  if (new Date(data.validUntil) <= new Date()) throw ApiError.badRequest('Tanggal berlaku harus di masa depan');
  const id = randomUUID();
  const spNumber = await mysqlGenerateSPNumber(pool, data.type);
  await pool.query('INSERT INTO surat_pesanan_khusus (id, sp_number, date, type, supplier_id, valid_until, status, notes, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,NOW(),NOW())', [id, spNumber, data.date || new Date(), data.type, data.supplier, data.validUntil, SP_STATUS.DRAFT, data.notes || null, userId]);
  for (let i = 0; i < (data.items || []).length; i++) {
    const item = data.items[i]; const itemId = randomUUID();
    await pool.query('INSERT INTO sp_items (id, sp_id, product_id, qty, unit, sort_order) VALUES (?,?,?,?,?,?)', [itemId, id, item.product, item.qty, item.unit, i]);
  }
  return mysqlGetSPWithItems(pool, id);
};

const mysqlUpdateSPStatus = async (id, newStatus, userId, rejectReason) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[sp]] = await pool.query('SELECT id, status FROM surat_pesanan_khusus WHERE id = ? LIMIT 1', [id]);
  if (!sp) throw ApiError.notFound('Surat Pesanan tidak ditemukan');
  const allowed = SP_STATUS_TRANSITIONS[sp.status];
  if (!allowed || !allowed.includes(newStatus)) throw ApiError.badRequest(`Tidak bisa mengubah status dari "${sp.status}" ke "${newStatus}"`);
  if (newStatus === SP_STATUS.REJECTED && !rejectReason) throw ApiError.badRequest('Alasan penolakan wajib diisi');
  const sets = ['status = ?', 'updated_at = NOW()']; const vals = [newStatus];
  if (newStatus === SP_STATUS.APPROVED) { sets.push('approved_by = ?', 'approved_at = NOW()'); vals.push(userId); }
  if (newStatus === SP_STATUS.REJECTED) { sets.push('reject_reason = ?'); vals.push(rejectReason); }
  vals.push(id);
  await pool.query(`UPDATE surat_pesanan_khusus SET ${sets.join(', ')} WHERE id = ?`, vals);
  return mysqlGetSPWithItems(pool, id);
};

const mysqlExpireOverdueSP = async () => {
  const pool = getMySQLPool();
  if (!pool) return;
  await pool.query("UPDATE surat_pesanan_khusus SET status = ?, updated_at = NOW() WHERE status = ? AND valid_until < NOW()", [SP_STATUS.EXPIRED, SP_STATUS.APPROVED]);
};

// ─── MySQL: E-Reports ───

const mysqlGetEReportWithItems = async (pool, id) => {
  const [[row]] = await pool.query(
    'SELECT er.*, u1.name as created_by_name, u2.name as submitted_by_name FROM e_reports er LEFT JOIN users u1 ON er.created_by = u1.id LEFT JOIN users u2 ON er.submitted_by = u2.id WHERE er.id = ? LIMIT 1', [id],
  );
  if (!row) return null;
  const [items] = await pool.query('SELECT * FROM e_report_items WHERE report_id = ? ORDER BY sort_order', [id]);
  return mapEReportRow(row, items);
};

const mysqlGetEReports = async (queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const { page = 1, limit = 10, type, status } = queryParams;
  const offset = (Number(page) - 1) * Number(limit);
  const where = []; const params = [];
  if (type) { where.push('er.type = ?'); params.push(type); }
  if (status) { where.push('er.status = ?'); params.push(status); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM e_reports er ${w}`, params);
  const [rows] = await pool.query(
    `SELECT er.*, u1.name as created_by_name, u2.name as submitted_by_name FROM e_reports er LEFT JOIN users u1 ON er.created_by = u1.id LEFT JOIN users u2 ON er.submitted_by = u2.id ${w} ORDER BY er.created_at DESC LIMIT ? OFFSET ?`, [...params, Number(limit), offset],
  );
  const erIds = rows.map((r) => r.id); let itemsMap = {};
  if (erIds.length > 0) {
    const [allItems] = await pool.query(`SELECT * FROM e_report_items WHERE report_id IN (${erIds.map(() => '?').join(',')}) ORDER BY sort_order`, erIds);
    for (const item of allItems) { (itemsMap[item.report_id] = itemsMap[item.report_id] || []).push(item); }
  }
  return { docs: rows.map((r) => mapEReportRow(r, itemsMap[r.id] || [])), pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } };
};

const mysqlGetEReportStats = async () => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [statusRows] = await pool.query('SELECT status, COUNT(*) as count FROM e_reports GROUP BY status');
  const stats = { total: 0 };
  for (const s of Object.values(EREPORT_STATUS)) stats[s] = 0;
  for (const sc of statusRows) { if (sc.status) { stats[sc.status] = sc.count; stats.total += sc.count; } }
  return stats;
};

const mysqlGenerateEReport = async (data, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const { period, type } = data;
  const [[existing]] = await pool.query('SELECT id FROM e_reports WHERE period = ? AND type = ? LIMIT 1', [period, type]);
  if (existing) throw ApiError.conflict(`Laporan ${type} untuk periode ${period} sudah ada`);
  const [year, month] = period.split('-').map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59, 999);
  const golonganMap = { [SP_TYPE.NARKOTIKA]: GOLONGAN_OBAT.NARKOTIKA, [SP_TYPE.PSIKOTROPIKA]: GOLONGAN_OBAT.PSIKOTROPIKA };
  const golongan = golonganMap[type] || 'prekursor';
  const [products] = await pool.query('SELECT id, name, sku FROM products WHERE is_active = 1 AND golongan = ?', [golongan]);
  if (products.length === 0) throw ApiError.notFound(`Tidak ada produk dengan golongan "${type}" ditemukan`);
  const items = [];
  for (const product of products) {
    const [[inAgg]] = await pool.query('SELECT COALESCE(SUM(quantity), 0) as total FROM stock_mutations WHERE product_id = ? AND type = ? AND mutation_date >= ? AND mutation_date <= ?', [product.id, MUTATION_TYPE.IN, startDate, endDate]);
    const [[outAgg]] = await pool.query('SELECT COALESCE(SUM(ABS(quantity)), 0) as total FROM stock_mutations WHERE product_id = ? AND type = ? AND mutation_date >= ? AND mutation_date <= ?', [product.id, MUTATION_TYPE.OUT, startDate, endDate]);
    const [[stockAgg]] = await pool.query("SELECT COALESCE(SUM(quantity), 0) as total FROM stock_batches WHERE product_id = ? AND status = 'active'", [product.id]);
    const qtyIn = Number(inAgg.total || 0); const qtyOut = Number(outAgg.total || 0); const stockEnd = Number(stockAgg.total || 0);
    if (qtyIn > 0 || qtyOut > 0 || stockEnd > 0) items.push({ productId: product.id, productName: product.name, qtyIn, qtyOut, stockEnd });
  }
  const id = randomUUID();
  const typePrefix = { [SP_TYPE.NARKOTIKA]: 'NK', [SP_TYPE.PSIKOTROPIKA]: 'PS', [SP_TYPE.PREKURSOR]: 'PK' };
  const reportNumber = `RPT-${typePrefix[type] || 'RPT'}/${period.replace('-', '/')}`;
  await pool.query('INSERT INTO e_reports (id, report_number, period, type, status, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,NOW(),NOW())', [id, reportNumber, period, type, EREPORT_STATUS.DRAFT, userId]);
  for (let i = 0; i < items.length; i++) {
    const item = items[i]; const itemId = randomUUID();
    await pool.query('INSERT INTO e_report_items (id, report_id, product_id, product_name, qty_in, qty_out, stock_end, sort_order) VALUES (?,?,?,?,?,?,?,?)', [itemId, id, item.productId, item.productName, item.qtyIn, item.qtyOut, item.stockEnd, i]);
  }
  return mysqlGetEReportWithItems(pool, id);
};

const mysqlSubmitEReport = async (id, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[report]] = await pool.query('SELECT id, status FROM e_reports WHERE id = ? LIMIT 1', [id]);
  if (!report) throw ApiError.notFound('e-Report tidak ditemukan');
  if (![EREPORT_STATUS.DRAFT, EREPORT_STATUS.REJECTED].includes(report.status)) throw ApiError.badRequest(`e-Report hanya bisa di-submit dari status draft atau rejected, status saat ini: "${report.status}"`);
  await pool.query('UPDATE e_reports SET status = ?, submitted_by = ?, submitted_at = NOW(), reject_reason = NULL, updated_at = NOW() WHERE id = ?', [EREPORT_STATUS.SUBMITTED, userId, id]);
  return mysqlGetEReportWithItems(pool, id);
};

// ─── MySQL: Documents ───

const computeDocStatus = (expiryDate) => {
  if (!expiryDate) return REG_DOC_STATUS.ACTIVE;
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const exp = new Date(expiryDate);
  if (exp <= now) return REG_DOC_STATUS.EXPIRED;
  if (exp <= thirtyDays) return REG_DOC_STATUS.EXPIRING_SOON;
  return REG_DOC_STATUS.ACTIVE;
};

const mysqlGetDocuments = async () => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');

  // Company docs from app_settings
  const appSettingService = require('./appSetting.service');
  let raw;
  try { raw = await appSettingService.getSettings(); } catch (_) { raw = null; }

  const companyDocs = [];
  if (raw) {
    const licenses = raw.company?.licenses || {};
    const pharmacist = raw.company?.responsiblePharmacist || {};
    const licenseEntries = [
      { type: 'PBF', data: licenses.pbf }, { type: 'SIUP', data: licenses.siup },
      { type: 'TDP', data: licenses.tdp }, { type: 'NIB', data: licenses.nib ? { number: licenses.nib.number } : null },
      { type: 'CDOB', data: licenses.cdob },
    ];
    for (const entry of licenseEntries) {
      if (!entry.data) continue;
      const doc = { type: entry.type, number: entry.data.number || null, issuedDate: entry.data.issuedDate || null, expiryDate: entry.data.expiryDate || null, holder: null, status: computeDocStatus(entry.data.expiryDate) };
      const [[regDoc]] = await pool.query("SELECT id, file_name FROM regulation_documents WHERE category = ? AND type = ? LIMIT 1", [REG_DOC_CATEGORY.COMPANY, entry.type]);
      if (regDoc) { doc._id = regDoc.id; doc.fileName = regDoc.file_name; }
      companyDocs.push(doc);
    }
    if (pharmacist.sipaNumber || pharmacist.sipaExpiry) {
      const doc = { type: 'SIPA', number: pharmacist.sipaNumber || null, issuedDate: null, expiryDate: pharmacist.sipaExpiry || null, holder: pharmacist.name || null, status: computeDocStatus(pharmacist.sipaExpiry) };
      const [[rd]] = await pool.query("SELECT id, file_name FROM regulation_documents WHERE category = ? AND type = 'SIPA' LIMIT 1", [REG_DOC_CATEGORY.COMPANY]);
      if (rd) { doc._id = rd.id; doc.fileName = rd.file_name; }
      companyDocs.push(doc);
    }
    if (pharmacist.straNumber || pharmacist.straExpiry) {
      const doc = { type: 'STRA', number: pharmacist.straNumber || null, issuedDate: null, expiryDate: pharmacist.straExpiry || null, holder: pharmacist.name || null, status: computeDocStatus(pharmacist.straExpiry) };
      const [[rd]] = await pool.query("SELECT id, file_name FROM regulation_documents WHERE category = ? AND type = 'STRA' LIMIT 1", [REG_DOC_CATEGORY.COMPANY]);
      if (rd) { doc._id = rd.id; doc.fileName = rd.file_name; }
      companyDocs.push(doc);
    }
  }

  // Supplier docs
  const [suppliers] = await pool.query('SELECT id, name, izin_sarana_number, izin_sarana_expiry_date, cdob_cdakb_number, cdob_cdakb_expiry_date, sip_sik_number, sip_sik_expiry_date FROM suppliers WHERE is_active = 1');
  const supplierDocs = [];
  for (const s of suppliers) {
    if (s.cdob_cdakb_number || s.cdob_cdakb_expiry_date) {
      supplierDocs.push({ entityName: s.name, type: 'CDOB/CDAKB', number: s.cdob_cdakb_number || null, expiryDate: s.cdob_cdakb_expiry_date || null, status: computeDocStatus(s.cdob_cdakb_expiry_date) });
    }
    if (s.izin_sarana_number || s.izin_sarana_expiry_date) {
      supplierDocs.push({ entityName: s.name, type: 'Izin Sarana', number: s.izin_sarana_number || null, expiryDate: s.izin_sarana_expiry_date || null, status: computeDocStatus(s.izin_sarana_expiry_date) });
    }
    if (s.sip_sik_number || s.sip_sik_expiry_date) {
      supplierDocs.push({ entityName: s.name, type: 'SIP/SIK', number: s.sip_sik_number || null, expiryDate: s.sip_sik_expiry_date || null, status: computeDocStatus(s.sip_sik_expiry_date) });
    }
  }

  // Customer docs
  const [customers] = await pool.query('SELECT id, name, type, izin_sarana_number, izin_sarana_expiry_date FROM customers WHERE is_active = 1');
  const customerDocs = [];
  for (const c of customers) {
    if (c.izin_sarana_number || c.izin_sarana_expiry_date) {
      customerDocs.push({ entityName: c.name, customerType: c.type, siaNumber: c.izin_sarana_number || null, siaExpiry: c.izin_sarana_expiry_date || null, status: computeDocStatus(c.izin_sarana_expiry_date) });
    }
  }

  return { company: companyDocs, supplier: supplierDocs, customer: customerDocs };
};

const mysqlGetDocStats = async () => {
  const docs = await mysqlGetDocuments();
  const all = [...docs.company, ...docs.supplier, ...docs.customer];
  return { total: all.length, active: all.filter((d) => d.status === REG_DOC_STATUS.ACTIVE).length, expiringSoon: all.filter((d) => d.status === REG_DOC_STATUS.EXPIRING_SOON).length, expired: all.filter((d) => d.status === REG_DOC_STATUS.EXPIRED).length };
};

const mysqlUploadDocument = async (id, file, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[regDoc]] = await pool.query('SELECT id FROM regulation_documents WHERE id = ? LIMIT 1', [id]);
  if (!regDoc) throw ApiError.notFound('Dokumen tidak ditemukan');
  await pool.query('UPDATE regulation_documents SET file_name = ?, file_path = ?, uploaded_at = NOW(), updated_by = ?, updated_at = NOW() WHERE id = ?', [file.originalname, file.path, userId, id]);
  const [[updated]] = await pool.query('SELECT * FROM regulation_documents WHERE id = ? LIMIT 1', [id]);
  return { id: updated.id, _id: updated.id, category: updated.category, type: updated.type, fileName: updated.file_name, filePath: updated.file_path, uploadedAt: updated.uploaded_at };
};

const mysqlSyncCompanyDocuments = async () => {
  const pool = getMySQLPool();
  if (!pool) return;
  const types = ['PBF', 'SIUP', 'TDP', 'NIB', 'CDOB', 'SIPA', 'STRA'];
  for (const type of types) {
    const [[exists]] = await pool.query("SELECT id FROM regulation_documents WHERE category = ? AND type = ? LIMIT 1", [REG_DOC_CATEGORY.COMPANY, type]);
    if (!exists) {
      const id = randomUUID();
      await pool.query('INSERT INTO regulation_documents (id, category, type, status, created_at, updated_at) VALUES (?,?,?,?,NOW(),NOW())', [id, REG_DOC_CATEGORY.COMPANY, type, REG_DOC_STATUS.ACTIVE]);
    }
  }
};

const getSPList = (q) => mysqlGetSPList(q);
const getSPStats = () => mysqlGetSPStats();
const getSPById = (id) => mysqlGetSPById(id);
const createSP = (data, userId) => mysqlCreateSP(data, userId);
const updateSPStatus = (id, newStatus, userId, rejectReason) => mysqlUpdateSPStatus(id, newStatus, userId, rejectReason);
const expireOverdueSP = () => mysqlExpireOverdueSP();
const getEReports = (q) => mysqlGetEReports(q);
const getEReportStats = () => mysqlGetEReportStats();
const generateEReport = (data, userId) => mysqlGenerateEReport(data, userId);
const submitEReport = (id, userId) => mysqlSubmitEReport(id, userId);
const getDocuments = () => mysqlGetDocuments();
const getDocStats = () => mysqlGetDocStats();
const uploadDocument = (id, file, userId) => mysqlUploadDocument(id, file, userId);
const syncCompanyDocuments = () => mysqlSyncCompanyDocuments();

module.exports = {
  getSPList,
  getSPStats,
  getSPById,
  createSP,
  updateSPStatus,
  expireOverdueSP,
  getEReports,
  getEReportStats,
  generateEReport,
  submitEReport,
  getDocuments,
  getDocStats,
  uploadDocument,
  syncCompanyDocuments,
};


