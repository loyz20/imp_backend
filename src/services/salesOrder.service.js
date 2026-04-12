const SalesOrder = require('../models/SalesOrder');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const AppSetting = require('../models/AppSetting');
const ApiError = require('../utils/ApiError');
const { paginate } = require('../helpers');
const { SO_STATUS, GOLONGAN_ALKES } = require('../constants');
const inventoryService = require('./inventory.service');
const financeService = require('./finance.service');
const config = require('../config');
const { getMySQLPool } = require('../config/database');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

const alkesGolonganValues = new Set(Object.values(GOLONGAN_ALKES));
const isAlkesGolongan = (golongan) => alkesGolonganValues.has(golongan);

// ─── Valid status transitions ───
const STATUS_TRANSITIONS = {
  [SO_STATUS.DRAFT]: [SO_STATUS.SHIPPED],
  [SO_STATUS.SHIPPED]: [SO_STATUS.AWAITING_PAYMENT, SO_STATUS.RETURNED],
  [SO_STATUS.AWAITING_PAYMENT]: [SO_STATUS.COMPLETED, SO_STATUS.RETURNED],
};

const LEGACY_STATUS_MAP = {
  draft: SO_STATUS.DRAFT,
  confirmed: SO_STATUS.SHIPPED,
  processing: SO_STATUS.SHIPPED,
  ready_to_ship: SO_STATUS.SHIPPED,
  packed: SO_STATUS.SHIPPED,
  partial_shipped: SO_STATUS.SHIPPED,
  shipped: SO_STATUS.SHIPPED,
  delivered: SO_STATUS.AWAITING_PAYMENT,
  partial_delivered: SO_STATUS.AWAITING_PAYMENT,
  invoiced: SO_STATUS.AWAITING_PAYMENT,
  awaiting_payment: SO_STATUS.AWAITING_PAYMENT,
  completed: SO_STATUS.COMPLETED,
  cancelled: SO_STATUS.RETURNED,
  canceled: SO_STATUS.RETURNED,
  returned: SO_STATUS.RETURNED,
};

const normalizeSoStatus = (status) => LEGACY_STATUS_MAP[status] || status;

const normalizeSoItems = (items = []) => items.map((item) => {
  const quantity = Number(item.quantity ?? item.quantityOrdered ?? item.quantityShipped ?? 0);

  return {
    ...item,
    quantity,
  };
});

const ensureSoItemQuantities = (items = []) => {
  for (const item of items) {
    if (!Number.isFinite(item.quantity) || item.quantity < 1) {
      throw ApiError.badRequest('Quantity item SO minimal 1');
    }
  }
};

const toDeliveryLikePayload = (so) => ({
  _id: so._id,
  salesOrderId: so._id,
  customerId: so.customerId,
  deliveryNumber: so.suratJalanNumber,
  shippedAt: so.shippedAt,
  updatedBy: so.updatedBy,
  items: (so.items || []).map((item) => ({
    productId: item.productId?._id || item.productId,
    satuan: item.satuan,
    quantityOrdered: Number(item.quantity || 0),
    quantityShipped: Number(item.quantity || 0),
    batchNumber: item.batchNumber || null,
    expiryDate: item.expiryDate || null,
  })),
});

/**
 * Get PPN config from settings
 */
const getPpnConfig = async () => {
  const settings = await AppSetting.getSettings();
  const isPkp = settings?.company?.tax?.isPkp || false;
  const ppnRate = isPkp ? (settings?.company?.tax?.defaultPpnRate ?? 11) : 0;
  return { isPkp, ppnRate };
};

/**
 * Get all sales orders
 */
const mongoGetSalesOrders = async (queryParams) => {
  const { page, limit, search, status, customerId, dateFrom, dateTo, sort } = queryParams;

  const filter = {};

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { suratJalanNumber: { $regex: escaped, $options: 'i' } },
      { fakturNumber: { $regex: escaped, $options: 'i' } },
    ];
  }

  if (status) {
    const statuses = status.split(',').map((s) => s.trim());
    filter.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
  }
  if (customerId) filter.customerId = customerId;

  if (dateFrom || dateTo) {
    filter.orderDate = {};
    if (dateFrom) filter.orderDate.$gte = new Date(dateFrom);
    if (dateTo) filter.orderDate.$lte = new Date(dateTo + 'T23:59:59.999Z');
  }

  return paginate(SalesOrder, {
    filter,
    page,
    limit,
    sort: sort || '-createdAt',
    populate: [
      { path: 'customerId', select: 'name code type phone' },
      { path: 'items.productId', select: 'name sku golongan satuan' },
      { path: 'createdBy', select: 'name' },
      { path: 'updatedBy', select: 'name' },
    ],
  });
};

/**
 * Get sales order statistics
 */
