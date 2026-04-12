const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const mongoose = require('mongoose');
const config = require('../config');
const { getMySQLPool } = require('../config/database');
const SalesOrder = require('../models/SalesOrder');
const PurchaseOrder = require('../models/PurchaseOrder');
const Product = require('../models/Product');
const StockBatch = require('../models/StockBatch');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const JournalEntry = require('../models/JournalEntry');
const AppSetting = require('../models/AppSetting');
const { paginate } = require('../helpers');
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

const getTrendGroupFormat = (period) => {
  switch (period) {
    case 'daily':
      return { format: '%Y-%m-%d', labelFn: (d) => d };
    case 'weekly':
      return { format: '%Y-W%V', labelFn: (d) => d };
    case 'yearly':
      return { format: '%Y', labelFn: (d) => d };
    case 'monthly':
    default:
      return { format: '%Y-%m', labelFn: (d) => {
        const [y, m] = d.split('-');
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
        return `${months[parseInt(m, 10) - 1]} ${y}`;
      }};
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

const mongoGetSalesReport = async (queryParams) => {
  const { search, status, customerId, period, dateFrom, dateTo, sort } = queryParams;
  const filter = {};

  const dateRange = getDateRange(period || 'monthly', dateFrom, dateTo);
  if (dateRange.$gte || dateRange.$lte) filter.orderDate = dateRange;
  if (status) filter.status = status;
  if (customerId) filter.customerId = customerId;

  if (search) {
    const regex = new RegExp(search, 'i');
    filter.$or = [{ invoiceNumber: regex }];
  }

  const result = await paginate(SalesOrder, {
    filter,
    page: queryParams.page,
    limit: queryParams.limit,
    sort: sort || '-createdAt',
    populate: [
      { path: 'customerId', select: 'name code type' },
    ],
  });

  const docs = result.docs.map((doc) => {
    const obj = { ...doc };
    obj.customer = obj.customerId;
    delete obj.customerId;
    return obj;
  });

  return { docs, pagination: result.pagination };
};

const mongoGetSalesStats = async (queryParams) => {
  const { status, customerId, period, dateFrom, dateTo } = queryParams;
  const dateRange = getDateRange(period || 'monthly', dateFrom, dateTo);
  const match = {};
  if (dateRange.$gte || dateRange.$lte) match.orderDate = dateRange;
  if (status) match.status = status;
  if (customerId) match.customerId = require('mongoose').Types.ObjectId(customerId);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [agg, completedThisMonth] = await Promise.all([
    SalesOrder.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalSales: { $sum: '$totalAmount' },
          totalOrders: { $sum: 1 },
        },
      },
    ]),
    SalesOrder.countDocuments({
      status: SO_STATUS.COMPLETED,
      completedAt: { $gte: startOfMonth },
    }),
  ]);

  const s = agg[0] || {};
  return {
    totalSales: formatCurrency(s.totalSales),
    totalOrders: s.totalOrders || 0,
    avgOrderValue: s.totalOrders ? formatCurrency(s.totalSales / s.totalOrders) : 0,
    completedThisMonth,
  };
};

const mongoGetSalesChart = async (queryParams) => {
  const { status, customerId, period, dateFrom, dateTo } = queryParams;
  const dateRange = getDateRange(period || 'monthly', dateFrom, dateTo);
  const match = {};
  if (dateRange.$gte || dateRange.$lte) match.orderDate = dateRange;
  if (status) match.status = status;
  if (customerId) match.customerId = require('mongoose').Types.ObjectId(customerId);

  const groupFormat = getTrendGroupFormat(period || 'monthly');

  const [trend, topProducts, byCustomerType, topCustomers] = await Promise.all([
    SalesOrder.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: groupFormat.format, date: '$orderDate' } },
          total: { $sum: '$totalAmount' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    SalesOrder.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productId',
          qty: { $sum: '$items.quantity' },
        },
      },
      { $sort: { qty: -1 } },
      { $limit: 10 },
      {
        $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' },
      },
      { $unwind: '$product' },
      { $project: { name: '$product.name', qty: 1 } },
    ]),
    SalesOrder.aggregate([
      { $match: match },
      {
        $lookup: { from: 'customers', localField: 'customerId', foreignField: '_id', as: 'customer' },
      },
      { $unwind: '$customer' },
      {
        $group: {
          _id: '$customer.type',
          value: { $sum: '$totalAmount' },
        },
      },
      { $project: { name: '$_id', value: 1, _id: 0 } },
      { $sort: { value: -1 } },
    ]),
    SalesOrder.aggregate([
      { $match: match },
      {
        $lookup: { from: 'customers', localField: 'customerId', foreignField: '_id', as: 'customer' },
      },
      { $unwind: '$customer' },
      {
        $group: { _id: '$customerId', name: { $first: '$customer.name' }, total: { $sum: '$totalAmount' } },
      },
      { $sort: { total: -1 } },
      { $limit: 10 },
      { $project: { name: 1, total: 1, _id: 0 } },
    ]),
  ]);

  return {
    trend: trend.map((t) => ({ label: groupFormat.labelFn(t._id), total: formatCurrency(t.total) })),
    topProducts,
    byCustomerType,
    topCustomers,
  };
};

// ═══════════════════════════════════════════════════════════════
// ─── 13.2 PURCHASES REPORT ───
// ═══════════════════════════════════════════════════════════════

const mongoGetPurchasesReport = async (queryParams) => {
  const { search, status, supplierId, period, dateFrom, dateTo, sort } = queryParams;
  const filter = {};

  const dateRange = getDateRange(period || 'monthly', dateFrom, dateTo);
  if (dateRange.$gte || dateRange.$lte) filter.orderDate = dateRange;
  if (status) filter.status = status;
  if (supplierId) filter.supplierId = supplierId;

  if (search) {
    const regex = new RegExp(search, 'i');
    filter.$or = [{ poNumber: regex }];
  }

  const result = await paginate(PurchaseOrder, {
    filter,
    page: queryParams.page,
    limit: queryParams.limit,
    sort: sort || '-createdAt',
    populate: [
      { path: 'supplierId', select: 'name code' },
    ],
  });

  const docs = result.docs.map((doc) => {
    const obj = { ...doc };
    obj.supplier = obj.supplierId;
    delete obj.supplierId;
    return obj;
  });

  return { docs, pagination: result.pagination };
};

