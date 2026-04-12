const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');
const Product = require('../models/Product');
const ApiError = require('../utils/ApiError');
const { paginate } = require('../helpers');
const { PO_STATUS, GOLONGAN_ALKES } = require('../constants');
const config = require('../config');
const { getMySQLPool } = require('../config/database');
const mongoose = require('mongoose');

// ─── MySQL Helpers ───

const alkesGolonganValues = new Set(Object.values(GOLONGAN_ALKES));
const isAlkesGolongan = (golongan) => alkesGolonganValues.has(golongan);

const mapPoRow = (row, items = []) => ({
  id: row.id, _id: row.id,
  poNumber: row.po_number,
  poCategory: row.po_category,
  status: row.status,
  supplierId: row.supplier_id ? {
    _id: row.supplier_id, id: row.supplier_id,
    name: row.supplier_name, code: row.supplier_code,
    phone: row.supplier_phone,
    address: {
      street: row.supplier_address_street || null,
      city: row.supplier_address_city || null,
      province: row.supplier_address_province || null,
    },
  } : null,
  orderDate: row.order_date,
  expectedDeliveryDate: row.expected_delivery_date,
  sentAt: row.sent_at,
  paymentTermDays: row.payment_term_days,
  items: items.map((i) => ({
    id: i.id, _id: i.id,
    productId: { _id: i.product_id, id: i.product_id, name: i.product_name, sku: i.product_sku, golongan: i.product_golongan, nie: i.product_nie, manufacturer: i.product_manufacturer },
    satuan: i.satuan, quantity: i.quantity, unitPrice: Number(i.unit_price),
    discount: Number(i.discount), subtotal: Number(i.subtotal),
    receivedQty: i.received_qty, notes: i.notes,
  })),
  subtotal: Number(row.subtotal),
  ppnAmount: Number(row.tax_amount),
  totalAmount: Number(row.total_amount),
  paidAmount: Number(row.paid_amount),
  remainingAmount: Number(row.remaining_amount),
  notes: row.notes,
  createdBy: row.created_by ? { _id: row.created_by, name: row.created_by_name } : null,
  updatedBy: row.updated_by ? { _id: row.updated_by, name: row.updated_by_name } : null,
  createdAt: row.created_at, updatedAt: row.updated_at,
});

const getPoWithDetails = async (pool, id) => {
  const [rows] = await pool.query(
    `SELECT po.*, s.name as supplier_name, s.code as supplier_code, s.phone as supplier_phone,
     s.address_street as supplier_address_street, s.address_city as supplier_address_city, s.address_province as supplier_address_province,
     u1.name as created_by_name, u2.name as updated_by_name
     FROM purchase_orders po
     LEFT JOIN suppliers s ON po.supplier_id = s.id
     LEFT JOIN users u1 ON po.created_by = u1.id
     LEFT JOIN users u2 ON po.updated_by = u2.id
     WHERE po.id = ? LIMIT 1`,
    [id],
  );
  if (rows.length === 0) return null;

  const [items] = await pool.query(
    `SELECT poi.*, p.name as product_name, p.sku as product_sku, p.golongan as product_golongan, p.nie as product_nie, p.manufacturer as product_manufacturer
     FROM purchase_order_items poi LEFT JOIN products p ON poi.product_id = p.id
     WHERE poi.purchase_order_id = ? ORDER BY poi.sort_order ASC`,
    [id],
  );

  return mapPoRow(rows[0], items);
};

const ROMAN_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

const generatePoNumber = async (pool, category = 'obat') => {
  const now = new Date();
  const year = now.getFullYear();
  const romanMonth = ROMAN_MONTHS[now.getMonth()];
  const typeCode = category === 'alkes' ? 'A' : 'F';
  const suffix = `/${typeCode}/SP/${romanMonth}/${year}`;

  const [rows] = await pool.query(
    'SELECT po_number FROM purchase_orders WHERE po_number LIKE ? ORDER BY po_number DESC LIMIT 1',
    [`%${suffix}`],
  );

  let nextNum = 1;
  if (rows.length > 0) {
    const lastNum = parseInt(rows[0].po_number.split('/')[0], 10);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }
  return `${String(nextNum).padStart(4, '0')}${suffix}`;
};

