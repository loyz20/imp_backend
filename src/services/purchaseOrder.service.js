const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');
const Product = require('../models/Product');
const AppSetting = require('../models/AppSetting');
const ApiError = require('../utils/ApiError');
const { paginate } = require('../helpers');
const { PO_STATUS } = require('../constants');

/**
 * Get all purchase orders with filtering, search, and pagination
 */
const getPurchaseOrders = async (queryParams) => {
  const { page, limit, search, status, supplierId, dateFrom, dateTo, sort } = queryParams;

  const filter = {};

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { poNumber: { $regex: escaped, $options: 'i' } },
    ];
  }

  if (status) {
    const statuses = status.split(',').map((s) => s.trim());
    filter.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
  }
  if (supplierId) filter.supplierId = supplierId;

  if (dateFrom || dateTo) {
    filter.orderDate = {};
    if (dateFrom) filter.orderDate.$gte = new Date(dateFrom);
    if (dateTo) filter.orderDate.$lte = new Date(dateTo + 'T23:59:59.999Z');
  }

  return paginate(PurchaseOrder, {
    filter,
    page,
    limit,
    sort: sort || '-createdAt',
    populate: [
      { path: 'supplierId', select: 'name code phone email' },
      { path: 'items.productId', select: 'name sku golongan nie manufacturer' },
      { path: 'createdBy', select: 'name' },
      { path: 'updatedBy', select: 'name' },
    ],
  });
};

/**
 * Get purchase order statistics
 */