const mongoGetStats = async () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    total,
    statusCounts,
    totalValueResult,
    monthlyValueResult,
    topCustomers,
  ] = await Promise.all([
    SalesOrder.countDocuments(),
    SalesOrder.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    SalesOrder.aggregate([
      { $match: { status: { $nin: [SO_STATUS.RETURNED] } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]),
    SalesOrder.aggregate([
      { $match: { orderDate: { $gte: startOfMonth }, status: { $nin: [SO_STATUS.RETURNED] } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]),
    SalesOrder.aggregate([
      { $match: { status: { $nin: [SO_STATUS.CANCELED] } } },
      {
        $group: {
          _id: '$customerId',
          totalOrders: { $sum: 1 },
          totalValue: { $sum: '$totalAmount' },
        },
      },
      { $sort: { totalValue: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'customers',
          localField: '_id',
          foreignField: '_id',
          as: 'customer',
        },
      },
      { $unwind: '$customer' },
      {
        $project: {
          customerId: '$_id',
          name: '$customer.name',
          totalOrders: 1,
          totalValue: 1,
        },
      },
    ]),
  ]);

  const statusMap = {};
  for (const s of statusCounts) {
    const normalized = normalizeSoStatus(s._id);
    statusMap[normalized] = (statusMap[normalized] || 0) + s.count;
  }

  const totalValue = totalValueResult[0]?.total || 0;
  const totalValueThisMonth = monthlyValueResult[0]?.total || 0;
  const activeTotal = total - (statusMap[SO_STATUS.RETURNED] || 0);

  return {
    total,
    shipped: statusMap[SO_STATUS.SHIPPED] || 0,
    awaitingPayment: statusMap[SO_STATUS.AWAITING_PAYMENT] || 0,
    returned: statusMap[SO_STATUS.RETURNED] || 0,
    completed: statusMap[SO_STATUS.COMPLETED] || 0,
    totalValue,
    totalValueThisMonth,
    averageOrderValue: activeTotal > 0 ? Math.round(totalValue / activeTotal) : 0,
    topCustomers,
  };
};

/**
 * Get sales order by ID
 */
const mongoGetSalesOrderById = async (id) => {
  const so = await SalesOrder.findById(id)
    .populate('customerId', 'name code type phone address izinSarana apoteker sipa creditLimit')
    .populate('items.productId', 'name sku golongan satuan')
    .populate('createdBy', 'name')
    .populate('updatedBy', 'name');

  if (!so) {
    throw ApiError.notFound('Sales order tidak ditemukan');
  }

  return so;
};

/**
 * Create a new sales order
 */
const mongoCreateSalesOrder = async (data, userId) => {
  if (data.fakturNumber === undefined && data.noFaktur !== undefined) {
    data.fakturNumber = data.noFaktur;
  }
  delete data.noFaktur;

  data.items = normalizeSoItems(data.items);
  ensureSoItemQuantities(data.items);

  // Validate customer
  const customer = await Customer.findById(data.customerId);
  if (!customer) {
    throw ApiError.notFound('Customer tidak ditemukan');
  }
  if (!customer.isActive) {
    throw ApiError.badRequest('Customer tidak aktif');
  }

  // Check SIA requirement
  const settings = await AppSetting.getSettings();
  if (settings?.customer?.requireSIA) {
    if (customer.izinSarana?.expiryDate && new Date(customer.izinSarana.expiryDate) < new Date()) {
      throw ApiError.badRequest('Izin Sarana pelanggan sudah expired');
    }
  }

  // Validate all products exist and are active
  const productIds = data.items.map((item) => item.productId);
  const uniqueProductIds = [...new Set(productIds.map(String))];
  const products = await Product.find({ _id: { $in: uniqueProductIds } });

  if (products.length !== uniqueProductIds.length) {
    throw ApiError.badRequest('Satu atau lebih produk tidak ditemukan');
  }

  const inactiveProduct = products.find((p) => !p.isActive);
  if (inactiveProduct) {
    throw ApiError.badRequest(`Produk "${inactiveProduct.name}" tidak aktif`);
  }

  // Default shipping address from customer
  if (!data.shippingAddress && customer.address) {
    const addr = customer.address;
    const parts = [addr.street, addr.city, addr.province].filter(Boolean);
    data.shippingAddress = parts.join(', ');
  }

  // Default payment term from settings
  if (data.paymentTermDays === undefined || data.paymentTermDays === null) {
    data.paymentTermDays = settings?.invoice?.defaultPaymentTermDays ?? 30;
  }

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

  const { ppnRate } = await getPpnConfig();
  const baseData = { ...data, status: SO_STATUS.DRAFT, createdBy: userId, updatedBy: userId };
  delete baseData.suratJalanNumber;

  const results = [];

  const createSingleSO = async (items, category) => {
    const soData = { ...baseData, items, soCategory: category };
    const so = new SalesOrder(soData);
    so.calculateTotals(ppnRate);
    await so.save();
    return so;
  };

  if (obatItems.length > 0) {
    results.push(await createSingleSO(obatItems, 'obat'));
  }
  if (alkesItems.length > 0) {
    results.push(await createSingleSO(alkesItems, 'alkes'));
  }

  return results;
};

/**
 * Update a sales order
 */
const mongoUpdateSalesOrder = async (id, data, userId) => {
  const so = await SalesOrder.findById(id);
  if (!so) {
    throw ApiError.notFound('Sales order tidak ditemukan');
  }

  if (data.fakturNumber === undefined && data.noFaktur !== undefined) {
    data.fakturNumber = data.noFaktur;
  }
  delete data.noFaktur;

  const normalizedStatus = normalizeSoStatus(so.status);
  if (so.status !== normalizedStatus) {
    so.status = normalizedStatus;
  }

  if (normalizedStatus !== SO_STATUS.DRAFT) {
    throw ApiError.badRequest('SO hanya dapat diedit saat berstatus draft');
  }

  // Validate customer if changed
  if (data.customerId) {
    const customer = await Customer.findById(data.customerId);
    if (!customer) throw ApiError.notFound('Customer tidak ditemukan');
    if (!customer.isActive) throw ApiError.badRequest('Customer tidak aktif');
  }

  // Validate products if items changed
  if (data.items) {
    data.items = normalizeSoItems(data.items);
    ensureSoItemQuantities(data.items);

    const productIds = data.items.map((item) => item.productId);
    const uniqueProductIds = [...new Set(productIds.map(String))];
    const products = await Product.find({ _id: { $in: uniqueProductIds } });
    if (products.length !== uniqueProductIds.length) {
      throw ApiError.badRequest('Satu atau lebih produk tidak ditemukan');
    }
    const inactiveProduct = products.find((p) => !p.isActive);
    if (inactiveProduct) {
      throw ApiError.badRequest(`Produk "${inactiveProduct.name}" tidak aktif`);
    }
  }

  // Check duplicate surat jalan number
  if (data.suratJalanNumber) {
    const existing = await SalesOrder.findOne({
      _id: { $ne: id },
      suratJalanNumber: data.suratJalanNumber,
    });
    if (existing) {
      throw ApiError.conflict('Nomor surat jalan sudah digunakan');
    }
  }

  data.updatedBy = userId;

  Object.assign(so, data);

  // Recalculate totals
  const { ppnRate } = await getPpnConfig();
  so.calculateTotals(ppnRate);

  await so.save();

  return so;
};

/**
 * Delete a sales order
 */
const mongoDeleteSalesOrder = async (id) => {
  const so = await SalesOrder.findById(id);
  if (!so) {
    throw ApiError.notFound('Sales order tidak ditemukan');
  }

  const normalizedStatus = normalizeSoStatus(so.status);
  if (so.status !== normalizedStatus) {
    so.status = normalizedStatus;
  }

  if (normalizedStatus !== SO_STATUS.DRAFT) {
    throw ApiError.badRequest('SO hanya dapat dihapus saat berstatus draft');
  }

  await so.deleteOne();
};

/**
 * Change SO status
 */
const mongoChangeStatus = async (id, newStatus, notes, userId) => {
  void notes;

  const so = await SalesOrder.findById(id);
  if (!so) {
    throw ApiError.notFound('Sales order tidak ditemukan');
  }

  const currentStatus = normalizeSoStatus(so.status);
  if (so.status !== currentStatus) {
    so.status = currentStatus;
  }

  if (currentStatus === newStatus) {
    if (so.isModified('status')) {
      await so.save();
    }
    return so;
  }

  const allowed = STATUS_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) {
    throw ApiError.badRequest(`Tidak dapat mengubah status dari '${currentStatus}' ke '${newStatus}'`);
  }

  so.status = newStatus;
  so.updatedBy = userId;

  // Set timestamp fields
  const now = new Date();

  if (newStatus === SO_STATUS.SHIPPED) {
    so.shippedAt = now;
    await inventoryService.createDeliveryMutations(toDeliveryLikePayload(so), userId);
  }

  if (newStatus === SO_STATUS.COMPLETED) {
    so.completedAt = now;
  }

  if (newStatus === SO_STATUS.RETURNED) {
    so.returnedAt = now;
    await inventoryService.revertDeliveryMutations(toDeliveryLikePayload(so), userId);
  }

  await so.save();
  return so;
};

// ─── MySQL Helpers ───

const mapSoRow = (row, items = []) => ({
  id: row.id, _id: row.id,
  suratJalanNumber: row.surat_jalan_number,
  fakturNumber: row.faktur_number,
  soCategory: row.so_category,
  status: row.status,
  customerId: row.customer_id ? { _id: row.customer_id, id: row.customer_id, name: row.customer_name, code: row.customer_code, type: row.customer_type, phone: row.customer_phone } : null,
  orderDate: row.order_date,
  deliveryDate: row.delivery_date,
  packedAt: row.packed_at, shippedAt: row.shipped_at, completedAt: row.completed_at, returnedAt: row.returned_at,
  paymentTermDays: row.payment_term_days,
  shippingAddress: row.shipping_address,
  items: items.map((i) => ({
    id: i.id, _id: i.id,
    productId: { _id: i.product_id, id: i.product_id, name: i.product_name, sku: i.product_sku, golongan: i.product_golongan, satuan: i.product_satuan },
    satuan: i.satuan, quantity: i.quantity, unitPrice: Number(i.unit_price), discount: Number(i.discount), subtotal: Number(i.subtotal),
    batchNumber: i.batch_number, expiryDate: i.expiry_date, notes: i.notes,
  })),
  subtotal: Number(row.subtotal), ppnRate: Number(row.ppn_rate), ppnAmount: Number(row.ppn_amount), totalAmount: Number(row.total_amount),
  paidAmount: Number(row.paid_amount), remainingAmount: Number(row.remaining_amount),
  notes: row.notes,
  createdBy: row.created_by ? { _id: row.created_by, name: row.created_by_name } : null,
  updatedBy: row.updated_by ? { _id: row.updated_by, name: row.updated_by_name } : null,
  createdAt: row.created_at, updatedAt: row.updated_at,
});

const getSoWithItems = async (pool, id) => {
  const [rows] = await pool.query(
    `SELECT so.*, c.name as customer_name, c.code as customer_code, c.type as customer_type, c.phone as customer_phone, u1.name as created_by_name, u2.name as updated_by_name
     FROM sales_orders so LEFT JOIN customers c ON so.customer_id = c.id LEFT JOIN users u1 ON so.created_by = u1.id LEFT JOIN users u2 ON so.updated_by = u2.id
     WHERE so.id = ? LIMIT 1`, [id],
  );
  if (rows.length === 0) return null;
  const [items] = await pool.query(
    `SELECT soi.*, p.name as product_name, p.sku as product_sku, p.golongan as product_golongan, p.satuan as product_satuan
     FROM sales_order_items soi LEFT JOIN products p ON soi.product_id = p.id
     WHERE soi.sales_order_id = ? ORDER BY soi.sort_order ASC`, [id],
  );
  return mapSoRow(rows[0], items);
};

const ROMAN_MONTHS = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII'];

const generateSuratJalanNumber = async (pool, category = 'obat') => {
  const now = new Date();
  const year = now.getFullYear();
  const romanMonth = ROMAN_MONTHS[now.getMonth()];
  const typeCode = category === 'alkes' ? 'A' : 'F';
  const suffix = `/${typeCode}/SJ/${romanMonth}/IMP/${year}`;

  const [rows] = await pool.query(
    'SELECT surat_jalan_number FROM sales_orders WHERE surat_jalan_number LIKE ? ORDER BY surat_jalan_number DESC LIMIT 1',
    [`%${suffix}`],
  );

  let nextNum = 1;
  if (rows.length > 0) {
    const lastNum = parseInt(rows[0].surat_jalan_number.split('/')[0], 10);
    if (!isNaN(lastNum)) nextNum = lastNum + 1;
  }
  return `${String(nextNum).padStart(4, '0')}${suffix}`;
};

// ─── MySQL Implementations ───

const mysqlGetSalesOrders = async (queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const { page = 1, limit = 10, search, status, customerId, dateFrom, dateTo } = queryParams;
  const offset = (Number(page) - 1) * Number(limit);
  const whereClauses = []; const params = [];
  if (search) { whereClauses.push('(so.surat_jalan_number LIKE ? OR so.faktur_number LIKE ?)'); const sl = `%${search}%`; params.push(sl, sl); }
  if (status) { const statuses = status.split(',').map((s) => s.trim()); whereClauses.push(`so.status IN (${statuses.map(() => '?').join(',')})`); params.push(...statuses); }
  if (customerId) { whereClauses.push('so.customer_id = ?'); params.push(customerId); }
  if (dateFrom) { whereClauses.push('so.order_date >= ?'); params.push(new Date(dateFrom)); }
  if (dateTo) { whereClauses.push('so.order_date <= ?'); params.push(new Date(`${dateTo}T23:59:59.999Z`)); }
  const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM sales_orders so ${where}`, params);
  const [rows] = await pool.query(
    `SELECT so.*, c.name as customer_name, c.code as customer_code, c.type as customer_type, u1.name as created_by_name, u2.name as updated_by_name
     FROM sales_orders so LEFT JOIN customers c ON so.customer_id = c.id LEFT JOIN users u1 ON so.created_by = u1.id LEFT JOIN users u2 ON so.updated_by = u2.id
     ${where} ORDER BY so.created_at DESC LIMIT ? OFFSET ?`, [...params, Number(limit), offset],
  );
  const soIds = rows.map((r) => r.id); let itemsMap = {};
  if (soIds.length > 0) {
    const [allItems] = await pool.query(
      `SELECT soi.*, p.name as product_name, p.sku as product_sku FROM sales_order_items soi LEFT JOIN products p ON soi.product_id = p.id WHERE soi.sales_order_id IN (${soIds.map(() => '?').join(',')}) ORDER BY soi.sort_order ASC`, soIds,
    );
    for (const item of allItems) { (itemsMap[item.sales_order_id] = itemsMap[item.sales_order_id] || []).push(item); }
  }
  return { docs: rows.map((r) => mapSoRow(r, itemsMap[r.id] || [])), pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } };
};

const mysqlGetStats = async () => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const now = new Date(); const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [[totalRow], [statusRows], [totalValRow], [monthValRow], [topCustRows]] = await Promise.all([
    pool.query('SELECT COUNT(*) as total FROM sales_orders'),
    pool.query('SELECT status, COUNT(*) as count FROM sales_orders GROUP BY status'),
    pool.query('SELECT SUM(total_amount) as total FROM sales_orders WHERE status != ?', [SO_STATUS.RETURNED]),
    pool.query('SELECT SUM(total_amount) as total FROM sales_orders WHERE order_date >= ? AND status != ?', [startOfMonth, SO_STATUS.RETURNED]),
    pool.query(`SELECT so.customer_id, c.name, COUNT(*) as total_orders, SUM(so.total_amount) as total_value FROM sales_orders so JOIN customers c ON so.customer_id = c.id WHERE so.status != ? GROUP BY so.customer_id, c.name ORDER BY total_value DESC LIMIT 5`, [SO_STATUS.RETURNED]),
  ]);
  const statusMap = {}; for (const s of statusRows) statusMap[normalizeSoStatus(s.status)] = (statusMap[normalizeSoStatus(s.status)] || 0) + s.count;
  const total = Number(totalRow.total || 0); const totalValue = Number(totalValRow.total || 0); const totalValueThisMonth = Number(monthValRow.total || 0);
  const activeTotal = total - (statusMap[SO_STATUS.RETURNED] || 0);
  return { total, shipped: statusMap[SO_STATUS.SHIPPED] || 0, awaitingPayment: statusMap[SO_STATUS.AWAITING_PAYMENT] || 0, returned: statusMap[SO_STATUS.RETURNED] || 0, completed: statusMap[SO_STATUS.COMPLETED] || 0, totalValue, totalValueThisMonth, averageOrderValue: activeTotal > 0 ? Math.round(totalValue / activeTotal) : 0, topCustomers: topCustRows };
};

const mysqlGetSalesOrderById = async (id) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const so = await getSoWithItems(pool, id);
  if (!so) throw ApiError.notFound('Sales order tidak ditemukan');
  return so;
};

const mysqlCreateSingleSO = async (pool, data, items, category, userId) => {
  const id = new mongoose.Types.ObjectId().toString();
  const suratJalanNumber = await generateSuratJalanNumber(pool, category);

  // Calculate totals for this subset of items
  let subtotal = 0;
  for (const item of items) {
    subtotal += item.subtotal || item.quantity * item.unitPrice * (1 - (item.discount || 0) / 100);
  }
  const ppnRate = 0; // simplified - real logic reads from AppSetting
  const ppnAmount = Math.round(subtotal * ppnRate / 100);
  const totalAmount = subtotal + ppnAmount;

  await pool.query(
    `INSERT INTO sales_orders (id, surat_jalan_number, faktur_number, so_category, status, customer_id, order_date, delivery_date, payment_term_days, shipping_address, subtotal, ppn_rate, ppn_amount, total_amount, paid_amount, remaining_amount, notes, created_by, updated_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,NOW(),NOW())`,
    [id, suratJalanNumber, data.fakturNumber || null, category, SO_STATUS.DRAFT, data.customerId, data.orderDate || new Date(), data.deliveryDate || null, data.paymentTermDays ?? 30, data.shippingAddress || null, subtotal, ppnRate, ppnAmount, totalAmount, totalAmount, data.notes || null, userId, userId],
  );

  for (let i = 0; i < items.length; i++) {
    const item = items[i]; const itemId = new mongoose.Types.ObjectId().toString();
    const itemSubtotal = item.subtotal || item.quantity * item.unitPrice * (1 - (item.discount || 0) / 100);
    // eslint-disable-next-line no-await-in-loop
    await pool.query('INSERT INTO sales_order_items (id, sales_order_id, product_id, satuan, quantity, unit_price, discount, subtotal, batch_number, expiry_date, notes, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [itemId, id, item.productId, item.satuan, item.quantity, item.unitPrice, item.discount || 0, itemSubtotal, item.batchNumber || null, item.expiryDate || null, item.notes || null, i]);
  }

  return id;
};

const mysqlCreateSalesOrder = async (data, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  if (data.fakturNumber === undefined && data.noFaktur !== undefined) { data.fakturNumber = data.noFaktur; }
  delete data.noFaktur;
  data.items = normalizeSoItems(data.items);
  ensureSoItemQuantities(data.items);
  const [[customer]] = await pool.query('SELECT id, name, is_active, address_street, address_city, address_province FROM customers WHERE id = ? LIMIT 1', [data.customerId]);
  if (!customer) throw ApiError.notFound('Customer tidak ditemukan');
  if (!customer.is_active) throw ApiError.badRequest('Customer tidak aktif');
  const productIds = data.items.map((item) => item.productId);
  const uniqueProductIds = [...new Set(productIds.map(String))];
  const [products] = await pool.query(`SELECT id, name, is_active, golongan FROM products WHERE id IN (${uniqueProductIds.map(() => '?').join(',')})`, uniqueProductIds);
  if (products.length !== uniqueProductIds.length) throw ApiError.badRequest('Satu atau lebih produk tidak ditemukan');
  const ip = products.find((p) => !p.is_active); if (ip) throw ApiError.badRequest(`Produk "${ip.name}" tidak aktif`);
  if (!data.shippingAddress) { const parts = [customer.address_street, customer.address_city, customer.address_province].filter(Boolean); data.shippingAddress = parts.join(', ') || null; }

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
    createdIds.push(await mysqlCreateSingleSO(pool, data, obatItems, 'obat', userId));
  }
  if (alkesItems.length > 0) {
    createdIds.push(await mysqlCreateSingleSO(pool, data, alkesItems, 'alkes', userId));
  }

  const results = [];
  for (const soId of createdIds) {
    results.push(await getSoWithItems(pool, soId));
  }
  return results;
};

const mysqlUpdateSalesOrder = async (id, data, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[existing]] = await pool.query('SELECT id, status FROM sales_orders WHERE id = ? LIMIT 1', [id]);
  if (!existing) throw ApiError.notFound('Sales order tidak ditemukan');
  if (normalizeSoStatus(existing.status) !== SO_STATUS.DRAFT) throw ApiError.badRequest('SO hanya dapat diedit saat berstatus draft');
  if (data.fakturNumber === undefined && data.noFaktur !== undefined) { data.fakturNumber = data.noFaktur; }
  delete data.noFaktur;
  const fieldMap = { fakturNumber: 'faktur_number', suratJalanNumber: 'surat_jalan_number', orderDate: 'order_date', deliveryDate: 'delivery_date', paymentTermDays: 'payment_term_days', shippingAddress: 'shipping_address', notes: 'notes' };
  if (data.customerId) fieldMap.customerId = 'customer_id';
  const setClauses = ['updated_by = ?', 'updated_at = NOW()']; const values = [userId];
  for (const [key, col] of Object.entries(fieldMap)) { if (data[key] !== undefined) { setClauses.push(`${col} = ?`); values.push(data[key]); } }
  values.push(id);
  await pool.query(`UPDATE sales_orders SET ${setClauses.join(', ')} WHERE id = ?`, values);
  if (data.items) {
    data.items = normalizeSoItems(data.items); ensureSoItemQuantities(data.items);
    await pool.query('DELETE FROM sales_order_items WHERE sales_order_id = ?', [id]);
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i]; const itemId = new mongoose.Types.ObjectId().toString();
      // eslint-disable-next-line no-await-in-loop
      await pool.query('INSERT INTO sales_order_items (id, sales_order_id, product_id, satuan, quantity, unit_price, discount, subtotal, batch_number, expiry_date, notes, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [itemId, id, item.productId, item.satuan, item.quantity, item.unitPrice, item.discount || 0, item.subtotal || item.quantity * item.unitPrice, item.batchNumber || null, item.expiryDate || null, item.notes || null, i]);
    }
  }
  return mysqlGetSalesOrderById(id);
};

const mysqlDeleteSalesOrder = async (id) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[existing]] = await pool.query('SELECT id, status FROM sales_orders WHERE id = ? LIMIT 1', [id]);
  if (!existing) throw ApiError.notFound('Sales order tidak ditemukan');
  const normalizedStatus = normalizeSoStatus(existing.status);
  if (normalizedStatus !== SO_STATUS.DRAFT) throw ApiError.badRequest('SO hanya dapat dihapus saat berstatus draft');
  await pool.query('DELETE FROM sales_order_items WHERE sales_order_id = ?', [id]);
  await pool.query('DELETE FROM sales_orders WHERE id = ?', [id]);
};

const mysqlChangeStatus = async (id, newStatus, notes, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[existing]] = await pool.query('SELECT id, status, customer_id FROM sales_orders WHERE id = ? LIMIT 1', [id]);
  if (!existing) throw ApiError.notFound('Sales order tidak ditemukan');
  const currentStatus = normalizeSoStatus(existing.status);
  if (currentStatus === newStatus) return mysqlGetSalesOrderById(id);
  const allowed = STATUS_TRANSITIONS[currentStatus];
  if (!allowed || !allowed.includes(newStatus)) throw ApiError.badRequest(`Tidak dapat mengubah status dari '${currentStatus}' ke '${newStatus}'`);
  const setClauses = ['status = ?', 'updated_by = ?', 'updated_at = NOW()']; const values = [newStatus, userId];
  const now = new Date();
  if (newStatus === SO_STATUS.SHIPPED) { setClauses.push('shipped_at = ?'); values.push(now); }
  if (newStatus === SO_STATUS.COMPLETED) { setClauses.push('completed_at = ?'); values.push(now); }
  if (newStatus === SO_STATUS.RETURNED) { setClauses.push('returned_at = ?'); values.push(now); }
  values.push(id);
  await pool.query(`UPDATE sales_orders SET ${setClauses.join(', ')} WHERE id = ?`, values);

  // Fetch full SO for side effects
  const so = await getSoWithItems(pool, id);
  const deliveryPayload = {
    _id: so.id,
    salesOrderId: so.id,
    customerId: so.customerId?._id || so.customerId,
    deliveryNumber: so.suratJalanNumber,
    shippedAt: so.shippedAt,
    updatedBy: userId,
    items: (so.items || []).map((item) => ({
      productId: item.productId?._id || item.productId,
      satuan: item.satuan,
      quantityOrdered: Number(item.quantity || 0),
      quantityShipped: Number(item.quantity || 0),
      batchNumber: item.batchNumber || null,
      expiryDate: item.expiryDate || null,
    })),
  };

  // Side effect: create stock OUT mutations on shipped
  if (newStatus === SO_STATUS.SHIPPED) {
    await inventoryService.createDeliveryMutations(deliveryPayload, userId);
  }

  // INVOICED status is now set via generateInvoice endpoint

  // Side effect: revert stock mutations on returned
  if (newStatus === SO_STATUS.RETURNED) {
    await inventoryService.revertDeliveryMutations(deliveryPayload, userId);
  }

  return mysqlGetSalesOrderById(id);
};

// ─── Generate Invoice from Multiple SOs ───

const mongoGenerateInvoice = async (salesOrderIds, userId) => {
  const orders = await SalesOrder.find({ _id: { $in: salesOrderIds } })
    .populate('customerId', 'name code type phone')
    .populate('items.productId', 'name sku golongan satuan');

  if (orders.length !== salesOrderIds.length) {
    throw ApiError.badRequest('Satu atau lebih sales order tidak ditemukan');
  }

  // All SOs must be shipped
  for (const so of orders) {
    const normalized = normalizeSoStatus(so.status);
    if (normalized !== SO_STATUS.SHIPPED) {
      throw ApiError.badRequest(`SO ${so.suratJalanNumber} belum berstatus shipped`);
    }
  }

  // All SOs must belong to the same customer
  const customerIds = [...new Set(orders.map((so) => so.customerId._id?.toString() || so.customerId.toString()))];
  if (customerIds.length > 1) {
    throw ApiError.badRequest('Semua surat jalan harus milik customer yang sama');
  }

  // Create invoice(s) via finance service — splits obat/alkes
  const invoices = await financeService.createInvoiceFromMultipleSOs(orders, userId);

  // Build invoice number map by category
  const invoiceNumberMap = {};
  for (const inv of invoices) {
    const cat = inv.invoiceCategory || 'obat';
    invoiceNumberMap[cat] = inv.invoiceNumber;
  }

  // Update all SOs to awaiting_payment, set fakturNumber, and create COGS journals
  const now = new Date();
  for (const so of orders) {
    so.status = SO_STATUS.AWAITING_PAYMENT;
    so.updatedBy = userId;

    // Set fakturNumber from matching invoice category
    const soCat = so.soCategory || 'obat';
    if (invoiceNumberMap[soCat]) {
      so.fakturNumber = invoiceNumberMap[soCat];
    } else if (invoices.length === 1) {
      so.fakturNumber = invoices[0].invoiceNumber;
    }

    // eslint-disable-next-line no-await-in-loop
    await so.save();

    // Create COGS journal for each SO
    try {
      // eslint-disable-next-line no-await-in-loop
      await financeService.createCOGSJournal(toDeliveryLikePayload(so));
    } catch (error) {
      logger.error(`Failed to create COGS journal for SO ${so.suratJalanNumber}: ${error.message}`);
    }
  }

  return invoices;
};

const mysqlGenerateInvoice = async (salesOrderIds, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');

  // Fetch all SOs with items
  const orders = [];
  for (const soId of salesOrderIds) {
    // eslint-disable-next-line no-await-in-loop
    const so = await getSoWithItems(pool, soId);
    if (!so) throw ApiError.badRequest(`Sales order ${soId} tidak ditemukan`);
    orders.push(so);
  }

  // All SOs must be shipped
  for (const so of orders) {
    const normalized = normalizeSoStatus(so.status);
    if (normalized !== SO_STATUS.SHIPPED) {
      throw ApiError.badRequest(`SO ${so.suratJalanNumber} belum berstatus shipped`);
    }
  }

  // All SOs must belong to the same customer
  const customerIds = [...new Set(orders.map((so) => so.customerId?._id?.toString() || so.customerId?.toString()))];
  if (customerIds.length > 1) {
    throw ApiError.badRequest('Semua surat jalan harus milik customer yang sama');
  }

  // Create invoice(s) via finance service — splits obat/alkes
  const invoices = await financeService.createInvoiceFromMultipleSOs(orders, userId);

  // Build invoice number map by category
  const invoiceNumberMap = {};
  for (const inv of invoices) {
    const cat = inv.invoiceCategory || 'obat';
    invoiceNumberMap[cat] = inv.invoiceNumber;
  }

  // Update all SOs to awaiting_payment, set fakturNumber, and create COGS journals
  const now = new Date();
  for (const so of orders) {
    // Determine fakturNumber from matching invoice category
    const soCat = so.soCategory || 'obat';
    let fakturNumber = invoiceNumberMap[soCat] || null;
    if (!fakturNumber && invoices.length === 1) {
      fakturNumber = invoices[0].invoiceNumber;
    }

    // eslint-disable-next-line no-await-in-loop
    await pool.query('UPDATE sales_orders SET status = ?, faktur_number = COALESCE(?, faktur_number), updated_by = ?, updated_at = NOW() WHERE id = ?', [SO_STATUS.AWAITING_PAYMENT, fakturNumber, userId, so._id]);

    const deliveryPayload = {
      _id: so._id,
      salesOrderId: so._id,
      customerId: so.customerId?._id || so.customerId,
      deliveryNumber: so.suratJalanNumber,
      shippedAt: so.shippedAt,
      updatedBy: userId,
      items: (so.items || []).map((item) => ({
        productId: item.productId?._id || item.productId,
        satuan: item.satuan,
        quantityOrdered: Number(item.quantity || 0),
        quantityShipped: Number(item.quantity || 0),
        batchNumber: item.batchNumber || null,
        expiryDate: item.expiryDate || null,
      })),
    };

    try {
      // eslint-disable-next-line no-await-in-loop
      await financeService.createCOGSJournal(deliveryPayload);
    } catch (err) {
      logger.error(`Failed to create COGS journal for SO ${so.suratJalanNumber}: ${err.message}`);
    }
  }

  return invoices;
};

// ─── Exported Functions with Provider Branching ───

const getSalesOrders = (q) => config.dbProvider === 'mysql' ? mysqlGetSalesOrders(q) : mongoGetSalesOrders(q);
const getStats = () => config.dbProvider === 'mysql' ? mysqlGetStats() : mongoGetStats();
const getSalesOrderById = (id) => config.dbProvider === 'mysql' ? mysqlGetSalesOrderById(id) : mongoGetSalesOrderById(id);
const createSalesOrder = (data, userId) => config.dbProvider === 'mysql' ? mysqlCreateSalesOrder(data, userId) : mongoCreateSalesOrder(data, userId);
const updateSalesOrder = (id, data, userId) => config.dbProvider === 'mysql' ? mysqlUpdateSalesOrder(id, data, userId) : mongoUpdateSalesOrder(id, data, userId);
const deleteSalesOrder = (id) => config.dbProvider === 'mysql' ? mysqlDeleteSalesOrder(id) : mongoDeleteSalesOrder(id);
const changeStatus = (id, newStatus, notes, userId) => config.dbProvider === 'mysql' ? mysqlChangeStatus(id, newStatus, notes, userId) : mongoChangeStatus(id, newStatus, notes, userId);
const generateInvoice = (salesOrderIds, userId) => config.dbProvider === 'mysql' ? mysqlGenerateInvoice(salesOrderIds, userId) : mongoGenerateInvoice(salesOrderIds, userId);

module.exports = { getSalesOrders, getStats, getSalesOrderById, createSalesOrder, updateSalesOrder, deleteSalesOrder, changeStatus, generateInvoice };
