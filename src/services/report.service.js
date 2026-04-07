const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
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

const getSalesReport = async (queryParams) => {
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

const getSalesStats = async (queryParams) => {
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

const getSalesChart = async (queryParams) => {
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

const getPurchasesReport = async (queryParams) => {
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

const getPurchasesStats = async (queryParams) => {
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

const getPurchasesChart = async (queryParams) => {
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

const getStockReport = async (queryParams) => {
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

const getStockStats = async (queryParams) => {
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

const getStockChart = async (queryParams) => {
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

const getFinanceReport = async (queryParams) => {
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

const getFinanceStats = async (queryParams) => {
  const report = await getFinanceReport(queryParams);
  const { profitLoss } = report;
  const totalRevenue = profitLoss.salesRevenue;
  const totalExpense = profitLoss.cogs + profitLoss.operatingExpense + profitLoss.otherExpense;
  const netProfit = profitLoss.netProfit;
  const margin = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 1000) / 10 : 0;

  return { totalRevenue, totalExpense, netProfit, margin };
};

const getFinanceChart = async (queryParams) => {
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

const getExpiredReport = async (queryParams) => {
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

const getExpiredStats = async (queryParams) => {
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

const getExpiredChart = async (queryParams) => {
  const stats = await getExpiredStats(queryParams);

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

const exportSalesExcel = async (queryParams) => {
  const all = await getAllSalesData(queryParams);
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

const exportPurchasesExcel = async (queryParams) => {
  const all = await getAllPurchasesData(queryParams);
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

const exportStockExcel = async (queryParams) => {
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

const exportFinanceExcel = async (queryParams) => {
  const report = await getFinanceReport(queryParams);
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

const exportExpiredExcel = async (queryParams) => {
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
const getAllSalesData = async (queryParams) => {
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

const getAllPurchasesData = async (queryParams) => {
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

const exportSalesPdf = async (queryParams) => {
  const all = await getAllSalesData(queryParams);
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

const exportPurchasesPdf = async (queryParams) => {
  const all = await getAllPurchasesData(queryParams);
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

const exportStockPdf = async (queryParams) => {
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

const exportFinancePdf = async (queryParams) => {
  const report = await getFinanceReport(queryParams);
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

const exportExpiredPdf = async (queryParams) => {
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
