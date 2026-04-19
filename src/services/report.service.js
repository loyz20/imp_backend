const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { getMySQLPool } = require('../config/database');
const {
  SO_STATUS,
  PO_STATUS,
  INVOICE_STATUS,
  FINANCE_PAYMENT_STATUS,
  PAYMENT_TYPE,
} = require('../constants');

// ═══════════════════════════════════════════════════════════════
// ─── HELPERS ───
// ═══════════════════════════════════════════════════════════════

const getDateRange = (period, dateFrom, dateTo) => {
  const now = new Date();
  let start;
  let end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  switch (period) {
    case 'daily':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      break;
    case 'weekly':
      start = new Date(now.getTime() - 7 * 86400000);
      start.setHours(0, 0, 0, 0);
      break;
    case 'yearly':
      start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      start.setHours(0, 0, 0, 0);
      break;
    case 'custom':
      if (dateFrom) start = new Date(dateFrom);
      if (dateTo) {
        end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
      }
      break;
    case 'monthly':
    default:
      start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      start.setHours(0, 0, 0, 0);
      break;
  }

  const result = {};
  if (start) result.$gte = start;
  if (end) result.$lte = end;
  return result;
};

const getMySQLDateRange = (period, dateFrom, dateTo) => {
  const range = getDateRange(period, dateFrom, dateTo);
  return {
    start: range.$gte || null,
    end: range.$lte || null,
  };
};

const mysqlDateWhere = (column, period, dateFrom, dateTo, where, params) => {
  const { start, end } = getMySQLDateRange(period || 'monthly', dateFrom, dateTo);
  if (start) {
    where.push(`${column} >= ?`);
    params.push(start);
  }
  if (end) {
    where.push(`${column} <= ?`);
    params.push(end);
  }
};

const getMySQLTrendFormat = (period) => {
  switch (period) {
    case 'daily':
      return '%Y-%m-%d';
    case 'weekly':
      return '%x-W%v';
    case 'yearly':
      return '%Y';
    case 'monthly':
    default:
      return '%Y-%m';
  }
};

const getTrendGroupFormat = (period) => {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  switch (period) {
    case 'daily':
      return {
        format: '%Y-%m-%d',
        labelFn: (d) => {
          const dt = new Date(`${d}T00:00:00`);
          if (Number.isNaN(dt.getTime())) return d;
          return `${String(dt.getDate()).padStart(2, '0')} ${months[dt.getMonth()]}`;
        },
      };
    case 'weekly':
      return {
        format: '%x-W%v',
        labelFn: (d) => {
          const match = /^(\d{4})-W(\d{2})$/.exec(d);
          if (!match) return d;
          return `M${match[2]} ${match[1]}`;
        },
      };
    case 'yearly':
      return { format: '%Y', labelFn: (d) => d };
    case 'monthly':
    default:
      return {
        format: '%Y-%m',
        labelFn: (d) => {
          const [y, m] = d.split('-');
          return `${months[parseInt(m, 10) - 1]} ${y}`;
        },
      };
  }
};

