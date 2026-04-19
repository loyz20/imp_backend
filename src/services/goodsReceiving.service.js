const inventoryService = require('./inventory.service');
const financeService = require('./finance.service');
const ApiError = require('../utils/ApiError');
const { GR_STATUS, PO_STATUS } = require('../constants');
const { getMySQLPool } = require('../config/database');
const { randomUUID } = require('crypto');
const logger = require('../utils/logger');
// ─── MySQL Helpers ───

const mapGrRow = (row, items = []) => ({
  id: row.id, _id: row.id,
  grNumber: row.gr_number,
  invoiceNumber: row.invoice_number,
  deliveryNote: row.delivery_note,
  status: row.status,
  supplierId: row.supplier_id ? { _id: row.supplier_id, id: row.supplier_id, name: row.supplier_name, code: row.supplier_code } : null,
  purchaseOrderId: row.purchase_order_id ? { _id: row.purchase_order_id, id: row.purchase_order_id, poNumber: row.po_number, status: row.po_status } : null,
  receivingDate: row.receiving_date,
  receivedBy: row.received_by ? { _id: row.received_by, name: row.received_by_name } : null,
  verifiedBy: row.verified_by ? { _id: row.verified_by, name: row.verified_by_name } : null,
  verifiedAt: row.verified_at,
  verificationNotes: row.verification_notes,
  subtotal: Number(row.subtotal || 0),
  ppnAmount: Number(row.ppn_amount || 0),
  grandTotal: Number(row.grand_total || 0),
  notes: row.notes,
  items: items.map((i) => ({
    id: i.id, _id: i.id,
    productId: { _id: i.product_id, id: i.product_id, name: i.product_name, sku: i.product_sku, golongan: i.product_golongan },
    batchNumber: i.batch_number, expiryDate: i.expiry_date, manufacturingDate: i.manufacturing_date,
    receivedQty: i.received_qty, orderedQty: i.ordered_qty, unitPrice: Number(i.unit_price), discount: Number(i.discount), subtotal: Number(i.subtotal),
    conditionStatus: i.condition_status || 'baik', notes: i.notes,
  })),
  createdBy: row.created_by ? { _id: row.created_by, name: row.created_by_name } : null,
  updatedBy: row.updated_by ? { _id: row.updated_by, name: row.updated_by_name } : null,
  createdAt: row.created_at, updatedAt: row.updated_at,
});

const getGrWithItems = async (pool, id) => {
  const [rows] = await pool.query(
    `SELECT gr.*, s.name as supplier_name, s.code as supplier_code, po.po_number, po.status as po_status, u1.name as received_by_name, u2.name as verified_by_name, u3.name as created_by_name, u4.name as updated_by_name
     FROM goods_receivings gr LEFT JOIN suppliers s ON gr.supplier_id = s.id LEFT JOIN purchase_orders po ON gr.purchase_order_id = po.id
     LEFT JOIN users u1 ON gr.received_by = u1.id LEFT JOIN users u2 ON gr.verified_by = u2.id LEFT JOIN users u3 ON gr.created_by = u3.id LEFT JOIN users u4 ON gr.updated_by = u4.id
     WHERE gr.id = ? LIMIT 1`, [id],
  );
  if (rows.length === 0) return null;
  const [items] = await pool.query(
    `SELECT gri.*, p.name as product_name, p.sku as product_sku, p.golongan as product_golongan
     FROM gr_items gri LEFT JOIN products p ON gri.product_id = p.id WHERE gri.goods_receiving_id = ? ORDER BY gri.sort_order ASC`, [id],
  );
  return mapGrRow(rows[0], items);
};