const getStats = async () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    total,
    statusCounts,
    totalValueResult,
    monthlyValueResult,
    topSuppliers,
  ] = await Promise.all([
    PurchaseOrder.countDocuments(),
    PurchaseOrder.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    PurchaseOrder.aggregate([
      { $match: { status: { $nin: [PO_STATUS.CANCELLED] } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]),
    PurchaseOrder.aggregate([
      { $match: { orderDate: { $gte: startOfMonth }, status: { $nin: [PO_STATUS.CANCELLED] } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } },
    ]),
    PurchaseOrder.aggregate([
      { $match: { status: { $nin: [PO_STATUS.CANCELLED] } } },
      {
        $group: {
          _id: '$supplierId',
          totalOrders: { $sum: 1 },
          totalValue: { $sum: '$totalAmount' },
        },
      },
      { $sort: { totalValue: -1 } },
      { $limit: 3 },
      {
        $lookup: {
          from: 'suppliers',
          localField: '_id',
          foreignField: '_id',
          as: 'supplier',
        },
      },
      { $unwind: '$supplier' },
      {
        $project: {
          supplierId: '$_id',
          name: '$supplier.name',
          totalOrders: 1,
          totalValue: 1,
        },
      },
    ]),
  ]);

  const statusMap = {};
  for (const s of statusCounts) {
    statusMap[s._id] = s.count;
  }

  const totalValue = totalValueResult[0]?.total || 0;
  const totalValueThisMonth = monthlyValueResult[0]?.total || 0;
  const activeTotal = total - (statusMap[PO_STATUS.CANCELLED] || 0);

  return {
    total,
    draft: statusMap[PO_STATUS.DRAFT] || 0,
    pendingApproval: statusMap[PO_STATUS.PENDING_APPROVAL] || 0,
    approved: statusMap[PO_STATUS.APPROVED] || 0,
    sent: statusMap[PO_STATUS.SENT] || 0,
    partialReceived: statusMap[PO_STATUS.PARTIAL_RECEIVED] || 0,
    received: statusMap[PO_STATUS.RECEIVED] || 0,
    cancelled: statusMap[PO_STATUS.CANCELLED] || 0,
    totalValue,
    totalValueThisMonth,
    avgOrderValue: activeTotal > 0 ? Math.round(totalValue / activeTotal) : 0,
    topSuppliers,
  };
};

/**
 * Get purchase order by ID
 */
const getPurchaseOrderById = async (id) => {
  const po = await PurchaseOrder.findById(id)
    .populate('supplierId', 'name code phone email address pbfLicense')
    .populate('items.productId', 'name sku golongan nie manufacturer')
    .populate('createdBy', 'name')
    .populate('updatedBy', 'name')
    .populate('approvalHistory.user', 'name');

  if (!po) {
    throw ApiError.notFound('Purchase order not found');
  }

  return po;
};

/**
 * Create a new purchase order
 */
const createPurchaseOrder = async (data, userId) => {
  // Validate supplier exists and is active
  const supplier = await Supplier.findById(data.supplierId);
  if (!supplier) {
    throw ApiError.notFound('Supplier tidak ditemukan');
  }
  if (!supplier.isActive) {
    throw ApiError.badRequest('Supplier tidak aktif');
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

  // Check for duplicate products in items
  const uniqueProducts = new Set(productIds.map(String));
  if (uniqueProducts.size !== productIds.length) {
    throw ApiError.badRequest('Tidak boleh ada produk duplikat dalam 1 PO');
  }

  // Check if approval is required from settings
  const settings = await AppSetting.getSettings();
  const requireApproval = settings?.purchaseOrder?.requireApproval !== false;

  data.status = requireApproval ? PO_STATUS.DRAFT : PO_STATUS.APPROVED;
  data.createdBy = userId;
  data.updatedBy = userId;

  if (!requireApproval) {
    data.approvedAt = new Date();
  }

  return PurchaseOrder.create(data);
};

/**
 * Update a purchase order
 */
const updatePurchaseOrder = async (id, data, userId) => {
  const po = await PurchaseOrder.findById(id);
  if (!po) {
    throw ApiError.notFound('Purchase order not found');
  }

  if (po.status !== PO_STATUS.DRAFT) {
    throw ApiError.badRequest('PO hanya dapat diedit saat berstatus draft');
  }

  // Validate supplier if changed
  if (data.supplierId) {
    const supplier = await Supplier.findById(data.supplierId);
    if (!supplier) throw ApiError.notFound('Supplier tidak ditemukan');
    if (!supplier.isActive) throw ApiError.badRequest('Supplier tidak aktif');
  }

  // Validate products if items changed
  if (data.items) {
    const productIds = data.items.map((item) => item.productId);
    const products = await Product.find({ _id: { $in: productIds } });
    if (products.length !== productIds.length) {
      throw ApiError.badRequest('Satu atau lebih produk tidak ditemukan');
    }
    const inactiveProduct = products.find((p) => !p.isActive);
    if (inactiveProduct) {
      throw ApiError.badRequest(`Produk "${inactiveProduct.name}" tidak aktif`);
    }
    const uniqueProducts = new Set(productIds.map(String));
    if (uniqueProducts.size !== productIds.length) {
      throw ApiError.badRequest('Tidak boleh ada produk duplikat dalam 1 PO');
    }
  }

  data.updatedBy = userId;
  Object.assign(po, data);
  await po.save();

  return po;
};

/**
 * Delete a purchase order
 */
const deletePurchaseOrder = async (id) => {
  const po = await PurchaseOrder.findById(id);
  if (!po) {
    throw ApiError.notFound('Purchase order not found');
  }

  if (po.status !== PO_STATUS.DRAFT && po.status !== PO_STATUS.CANCELLED) {
    throw ApiError.badRequest('PO hanya dapat dihapus saat berstatus draft atau cancelled');
  }

  await po.deleteOne();
};

/**
 * Get valid status transitions (considers requireApproval setting)
 */
const getValidTransitions = async () => {
  const settings = await AppSetting.getSettings();
  const requireApproval = settings?.purchaseOrder?.requireApproval !== false;

  return {
    [PO_STATUS.DRAFT]: requireApproval
      ? [PO_STATUS.PENDING_APPROVAL, PO_STATUS.CANCELLED]
      : [PO_STATUS.SENT, PO_STATUS.CANCELLED],
    [PO_STATUS.APPROVED]: [PO_STATUS.SENT, PO_STATUS.CANCELLED],
    [PO_STATUS.SENT]: [PO_STATUS.CANCELLED],
  };
};

/**
 * Change PO status
 */
const changeStatus = async (id, newStatus, notes, userId) => {
  const po = await PurchaseOrder.findById(id);
  if (!po) {
    throw ApiError.notFound('Purchase order not found');
  }

  const transitions = await getValidTransitions();
  const allowed = transitions[po.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw ApiError.badRequest(`Tidak dapat mengubah status dari '${po.status}' ke '${newStatus}'`);
  }

  // For sent → cancelled, check no receivings exist
  if (po.status === PO_STATUS.SENT && newStatus === PO_STATUS.CANCELLED) {
    const hasReceiving = po.items.some((item) => item.receivedQty > 0);
    if (hasReceiving) {
      throw ApiError.badRequest('PO tidak dapat dibatalkan karena sudah ada penerimaan barang');
    }
  }

  // For draft → pending_approval, ensure items exist
  if (newStatus === PO_STATUS.PENDING_APPROVAL && po.items.length === 0) {
    throw ApiError.badRequest('PO harus memiliki minimal 1 item untuk diajukan');
  }

  po.status = newStatus;
  po.updatedBy = userId;

  if (newStatus === PO_STATUS.SENT) {
    po.sentAt = new Date();
  }

  await po.save();
  return po;
};

/**
 * Approve a purchase order
 */
const approvePurchaseOrder = async (id, notes, userId) => {
  const po = await PurchaseOrder.findById(id);
  if (!po) {
    throw ApiError.notFound('Purchase order not found');
  }

  if (po.status !== PO_STATUS.PENDING_APPROVAL) {
    throw ApiError.badRequest('PO harus berstatus pending_approval untuk di-approve');
  }

  // Separation of duties: approver cannot be creator
  if (po.createdBy && po.createdBy.toString() === userId.toString()) {
    throw ApiError.badRequest('Pembuat PO tidak boleh menjadi approver (separation of duties)');
  }

  const level = po.approvalHistory.length + 1;

  po.approvalHistory.push({
    user: userId,
    action: 'approved',
    notes: notes || '',
    date: new Date(),
    level,
  });

  po.status = PO_STATUS.APPROVED;
  po.approvedAt = new Date();
  po.updatedBy = userId;

  await po.save();
  return po;
};

/**
 * Reject a purchase order
 */
const rejectPurchaseOrder = async (id, notes, userId) => {
  const po = await PurchaseOrder.findById(id);
  if (!po) {
    throw ApiError.notFound('Purchase order not found');
  }

  if (po.status !== PO_STATUS.PENDING_APPROVAL) {
    throw ApiError.badRequest('PO harus berstatus pending_approval untuk di-reject');
  }

  const level = po.approvalHistory.length + 1;

  po.approvalHistory.push({
    user: userId,
    action: 'rejected',
    notes,
    date: new Date(),
    level,
  });

  po.status = PO_STATUS.DRAFT;
  po.approvedAt = null;
  po.updatedBy = userId;

  await po.save();
  return po;
};

module.exports = {
  getPurchaseOrders,
  getStats,
  getPurchaseOrderById,
  createPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  changeStatus,
  approvePurchaseOrder,
  rejectPurchaseOrder,
};