const formatCurrency = (v) => Math.round(v || 0);
const formatDate = (d) => {
  if (!d) return '-';
  const dt = new Date(d);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${String(dt.getDate()).padStart(2, '0')} ${months[dt.getMonth()]} ${dt.getFullYear()}`;
};

// ═══════════════════════════════════════════════════════════════
// ─── 13.1 SALES REPORT ───
// ═══════════════════════════════════════════════════════════════

const mysqlGetSalesReport = async (queryParams) => {
  const pool = getMySQLPool();
  const { search, status, customerId, period, dateFrom, dateTo, sort } = queryParams;
  const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(queryParams.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const where = []; const params = [];
  mysqlDateWhere('so.order_date', period, dateFrom, dateTo, where, params);
  if (status) { where.push('so.status = ?'); params.push(status); }
  if (customerId) { where.push('so.customer_id = ?'); params.push(customerId); }
  if (search) {
    where.push('(so.surat_jalan_number LIKE ? OR so.faktur_number LIKE ? OR c.name LIKE ?)');
    const sl = `%${search}%`;
    params.push(sl, sl, sl);
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortField = sort || '-createdAt';
  const requestedSortCol = sortField.replace(/^-/, '');
  const sortColumnMap = {
    invoiceNumber: 'faktur_number',
    invoice_number: 'faktur_number',
    fakturNumber: 'faktur_number',
    faktur_number: 'faktur_number',
    suratJalanNumber: 'surat_jalan_number',
    surat_jalan_number: 'surat_jalan_number',
    orderDate: 'order_date',
    order_date: 'order_date',
    totalAmount: 'total_amount',
    total_amount: 'total_amount',
    status: 'status',
    createdAt: 'created_at',
    created_at: 'created_at',
    updatedAt: 'updated_at',
    updated_at: 'updated_at',
  };
  const sortCol = sortColumnMap[requestedSortCol] || 'created_at';
  const sortDir = sortField.startsWith('-') ? 'DESC' : 'ASC';

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM sales_orders so ${whereClause}`, params);
  const [rows] = await pool.query(
    `SELECT so.*, c.name AS customer_name, c.code AS customer_code, c.type AS customer_type
     FROM sales_orders so LEFT JOIN customers c ON so.customer_id = c.id
     ${whereClause} ORDER BY so.${sortCol} ${sortDir} LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const totalPages = Math.ceil(total / limit);
  const docs = rows.map((r) => ({
    _id: r.id,
    invoiceNumber: r.faktur_number || r.invoice_number || null,
    suratJalanNumber: r.surat_jalan_number,
    orderDate: r.order_date,
    totalAmount: Number(r.total_amount),
    status: r.status,
    customer: { _id: r.customer_id, name: r.customer_name, code: r.customer_code, type: r.customer_type },
    createdAt: r.created_at,
  }));

  return { docs, pagination: { totalDocs: total, totalPages, page, limit, hasNextPage: page < totalPages, hasPrevPage: page > 1 } };
};

const mysqlGetSalesStats = async (queryParams) => {
  const pool = getMySQLPool();
  const { status, customerId, period, dateFrom, dateTo } = queryParams;
  const where = []; const params = [];
  mysqlDateWhere('order_date', period, dateFrom, dateTo, where, params);
  if (status) { where.push('status = ?'); params.push(status); }
  if (customerId) { where.push('customer_id = ?'); params.push(customerId); }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [[agg]] = await pool.query(
    `SELECT COALESCE(SUM(total_amount),0) as totalSales, COUNT(*) as totalOrders FROM sales_orders ${whereClause}`,
    params,
  );
  const [[{ cnt }]] = await pool.query(
    'SELECT COUNT(*) as cnt FROM sales_orders WHERE status = ? AND completed_at >= ?',
    [SO_STATUS.COMPLETED, startOfMonth],
  );

  return {
    totalSales: formatCurrency(agg.totalSales),
    totalOrders: agg.totalOrders || 0,
    avgOrderValue: agg.totalOrders ? formatCurrency(agg.totalSales / agg.totalOrders) : 0,
    completedThisMonth: cnt,
  };
};

const mysqlGetSalesChart = async (queryParams) => {
  const pool = getMySQLPool();
  const { status, customerId, period, dateFrom, dateTo } = queryParams;
  const where = []; const params = [];
  mysqlDateWhere('so.order_date', period, dateFrom, dateTo, where, params);
  if (status) { where.push('so.status = ?'); params.push(status); }
  if (customerId) { where.push('so.customer_id = ?'); params.push(customerId); }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const dateFormat = getMySQLTrendFormat(period || 'monthly');
  const groupFormat = getTrendGroupFormat(period || 'monthly');

  const [trend] = await pool.query(
    `SELECT DATE_FORMAT(so.order_date, '${dateFormat}') as period_key, SUM(so.total_amount) as total
     FROM sales_orders so ${whereClause} GROUP BY period_key ORDER BY period_key`, params,
  );
  const [topProducts] = await pool.query(
    `SELECT p.name, SUM(soi.quantity) as qty
     FROM sales_order_items soi
     JOIN sales_orders so ON soi.sales_order_id = so.id
     JOIN products p ON soi.product_id = p.id
     ${whereClause} GROUP BY soi.product_id ORDER BY qty DESC LIMIT 10`, params,
  );
  const [byCustomerType] = await pool.query(
    `SELECT c.type as name, SUM(so.total_amount) as value
     FROM sales_orders so LEFT JOIN customers c ON so.customer_id = c.id
     ${whereClause} GROUP BY c.type ORDER BY value DESC`, params,
  );
  const [topCustomers] = await pool.query(
    `SELECT c.name, SUM(so.total_amount) as total
     FROM sales_orders so LEFT JOIN customers c ON so.customer_id = c.id
     ${whereClause} GROUP BY so.customer_id ORDER BY total DESC LIMIT 10`, params,
  );

  return {
    trend: trend.map((t) => ({ label: groupFormat.labelFn(t.period_key), total: formatCurrency(t.total) })),
    topProducts: topProducts.map((t) => ({ name: t.name, qty: Number(t.qty) })),
    byCustomerType: byCustomerType.map((t) => ({ name: t.name, value: Number(t.value) })),
    topCustomers: topCustomers.map((t) => ({ name: t.name, total: Number(t.total) })),
  };
};

// ═══════════════════════════════════════════════════════════════
// ─── MySQL: PURCHASES REPORT ───
// ═══════════════════════════════════════════════════════════════

const mysqlGetAllPurchasesData = async (queryParams) => {
  const pool = getMySQLPool();
  const { search, status, supplierId, period, dateFrom, dateTo } = queryParams;
  const where = []; const params = [];
  mysqlDateWhere('po.order_date', period, dateFrom, dateTo, where, params);
  if (status) { where.push('po.status = ?'); params.push(status); }
  if (supplierId) { where.push('po.supplier_id = ?'); params.push(supplierId); }
  if (search) { where.push('po.po_number LIKE ?'); params.push(`%${search}%`); }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT po.*, s.name AS supplier_name, s.code AS supplier_code
     FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id
     ${whereClause} ORDER BY po.order_date DESC LIMIT 50000`,
    params,
  );
  return rows.map((r) => ({
    ...r,
    poNumber: r.po_number,
    supplierId: { name: r.supplier_name, code: r.supplier_code },
    orderDate: r.order_date,
    totalAmount: Number(r.total_amount),
  }));
};