const generateGrNumber = async (pool) => {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const prefix = `GR-${ymd}-`;
  const [rows] = await pool.query('SELECT gr_number FROM goods_receivings WHERE gr_number LIKE ? ORDER BY gr_number DESC LIMIT 1', [`${prefix}%`]);
  const seq = rows.length > 0 ? parseInt(rows[0].gr_number.split('-').pop(), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

// ─── MySQL Implementations ───

const mysqlGetGoodsReceivings = async (queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const { page = 1, limit = 10, search, status, supplierId, dateFrom, dateTo } = queryParams;
  const offset = (Number(page) - 1) * Number(limit);
  const whereClauses = []; const params = [];
  if (search) { whereClauses.push('(gr.invoice_number LIKE ? OR gr.delivery_note LIKE ?)'); const sl = `%${search}%`; params.push(sl, sl); }
  if (status) { const statuses = status.split(',').map((s) => s.trim()); whereClauses.push(`gr.status IN (${statuses.map(() => '?').join(',')})`); params.push(...statuses); }
  if (supplierId) { whereClauses.push('gr.supplier_id = ?'); params.push(supplierId); }
  if (dateFrom) { whereClauses.push('gr.receiving_date >= ?'); params.push(new Date(dateFrom)); }
  if (dateTo) { whereClauses.push('gr.receiving_date <= ?'); params.push(new Date(`${dateTo}T23:59:59.999Z`)); }
  const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM goods_receivings gr ${where}`, params);
  const [rows] = await pool.query(
    `SELECT gr.*, s.name as supplier_name, s.code as supplier_code, po.po_number, u1.name as received_by_name, u3.name as created_by_name FROM goods_receivings gr LEFT JOIN suppliers s ON gr.supplier_id = s.id LEFT JOIN purchase_orders po ON gr.purchase_order_id = po.id LEFT JOIN users u1 ON gr.received_by = u1.id LEFT JOIN users u3 ON gr.created_by = u3.id ${where} ORDER BY gr.created_at DESC LIMIT ? OFFSET ?`, [...params, Number(limit), offset],
  );
  const grIds = rows.map((r) => r.id); let itemsMap = {};
  if (grIds.length > 0) {
    const [allItems] = await pool.query(`SELECT gri.*, p.name as product_name, p.sku as product_sku FROM gr_items gri LEFT JOIN products p ON gri.product_id = p.id WHERE gri.goods_receiving_id IN (${grIds.map(() => '?').join(',')}) ORDER BY gri.sort_order ASC`, grIds);
    for (const item of allItems) { (itemsMap[item.goods_receiving_id] = itemsMap[item.goods_receiving_id] || []).push(item); }
  }
  return { docs: rows.map((r) => mapGrRow(r, itemsMap[r.id] || [])), pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } };
};

const mysqlGetStats = async () => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const now = new Date(); const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1); const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0, 0, 0, 0);
  const [[totalRow], [statusRows], [[thisMonthRow]], [[thisWeekRow]], [[discRow]]] = await Promise.all([
    pool.query('SELECT COUNT(*) as total FROM goods_receivings'),
    pool.query('SELECT status, COUNT(*) as count FROM goods_receivings GROUP BY status'),
    pool.query('SELECT COUNT(*) as total FROM goods_receivings WHERE receiving_date >= ?', [startOfMonth]),
    pool.query('SELECT COUNT(*) as total FROM goods_receivings WHERE receiving_date >= ?', [startOfWeek]),
    pool.query('SELECT COUNT(DISTINCT gri.goods_receiving_id) as total FROM gr_items gri WHERE gri.ordered_qty > 0 AND gri.received_qty != gri.ordered_qty'),
  ]);
  const statusMap = {}; for (const s of statusRows) statusMap[s.status] = s.count;
  return { total: Number(totalRow.total), draft: statusMap[GR_STATUS.DRAFT] || 0, checked: statusMap[GR_STATUS.CHECKED] || 0, pendingVerification: (statusMap[GR_STATUS.DRAFT] || 0) + (statusMap[GR_STATUS.CHECKED] || 0), verified: statusMap[GR_STATUS.VERIFIED] || 0, completed: statusMap[GR_STATUS.COMPLETED] || 0, thisMonth: Number(thisMonthRow.total), thisWeek: Number(thisWeekRow.total), discrepancyCount: Number(discRow.total), damagedItems: 0 };
};

const mysqlGetGoodsReceivingById = async (id) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const gr = await getGrWithItems(pool, id);
  if (!gr) throw ApiError.notFound('Goods receiving not found');
  return gr;
};

const mysqlCreateGoodsReceiving = async (data, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  let supplierId = data.supplierId;
  if (data.purchaseOrderId) {
    const [[po]] = await pool.query('SELECT id, status, supplier_id FROM purchase_orders WHERE id = ? LIMIT 1', [data.purchaseOrderId]);
    if (!po) throw ApiError.notFound('Purchase order tidak ditemukan');
    if (po.status !== PO_STATUS.SENT) throw ApiError.badRequest('PO harus berstatus sent');
    supplierId = po.supplier_id;
    if (data.items) {
      const [poItems] = await pool.query('SELECT * FROM purchase_order_items WHERE purchase_order_id = ?', [data.purchaseOrderId]);
      data.items = data.items.map((grItem) => {
        const poItem = poItems.find((pi) => pi.product_id === grItem.productId);
        if (poItem && grItem.orderedQty == null) return { ...grItem, orderedQty: poItem.quantity };
        if (!poItem && grItem.orderedQty == null) return { ...grItem, orderedQty: 0 };
        return grItem;
      });
    }
  }
  if (!supplierId) throw ApiError.badRequest('Supplier wajib dipilih (atau pilih PO yang terkait)');
  const [[supplier]] = await pool.query('SELECT id FROM suppliers WHERE id = ? LIMIT 1', [supplierId]);
  if (!supplier) throw ApiError.notFound('Supplier tidak ditemukan');
  const now = new Date();
  for (let i = 0; i < (data.items || []).length; i++) {
    const item = data.items[i];
    if (new Date(item.expiryDate) <= now) throw ApiError.badRequest(`Item ke-${i + 1}: Tanggal kedaluwarsa harus di masa depan`);
    if (item.manufacturingDate && new Date(item.manufacturingDate) >= new Date(item.expiryDate)) throw ApiError.badRequest(`Item ke-${i + 1}: Tanggal produksi harus sebelum tanggal kedaluwarsa`);
  }
  const id = randomUUID();
  const grNumber = data.grNumber || await generateGrNumber(pool);
  await pool.query(
    `INSERT INTO goods_receivings (id, gr_number, invoice_number, delivery_note, status, supplier_id, purchase_order_id, receiving_date, received_by, subtotal, ppn_amount, grand_total, notes, created_by, updated_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())`,
    [id, grNumber, data.invoiceNumber || null, data.deliveryNote || null, GR_STATUS.DRAFT, supplierId, data.purchaseOrderId || null, data.receivingDate || now, userId, data.subtotal || 0, data.ppnAmount || 0, data.grandTotal || 0, data.notes || null, userId, userId],
  );
  for (let i = 0; i < (data.items || []).length; i++) {
    const item = data.items[i]; const itemId = randomUUID();
    // eslint-disable-next-line no-await-in-loop
    await pool.query('INSERT INTO gr_items (id, goods_receiving_id, product_id, batch_number, expiry_date, manufacturing_date, received_qty, ordered_qty, unit_price, discount, subtotal, condition_status, notes, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [itemId, id, item.productId, item.batchNumber || null, item.expiryDate || null, item.manufacturingDate || null, item.receivedQty || 0, item.orderedQty || 0, item.unitPrice || 0, item.discount || 0, item.subtotal || 0, item.conditionStatus || 'baik', item.notes || null, i]);
  }
  return mysqlGetGoodsReceivingById(id);
};

const mysqlUpdateGoodsReceiving = async (id, data, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[existing]] = await pool.query('SELECT id, status FROM goods_receivings WHERE id = ? LIMIT 1', [id]);
  if (!existing) throw ApiError.notFound('Goods receiving not found');
  if (existing.status !== GR_STATUS.DRAFT) throw ApiError.badRequest('Penerimaan hanya dapat diedit saat berstatus draft');
  const fieldMap = { invoiceNumber: 'invoice_number', deliveryNote: 'delivery_note', receivingDate: 'receiving_date', subtotal: 'subtotal', ppnAmount: 'ppn_amount', grandTotal: 'grand_total', notes: 'notes' };
  const setClauses = ['updated_by = ?', 'updated_at = NOW()']; const values = [userId];
  for (const [key, col] of Object.entries(fieldMap)) { if (data[key] !== undefined) { setClauses.push(`${col} = ?`); values.push(data[key]); } }
  values.push(id);
  await pool.query(`UPDATE goods_receivings SET ${setClauses.join(', ')} WHERE id = ?`, values);
  if (data.items) {
    const now = new Date();
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      if (item.expiryDate && new Date(item.expiryDate) <= now) throw ApiError.badRequest(`Item ke-${i + 1}: Tanggal kedaluwarsa harus di masa depan`);
      if (item.manufacturingDate && item.expiryDate && new Date(item.manufacturingDate) >= new Date(item.expiryDate)) throw ApiError.badRequest(`Item ke-${i + 1}: Tanggal produksi harus sebelum tanggal kedaluwarsa`);
    }
    await pool.query('DELETE FROM gr_items WHERE goods_receiving_id = ?', [id]);
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i]; const itemId = randomUUID();
      // eslint-disable-next-line no-await-in-loop
      await pool.query('INSERT INTO gr_items (id, goods_receiving_id, product_id, batch_number, expiry_date, manufacturing_date, received_qty, ordered_qty, unit_price, discount, subtotal, condition_status, notes, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)', [itemId, id, item.productId, item.batchNumber || null, item.expiryDate || null, item.manufacturingDate || null, item.receivedQty || 0, item.orderedQty || 0, item.unitPrice || 0, item.discount || 0, item.subtotal || 0, item.conditionStatus || 'baik', item.notes || null, i]);
    }
  }
  return mysqlGetGoodsReceivingById(id);
};

const mysqlDeleteGoodsReceiving = async (id) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[existing]] = await pool.query('SELECT id, status FROM goods_receivings WHERE id = ? LIMIT 1', [id]);
  if (!existing) throw ApiError.notFound('Goods receiving not found');
  if (existing.status !== GR_STATUS.DRAFT) throw ApiError.badRequest('Penerimaan hanya dapat dihapus saat berstatus draft');
  await pool.query('DELETE FROM gr_items WHERE goods_receiving_id = ?', [id]);
  await pool.query('DELETE FROM goods_receivings WHERE id = ?', [id]);
};

const mysqlUpdatePOReceiving = async (pool, poId) => {
  const [[po]] = await pool.query('SELECT id FROM purchase_orders WHERE id = ? LIMIT 1', [poId]);
  if (!po) return;
  const [grs] = await pool.query('SELECT id FROM goods_receivings WHERE purchase_order_id = ? AND status IN (?,?)', [poId, GR_STATUS.VERIFIED, GR_STATUS.COMPLETED]);
  if (grs.length === 0) return;
  const grIds = grs.map((g) => g.id);
  const [poItems] = await pool.query('SELECT id, product_id, quantity FROM purchase_order_items WHERE purchase_order_id = ?', [poId]);
  const [grItems] = await pool.query(`SELECT product_id, SUM(received_qty) as total FROM gr_items WHERE goods_receiving_id IN (${grIds.map(() => '?').join(',')}) GROUP BY product_id`, grIds);
  const receivedMap = {}; for (const gi of grItems) receivedMap[gi.product_id] = Number(gi.total);
  for (const poi of poItems) {
    const received = Math.min(receivedMap[poi.product_id] || 0, poi.quantity);
    // eslint-disable-next-line no-await-in-loop
    await pool.query('UPDATE purchase_order_items SET received_qty = ? WHERE id = ?', [received, poi.id]);
  }
  const allReceived = poItems.every((poi) => Math.min(receivedMap[poi.product_id] || 0, poi.quantity) >= poi.quantity);
  const someReceived = poItems.some((poi) => (receivedMap[poi.product_id] || 0) > 0);
  const newStatus = allReceived ? PO_STATUS.RECEIVED : undefined;
  if (newStatus) await pool.query('UPDATE purchase_orders SET status = ?, updated_at = NOW() WHERE id = ?', [newStatus, poId]);
};

const mysqlVerifyGoodsReceiving = async (id, notes, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const gr = await getGrWithItems(pool, id);
  if (!gr) throw ApiError.notFound('Goods receiving not found');
  if (gr.status !== GR_STATUS.DRAFT && gr.status !== GR_STATUS.CHECKED) throw ApiError.badRequest('Penerimaan harus berstatus draft atau checked untuk diverifikasi');
  if (gr.purchaseOrderId && !gr.invoiceNumber) throw ApiError.badRequest('Nomor faktur supplier wajib diisi sebelum verifikasi penerimaan PO');
  const now = new Date();
  for (let i = 0; i < gr.items.length; i++) {
    const item = gr.items[i];
    if (!item.batchNumber) throw ApiError.badRequest(`Item ke-${i + 1}: Nomor batch wajib diisi (CDOB)`);
    if (!item.expiryDate) throw ApiError.badRequest(`Item ke-${i + 1}: Tanggal kedaluwarsa wajib diisi (CDOB)`);
    if (new Date(item.expiryDate) <= now) throw ApiError.badRequest(`Item ke-${i + 1}: Produk sudah expired, tidak dapat diverifikasi`);
  }
  await pool.query('UPDATE goods_receivings SET status = ?, verified_by = ?, verified_at = NOW(), verification_notes = ?, updated_by = ?, updated_at = NOW() WHERE id = ?', [GR_STATUS.VERIFIED, userId, notes || '', userId, id]);
  if (gr.purchaseOrderId) await mysqlUpdatePOReceiving(pool, gr.purchaseOrderId._id || gr.purchaseOrderId);
  const updatedGr = await getGrWithItems(pool, id);
  try { await inventoryService.createGRMutations(updatedGr, userId); } catch (err) { logger.error(`Failed to create GR mutations for ${id}: ${err.message}`); }
  try { const poId = gr.purchaseOrderId?._id || gr.purchaseOrderId; const po = poId ? await (async () => { const [[r]] = await pool.query('SELECT id, po_number, supplier_id, payment_term_days FROM purchase_orders WHERE id = ? LIMIT 1', [poId]); return r ? { _id: r.id, poNumber: r.po_number, supplierId: r.supplier_id, paymentTermDays: r.payment_term_days } : null; })() : null; await financeService.createJournalFromGR(updatedGr, po); await financeService.createPurchaseInvoiceFromGR(updatedGr, po, userId); } catch (err) { logger.error(`Failed to create journal/invoice for GR ${id}: ${err.message}`); }
  return updatedGr;
};

const mysqlGetAvailablePOs = async (queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const { search, supplierId, page = 1, limit = 20 } = queryParams;
  const offset = (Number(page) - 1) * Number(limit);
  const whereClauses = [`po.status = '${PO_STATUS.SENT}'`]; const params = [];
  if (supplierId) { whereClauses.push('po.supplier_id = ?'); params.push(supplierId); }
  if (search) { whereClauses.push('po.po_number LIKE ?'); params.push(`%${search}%`); }
  const where = `WHERE ${whereClauses.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM purchase_orders po ${where}`, params);
  const [rows] = await pool.query(`SELECT po.*, s.name as supplier_name, s.code as supplier_code FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id ${where} ORDER BY po.created_at DESC LIMIT ? OFFSET ?`, [...params, Number(limit), offset]);
  const poIds = rows.map((r) => r.id);
  let itemsMap = {};
  if (poIds.length > 0) {
    const [items] = await pool.query(`SELECT poi.*, p.name as product_name, p.sku as product_sku FROM purchase_order_items poi LEFT JOIN products p ON poi.product_id = p.id WHERE poi.purchase_order_id IN (${poIds.map(() => '?').join(',')})`, poIds);
    for (const item of items) { (itemsMap[item.purchase_order_id] = itemsMap[item.purchase_order_id] || []).push({ ...item, remainingQty: Math.max(0, item.quantity - (item.received_qty || 0)) }); }
  }
  const docs = rows.map((r) => ({ _id: r.id, id: r.id, poNumber: r.po_number, status: r.status, supplierId: { _id: r.supplier_id, name: r.supplier_name, code: r.supplier_code }, items: (itemsMap[r.id] || []).map((i) => ({ _id: i.id, productId: { _id: i.product_id, name: i.product_name, sku: i.product_sku }, quantity: i.quantity, receivedQty: i.received_qty || 0, remainingQty: i.remainingQty })), createdAt: r.created_at }));
  return { docs, pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } };
};

const getGoodsReceivings = (q) => mysqlGetGoodsReceivings(q);
const getStats = () => mysqlGetStats();
const getGoodsReceivingById = (id) => mysqlGetGoodsReceivingById(id);
const createGoodsReceiving = (data, userId) => mysqlCreateGoodsReceiving(data, userId);
const updateGoodsReceiving = (id, data, userId) => mysqlUpdateGoodsReceiving(id, data, userId);
const deleteGoodsReceiving = (id) => mysqlDeleteGoodsReceiving(id);
const verifyGoodsReceiving = (id, notes, userId) => mysqlVerifyGoodsReceiving(id, notes, userId);
const getAvailablePOs = (q) => mysqlGetAvailablePOs(q);

module.exports = {
  getGoodsReceivings,
  getStats,
  getGoodsReceivingById,
  createGoodsReceiving,
  updateGoodsReceiving,
  deleteGoodsReceiving,
  verifyGoodsReceiving,
  getAvailablePOs,
};