const mongoGetPurchasesStats = async (queryParams) => {
  const { status, supplierId, period, dateFrom, dateTo } = queryParams;
  const dateRange = getDateRange(period || 'monthly', dateFrom, dateTo);
  const match = {};
  if (dateRange.$gte || dateRange.$lte) match.orderDate = dateRange;
  if (status) match.status = status;
  if (supplierId) match.supplierId = require('mongoose').Types.ObjectId(supplierId);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [agg, receivedThisMonth] = await Promise.all([
    PurchaseOrder.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          totalPurchases: { $sum: '$totalAmount' },
          totalOrders: { $sum: 1 },
        },
      },
    ]),
    PurchaseOrder.countDocuments({
      status: PO_STATUS.RECEIVED,
      updatedAt: { $gte: startOfMonth },
    }),
  ]);

  const s = agg[0] || {};
  return {
    totalPurchases: formatCurrency(s.totalPurchases),
    totalOrders: s.totalOrders || 0,
    avgOrderValue: s.totalOrders ? formatCurrency(s.totalPurchases / s.totalOrders) : 0,
    receivedThisMonth,
  };
};

const mongoGetPurchasesChart = async (queryParams) => {
  const { status, supplierId, period, dateFrom, dateTo } = queryParams;
  const dateRange = getDateRange(period || 'monthly', dateFrom, dateTo);
  const match = {};
  if (dateRange.$gte || dateRange.$lte) match.orderDate = dateRange;
  if (status) match.status = status;
  if (supplierId) match.supplierId = require('mongoose').Types.ObjectId(supplierId);

  const groupFormat = getTrendGroupFormat(period || 'monthly');

  const [trend, topSuppliers, byCategory, topProducts] = await Promise.all([
    PurchaseOrder.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: groupFormat.format, date: '$orderDate' } },
          total: { $sum: '$totalAmount' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    PurchaseOrder.aggregate([
      { $match: match },
      {
        $lookup: { from: 'suppliers', localField: 'supplierId', foreignField: '_id', as: 'supplier' },
      },
      { $unwind: '$supplier' },
      {
        $group: { _id: '$supplierId', name: { $first: '$supplier.name' }, total: { $sum: '$totalAmount' } },
      },
      { $sort: { total: -1 } },
      { $limit: 10 },
      { $project: { name: 1, total: 1, _id: 0 } },
    ]),
    PurchaseOrder.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $lookup: { from: 'products', localField: 'items.productId', foreignField: '_id', as: 'product' },
      },
      { $unwind: '$product' },
      {
        $group: { _id: '$product.category', value: { $sum: '$items.subtotal' } },
      },
      { $project: { name: '$_id', value: 1, _id: 0 } },
      { $sort: { value: -1 } },
    ]),
    PurchaseOrder.aggregate([
      { $match: match },
      { $unwind: '$items' },
      {
        $group: { _id: '$items.productId', qty: { $sum: '$items.quantity' } },
      },
      { $sort: { qty: -1 } },
      { $limit: 10 },
      {
        $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' },
      },
      { $unwind: '$product' },
      { $project: { name: '$product.name', qty: 1, _id: 0 } },
    ]),
  ]);

  return {
    trend: trend.map((t) => ({ label: groupFormat.labelFn(t._id), total: formatCurrency(t.total) })),
    topSuppliers,
    byCategory,
    topProducts,
  };
};

// ═══════════════════════════════════════════════════════════════
// ─── 13.3 STOCK REPORT ───
// ═══════════════════════════════════════════════════════════════

const buildStockPipeline = (queryParams) => {
  const { kategori, golongan, stockStatus, search } = queryParams;
  const productMatch = { isActive: true };
  if (kategori) productMatch.category = kategori;
  if (golongan) productMatch.golongan = golongan;
  if (search) {
    const regex = new RegExp(search, 'i');
    productMatch.$or = [{ name: regex }, { sku: regex }, { code: regex }];
  }

  const pipeline = [
    { $match: productMatch },
    {
      $lookup: {
        from: 'stockbatches',
        let: { pid: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$productId', '$$pid'] }, { $eq: ['$status', 'active'] }] } } },
          { $group: { _id: null, totalStock: { $sum: '$quantity' }, stockValue: { $sum: { $multiply: ['$quantity', '$unitPrice'] } } } },
        ],
        as: 'stockInfo',
      },
    },
    {
      $addFields: {
        totalStock: { $ifNull: [{ $arrayElemAt: ['$stockInfo.totalStock', 0] }, 0] },
        stockValue: { $ifNull: [{ $arrayElemAt: ['$stockInfo.stockValue', 0] }, 0] },
      },
    },
    {
      $addFields: {
        stockStatus: {
          $cond: [{ $eq: ['$totalStock', 0] }, 'out_of_stock',
            { $cond: [{ $lte: ['$totalStock', { $ifNull: ['$stokMinimum', 10] }] }, 'low_stock', 'in_stock'] }],
        },
      },
    },
  ];

  if (stockStatus) {
    pipeline.push({ $match: { stockStatus } });
  }

  pipeline.push({ $project: { stockInfo: 0 } });
  return pipeline;
};