const mysqlGetPurchasesReport = async (queryParams) => {
  const pool = getMySQLPool();
  const { search, status, supplierId, period, dateFrom, dateTo, sort } = queryParams;
  const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(queryParams.limit, 10) || 20));
  const offset = (page - 1) * limit;

  const where = []; const params = [];
  mysqlDateWhere('po.order_date', period, dateFrom, dateTo, where, params);
  if (status) { where.push('po.status = ?'); params.push(status); }
  if (supplierId) { where.push('po.supplier_id = ?'); params.push(supplierId); }
  if (search) { where.push('po.po_number LIKE ?'); params.push(`%${search}%`); }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortField = sort || '-createdAt';
  const requestedSortCol = sortField.replace(/^-/, '');
  const sortColumnMap = {
    poNumber: 'po_number',
    po_number: 'po_number',
    orderDate: 'order_date',
    order_date: 'order_date',
    totalAmount: 'total_amount',
    total_amount: 'total_amount',
    status: 'status',
    createdAt: 'created_at',
    created_at: 'created_at',
    updatedAt: 'updated_at',
    updated_at: 'updated_at',
  };
  const sortCol = sortColumnMap[requestedSortCol] || 'created_at';
  const sortDir = sortField.startsWith('-') ? 'DESC' : 'ASC';

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM purchase_orders po ${whereClause}`, params);
  const [rows] = await pool.query(
    `SELECT po.*, s.name AS supplier_name, s.code AS supplier_code
     FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id
     ${whereClause} ORDER BY po.${sortCol} ${sortDir} LIMIT ? OFFSET ?`,
    [...params, limit, offset],
  );

  const totalPages = Math.ceil(total / limit);
  const docs = rows.map((r) => ({
    _id: r.id,
    poNumber: r.po_number,
    orderDate: r.order_date,
    totalAmount: Number(r.total_amount),
    status: r.status,
    supplier: { _id: r.supplier_id, name: r.supplier_name, code: r.supplier_code },
    createdAt: r.created_at,
  }));

  return { docs, pagination: { totalDocs: total, totalPages, page, limit, hasNextPage: page < totalPages, hasPrevPage: page > 1 } };
};

const mysqlGetPurchasesStats = async (queryParams) => {
  const pool = getMySQLPool();
  const { status, supplierId, period, dateFrom, dateTo } = queryParams;
  const where = []; const params = [];
  mysqlDateWhere('order_date', period, dateFrom, dateTo, where, params);
  if (status) { where.push('status = ?'); params.push(status); }
  if (supplierId) { where.push('supplier_id = ?'); params.push(supplierId); }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [[agg]] = await pool.query(
    `SELECT COALESCE(SUM(total_amount),0) as totalPurchases, COUNT(*) as totalOrders FROM purchase_orders ${whereClause}`,
    params,
  );
  const [[{ cnt }]] = await pool.query(
    'SELECT COUNT(*) as cnt FROM purchase_orders WHERE status = ? AND updated_at >= ?',
    [PO_STATUS.RECEIVED, startOfMonth],
  );

  return {
    totalPurchases: formatCurrency(agg.totalPurchases),
    totalOrders: agg.totalOrders || 0,
    avgOrderValue: agg.totalOrders ? formatCurrency(agg.totalPurchases / agg.totalOrders) : 0,
    receivedThisMonth: cnt,
  };
};

const mysqlGetPurchasesChart = async (queryParams) => {
  const pool = getMySQLPool();
  const { status, supplierId, period, dateFrom, dateTo } = queryParams;
  const where = []; const params = [];
  mysqlDateWhere('po.order_date', period, dateFrom, dateTo, where, params);
  if (status) { where.push('po.status = ?'); params.push(status); }
  if (supplierId) { where.push('po.supplier_id = ?'); params.push(supplierId); }
  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const dateFormat = getMySQLTrendFormat(period || 'monthly');
  const groupFormat = getTrendGroupFormat(period || 'monthly');

  const [trend] = await pool.query(
    `SELECT DATE_FORMAT(po.order_date, '${dateFormat}') as period_key, SUM(po.total_amount) as total
     FROM purchase_orders po ${whereClause} GROUP BY period_key ORDER BY period_key`, params,
  );
  const [topSuppliers] = await pool.query(
    `SELECT s.name, SUM(po.total_amount) as total
     FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id
     ${whereClause} GROUP BY po.supplier_id ORDER BY total DESC LIMIT 10`, params,
  );
  const [byCategory] = await pool.query(
    `SELECT p.category as name, SUM(poi.subtotal) as value
     FROM purchase_order_items poi
     JOIN purchase_orders po ON poi.purchase_order_id = po.id
     JOIN products p ON poi.product_id = p.id
     ${whereClause} GROUP BY p.category ORDER BY value DESC`, params,
  );
  const [topProducts] = await pool.query(
    `SELECT p.name, SUM(poi.quantity) as qty
     FROM purchase_order_items poi
     JOIN purchase_orders po ON poi.purchase_order_id = po.id
     JOIN products p ON poi.product_id = p.id
     ${whereClause} GROUP BY poi.product_id ORDER BY qty DESC LIMIT 10`, params,
  );

  return {
    trend: trend.map((t) => ({ label: groupFormat.labelFn(t.period_key), total: formatCurrency(t.total) })),
    topSuppliers: topSuppliers.map((t) => ({ name: t.name, total: Number(t.total) })),
    byCategory: byCategory.map((t) => ({ name: t.name, value: Number(t.value) })),
    topProducts: topProducts.map((t) => ({ name: t.name, qty: Number(t.qty) })),
  };
};

// ═══════════════════════════════════════════════════════════════
// ─── MySQL: STOCK REPORT ───
// ═══════════════════════════════════════════════════════════════

const mysqlBuildStockWhere = (queryParams) => {
  const { kategori, golongan, stockStatus, search } = queryParams;
  const where = ['p.is_active = 1'];
  const params = [];
  if (kategori) { where.push('p.category = ?'); params.push(kategori); }
  if (golongan) { where.push('p.golongan = ?'); params.push(golongan); }
  if (search) { where.push('(p.name LIKE ? OR p.sku LIKE ? OR p.code LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  return { where, params, stockStatus };
};

const mysqlStockBaseQuery = (where, stockStatusFilter) => {
  let q = `SELECT p.id, p.sku, p.name, p.category, p.golongan, p.satuan, p.satuan_kecil, p.stok_minimum,
    COALESCE(sb.total_stock, 0) AS total_stock,
    COALESCE(sb.stock_value, 0) AS stock_value,
    CASE
      WHEN COALESCE(sb.total_stock, 0) = 0 THEN 'out_of_stock'
      WHEN COALESCE(sb.total_stock, 0) <= COALESCE(p.stok_minimum, 10) THEN 'low_stock'
      ELSE 'in_stock'
    END AS stock_status
    FROM products p
    LEFT JOIN (
      SELECT product_id, SUM(quantity) as total_stock, SUM(quantity * unit_price) as stock_value
      FROM stock_batches WHERE status = 'active' GROUP BY product_id
    ) sb ON sb.product_id = p.id
    WHERE ${where.join(' AND ')}`;
  if (stockStatusFilter) {
    q = `SELECT * FROM (${q}) AS sub WHERE sub.stock_status = '${stockStatusFilter}'`;
  }
  return q;
};

const mysqlGetStockReport = async (queryParams) => {
  const pool = getMySQLPool();
  const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(queryParams.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const sortField = queryParams.sort || '-totalStock';
  const requestedSortCol = sortField.replace(/^-/, '');
  const sortColumnMap = {
    code: 'code',
    sku: 'sku',
    name: 'name',
    kategori: 'category',
    golongan: 'golongan',
    totalStock: 'total_stock',
    total_stock: 'total_stock',
    stockValue: 'stock_value',
    stock_value: 'stock_value',
    stockStatus: 'stock_status',
    stock_status: 'stock_status',
  };
  const sortCol = sortColumnMap[requestedSortCol] || 'total_stock';
  const sortDir = sortField.startsWith('-') ? 'DESC' : 'ASC';

  const { where, params, stockStatus } = mysqlBuildStockWhere(queryParams);
  const baseQuery = mysqlStockBaseQuery(where, stockStatus);

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM (${baseQuery}) AS cnt`, params);
  const [rows] = await pool.query(`${baseQuery} ORDER BY ${sortCol} ${sortDir} LIMIT ? OFFSET ?`, [...params, limit, offset]);

  const totalPages = Math.ceil(total / limit);
  const docs = rows.map((d) => ({
    _id: d.id,
    code: d.code,
    sku: d.sku,
    name: d.name,
    kategori: d.category,
    golongan: d.golongan,
    totalStock: Number(d.total_stock),
    stockValue: Number(d.stock_value),
    stockStatus: d.stock_status,
    unit: d.satuan || d.satuan_kecil || 'Pcs',
  }));

  return { docs, pagination: { totalDocs: total, totalPages, page, limit, hasNextPage: page < totalPages, hasPrevPage: page > 1 } };
};

const mysqlGetStockStats = async (queryParams) => {
  const pool = getMySQLPool();
  const { where, params, stockStatus } = mysqlBuildStockWhere(queryParams);
  const baseQuery = mysqlStockBaseQuery(where, stockStatus);

  const now = new Date();
  const nearExpiryDate = new Date(now.getTime() + 90 * 86400000);

  const [[agg]] = await pool.query(
    `SELECT COUNT(*) as totalSku, COALESCE(SUM(total_stock),0) as totalQty,
     SUM(CASE WHEN stock_status = 'out_of_stock' THEN 1 ELSE 0 END) as outOfStock
     FROM (${baseQuery}) AS sub`, params,
  );
  const [[{ nearExpiry }]] = await pool.query(
    'SELECT COUNT(*) as nearExpiry FROM stock_batches WHERE status = ? AND quantity > 0 AND expiry_date <= ? AND expiry_date > ?',
    ['active', nearExpiryDate, now],
  );

  return {
    totalSku: agg.totalSku || 0,
    totalQty: Number(agg.totalQty) || 0,
    nearExpiry,
    outOfStock: Number(agg.outOfStock) || 0,
  };
};