// ─── MySQL Implementations ───

const mysqlGetPurchaseOrders = async (queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');

  const { page = 1, limit = 10, search, status, supplierId, dateFrom, dateTo } = queryParams;
  const offset = (Number(page) - 1) * Number(limit);
  const whereClauses = []; const params = [];

  if (search) { whereClauses.push('po.po_number LIKE ?'); params.push(`%${search}%`); }
  if (status) {
    const statuses = status.split(',').map((s) => s.trim());
    whereClauses.push(`po.status IN (${statuses.map(() => '?').join(',')})`);
    params.push(...statuses);
  }
  if (supplierId) { whereClauses.push('po.supplier_id = ?'); params.push(supplierId); }
  if (dateFrom) { whereClauses.push('po.order_date >= ?'); params.push(new Date(dateFrom)); }
  if (dateTo) { whereClauses.push('po.order_date <= ?'); params.push(new Date(`${dateTo}T23:59:59.999Z`)); }

  const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM purchase_orders po ${where}`, params);

  const [rows] = await pool.query(
    `SELECT po.*, s.name as supplier_name, s.code as supplier_code, s.phone as supplier_phone,
     s.address_street as supplier_address_street, s.address_city as supplier_address_city, s.address_province as supplier_address_province,
     u1.name as created_by_name, u2.name as updated_by_name
     FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id LEFT JOIN users u1 ON po.created_by = u1.id LEFT JOIN users u2 ON po.updated_by = u2.id
     ${where} ORDER BY po.created_at DESC LIMIT ? OFFSET ?`,
    [...params, Number(limit), offset],
  );

  // Load items per PO (bulk)
  const poIds = rows.map((r) => r.id);
  let itemsMap = {};
  if (poIds.length > 0) {
    const [allItems] = await pool.query(
      `SELECT poi.*, p.name as product_name, p.sku as product_sku FROM purchase_order_items poi LEFT JOIN products p ON poi.product_id = p.id WHERE poi.purchase_order_id IN (${poIds.map(() => '?').join(',')}) ORDER BY poi.sort_order ASC`,
      poIds,
    );
    for (const item of allItems) { (itemsMap[item.purchase_order_id] = itemsMap[item.purchase_order_id] || []).push(item); }
  }

  return {
    docs: rows.map((r) => mapPoRow(r, itemsMap[r.id] || [])),
    pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) },
  };
};

const mysqlGetStats = async () => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [[countRow], [statusRows], [totalValRow], [monthValRow], [topSuppRows]] = await Promise.all([
    pool.query('SELECT COUNT(*) as total FROM purchase_orders'),
    pool.query('SELECT status, COUNT(*) as count FROM purchase_orders GROUP BY status'),
    pool.query(`SELECT SUM(total_amount) as total FROM purchase_orders`),
    pool.query(`SELECT SUM(total_amount) as total FROM purchase_orders WHERE order_date >= ?`, [startOfMonth]),
    pool.query(`SELECT po.supplier_id, s.name, COUNT(*) as total_orders, SUM(po.total_amount) as total_value FROM purchase_orders po JOIN suppliers s ON po.supplier_id = s.id GROUP BY po.supplier_id, s.name ORDER BY total_value DESC LIMIT 3`),
  ]);

  const statusMap = {}; for (const s of statusRows) statusMap[s.status] = s.count;
  const total = Number(countRow.total || 0);
  const totalValue = Number(totalValRow.total || 0);
  const totalValueThisMonth = Number(monthValRow.total || 0);

  return {
    total, draft: statusMap[PO_STATUS.DRAFT] || 0, sent: statusMap[PO_STATUS.SENT] || 0,
    received: statusMap[PO_STATUS.RECEIVED] || 0, totalValue, totalValueThisMonth,
    avgOrderValue: total > 0 ? Math.round(totalValue / total) : 0,
    topSuppliers: topSuppRows,
  };
};

const mysqlGetPurchaseOrderById = async (id) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const po = await getPoWithDetails(pool, id);
  if (!po) throw ApiError.notFound('Purchase order not found');
  return po;
};

const mysqlCreateSinglePO = async (pool, data, items, category, userId) => {
  const id = new mongoose.Types.ObjectId().toString();
  const poNumber = await generatePoNumber(pool, category);
  const status = PO_STATUS.DRAFT;

  // Calculate totals for this subset of items
  let subtotal = 0;
  for (const item of items) {
    subtotal += item.subtotal || (item.quantity * item.unitPrice * (1 - (item.discount || 0) / 100));
  }
  const ppnRate = data.ppnRate || 11;
  const ppnAmount = Math.round(subtotal * ppnRate / 100);
  const totalAmount = subtotal + ppnAmount;

  await pool.query(
    `INSERT INTO purchase_orders (id, po_number, po_category, status, supplier_id, order_date, expected_delivery_date, payment_term_days, subtotal, tax_amount, total_amount, paid_amount, remaining_amount, notes, created_by, updated_by, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,NOW(),NOW())`,
    [id, poNumber, category, status, data.supplierId, data.orderDate, data.expectedDeliveryDate || null, data.paymentTermDays ?? 30, subtotal, ppnAmount, totalAmount, totalAmount, data.notes || null, userId, userId],
  );

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemId = new mongoose.Types.ObjectId().toString();
    // eslint-disable-next-line no-await-in-loop
    await pool.query(
      'INSERT INTO purchase_order_items (id, purchase_order_id, product_id, satuan, quantity, unit_price, discount, subtotal, received_qty, notes, sort_order) VALUES (?,?,?,?,?,?,?,?,0,?,?)',
      [itemId, id, item.productId, item.satuan, item.quantity, item.unitPrice, item.discount || 0, item.subtotal || (item.quantity * item.unitPrice * (1 - (item.discount || 0) / 100)), item.notes || null, i],
    );
  }

  return id;
};

const mysqlCreatePurchaseOrder = async (data, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');

  // Validate supplier
  const [[supplier]] = await pool.query('SELECT id, is_active FROM suppliers WHERE id = ? LIMIT 1', [data.supplierId]);
  if (!supplier) throw ApiError.notFound('Supplier tidak ditemukan');
  if (!supplier.is_active) throw ApiError.badRequest('Supplier tidak aktif');

  // Validate products
  const productIds = data.items.map((item) => item.productId);
  const uniqueProducts = new Set(productIds.map(String));
  if (uniqueProducts.size !== productIds.length) throw ApiError.badRequest('Tidak boleh ada produk duplikat dalam 1 PO');

  const [products] = await pool.query(`SELECT id, name, is_active, golongan FROM products WHERE id IN (${productIds.map(() => '?').join(',')})`, productIds);
  if (products.length !== productIds.length) throw ApiError.badRequest('Satu atau lebih produk tidak ditemukan');
  const inactiveProduct = products.find((p) => !p.is_active);
  if (inactiveProduct) throw ApiError.badRequest(`Produk "${inactiveProduct.name}" tidak aktif`);

  // Classify items by category (obat / alkes)
  const productMap = {};
  for (const p of products) productMap[p.id] = p;
  const obatItems = [];
  const alkesItems = [];
  for (const item of data.items) {
    const product = productMap[item.productId];
    if (isAlkesGolongan(product.golongan)) {
      alkesItems.push(item);
    } else {
      obatItems.push(item);
    }
  }

  const createdIds = [];
  if (obatItems.length > 0) {
    createdIds.push(await mysqlCreateSinglePO(pool, data, obatItems, 'obat', userId));
  }
  if (alkesItems.length > 0) {
    createdIds.push(await mysqlCreateSinglePO(pool, data, alkesItems, 'alkes', userId));
  }

  const results = [];
  for (const poId of createdIds) {
    results.push(await getPoWithDetails(pool, poId));
  }
  return results;
};

const mysqlUpdatePurchaseOrder = async (id, data, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[existing]] = await pool.query('SELECT id, status FROM purchase_orders WHERE id = ? LIMIT 1', [id]);
  if (!existing) throw ApiError.notFound('Purchase order not found');
  if (existing.status !== PO_STATUS.DRAFT) throw ApiError.badRequest('PO hanya dapat diedit saat berstatus draft');

  const fieldMap = { orderDate: 'order_date', expectedDeliveryDate: 'expected_delivery_date', paymentTermDays: 'payment_term_days', subtotal: 'subtotal', ppnAmount: 'tax_amount', totalAmount: 'total_amount', remainingAmount: 'remaining_amount', notes: 'notes' };
  if (data.supplierId) { fieldMap.supplierId = 'supplier_id'; }
  const setClauses = ['updated_by = ?', 'updated_at = NOW()']; const values = [userId];
  for (const [key, col] of Object.entries(fieldMap)) { if (data[key] !== undefined) { setClauses.push(`${col} = ?`); values.push(data[key]); } }
  values.push(id);
  await pool.query(`UPDATE purchase_orders SET ${setClauses.join(', ')} WHERE id = ?`, values);

  if (data.items) {
    await pool.query('DELETE FROM purchase_order_items WHERE purchase_order_id = ?', [id]);
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      const itemId = new mongoose.Types.ObjectId().toString();
      // eslint-disable-next-line no-await-in-loop
      await pool.query(
        'INSERT INTO purchase_order_items (id, purchase_order_id, product_id, satuan, quantity, unit_price, discount, subtotal, received_qty, notes, sort_order) VALUES (?,?,?,?,?,?,?,?,0,?,?)',
        [itemId, id, item.productId, item.satuan, item.quantity, item.unitPrice, item.discount || 0, item.subtotal || (item.quantity * item.unitPrice), item.notes || null, i],
      );
    }
  }

  return mysqlGetPurchaseOrderById(id);
};

const mysqlDeletePurchaseOrder = async (id) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[existing]] = await pool.query('SELECT id, status FROM purchase_orders WHERE id = ? LIMIT 1', [id]);
  if (!existing) throw ApiError.notFound('Purchase order not found');
  if (existing.status !== PO_STATUS.DRAFT) throw ApiError.badRequest('PO hanya dapat dihapus saat berstatus draft');
  await pool.query('DELETE FROM purchase_order_items WHERE purchase_order_id = ?', [id]);
  await pool.query('DELETE FROM purchase_orders WHERE id = ?', [id]);
};

const mysqlChangeStatus = async (id, newStatus, notes, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[po]] = await pool.query('SELECT id, status, created_by FROM purchase_orders WHERE id = ? LIMIT 1', [id]);
  if (!po) throw ApiError.notFound('Purchase order not found');

  const transitions = {
    [PO_STATUS.DRAFT]: [PO_STATUS.SENT],
  };
  const allowed = transitions[po.status];
  if (!allowed || !allowed.includes(newStatus)) throw ApiError.badRequest(`Tidak dapat mengubah status dari '${po.status}' ke '${newStatus}'`);

  const setClauses = ['status = ?', 'updated_by = ?', 'updated_at = NOW()']; const values = [newStatus, userId];
  if (newStatus === PO_STATUS.SENT) { setClauses.push('sent_at = NOW()'); }
  values.push(id);
  await pool.query(`UPDATE purchase_orders SET ${setClauses.join(', ')} WHERE id = ?`, values);
  return mysqlGetPurchaseOrderById(id);
};

// ─── Mongo Implementations ───

const mongoPurchaseOrders = {
  getPurchaseOrders: async (queryParams) => {
    const { page, limit, search, status, supplierId, dateFrom, dateTo, sort } = queryParams;
    const filter = {};
    if (search) { const e = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); filter.$or = [{ poNumber: { $regex: e, $options: 'i' } }]; }
    if (status) { const statuses = status.split(',').map((s) => s.trim()); filter.status = statuses.length > 1 ? { $in: statuses } : statuses[0]; }
    if (supplierId) filter.supplierId = supplierId;
    if (dateFrom || dateTo) { filter.orderDate = {}; if (dateFrom) filter.orderDate.$gte = new Date(dateFrom); if (dateTo) filter.orderDate.$lte = new Date(`${dateTo}T23:59:59.999Z`); }
    return paginate(PurchaseOrder, {
      filter, page, limit, sort: sort || '-createdAt',
      populate: [
        { path: 'supplierId', select: 'name code phone' },
        { path: 'items.productId', select: 'name sku golongan nie manufacturer' },
        { path: 'createdBy', select: 'name' }, { path: 'updatedBy', select: 'name' },
      ],
    });
  },
  getStats: async () => {
    const now = new Date(); const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const [total, statusCounts, totalValueResult, monthlyValueResult, topSuppliers] = await Promise.all([
      PurchaseOrder.countDocuments(),
      PurchaseOrder.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      PurchaseOrder.aggregate([{ $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
      PurchaseOrder.aggregate([{ $match: { orderDate: { $gte: startOfMonth } } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
      PurchaseOrder.aggregate([{ $group: { _id: '$supplierId', totalOrders: { $sum: 1 }, totalValue: { $sum: '$totalAmount' } } }, { $sort: { totalValue: -1 } }, { $limit: 3 }, { $lookup: { from: 'suppliers', localField: '_id', foreignField: '_id', as: 'supplier' } }, { $unwind: '$supplier' }, { $project: { supplierId: '$_id', name: '$supplier.name', totalOrders: 1, totalValue: 1 } }]),
    ]);
    const statusMap = {}; for (const s of statusCounts) statusMap[s._id] = s.count;
    const totalValue = totalValueResult[0]?.total || 0; const totalValueThisMonth = monthlyValueResult[0]?.total || 0;
    return { total, draft: statusMap[PO_STATUS.DRAFT] || 0, sent: statusMap[PO_STATUS.SENT] || 0, received: statusMap[PO_STATUS.RECEIVED] || 0, totalValue, totalValueThisMonth, avgOrderValue: total > 0 ? Math.round(totalValue / total) : 0, topSuppliers };
  },
  getPurchaseOrderById: async (id) => {
    const po = await PurchaseOrder.findById(id).populate('supplierId', 'name code phone address izinSarana').populate('items.productId', 'name sku golongan nie manufacturer').populate('createdBy', 'name').populate('updatedBy', 'name');
    if (!po) throw ApiError.notFound('Purchase order not found');
    return po;
  },
  createPurchaseOrder: async (data, userId) => {
    const supplier = await Supplier.findById(data.supplierId);
    if (!supplier) throw ApiError.notFound('Supplier tidak ditemukan');
    if (!supplier.isActive) throw ApiError.badRequest('Supplier tidak aktif');
    const productIds = data.items.map((item) => item.productId);
    const products = await Product.find({ _id: { $in: productIds } });
    if (products.length !== productIds.length) throw ApiError.badRequest('Satu atau lebih produk tidak ditemukan');
    const inactiveProduct = products.find((p) => !p.isActive);
    if (inactiveProduct) throw ApiError.badRequest(`Produk "${inactiveProduct.name}" tidak aktif`);
    const uniqueProducts = new Set(productIds.map(String));
    if (uniqueProducts.size !== productIds.length) throw ApiError.badRequest('Tidak boleh ada produk duplikat dalam 1 PO');

    // Classify items by category (obat / alkes)
    const productMap = {};
    for (const p of products) productMap[p._id.toString()] = p;
    const obatItems = [];
    const alkesItems = [];
    for (const item of data.items) {
      const product = productMap[item.productId.toString()];
      if (isAlkesGolongan(product.golongan)) {
        alkesItems.push(item);
      } else {
        obatItems.push(item);
      }
    }

    const results = [];
    const baseData = { ...data, status: PO_STATUS.DRAFT, createdBy: userId, updatedBy: userId };

    if (obatItems.length > 0) {
      const poData = { ...baseData, items: obatItems, poCategory: 'obat' };
      const po = await PurchaseOrder.create(poData);
      const populated = await PurchaseOrder.findById(po._id)
        .populate('supplierId', 'name code phone address izinSarana')
        .populate('items.productId', 'name sku golongan nie manufacturer')
        .populate('createdBy', 'name').populate('updatedBy', 'name');
      results.push(populated);
    }
    if (alkesItems.length > 0) {
      const poData = { ...baseData, items: alkesItems, poCategory: 'alkes' };
      const po = await PurchaseOrder.create(poData);
      const populated = await PurchaseOrder.findById(po._id)
        .populate('supplierId', 'name code phone address izinSarana')
        .populate('items.productId', 'name sku golongan nie manufacturer')
        .populate('createdBy', 'name').populate('updatedBy', 'name');
      results.push(populated);
    }
    return results;
  },
  updatePurchaseOrder: async (id, data, userId) => {
    const po = await PurchaseOrder.findById(id);
    if (!po) throw ApiError.notFound('Purchase order not found');
    if (po.status !== PO_STATUS.DRAFT) throw ApiError.badRequest('PO hanya dapat diedit saat berstatus draft');
    if (data.supplierId) { const s = await Supplier.findById(data.supplierId); if (!s) throw ApiError.notFound('Supplier tidak ditemukan'); if (!s.isActive) throw ApiError.badRequest('Supplier tidak aktif'); }
    if (data.items) {
      const productIds = data.items.map((item) => item.productId);
      const products = await Product.find({ _id: { $in: productIds } });
      if (products.length !== productIds.length) throw ApiError.badRequest('Satu atau lebih produk tidak ditemukan');
      const ip = products.find((p) => !p.isActive); if (ip) throw ApiError.badRequest(`Produk "${ip.name}" tidak aktif`);
      if (new Set(productIds.map(String)).size !== productIds.length) throw ApiError.badRequest('Tidak boleh ada produk duplikat dalam 1 PO');
    }
    data.updatedBy = userId; Object.assign(po, data); await po.save(); return po;
  },
  deletePurchaseOrder: async (id) => {
    const po = await PurchaseOrder.findById(id); if (!po) throw ApiError.notFound('Purchase order not found');
    if (po.status !== PO_STATUS.DRAFT) throw ApiError.badRequest('PO hanya dapat dihapus saat berstatus draft');
    await po.deleteOne();
  },
  changeStatus: async (id, newStatus, notes, userId) => {
    const po = await PurchaseOrder.findById(id); if (!po) throw ApiError.notFound('Purchase order not found');
    const transitions = { [PO_STATUS.DRAFT]: [PO_STATUS.SENT] };
    const allowed = transitions[po.status]; if (!allowed || !allowed.includes(newStatus)) throw ApiError.badRequest(`Tidak dapat mengubah status dari '${po.status}' ke '${newStatus}'`);
    if (newStatus === PO_STATUS.SENT && po.items.length === 0) throw ApiError.badRequest('PO harus memiliki minimal 1 item untuk dikirim');
    po.status = newStatus; po.updatedBy = userId; if (newStatus === PO_STATUS.SENT) po.sentAt = new Date();
    await po.save(); return po;
  },
};

// ─── Exported Functions with Provider Branching ───

const getPurchaseOrders = (q) => config.dbProvider === 'mysql' ? mysqlGetPurchaseOrders(q) : mongoPurchaseOrders.getPurchaseOrders(q);
const getStats = () => config.dbProvider === 'mysql' ? mysqlGetStats() : mongoPurchaseOrders.getStats();
const getPurchaseOrderById = (id) => config.dbProvider === 'mysql' ? mysqlGetPurchaseOrderById(id) : mongoPurchaseOrders.getPurchaseOrderById(id);
const createPurchaseOrder = (data, userId) => config.dbProvider === 'mysql' ? mysqlCreatePurchaseOrder(data, userId) : mongoPurchaseOrders.createPurchaseOrder(data, userId);
const updatePurchaseOrder = (id, data, userId) => config.dbProvider === 'mysql' ? mysqlUpdatePurchaseOrder(id, data, userId) : mongoPurchaseOrders.updatePurchaseOrder(id, data, userId);
const deletePurchaseOrder = (id) => config.dbProvider === 'mysql' ? mysqlDeletePurchaseOrder(id) : mongoPurchaseOrders.deletePurchaseOrder(id);
const changeStatus = (id, newStatus, notes, userId) => config.dbProvider === 'mysql' ? mysqlChangeStatus(id, newStatus, notes, userId) : mongoPurchaseOrders.changeStatus(id, newStatus, notes, userId);

module.exports = { getPurchaseOrders, getStats, getPurchaseOrderById, createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder, changeStatus };