const mongoGetStockReport = async (queryParams) => {
  const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(queryParams.limit, 10) || 20));
  const sortField = queryParams.sort || '-totalStock';
  const sortDir = sortField.startsWith('-') ? -1 : 1;
  const sortKey = sortField.replace(/^-/, '');

  const pipeline = buildStockPipeline(queryParams);
  pipeline.push({ $sort: { [sortKey]: sortDir } });

  const countPipeline = [...pipeline, { $count: 'total' }];
  const dataPipeline = [...pipeline, { $skip: (page - 1) * limit }, { $limit: limit }];

  const [countResult, docs] = await Promise.all([
    Product.aggregate(countPipeline),
    Product.aggregate(dataPipeline),
  ]);

  const totalDocs = (countResult[0] || {}).total || 0;
  const totalPages = Math.ceil(totalDocs / limit);

  const mapped = docs.map((d) => ({
    _id: d._id,
    code: d.code,
    sku: d.sku,
    name: d.name,
    kategori: d.category,
    golongan: d.golongan,
    totalStock: d.totalStock,
    stockValue: d.stockValue,
    stockStatus: d.stockStatus,
    unit: d.satuan || d.satuanKecil || 'Pcs',
  }));

  return {
    docs: mapped,
    pagination: {
      totalDocs,
      totalPages,
      page,
      limit,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
};

const mongoGetStockStats = async (queryParams) => {
  const pipeline = buildStockPipeline(queryParams);
  pipeline.push({
    $group: {
      _id: null,
      totalSku: { $sum: 1 },
      totalQty: { $sum: '$totalStock' },
      outOfStock: { $sum: { $cond: [{ $eq: ['$stockStatus', 'out_of_stock'] }, 1, 0] } },
    },
  });

  const now = new Date();
  const nearExpiryDate = new Date(now.getTime() + 90 * 86400000);

  const [stockAgg, nearExpiry] = await Promise.all([
    Product.aggregate(pipeline),
    StockBatch.countDocuments({
      status: 'active',
      quantity: { $gt: 0 },
      expiryDate: { $lte: nearExpiryDate, $gt: now },
    }),
  ]);

  const s = stockAgg[0] || {};
  return {
    totalSku: s.totalSku || 0,
    totalQty: s.totalQty || 0,
    nearExpiry,
    outOfStock: s.outOfStock || 0,
  };
};

const mongoGetStockChart = async (queryParams) => {
  const pipeline = buildStockPipeline(queryParams);

  const [byCategory, topProducts, byGolongan, byStatus] = await Promise.all([
    Product.aggregate([
      ...pipeline,
      { $group: { _id: '$category', qty: { $sum: '$totalStock' } } },
      { $project: { name: '$_id', qty: 1, _id: 0 } },
      { $sort: { qty: -1 } },
    ]),
    Product.aggregate([
      ...pipeline,
      { $sort: { totalStock: -1 } },
      { $limit: 10 },
      { $project: { name: 1, qty: '$totalStock', _id: 0 } },
    ]),
    Product.aggregate([
      ...pipeline,
      { $group: { _id: '$golongan', value: { $sum: '$totalStock' } } },
      { $project: { name: '$_id', value: 1, _id: 0 } },
      { $sort: { value: -1 } },
    ]),
    Product.aggregate([
      ...pipeline,
      {
        $group: {
          _id: '$stockStatus',
          value: { $sum: 1 },
        },
      },
    ]),
  ]);

  const statusMap = { in_stock: 'Tersedia', low_stock: 'Stok Rendah', out_of_stock: 'Habis' };
  const byStatusFormatted = ['in_stock', 'low_stock', 'out_of_stock'].map((key) => {
    const found = byStatus.find((s) => s._id === key);
    return { name: statusMap[key], value: found ? found.value : 0 };
  });

  return { byCategory, topProducts, byGolongan, byStatus: byStatusFormatted };
};

// ═══════════════════════════════════════════════════════════════
// ─── 13.4 FINANCE REPORT ───
// ═══════════════════════════════════════════════════════════════

const mongoGetFinanceReport = async (queryParams) => {
  const { period, dateFrom, dateTo } = queryParams;
  const dateRange = getDateRange(period || 'monthly', dateFrom, dateTo);

  // Profit & Loss — include all non-cancelled invoices
  const invoiceMatch = { status: { $ne: INVOICE_STATUS.CANCELLED } };
  if (dateRange.$gte || dateRange.$lte) invoiceMatch.invoiceDate = dateRange;

  const paymentMatch = { status: FINANCE_PAYMENT_STATUS.VERIFIED };
  if (dateRange.$gte || dateRange.$lte) paymentMatch.paymentDate = dateRange;

  const [invoiceAgg, incomingAgg, outgoingAgg, memoAgg, journalExpenses, cogsAgg] = await Promise.all([
    Invoice.aggregate([
      { $match: invoiceMatch },
      {
        $group: {
          _id: null,
          salesRevenue: { $sum: '$totalAmount' },
          discount: { $sum: '$discount' },
          ppn: { $sum: '$ppnAmount' },
        },
      },
    ]),
    Payment.aggregate([
      { $match: { ...paymentMatch, type: PAYMENT_TYPE.INCOMING } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    Payment.aggregate([
      { $match: { ...paymentMatch, type: PAYMENT_TYPE.OUTGOING } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]),
    (async () => {
      const Memo = require('../models/Memo');
      const memoMatch = { status: 'posted' };
      if (dateRange.$gte || dateRange.$lte) memoMatch.postedAt = dateRange;
      return Memo.aggregate([
        { $match: memoMatch },
        {
          $group: {
            _id: '$type',
            total: { $sum: '$totalAmount' },
          },
        },
      ]);
    })(),
    // Operating expenses EXCLUDING COGS (5100) to avoid double-counting
    JournalEntry.aggregate([
      { $match: dateRange.$gte || dateRange.$lte ? { date: dateRange } : {} },
      { $unwind: '$entries' },
      {
        $lookup: {
          from: 'chartofaccounts',
          localField: 'entries.accountId',
          foreignField: '_id',
          as: 'account',
        },
      },
      { $unwind: '$account' },
      { $match: { 'account.category': 'expense', 'account.code': { $ne: '5100' } } },
      { $group: { _id: null, total: { $sum: '$entries.debit' } } },
    ]),
    // COGS from HPP journal entries (account 5100)
    JournalEntry.aggregate([
      { $match: dateRange.$gte || dateRange.$lte ? { date: dateRange } : {} },
      { $unwind: '$entries' },
      {
        $lookup: {
          from: 'chartofaccounts',
          localField: 'entries.accountId',
          foreignField: '_id',
          as: 'account',
        },
      },
      { $unwind: '$account' },
      { $match: { 'account.code': '5100' } },
      { $group: { _id: null, total: { $sum: '$entries.debit' } } },
    ]),
  ]);

  const inv = invoiceAgg[0] || {};
  const salesRevenue = formatCurrency(inv.salesRevenue);
  const creditMemo = (memoAgg.find((m) => m._id === 'credit_memo') || {}).total || 0;
  const discountReturn = formatCurrency((inv.discount || 0) + creditMemo);
  const netRevenue = salesRevenue - discountReturn;

  const cogs = formatCurrency((cogsAgg[0] || {}).total);
  const grossProfit = netRevenue - cogs;

  const operatingExpense = formatCurrency((journalExpenses[0] || {}).total);
  const otherExpense = 0;
  const netProfit = grossProfit - operatingExpense - otherExpense;

  // Cash Flow
  const operatingIn = formatCurrency((incomingAgg[0] || {}).total);
  const operatingOut = formatCurrency((outgoingAgg[0] || {}).total);

  return {
    profitLoss: {
      salesRevenue,
      discountReturn,
      netRevenue,
      cogs,
      grossProfit,
      operatingExpense,
      otherExpense,
      netProfit,
    },
    cashFlow: {
      operatingIn,
      operatingOut,
      operatingNet: operatingIn - operatingOut,
      investingIn: 0,
      investingOut: 0,
      investingNet: 0,
      financingIn: 0,
      financingOut: 0,
      financingNet: 0,
      totalNet: operatingIn - operatingOut,
    },
  };
};

const mongoGetFinanceStats = async (queryParams) => {
  const report = await mongoGetFinanceReport(queryParams);
  const { profitLoss } = report;
  const totalRevenue = profitLoss.salesRevenue;
  const totalExpense = profitLoss.cogs + profitLoss.operatingExpense + profitLoss.otherExpense;
  const netProfit = profitLoss.netProfit;
  const margin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 1000) / 10 : 0;

  return { totalRevenue, totalExpense, netProfit, margin };
};

const mongoGetFinanceChart = async (queryParams) => {
  const { period, dateFrom, dateTo } = queryParams;
  const dateRange = getDateRange(period || 'monthly', dateFrom, dateTo);
  const groupFormat = getTrendGroupFormat(period || 'monthly');

  const paymentMatch = { status: FINANCE_PAYMENT_STATUS.VERIFIED };
  if (dateRange.$gte || dateRange.$lte) paymentMatch.paymentDate = dateRange;

  const [incomingTrend, outgoingTrend] = await Promise.all([
    Payment.aggregate([
      { $match: { ...paymentMatch, type: PAYMENT_TYPE.INCOMING } },
      {
        $group: {
          _id: { $dateToString: { format: groupFormat.format, date: '$paymentDate' } },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Payment.aggregate([
      { $match: { ...paymentMatch, type: PAYMENT_TYPE.OUTGOING } },
      {
        $group: {
          _id: { $dateToString: { format: groupFormat.format, date: '$paymentDate' } },
          total: { $sum: '$amount' },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  // Merge into combined trend
  const allLabels = new Set([
    ...incomingTrend.map((t) => t._id),
    ...outgoingTrend.map((t) => t._id),
  ]);
  const sortedLabels = Array.from(allLabels).sort();

  const inMap = Object.fromEntries(incomingTrend.map((t) => [t._id, t.total]));
  const outMap = Object.fromEntries(outgoingTrend.map((t) => [t._id, t.total]));

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
// ─── 13.5 EXPIRED REPORT ───
// ═══════════════════════════════════════════════════════════════

const getExpiryStatus = (daysRemaining) => {
  if (daysRemaining <= 0) return 'expired';
  if (daysRemaining <= 30) return 'critical';
  if (daysRemaining <= 90) return 'warning';
  if (daysRemaining <= 180) return 'caution';
  return 'safe';
};

const buildExpiredMatch = (queryParams) => {
  const { expiryStatus, kategori, golongan, dateFrom, dateTo, search } = queryParams;
  const now = new Date();

  // Base: only active batches with stock
  const batchMatch = { status: 'active', quantity: { $gt: 0 } };

  // Filter by expiry date range
  if (dateFrom || dateTo) {
    batchMatch.expiryDate = {};
    if (dateFrom) batchMatch.expiryDate.$gte = new Date(dateFrom);
    if (dateTo) batchMatch.expiryDate.$lte = new Date(dateTo);
  }

  // Filter by expiry urgency status
  if (expiryStatus) {
    const expiryDateFilter = {};
    if (expiryStatus === 'expired') expiryDateFilter.$lte = now;
    else if (expiryStatus === 'critical') {
      expiryDateFilter.$gt = now;
      expiryDateFilter.$lte = new Date(now.getTime() + 30 * 86400000);
    } else if (expiryStatus === 'warning') {
      expiryDateFilter.$gt = new Date(now.getTime() + 30 * 86400000);
      expiryDateFilter.$lte = new Date(now.getTime() + 90 * 86400000);
    } else if (expiryStatus === 'caution') {
      expiryDateFilter.$gt = new Date(now.getTime() + 90 * 86400000);
      expiryDateFilter.$lte = new Date(now.getTime() + 180 * 86400000);
    }
    batchMatch.expiryDate = { ...batchMatch.expiryDate, ...expiryDateFilter };
  }

  // Default: only batches expiring within 180 days or already expired
  if (!expiryStatus && !dateFrom && !dateTo) {
    batchMatch.expiryDate = { $lte: new Date(now.getTime() + 180 * 86400000) };
  }

  return { batchMatch, kategori, golongan, search };
};

const mongoGetExpiredReport = async (queryParams) => {
  const now = new Date();
  const page = Math.max(1, parseInt(queryParams.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(queryParams.limit, 10) || 20));
  const sortField = queryParams.sort || 'expiryDate';
  const sortDir = sortField.startsWith('-') ? -1 : 1;
  const sortKey = sortField.replace(/^-/, '');

  const { batchMatch, kategori, golongan, search } = buildExpiredMatch(queryParams);

  const pipeline = [
    { $match: batchMatch },
    {
      $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' },
    },
    { $unwind: '$product' },
    { $match: { 'product.isActive': true } },
  ];

  if (kategori) pipeline.push({ $match: { 'product.category': kategori } });
  if (golongan) pipeline.push({ $match: { 'product.golongan': golongan } });
  if (search) {
    const regex = new RegExp(search, 'i');
    pipeline.push({
      $match: { $or: [{ 'product.name': regex }, { batchNumber: regex }] },
    });
  }

  pipeline.push({
    $addFields: {
      daysRemaining: { $divide: [{ $subtract: ['$expiryDate', now] }, 86400000] },
    },
  });

  pipeline.push({ $sort: { [sortKey]: sortDir } });

  const countPipeline = [...pipeline, { $count: 'total' }];
  const dataPipeline = [
    ...pipeline,
    { $skip: (page - 1) * limit },
    { $limit: limit },
    {
      $project: {
        productName: '$product.name',
        name: '$product.name',
        batchNumber: 1,
        expiryDate: 1,
        daysRemaining: { $floor: '$daysRemaining' },
        qty: '$quantity',
        value: { $multiply: ['$quantity', '$unitPrice'] },
        kategori: '$product.category',
        golongan: '$product.golongan',
      },
    },
  ];

  const [countResult, docs] = await Promise.all([
    StockBatch.aggregate(countPipeline),
    StockBatch.aggregate(dataPipeline),
  ]);

  const totalDocs = (countResult[0] || {}).total || 0;
  const totalPages = Math.ceil(totalDocs / limit);

  const docsWithStatus = docs.map((d) => ({
    ...d,
    expiryStatus: getExpiryStatus(d.daysRemaining),
  }));

  return {
    docs: docsWithStatus,
    pagination: { totalDocs, totalPages, page, limit, hasNextPage: page < totalPages, hasPrevPage: page > 1 },
  };
};

const mongoGetExpiredStats = async (queryParams) => {
  const now = new Date();
  const pipeline = [
    { $match: { status: 'active', quantity: { $gt: 0 } } },
  ];

  // Apply product filters if present
  if (queryParams.kategori || queryParams.golongan) {
    pipeline.push(
      { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
      { $unwind: '$product' },
    );
    if (queryParams.kategori) pipeline.push({ $match: { 'product.category': queryParams.kategori } });
    if (queryParams.golongan) pipeline.push({ $match: { 'product.golongan': queryParams.golongan } });
  }

  pipeline.push({
    $group: {
      _id: null,
      totalExpired: {
        $sum: { $cond: [{ $lte: ['$expiryDate', now] }, 1, 0] },
      },
      critical: {
        $sum: {
          $cond: [
            { $and: [{ $gt: ['$expiryDate', now] }, { $lte: ['$expiryDate', new Date(now.getTime() + 30 * 86400000)] }] },
            1, 0,
          ],
        },
      },
      warning: {
        $sum: {
          $cond: [
            { $and: [{ $gt: ['$expiryDate', new Date(now.getTime() + 30 * 86400000)] }, { $lte: ['$expiryDate', new Date(now.getTime() + 90 * 86400000)] }] },
            1, 0,
          ],
        },
      },
      caution: {
        $sum: {
          $cond: [
            { $and: [{ $gt: ['$expiryDate', new Date(now.getTime() + 90 * 86400000)] }, { $lte: ['$expiryDate', new Date(now.getTime() + 180 * 86400000)] }] },
            1, 0,
          ],
        },
      },
    },
  });

  const result = await StockBatch.aggregate(pipeline);
  const s = result[0] || {};
  return {
    totalExpired: s.totalExpired || 0,
    critical: s.critical || 0,
    warning: s.warning || 0,
    caution: s.caution || 0,
  };
};

const mongoGetExpiredChart = async (queryParams) => {
  const stats = await mongoGetExpiredStats(queryParams);

  const byUrgency = [
    { key: 'expired', name: 'Kadaluarsa', count: stats.totalExpired },
    { key: 'critical', name: 'Kritis', count: stats.critical },
    { key: 'warning', name: 'Warning', count: stats.warning },
    { key: 'caution', name: 'Perhatian', count: stats.caution },
  ];

  const batchPipeline = [
    {
      $match: {
        status: 'active',
        quantity: { $gt: 0 },
        expiryDate: { $lte: new Date(Date.now() + 180 * 86400000) },
      },
    },
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
  ];

  if (queryParams.kategori) batchPipeline.push({ $match: { 'product.category': queryParams.kategori } });
  if (queryParams.golongan) batchPipeline.push({ $match: { 'product.golongan': queryParams.golongan } });

  batchPipeline.push(
    { $group: { _id: '$product.golongan', value: { $sum: 1 } } },
    { $project: { name: '$_id', value: 1, _id: 0 } },
    { $sort: { value: -1 } },
  );

  const byGolongan = await StockBatch.aggregate(batchPipeline);

  return { byUrgency, byGolongan };
};

// ═══════════════════════════════════════════════════════════════
// ─── EXCEL EXPORT ───
// ═══════════════════════════════════════════════════════════════

const createExcelWorkbook = (sheetName, columns, rows) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'IKO System';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName);
  sheet.columns = columns;

  // Header styling
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };

  rows.forEach((row) => sheet.addRow(row));

  // Auto-filter
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  // Auto-fit columns (approximate)
  sheet.columns.forEach((col) => {
    let maxLen = col.header ? col.header.length : 10;
    col.eachCell({ includeEmpty: false }, (cell) => {
      const len = cell.value ? String(cell.value).length : 0;
      if (len > maxLen) maxLen = len;
    });
    col.width = Math.min(maxLen + 4, 40);
  });

  return workbook;
};

const mongoExportSalesExcel = async (queryParams) => {
  const all = await mongoGetAllSalesData(queryParams);
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

const mongoExportPurchasesExcel = async (queryParams) => {
  const all = await mongoGetAllPurchasesData(queryParams);
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

const mongoExportStockExcel = async (queryParams) => {
  const pipeline = buildStockPipeline(queryParams);
  pipeline.push({ $sort: { totalStock: -1 } }, { $limit: 50000 });
  const all = await Product.aggregate(pipeline);

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
    totalStock: d.totalStock,
    stockValue: d.stockValue,
    stockStatus: d.stockStatus,
  }));

  return createExcelWorkbook('Stok', columns, rows);
};

const mongoExportFinanceExcel = async (queryParams) => {
  const report = await mongoGetFinanceReport(queryParams);
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

const mongoExportExpiredExcel = async (queryParams) => {
  const now = new Date();
  const { batchMatch, kategori, golongan, search } = buildExpiredMatch(queryParams);
  const pipeline = [
    { $match: batchMatch },
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $match: { 'product.isActive': true } },
  ];
  if (kategori) pipeline.push({ $match: { 'product.category': kategori } });
  if (golongan) pipeline.push({ $match: { 'product.golongan': golongan } });
  if (search) {
    const regex = new RegExp(search, 'i');
    pipeline.push({ $match: { $or: [{ 'product.name': regex }, { batchNumber: regex }] } });
  }
  pipeline.push(
    { $sort: { expiryDate: 1 } },
    { $limit: 50000 },
    {
      $project: {
        name: '$product.name',
        batchNumber: 1,
        expiryDate: 1,
        qty: '$quantity',
        value: { $multiply: ['$quantity', '$unitPrice'] },
        kategori: '$product.category',
        golongan: '$product.golongan',
        daysRemaining: { $floor: { $divide: [{ $subtract: ['$expiryDate', now] }, 86400000] } },
      },
    },
  );

  const all = await StockBatch.aggregate(pipeline);

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
    batchNumber: d.batchNumber,
    expiryDate: formatDate(d.expiryDate),
    daysRemaining: d.daysRemaining,
    qty: d.qty,
    value: d.value,
    expiryStatus: getExpiryStatus(d.daysRemaining),
    kategori: d.kategori,
    golongan: d.golongan,
  }));

  return createExcelWorkbook('Obat Kadaluarsa', columns, rows);
};

// Helper: get all sales data (no pagination, max 50k)
const mongoGetAllSalesData = async (queryParams) => {
  const { search, status, customerId, period, dateFrom, dateTo } = queryParams;
  const filter = {};
  const dateRange = getDateRange(period || 'monthly', dateFrom, dateTo);
  if (dateRange.$gte || dateRange.$lte) filter.orderDate = dateRange;
  if (status) filter.status = status;
  if (customerId) filter.customerId = customerId;
  if (search) {
    const regex = new RegExp(search, 'i');
    filter.$or = [{ invoiceNumber: regex }];
  }
  return SalesOrder.find(filter)
    .populate('customerId', 'name code')
    .sort('-orderDate')
    .limit(50000)
    .lean();
};

const mongoGetAllPurchasesData = async (queryParams) => {
  const { search, status, supplierId, period, dateFrom, dateTo } = queryParams;
  const filter = {};
  const dateRange = getDateRange(period || 'monthly', dateFrom, dateTo);
  if (dateRange.$gte || dateRange.$lte) filter.orderDate = dateRange;
  if (status) filter.status = status;
  if (supplierId) filter.supplierId = supplierId;
  if (search) {
    const regex = new RegExp(search, 'i');
    filter.$or = [{ poNumber: regex }];
  }
  return PurchaseOrder.find(filter)
    .populate('supplierId', 'name code')
    .sort('-orderDate')
    .limit(50000)
    .lean();
};

// ═══════════════════════════════════════════════════════════════
// ─── PDF EXPORT ───
// ═══════════════════════════════════════════════════════════════

const createPdfDocument = async (title, periodLabel) => {
  const settings = await AppSetting.getSettings();
  const companyName = settings?.company?.name || 'PT IKO Farma';

  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margins: { top: 50, bottom: 50, left: 40, right: 40 },
    bufferPages: true,
  });

  // Header
  doc.fontSize(16).font('Helvetica-Bold').text(companyName, { align: 'center' });
  doc.fontSize(12).font('Helvetica').text(title, { align: 'center' });
  doc.fontSize(9).text(`Periode: ${periodLabel} | Dicetak: ${formatDate(new Date())}`, { align: 'center' });
  doc.moveDown(1);

  return doc;
};

const drawPdfTable = (doc, headers, rows, colWidths) => {
  const startX = doc.x;
  let y = doc.y;
  const rowHeight = 18;
  const pageHeight = doc.page.height - doc.page.margins.bottom;

  // Header row
  doc.font('Helvetica-Bold').fontSize(8);
  doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill('#E0E0E0').stroke();
  let x = startX;
  headers.forEach((h, i) => {
    doc.fillColor('#000000').text(h, x + 3, y + 4, { width: colWidths[i] - 6, height: rowHeight });
    x += colWidths[i];
  });
  y += rowHeight;

  // Data rows
  doc.font('Helvetica').fontSize(7);
  rows.forEach((row, rowIdx) => {
    if (y + rowHeight > pageHeight) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    // Zebra stripe
    if (rowIdx % 2 === 1) {
      doc.rect(startX, y, colWidths.reduce((a, b) => a + b, 0), rowHeight).fill('#F5F5F5').stroke();
    }
    x = startX;
    row.forEach((cell, i) => {
      doc.fillColor('#000000').text(String(cell ?? ''), x + 3, y + 4, { width: colWidths[i] - 6, height: rowHeight });
      x += colWidths[i];
    });
    y += rowHeight;
  });

  return doc;
};

const addPdfPageNumbers = (doc) => {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(7).font('Helvetica')
      .text(`Halaman ${i + 1} dari ${range.count}`, 40, doc.page.height - 35, { align: 'center' });
  }
};

const mongoExportSalesPdf = async (queryParams) => {
  const all = await mongoGetAllSalesData(queryParams);
  const periodLabel = queryParams.period || 'monthly';
  const doc = await createPdfDocument('Laporan Penjualan', periodLabel);

  const headers = ['No', 'No. SO', 'Pelanggan', 'Tanggal', 'Total (Rp)', 'Status'];
  const colWidths = [30, 130, 200, 90, 120, 80];
  const rows = all.map((d, i) => [
    i + 1,
    d.invoiceNumber,
    d.customerId?.name || '-',
    formatDate(d.orderDate),
    (d.totalAmount || 0).toLocaleString('id-ID'),
    d.status,
  ]);

  drawPdfTable(doc, headers, rows, colWidths);
  addPdfPageNumbers(doc);
  doc.end();
  return doc;
};

const mongoExportPurchasesPdf = async (queryParams) => {
  const all = await mongoGetAllPurchasesData(queryParams);
  const periodLabel = queryParams.period || 'monthly';
  const doc = await createPdfDocument('Laporan Pembelian', periodLabel);

  const headers = ['No', 'No. PO', 'Supplier', 'Tanggal', 'Total (Rp)', 'Status'];
  const colWidths = [30, 130, 200, 90, 120, 80];
  const rows = all.map((d, i) => [
    i + 1,
    d.poNumber,
    d.supplierId?.name || '-',
    formatDate(d.orderDate),
    (d.totalAmount || 0).toLocaleString('id-ID'),
    d.status,
  ]);

  drawPdfTable(doc, headers, rows, colWidths);
  addPdfPageNumbers(doc);
  doc.end();
  return doc;
};

const mongoExportStockPdf = async (queryParams) => {
  const pipeline = buildStockPipeline(queryParams);
  pipeline.push({ $sort: { totalStock: -1 } }, { $limit: 50000 });
  const all = await Product.aggregate(pipeline);

  const doc = await createPdfDocument('Laporan Stok', 'Snapshot');

  const headers = ['No', 'Kode', 'Nama Produk', 'Kategori', 'Stok', 'Nilai (Rp)', 'Status'];
  const colWidths = [30, 80, 200, 100, 60, 120, 80];
  const rows = all.map((d, i) => [
    i + 1,
    d.code || d.sku,
    d.name,
    d.category,
    (d.totalStock || 0).toLocaleString('id-ID'),
    (d.stockValue || 0).toLocaleString('id-ID'),
    d.stockStatus,
  ]);

  drawPdfTable(doc, headers, rows, colWidths);
  addPdfPageNumbers(doc);
  doc.end();
  return doc;
};

const mongoExportFinancePdf = async (queryParams) => {
  const report = await mongoGetFinanceReport(queryParams);
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

const mongoExportExpiredPdf = async (queryParams) => {
  const now = new Date();
  const { batchMatch, kategori, golongan, search } = buildExpiredMatch(queryParams);
  const pipeline = [
    { $match: batchMatch },
    { $lookup: { from: 'products', localField: 'productId', foreignField: '_id', as: 'product' } },
    { $unwind: '$product' },
    { $match: { 'product.isActive': true } },
  ];
  if (kategori) pipeline.push({ $match: { 'product.category': kategori } });
  if (golongan) pipeline.push({ $match: { 'product.golongan': golongan } });
  if (search) {
    const regex = new RegExp(search, 'i');
    pipeline.push({ $match: { $or: [{ 'product.name': regex }, { batchNumber: regex }] } });
  }
  pipeline.push(
    { $sort: { expiryDate: 1 } },
    { $limit: 50000 },
    {
      $project: {
        name: '$product.name',
        batchNumber: 1,
        expiryDate: 1,
        qty: '$quantity',
        daysRemaining: { $floor: { $divide: [{ $subtract: ['$expiryDate', now] }, 86400000] } },
        kategori: '$product.category',
      },
    },
  );

  const all = await StockBatch.aggregate(pipeline);
  const doc = await createPdfDocument('Laporan Obat Kadaluarsa', 'Snapshot');

  const headers = ['No', 'Nama Produk', 'No. Batch', 'Tanggal ED', 'Sisa Hari', 'Qty', 'Status'];
  const colWidths = [30, 180, 130, 90, 60, 60, 80];
  const rows = all.map((d, i) => [
    i + 1,
    d.name,
    d.batchNumber,
    formatDate(d.expiryDate),
    d.daysRemaining,
    d.qty,
    getExpiryStatus(d.daysRemaining),
  ]);

  drawPdfTable(doc, headers, rows, colWidths);
  addPdfPageNumbers(doc);
  doc.end();
  return doc;
};

// ═══════════════════════════════════════════════════════════════
// ─── MySQL HELPERS ───
// ═══════════════════════════════════════════════════════════════

const getMySQLDateRange = (period, dateFrom, dateTo) => {
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
      if (dateTo) { end = new Date(dateTo); end.setHours(23, 59, 59, 999); }
      break;
    case 'monthly':
    default:
      start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
      start.setHours(0, 0, 0, 0);
      break;
  }
  return { start, end };
};

const mysqlDateWhere = (col, period, dateFrom, dateTo, clauses, params) => {
  const { start, end } = getMySQLDateRange(period || 'monthly', dateFrom, dateTo);
  if (start) { clauses.push(`${col} >= ?`); params.push(start); }
  if (end) { clauses.push(`${col} <= ?`); params.push(end); }
};

const getMySQLTrendFormat = (period) => {
  switch (period) {
    case 'daily': return '%Y-%m-%d';
    case 'weekly': return '%x-W%v';
    case 'yearly': return '%Y';
    case 'monthly':
    default: return '%Y-%m';
  }
};

// ═══════════════════════════════════════════════════════════════
// ─── MySQL: SALES REPORT ───
// ═══════════════════════════════════════════════════════════════

const mysqlGetAllSalesData = async (queryParams) => {
  const pool = getMySQLPool();
  const { search, status, customerId, period, dateFrom, dateTo } = queryParams;
  const where = []; const params = [];
  mysqlDateWhere('so.order_date', period, dateFrom, dateTo, where, params);
  if (status) { where.push('so.status = ?'); params.push(status); }
  if (customerId) { where.push('so.customer_id = ?'); params.push(customerId); }
  if (search) { where.push('so.invoice_number LIKE ?'); params.push(`%${search}%`); }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT so.*, c.name AS customer_name, c.code AS customer_code
     FROM sales_orders so LEFT JOIN customers c ON so.customer_id = c.id
     ${whereClause} ORDER BY so.order_date DESC LIMIT 50000`,
    params,
  );
  return rows.map((r) => ({
    ...r,
    invoiceNumber: r.invoice_number,
    customerId: { name: r.customer_name, code: r.customer_code },
    orderDate: r.order_date,
    totalAmount: Number(r.total_amount),
  }));
};

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
  if (search) { where.push('so.invoice_number LIKE ?'); params.push(`%${search}%`); }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const sortCol = (sort || '-created_at').replace(/^-/, '');
  const sortDir = (sort || '-created_at').startsWith('-') ? 'DESC' : 'ASC';

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
    invoiceNumber: r.invoice_number,
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
  const sortCol = (sort || '-created_at').replace(/^-/, '');
  const sortDir = (sort || '-created_at').startsWith('-') ? 'DESC' : 'ASC';

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
  let q = `SELECT p.id, p.code, p.sku, p.name, p.category, p.golongan, p.satuan, p.satuan_kecil, p.stok_minimum,
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
  const sortField = queryParams.sort || '-total_stock';
  const sortCol = sortField.replace(/^-/, '');
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
  const { period, dateFrom, dateTo } = queryParams;
  const { start, end } = getMySQLDateRange(period || 'monthly', dateFrom, dateTo);
  const dateFormat = getMySQLTrendFormat(period || 'monthly');
  const groupFormat = getTrendGroupFormat(period || 'monthly');

  const payWhere = []; const payParams = [];
  if (start) { payWhere.push('p.payment_date >= ?'); payParams.push(start); }
  if (end) { payWhere.push('p.payment_date <= ?'); payParams.push(end); }
  const payWhereStr = payWhere.length ? 'AND ' + payWhere.join(' AND ') : '';

  const [incomingTrend] = await pool.query(
    `SELECT DATE_FORMAT(p.payment_date, '${dateFormat}') as period_key, SUM(p.amount) as total
     FROM payments p JOIN invoices inv ON p.invoice_id = inv.id
     WHERE inv.invoice_type = 'sales' ${payWhereStr}
     GROUP BY period_key ORDER BY period_key`, payParams,
  );
  const [outgoingTrend] = await pool.query(
    `SELECT DATE_FORMAT(p.payment_date, '${dateFormat}') as period_key, SUM(p.amount) as total
     FROM payments p JOIN invoices inv ON p.invoice_id = inv.id
     WHERE inv.invoice_type = 'purchase' ${payWhereStr}
     GROUP BY period_key ORDER BY period_key`, payParams,
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

// ═══════════════════════════════════════════════════════════════
// ─── PROVIDER-ROUTED WRAPPERS ───
// ═══════════════════════════════════════════════════════════════

const isMysql = () => config.dbProvider === 'mysql';

const getSalesReport = (q) => isMysql() ? mysqlGetSalesReport(q) : mongoGetSalesReport(q);
const getSalesStats = (q) => isMysql() ? mysqlGetSalesStats(q) : mongoGetSalesStats(q);
const getSalesChart = (q) => isMysql() ? mysqlGetSalesChart(q) : mongoGetSalesChart(q);
const getPurchasesReport = (q) => isMysql() ? mysqlGetPurchasesReport(q) : mongoGetPurchasesReport(q);
const getPurchasesStats = (q) => isMysql() ? mysqlGetPurchasesStats(q) : mongoGetPurchasesStats(q);
const getPurchasesChart = (q) => isMysql() ? mysqlGetPurchasesChart(q) : mongoGetPurchasesChart(q);
const getStockReport = (q) => isMysql() ? mysqlGetStockReport(q) : mongoGetStockReport(q);
const getStockStats = (q) => isMysql() ? mysqlGetStockStats(q) : mongoGetStockStats(q);
const getStockChart = (q) => isMysql() ? mysqlGetStockChart(q) : mongoGetStockChart(q);
const getFinanceReport = (q) => isMysql() ? mysqlGetFinanceReport(q) : mongoGetFinanceReport(q);
const getFinanceStats = (q) => isMysql() ? mysqlGetFinanceStats(q) : mongoGetFinanceStats(q);
const getFinanceChart = (q) => isMysql() ? mysqlGetFinanceChart(q) : mongoGetFinanceChart(q);
const getExpiredReport = (q) => isMysql() ? mysqlGetExpiredReport(q) : mongoGetExpiredReport(q);
const getExpiredStats = (q) => isMysql() ? mysqlGetExpiredStats(q) : mongoGetExpiredStats(q);
const getExpiredChart = (q) => isMysql() ? mysqlGetExpiredChart(q) : mongoGetExpiredChart(q);
const exportSalesExcel = (q) => isMysql() ? mysqlExportSalesExcel(q) : mongoExportSalesExcel(q);
const exportSalesPdf = (q) => isMysql() ? mysqlExportSalesPdf(q) : mongoExportSalesPdf(q);
const exportPurchasesExcel = (q) => isMysql() ? mysqlExportPurchasesExcel(q) : mongoExportPurchasesExcel(q);
const exportPurchasesPdf = (q) => isMysql() ? mysqlExportPurchasesPdf(q) : mongoExportPurchasesPdf(q);
const exportStockExcel = (q) => isMysql() ? mysqlExportStockExcel(q) : mongoExportStockExcel(q);
const exportStockPdf = (q) => isMysql() ? mysqlExportStockPdf(q) : mongoExportStockPdf(q);
const exportFinanceExcel = (q) => isMysql() ? mysqlExportFinanceExcel(q) : mongoExportFinanceExcel(q);
const exportFinancePdf = (q) => isMysql() ? mysqlExportFinancePdf(q) : mongoExportFinancePdf(q);
const exportExpiredExcel = (q) => isMysql() ? mysqlExportExpiredExcel(q) : mongoExportExpiredExcel(q);
const exportExpiredPdf = (q) => isMysql() ? mysqlExportExpiredPdf(q) : mongoExportExpiredPdf(q);

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