const mysqlGetStockChart = async (queryParams) => {
  const pool = getMySQLPool();
  const { where, params, stockStatus } = mysqlBuildStockWhere(queryParams);
  const baseQuery = mysqlStockBaseQuery(where, stockStatus);

  const [byCategory] = await pool.query(
    `SELECT category as name, SUM(total_stock) as qty FROM (${baseQuery}) AS sub GROUP BY category ORDER BY qty DESC`, params,
  );
  const [topProducts] = await pool.query(
    `SELECT name, total_stock as qty FROM (${baseQuery}) AS sub ORDER BY total_stock DESC LIMIT 10`, params,
  );
  const [byGolongan] = await pool.query(
    `SELECT golongan as name, SUM(total_stock) as value FROM (${baseQuery}) AS sub GROUP BY golongan ORDER BY value DESC`, params,
  );
  const [byStatusRaw] = await pool.query(
    `SELECT stock_status as _id, COUNT(*) as value FROM (${baseQuery}) AS sub GROUP BY stock_status`, params,
  );

  const statusMap = { in_stock: 'Tersedia', low_stock: 'Stok Rendah', out_of_stock: 'Habis' };
  const byStatus = ['in_stock', 'low_stock', 'out_of_stock'].map((key) => {
    const found = byStatusRaw.find((s) => s._id === key);
    return { name: statusMap[key], value: found ? Number(found.value) : 0 };
  });

  return {
    byCategory: byCategory.map((r) => ({ name: r.name, qty: Number(r.qty) })),
    topProducts: topProducts.map((r) => ({ name: r.name, qty: Number(r.qty) })),
    byGolongan: byGolongan.map((r) => ({ name: r.name, value: Number(r.value) })),
    byStatus,
  };
};

// ═══════════════════════════════════════════════════════════════
// ─── MySQL: FINANCE REPORT ───
// ═══════════════════════════════════════════════════════════════

const mysqlGetFinanceReport = async (queryParams) => {
  const pool = getMySQLPool();
  const { period, dateFrom, dateTo } = queryParams;
  const { start, end } = getMySQLDateRange(period || 'monthly', dateFrom, dateTo);

  // Invoice aggregation
  const invWhere = ["inv.status != 'cancelled'"]; const invParams = [];
  if (start) { invWhere.push('inv.invoice_date >= ?'); invParams.push(start); }
  if (end) { invWhere.push('inv.invoice_date <= ?'); invParams.push(end); }
  const invWhereStr = invWhere.length ? `WHERE ${invWhere.join(' AND ')}` : '';

  // Payment date filter
  const payWhere = []; const payParams = [];
  if (start) { payWhere.push('p.payment_date >= ?'); payParams.push(start); }
  if (end) { payWhere.push('p.payment_date <= ?'); payParams.push(end); }

  // Journal date filter
  const jWhere = []; const jParams = [];
  if (start) { jWhere.push('je.date >= ?'); jParams.push(start); }
  if (end) { jWhere.push('je.date <= ?'); jParams.push(end); }

  // Memo date filter
  const mWhere = ["m.status = 'posted'"]; const mParams = [];
  if (start) { mWhere.push('m.approved_at >= ?'); mParams.push(start); }
  if (end) { mWhere.push('m.approved_at <= ?'); mParams.push(end); }

  const [
    [invAgg],
    [incomingAgg],
    [outgoingAgg],
    memoRows,
    [expenseAgg],
    [cogsAgg],
  ] = await Promise.all([
    // Sales revenue from invoices
    pool.query(
      `SELECT COALESCE(SUM(inv.total_amount),0) as salesRevenue, COALESCE(SUM(inv.discount),0) as discount,
       COALESCE(SUM(inv.ppn_amount),0) as ppn
       FROM invoices inv ${invWhereStr}`, invParams,
    ).then(([[r]]) => [r]),
    // Incoming payments (via sales invoices)
    pool.query(
      `SELECT COALESCE(SUM(p.amount),0) as total FROM payments p
       JOIN invoices inv ON p.invoice_id = inv.id
       WHERE inv.invoice_type = 'sales' ${payWhere.length ? 'AND ' + payWhere.join(' AND ') : ''}`,
      payParams,
    ).then(([[r]]) => [r]),
    // Outgoing payments (via purchase invoices)
    pool.query(
      `SELECT COALESCE(SUM(p.amount),0) as total FROM payments p
       JOIN invoices inv ON p.invoice_id = inv.id
       WHERE inv.invoice_type = 'purchase' ${payWhere.length ? 'AND ' + payWhere.join(' AND ') : ''}`,
      payParams,
    ).then(([[r]]) => [r]),
    // Memo aggregation
    pool.query(
      `SELECT m.type as _id, SUM(m.amount) as total FROM memos m WHERE ${mWhere.join(' AND ')} GROUP BY m.type`,
      mParams,
    ).then(([rows]) => rows),
    // Operating expenses (excl COGS 5100)
    pool.query(
      `SELECT COALESCE(SUM(jel.debit),0) as total FROM journal_entry_lines jel
       JOIN journal_entries je ON jel.journal_entry_id = je.id
       JOIN chart_of_accounts coa ON jel.account_id = coa.id
       WHERE coa.category = 'expense' AND coa.code != '5100'
       ${jWhere.length ? 'AND ' + jWhere.join(' AND ') : ''}`, jParams,
    ).then(([[r]]) => [r]),
    // COGS (account 5100)
    pool.query(
      `SELECT COALESCE(SUM(jel.debit),0) as total FROM journal_entry_lines jel
       JOIN journal_entries je ON jel.journal_entry_id = je.id
       JOIN chart_of_accounts coa ON jel.account_id = coa.id
       WHERE coa.code = '5100'
       ${jWhere.length ? 'AND ' + jWhere.join(' AND ') : ''}`, jParams,
    ).then(([[r]]) => [r]),
  ]);

  const salesRevenue = formatCurrency(invAgg.salesRevenue);
  const creditMemo = (memoRows.find((m) => m._id === 'credit_memo') || {}).total || 0;
  const discountReturn = formatCurrency(Number(invAgg.discount || 0) + Number(creditMemo));
  const netRevenue = salesRevenue - discountReturn;
  const cogs = formatCurrency(cogsAgg.total);
  const grossProfit = netRevenue - cogs;
  const operatingExpense = formatCurrency(expenseAgg.total);
  const otherExpense = 0;
  const netProfit = grossProfit - operatingExpense - otherExpense;
  const operatingIn = formatCurrency(incomingAgg.total);
  const operatingOut = formatCurrency(outgoingAgg.total);

  return {
    profitLoss: { salesRevenue, discountReturn, netRevenue, cogs, grossProfit, operatingExpense, otherExpense, netProfit },
    cashFlow: {
      operatingIn, operatingOut, operatingNet: operatingIn - operatingOut,
      investingIn: 0, investingOut: 0, investingNet: 0,
      financingIn: 0, financingOut: 0, financingNet: 0,
      totalNet: operatingIn - operatingOut,
    },
  };
};

