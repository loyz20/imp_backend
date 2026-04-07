const SalesOrder = require('../models/SalesOrder');
const Customer = require('../models/Customer');
const Product = require('../models/Product');
const AppSetting = require('../models/AppSetting');
const ApiError = require('../utils/ApiError');
const { paginate } = require('../helpers');
const { SO_STATUS } = require('../constants');
const inventoryService = require('./inventory.service');
const financeService = require('./finance.service');

// ─── Valid status transitions ───
const STATUS_TRANSITIONS = {
  [SO_STATUS.DRAFT]: [SO_STATUS.PACKED, SO_STATUS.CANCELED],
  [SO_STATUS.PACKED]: [SO_STATUS.DELIVERED],
  [SO_STATUS.DELIVERED]: [SO_STATUS.PARTIAL_DELIVERED, SO_STATUS.RETURNED, SO_STATUS.COMPLETED],
  [SO_STATUS.PARTIAL_DELIVERED]: [SO_STATUS.DELIVERED, SO_STATUS.RETURNED, SO_STATUS.COMPLETED],
};

const LEGACY_STATUS_MAP = {
  draft: SO_STATUS.DRAFT,
  confirmed: SO_STATUS.PACKED,
  processing: SO_STATUS.PACKED,
  ready_to_ship: SO_STATUS.PACKED,
  partial_shipped: SO_STATUS.PARTIAL_DELIVERED,
  shipped: SO_STATUS.DELIVERED,
  completed: SO_STATUS.COMPLETED,
  cancelled: SO_STATUS.CANCELED,
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
  deliveryNumber: so.invoiceNumber,
  deliveredAt: so.deliveredAt,
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
const getSalesOrders = async (queryParams) => {
  const { page, limit, search, status, customerId, dateFrom, dateTo, sort } = queryParams;

  const filter = {};

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { invoiceNumber: { $regex: escaped, $options: 'i' } },
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
      { path: 'customerId', select: 'name code type phone email' },
      { path: 'items.productId', select: 'name sku golongan satuan hargaJual' },
      { path: 'createdBy', select: 'name' },
      { path: 'updatedBy', select: 'name' },
    ],
  });
};

/**
 * Get sales order statistics
 */
const getStats = async () => {
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
      { $match: { status: { $nin: [SO_STATUS.CANCELED] } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]),
    SalesOrder.aggregate([
      { $match: { orderDate: { $gte: startOfMonth }, status: { $nin: [SO_STATUS.CANCELED] } } },
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
  const activeTotal = total - (statusMap[SO_STATUS.CANCELED] || 0);

  return {
    total,
    packed: statusMap[SO_STATUS.PACKED] || 0,
    delivered: statusMap[SO_STATUS.DELIVERED] || 0,
    partialDelivered: statusMap[SO_STATUS.PARTIAL_DELIVERED] || 0,
    returned: statusMap[SO_STATUS.RETURNED] || 0,
    canceled: statusMap[SO_STATUS.CANCELED] || 0,
    totalValue,
    totalValueThisMonth,
    averageOrderValue: activeTotal > 0 ? Math.round(totalValue / activeTotal) : 0,
    topCustomers,
  };
};

/**
 * Get sales order by ID
 */
const getSalesOrderById = async (id) => {
  const so = await SalesOrder.findById(id)
    .populate('customerId', 'name code type phone email address siaLicense pharmacist creditLimit')
    .populate('items.productId', 'name sku golongan satuan hargaJual')
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
const createSalesOrder = async (data, userId) => {
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
    if (customer.siaLicense?.expiryDate && new Date(customer.siaLicense.expiryDate) < new Date()) {
      throw ApiError.badRequest('SIA pelanggan sudah expired');
    }
  }

  // Validate all products exist and are active
  const productIds = data.items.map((item) => item.productId);
  const products = await Product.find({ _id: { $in: productIds } });

  if (products.length !== productIds.length) {
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

  data.status = SO_STATUS.DRAFT;
  data.createdBy = userId;
  data.updatedBy = userId;

  const so = new SalesOrder(data);

  // Calculate totals with PPN
  const { ppnRate } = await getPpnConfig();
  so.calculateTotals(ppnRate);

  await so.save();

  return so;
};

/**
 * Update a sales order
 */
const updateSalesOrder = async (id, data, userId) => {
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
    const products = await Product.find({ _id: { $in: productIds } });
    if (products.length !== productIds.length) {
      throw ApiError.badRequest('Satu atau lebih produk tidak ditemukan');
    }
    const inactiveProduct = products.find((p) => !p.isActive);
    if (inactiveProduct) {
      throw ApiError.badRequest(`Produk "${inactiveProduct.name}" tidak aktif`);
    }
  }

  // Check duplicate SO number
  if (data.invoiceNumber) {
    const existing = await SalesOrder.findOne({
      _id: { $ne: id },
      invoiceNumber: data.invoiceNumber,
    });
    if (existing) {
      throw ApiError.conflict('Nomor SO sudah digunakan');
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
const deleteSalesOrder = async (id) => {
  const so = await SalesOrder.findById(id);
  if (!so) {
    throw ApiError.notFound('Sales order tidak ditemukan');
  }

  const normalizedStatus = normalizeSoStatus(so.status);
  if (so.status !== normalizedStatus) {
    so.status = normalizedStatus;
  }

  if (normalizedStatus !== SO_STATUS.DRAFT && normalizedStatus !== SO_STATUS.CANCELED) {
    throw ApiError.badRequest('SO hanya dapat dihapus saat berstatus draft atau canceled');
  }

  await so.deleteOne();
};

/**
 * Change SO status
 */
const changeStatus = async (id, newStatus, notes, userId) => {
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

  if (newStatus === SO_STATUS.PACKED && !so.packedAt) {
    await inventoryService.createDeliveryMutations(toDeliveryLikePayload(so), userId);
    so.packedAt = now;
  }

  if (
    (newStatus === SO_STATUS.PARTIAL_DELIVERED || newStatus === SO_STATUS.DELIVERED)
    && !so.shippedAt
  ) {
    so.shippedAt = now;
  }

  if (newStatus === SO_STATUS.DELIVERED) {
    so.deliveredAt = now;
  }

  if (newStatus === SO_STATUS.COMPLETED) {
    so.completedAt = now;
  }

  if (newStatus === SO_STATUS.RETURNED) {
    so.returnedAt = now;
  }

  if (newStatus === SO_STATUS.RETURNED || newStatus === SO_STATUS.CANCELED) {
    await inventoryService.revertDeliveryMutations(toDeliveryLikePayload(so), userId);
  }

  if (newStatus === SO_STATUS.DELIVERED) {
    const deliveryPayload = toDeliveryLikePayload(so);

    try {
      await financeService.createInvoiceFromDelivery(deliveryPayload, userId);
    } catch (error) {
      // Keep status change non-blocking if invoice generation fails.
          }

    try {
      await financeService.createCOGSJournal(deliveryPayload);
    } catch (error) {
      // Keep status change non-blocking if COGS journal generation fails.
          }
  }

  await so.save();
  return so;
};

module.exports = {
  getSalesOrders,
  getStats,
  getSalesOrderById,
  createSalesOrder,
  updateSalesOrder,
  deleteSalesOrder,
  changeStatus,
};