const mysqlGetFinanceStats = async (queryParams) => {
  const report = await mysqlGetFinanceReport(queryParams);
  const { profitLoss } = report;
  const totalRevenue = profitLoss.salesRevenue;
  const totalExpense = profitLoss.cogs + profitLoss.operatingExpense + profitLoss.otherExpense;
  const netProfit = profitLoss.netProfit;
  const margin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 1000) / 10 : 0;
  return { totalRevenue, totalExpense, netProfit, margin };
};

const mysqlGetFinanceChart = async (queryParams) => {
  const pool = getMySQLPool();
  const { period, dateFrom, dateTo, months } = queryParams;
  let start; let end; let effectivePeriod = period || 'monthly';
  if (months) {
    const now = new Date();
    start = new Date(now.getFullYear(), now.getMonth() - (Number(months) - 1), 1);
    start.setHours(0, 0, 0, 0);
    end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    effectivePeriod = 'monthly';
  } else {
    ({ start, end } = getMySQLDateRange(effectivePeriod, dateFrom, dateTo));
    if (effectivePeriod === 'custom') {
      const startDate = start || new Date(dateFrom || Date.now());
      const endDate = end || new Date(dateTo || Date.now());
      const daySpan = Math.max(1, Math.ceil((endDate - startDate) / 86400000));
      if (daySpan <= 45) effectivePeriod = 'daily';
      else if (daySpan <= 180) effectivePeriod = 'weekly';
      else if (daySpan <= 730) effectivePeriod = 'monthly';
      else effectivePeriod = 'yearly';
    }
  }
  const dateFormat = getMySQLTrendFormat(effectivePeriod);
  const groupFormat = getTrendGroupFormat(effectivePeriod);

  const invWhere = ["inv.status != 'cancelled'"]; const invParams = [];
  if (start) { invWhere.push('inv.invoice_date >= ?'); invParams.push(start); }
  if (end) { invWhere.push('inv.invoice_date <= ?'); invParams.push(end); }
  const invWhereStr = invWhere.length ? 'WHERE ' + invWhere.join(' AND ') : '';

  const [incomingTrend] = await pool.query(
    `SELECT DATE_FORMAT(inv.invoice_date, '${dateFormat}') as period_key, COALESCE(SUM(inv.total_amount),0) as total
     FROM invoices inv
     ${invWhereStr} AND inv.invoice_type = 'sales'
     GROUP BY period_key ORDER BY period_key`, invParams,
  );
  const [outgoingTrend] = await pool.query(
    `SELECT DATE_FORMAT(inv.invoice_date, '${dateFormat}') as period_key, COALESCE(SUM(inv.total_amount),0) as total
     FROM invoices inv
     ${invWhereStr} AND inv.invoice_type = 'purchase'
     GROUP BY period_key ORDER BY period_key`, invParams,
  );

  const allLabels = new Set([...incomingTrend.map((t) => t.period_key), ...outgoingTrend.map((t) => t.period_key)]);
  const sortedLabels = Array.from(allLabels).sort();
  const inMap = Object.fromEntries(incomingTrend.map((t) => [t.period_key, Number(t.total)]));
  const outMap = Object.fromEntries(outgoingTrend.map((t) => [t.period_key, Number(t.total)]));

  const trend = sortedLabels.map((key) => ({
    label: groupFormat.labelFn(key),
    revenue: formatCurrency(inMap[key]),
    expense: formatCurrency(outMap[key]),
  }));
  const profitTrend = sortedLabels.map((key) => ({
    label: groupFormat.labelFn(key),
    profit: formatCurrency((inMap[key] || 0) - (outMap[key] || 0)),
  }));

  return { trend, profitTrend };
};

// ═══════════════════════════════════════════════════════════════
// ─── MySQL: EXPIRED REPORT ───
// ═══════════════════════════════════════════════════════════════

const mysqlBuildExpiredWhere = (queryParams) => {
  const { expiryStatus, kategori, golongan, dateFrom, dateTo, search } = queryParams;
  const now = new Date();
  const where = ["sb.status = 'active'", 'sb.quantity > 0'];
  const params = [];

  if (dateFrom) { where.push('sb.expiry_date >= ?'); params.push(new Date(dateFrom)); }
  if (dateTo) { where.push('sb.expiry_date <= ?'); params.push(new Date(dateTo)); }

  if (expiryStatus) {
    if (expiryStatus === 'expired') { where.push('sb.expiry_date <= ?'); params.push(now); }
    else if (expiryStatus === 'critical') { where.push('sb.expiry_date > ?'); params.push(now); where.push('sb.expiry_date <= ?'); params.push(new Date(now.getTime() + 30 * 86400000)); }
    else if (expiryStatus === 'warning') { where.push('sb.expiry_date > ?'); params.push(new Date(now.getTime() + 30 * 86400000)); where.push('sb.expiry_date <= ?'); params.push(new Date(now.getTime() + 90 * 86400000)); }
    else if (expiryStatus === 'caution') { where.push('sb.expiry_date > ?'); params.push(new Date(now.getTime() + 90 * 86400000)); where.push('sb.expiry_date <= ?'); params.push(new Date(now.getTime() + 180 * 86400000)); }
  }

  if (!expiryStatus && !dateFrom && !dateTo) {
    where.push('sb.expiry_date <= ?');
    params.push(new Date(now.getTime() + 180 * 86400000));
  }

  if (kategori) { where.push('p.category = ?'); params.push(kategori); }
  if (golongan) { where.push('p.golongan = ?'); params.push(golongan); }
  if (search) { where.push('(p.name LIKE ? OR sb.batch_number LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }

  return { where, params };
};

const mysqlGetExpiredReport = async (queryParams) => {
  const pool = getMySQLPool();
  const now = new Date();
  const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(queryParams.limit, 10) || 20));
  const offset = (page - 1) * limit;
  const sortField = queryParams.sort || 'expiry_date';
  const sortCol = sortField.replace(/^-/, '');
  const sortDir = sortField.startsWith('-') ? 'DESC' : 'ASC';

  const { where, params } = mysqlBuildExpiredWhere(queryParams);
  const whereClause = `WHERE ${where.join(' AND ')} AND p.is_active = 1`;

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) as total FROM stock_batches sb JOIN products p ON sb.product_id = p.id ${whereClause}`, params,
  );
  const [rows] = await pool.query(
    `SELECT sb.id, p.name AS product_name, sb.batch_number, sb.expiry_date, sb.quantity, sb.unit_price,
     DATEDIFF(sb.expiry_date, ?) as days_remaining, p.category, p.golongan
     FROM stock_batches sb JOIN products p ON sb.product_id = p.id
     ${whereClause} ORDER BY ${sortCol === 'expiryDate' ? 'sb.expiry_date' : sortCol} ${sortDir} LIMIT ? OFFSET ?`,
    [now, ...params, limit, offset],
  );

  const totalPages = Math.ceil(total / limit);
  const docs = rows.map((d) => ({
    _id: d.id,
    productName: d.product_name,
    name: d.product_name,
    batchNumber: d.batch_number,
    expiryDate: d.expiry_date,
    daysRemaining: d.days_remaining,
    qty: d.quantity,
    value: d.quantity * Number(d.unit_price),
    kategori: d.category,
    golongan: d.golongan,
    expiryStatus: getExpiryStatus(d.days_remaining),
  }));

  return { docs, pagination: { totalDocs: total, totalPages, page, limit, hasNextPage: page < totalPages, hasPrevPage: page > 1 } };
};

const mysqlGetExpiredStats = async (queryParams) => {
  const pool = getMySQLPool();
  const now = new Date();
  const where = ["sb.status = 'active'", 'sb.quantity > 0'];
  const params = [];

  let joinProduct = false;
  if (queryParams.kategori) { where.push('p.category = ?'); params.push(queryParams.kategori); joinProduct = true; }
  if (queryParams.golongan) { where.push('p.golongan = ?'); params.push(queryParams.golongan); joinProduct = true; }
  const join = joinProduct ? 'JOIN products p ON sb.product_id = p.id' : '';
  const whereClause = `WHERE ${where.join(' AND ')}`;

  const [[s]] = await pool.query(
    `SELECT
      SUM(CASE WHEN sb.expiry_date <= ? THEN 1 ELSE 0 END) as totalExpired,
      SUM(CASE WHEN sb.expiry_date > ? AND sb.expiry_date <= ? THEN 1 ELSE 0 END) as critical,
      SUM(CASE WHEN sb.expiry_date > ? AND sb.expiry_date <= ? THEN 1 ELSE 0 END) as warning,
      SUM(CASE WHEN sb.expiry_date > ? AND sb.expiry_date <= ? THEN 1 ELSE 0 END) as caution
     FROM stock_batches sb ${join} ${whereClause}`,
    [now, now, new Date(now.getTime() + 30 * 86400000),
     new Date(now.getTime() + 30 * 86400000), new Date(now.getTime() + 90 * 86400000),
     new Date(now.getTime() + 90 * 86400000), new Date(now.getTime() + 180 * 86400000),
     ...params],
  );

  return {
    totalExpired: Number(s.totalExpired) || 0,
    critical: Number(s.critical) || 0,
    warning: Number(s.warning) || 0,
    caution: Number(s.caution) || 0,
  };
};

const mysqlGetExpiredChart = async (queryParams) => {
  const pool = getMySQLPool();
  const stats = await mysqlGetExpiredStats(queryParams);

  const byUrgency = [
    { key: 'expired', name: 'Kadaluarsa', count: stats.totalExpired },
    { key: 'critical', name: 'Kritis', count: stats.critical },
    { key: 'warning', name: 'Warning', count: stats.warning },
    { key: 'caution', name: 'Perhatian', count: stats.caution },
  ];

  const now = new Date();
  const bWhere = ["sb.status = 'active'", 'sb.quantity > 0', 'sb.expiry_date <= ?'];
  const bParams = [new Date(now.getTime() + 180 * 86400000)];
  if (queryParams.kategori) { bWhere.push('p.category = ?'); bParams.push(queryParams.kategori); }
  if (queryParams.golongan) { bWhere.push('p.golongan = ?'); bParams.push(queryParams.golongan); }

  const [byGolongan] = await pool.query(
    `SELECT p.golongan as name, COUNT(*) as value
     FROM stock_batches sb JOIN products p ON sb.product_id = p.id
     WHERE ${bWhere.join(' AND ')} GROUP BY p.golongan ORDER BY value DESC`, bParams,
  );

  return { byUrgency, byGolongan: byGolongan.map((r) => ({ name: r.name, value: Number(r.value) })) };
};

// ═══════════════════════════════════════════════════════════════
// ─── MySQL: EXPORT FUNCTIONS ───
// ═══════════════════════════════════════════════════════════════

const mysqlExportSalesExcel = async (queryParams) => {
  const all = await mysqlGetAllSalesData(queryParams);
  const columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: 'No. SO', key: 'invoiceNumber', width: 22 },
    { header: 'Pelanggan', key: 'customer', width: 30 },
    { header: 'Tanggal', key: 'orderDate', width: 16 },
    { header: 'Total (Rp)', key: 'totalAmount', width: 18, style: { numFmt: '#,##0' } },
    { header: 'Status', key: 'status', width: 14 },
  ];
  const rows = all.map((d, i) => ({
    no: i + 1,
    invoiceNumber: d.invoiceNumber,
    customer: d.customerId?.name || '-',
    orderDate: formatDate(d.orderDate),
    totalAmount: d.totalAmount,
    status: d.status,
  }));
  return createExcelWorkbook('Penjualan', columns, rows);
};

const mysqlExportPurchasesExcel = async (queryParams) => {
  const all = await mysqlGetAllPurchasesData(queryParams);
  const columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: 'No. PO', key: 'poNumber', width: 22 },
    { header: 'Supplier', key: 'supplier', width: 30 },
    { header: 'Tanggal', key: 'orderDate', width: 16 },
    { header: 'Total (Rp)', key: 'totalAmount', width: 18, style: { numFmt: '#,##0' } },
    { header: 'Status', key: 'status', width: 14 },
  ];
  const rows = all.map((d, i) => ({
    no: i + 1,
    poNumber: d.poNumber,
    supplier: d.supplierId?.name || '-',
    orderDate: formatDate(d.orderDate),
    totalAmount: d.totalAmount,
    status: d.status,
  }));
  return createExcelWorkbook('Pembelian', columns, rows);
};

const mysqlExportStockExcel = async (queryParams) => {
  const pool = getMySQLPool();
  const { where, params, stockStatus } = mysqlBuildStockWhere(queryParams);
  const baseQuery = mysqlStockBaseQuery(where, stockStatus);
  const [all] = await pool.query(`${baseQuery} ORDER BY total_stock DESC LIMIT 50000`, params);

  const columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: 'Kode', key: 'code', width: 14 },
    { header: 'SKU', key: 'sku', width: 18 },
    { header: 'Nama Produk', key: 'name', width: 32 },
    { header: 'Kategori', key: 'kategori', width: 16 },
    { header: 'Golongan', key: 'golongan', width: 20 },
    { header: 'Stok', key: 'totalStock', width: 10, style: { numFmt: '#,##0' } },
    { header: 'Nilai (Rp)', key: 'stockValue', width: 18, style: { numFmt: '#,##0' } },
    { header: 'Status', key: 'stockStatus', width: 14 },
  ];
  const rows = all.map((d, i) => ({
    no: i + 1,
    code: d.code,
    sku: d.sku,
    name: d.name,
    kategori: d.category,
    golongan: d.golongan,
    totalStock: Number(d.total_stock),
    stockValue: Number(d.stock_value),
    stockStatus: d.stock_status,
  }));
  return createExcelWorkbook('Stok', columns, rows);
};

const mysqlExportFinanceExcel = async (queryParams) => {
  const report = await mysqlGetFinanceReport(queryParams);
  const { profitLoss, cashFlow } = report;
  const columns = [
    { header: 'Keterangan', key: 'label', width: 35 },
    { header: 'Jumlah (Rp)', key: 'amount', width: 22, style: { numFmt: '#,##0' } },
  ];
  const rows = [
    { label: '=== LABA RUGI ===', amount: '' },
    { label: 'Pendapatan Penjualan', amount: profitLoss.salesRevenue },
    { label: 'Diskon & Retur', amount: profitLoss.discountReturn },
    { label: 'Pendapatan Bersih', amount: profitLoss.netRevenue },
    { label: 'Harga Pokok Penjualan', amount: profitLoss.cogs },
    { label: 'Laba Kotor', amount: profitLoss.grossProfit },
    { label: 'Beban Operasional', amount: profitLoss.operatingExpense },
    { label: 'Beban Lain-lain', amount: profitLoss.otherExpense },
    { label: 'Laba Bersih', amount: profitLoss.netProfit },
    { label: '', amount: '' },
    { label: '=== ARUS KAS ===', amount: '' },
    { label: 'Kas Masuk Operasi', amount: cashFlow.operatingIn },
    { label: 'Kas Keluar Operasi', amount: cashFlow.operatingOut },
    { label: 'Arus Kas Bersih Operasi', amount: cashFlow.operatingNet },
    { label: 'Total Arus Kas Bersih', amount: cashFlow.totalNet },
  ];
  return createExcelWorkbook('Keuangan', columns, rows);
};

const mysqlExportExpiredExcel = async (queryParams) => {
  const pool = getMySQLPool();
  const now = new Date();
  const { where, params } = mysqlBuildExpiredWhere(queryParams);
  const whereClause = `WHERE ${where.join(' AND ')} AND p.is_active = 1`;

  const [all] = await pool.query(
    `SELECT p.name, sb.batch_number, sb.expiry_date, sb.quantity as qty,
     sb.quantity * sb.unit_price as value, p.category as kategori, p.golongan,
     DATEDIFF(sb.expiry_date, ?) as days_remaining
     FROM stock_batches sb JOIN products p ON sb.product_id = p.id
     ${whereClause} ORDER BY sb.expiry_date ASC LIMIT 50000`,
    [now, ...params],
  );

  const columns = [
    { header: 'No', key: 'no', width: 6 },
    { header: 'Nama Produk', key: 'name', width: 30 },
    { header: 'No. Batch', key: 'batchNumber', width: 22 },
    { header: 'Tanggal ED', key: 'expiryDate', width: 16 },
    { header: 'Sisa Hari', key: 'daysRemaining', width: 12 },
    { header: 'Qty', key: 'qty', width: 10, style: { numFmt: '#,##0' } },
    { header: 'Nilai (Rp)', key: 'value', width: 18, style: { numFmt: '#,##0' } },
    { header: 'Status', key: 'expiryStatus', width: 14 },
    { header: 'Kategori', key: 'kategori', width: 16 },
    { header: 'Golongan', key: 'golongan', width: 18 },
  ];
  const rows = all.map((d, i) => ({
    no: i + 1,
    name: d.name,
    batchNumber: d.batch_number,
    expiryDate: formatDate(d.expiry_date),
    daysRemaining: d.days_remaining,
    qty: d.qty,
    value: Number(d.value),
    expiryStatus: getExpiryStatus(d.days_remaining),
    kategori: d.kategori,
    golongan: d.golongan,
  }));
  return createExcelWorkbook('Obat Kadaluarsa', columns, rows);
};

const mysqlExportSalesPdf = async (queryParams) => {
  const all = await mysqlGetAllSalesData(queryParams);
  const periodLabel = queryParams.period || 'monthly';
  const doc = await createPdfDocument('Laporan Penjualan', periodLabel);
  const headers = ['No', 'No. SO', 'Pelanggan', 'Tanggal', 'Total (Rp)', 'Status'];
  const colWidths = [30, 130, 200, 90, 120, 80];
  const rows = all.map((d, i) => [
    i + 1, d.invoiceNumber, d.customerId?.name || '-', formatDate(d.orderDate),
    (d.totalAmount || 0).toLocaleString('id-ID'), d.status,
  ]);
  drawPdfTable(doc, headers, rows, colWidths);
  addPdfPageNumbers(doc);
  doc.end();
  return doc;
};

const mysqlExportPurchasesPdf = async (queryParams) => {
  const all = await mysqlGetAllPurchasesData(queryParams);
  const periodLabel = queryParams.period || 'monthly';
  const doc = await createPdfDocument('Laporan Pembelian', periodLabel);
  const headers = ['No', 'No. PO', 'Supplier', 'Tanggal', 'Total (Rp)', 'Status'];
  const colWidths = [30, 130, 200, 90, 120, 80];
  const rows = all.map((d, i) => [
    i + 1, d.poNumber, d.supplierId?.name || '-', formatDate(d.orderDate),
    (d.totalAmount || 0).toLocaleString('id-ID'), d.status,
  ]);
  drawPdfTable(doc, headers, rows, colWidths);
  addPdfPageNumbers(doc);
  doc.end();
  return doc;
};

const mysqlExportStockPdf = async (queryParams) => {
  const pool = getMySQLPool();
  const { where, params, stockStatus } = mysqlBuildStockWhere(queryParams);
  const baseQuery = mysqlStockBaseQuery(where, stockStatus);
  const [all] = await pool.query(`${baseQuery} ORDER BY total_stock DESC LIMIT 50000`, params);

  const doc = await createPdfDocument('Laporan Stok', 'Snapshot');
  const headers = ['No', 'Kode', 'Nama Produk', 'Kategori', 'Stok', 'Nilai (Rp)', 'Status'];
  const colWidths = [30, 80, 200, 100, 60, 120, 80];
  const rows = all.map((d, i) => [
    i + 1, d.code || d.sku, d.name, d.category,
    (Number(d.total_stock) || 0).toLocaleString('id-ID'),
    (Number(d.stock_value) || 0).toLocaleString('id-ID'),
    d.stock_status,
  ]);
  drawPdfTable(doc, headers, rows, colWidths);
  addPdfPageNumbers(doc);
  doc.end();
  return doc;
};

const mysqlExportFinancePdf = async (queryParams) => {
  const report = await mysqlGetFinanceReport(queryParams);
  const periodLabel = queryParams.period || 'monthly';
  const doc = await createPdfDocument('Laporan Keuangan', periodLabel);
  doc.options.layout = 'portrait';
  const { profitLoss, cashFlow } = report;
  const fmt = (v) => (v || 0).toLocaleString('id-ID');
  const headers = ['Keterangan', 'Jumlah (Rp)'];
  const colWidths = [400, 250];
  const rows = [
    ['--- LABA RUGI ---', ''],
    ['Pendapatan Penjualan', fmt(profitLoss.salesRevenue)],
    ['Diskon & Retur', fmt(profitLoss.discountReturn)],
    ['Pendapatan Bersih', fmt(profitLoss.netRevenue)],
    ['Harga Pokok Penjualan', fmt(profitLoss.cogs)],
    ['Laba Kotor', fmt(profitLoss.grossProfit)],
    ['Beban Operasional', fmt(profitLoss.operatingExpense)],
    ['Beban Lain-lain', fmt(profitLoss.otherExpense)],
    ['Laba Bersih', fmt(profitLoss.netProfit)],
    ['', ''],
    ['--- ARUS KAS ---', ''],
    ['Kas Masuk Operasi', fmt(cashFlow.operatingIn)],
    ['Kas Keluar Operasi', fmt(cashFlow.operatingOut)],
    ['Arus Kas Bersih Operasi', fmt(cashFlow.operatingNet)],
    ['Total Arus Kas Bersih', fmt(cashFlow.totalNet)],
  ];
  drawPdfTable(doc, headers, rows, colWidths);
  addPdfPageNumbers(doc);
  doc.end();
  return doc;
};

const mysqlExportExpiredPdf = async (queryParams) => {
  const pool = getMySQLPool();
  const now = new Date();
  const { where, params } = mysqlBuildExpiredWhere(queryParams);
  const whereClause = `WHERE ${where.join(' AND ')} AND p.is_active = 1`;

  const [all] = await pool.query(
    `SELECT p.name, sb.batch_number, sb.expiry_date, sb.quantity as qty,
     DATEDIFF(sb.expiry_date, ?) as days_remaining, p.category
     FROM stock_batches sb JOIN products p ON sb.product_id = p.id
     ${whereClause} ORDER BY sb.expiry_date ASC LIMIT 50000`,
    [now, ...params],
  );

  const doc = await createPdfDocument('Laporan Obat Kadaluarsa', 'Snapshot');
  const headers = ['No', 'Nama Produk', 'No. Batch', 'Tanggal ED', 'Sisa Hari', 'Qty', 'Status'];
  const colWidths = [30, 180, 130, 90, 60, 60, 80];
  const rows = all.map((d, i) => [
    i + 1, d.name, d.batch_number, formatDate(d.expiry_date),
    d.days_remaining, d.qty, getExpiryStatus(d.days_remaining),
  ]);
  drawPdfTable(doc, headers, rows, colWidths);
  addPdfPageNumbers(doc);
  doc.end();
  return doc;
};

const getSalesReport = (q) => mysqlGetSalesReport(q);
const getSalesStats = (q) => mysqlGetSalesStats(q);
const getSalesChart = (q) => mysqlGetSalesChart(q);
const getPurchasesReport = (q) => mysqlGetPurchasesReport(q);
const getPurchasesStats = (q) => mysqlGetPurchasesStats(q);
const getPurchasesChart = (q) => mysqlGetPurchasesChart(q);
const getStockReport = (q) => mysqlGetStockReport(q);
const getStockStats = (q) => mysqlGetStockStats(q);
const getStockChart = (q) => mysqlGetStockChart(q);
const getFinanceReport = (q) => mysqlGetFinanceReport(q);
const getFinanceStats = (q) => mysqlGetFinanceStats(q);
const getFinanceChart = (q) => mysqlGetFinanceChart(q);
const getExpiredReport = (q) => mysqlGetExpiredReport(q);
const getExpiredStats = (q) => mysqlGetExpiredStats(q);
const getExpiredChart = (q) => mysqlGetExpiredChart(q);
const exportSalesExcel = (q) => mysqlExportSalesExcel(q);
const exportSalesPdf = (q) => mysqlExportSalesPdf(q);
const exportPurchasesExcel = (q) => mysqlExportPurchasesExcel(q);
const exportPurchasesPdf = (q) => mysqlExportPurchasesPdf(q);
const exportStockExcel = (q) => mysqlExportStockExcel(q);
const exportStockPdf = (q) => mysqlExportStockPdf(q);
const exportFinanceExcel = (q) => mysqlExportFinanceExcel(q);
const exportFinancePdf = (q) => mysqlExportFinancePdf(q);
const exportExpiredExcel = (q) => mysqlExportExpiredExcel(q);
const exportExpiredPdf = (q) => mysqlExportExpiredPdf(q);

module.exports = {
  // Sales
  getSalesReport,
  getSalesStats,
  getSalesChart,
  exportSalesExcel,
  exportSalesPdf,
  // Purchases
  getPurchasesReport,
  getPurchasesStats,
  getPurchasesChart,
  exportPurchasesExcel,
  exportPurchasesPdf,
  // Stock
  getStockReport,
  getStockStats,
  getStockChart,
  exportStockExcel,
  exportStockPdf,
  // Finance
  getFinanceReport,
  getFinanceStats,
  getFinanceChart,
  exportFinanceExcel,
  exportFinancePdf,
  // Expired
  getExpiredReport,
  getExpiredStats,
  getExpiredChart,
  exportExpiredExcel,
  exportExpiredPdf,
};


