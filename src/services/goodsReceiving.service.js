const GoodsReceiving = require('../models/GoodsReceiving');
const PurchaseOrder = require('../models/PurchaseOrder');
const Supplier = require('../models/Supplier');
const Product = require('../models/Product');
const inventoryService = require('./inventory.service');
const financeService = require('./finance.service');
const ApiError = require('../utils/ApiError');
const { paginate } = require('../helpers');
const { GR_STATUS, PO_STATUS } = require('../constants');

const ensureProductsExist = async (items) => {
  const uniqueProductIds = [...new Set(items.map((item) => item.productId.toString()))];
  const products = await Product.find({ _id: { $in: uniqueProductIds } }).select('_id').lean();

  if (products.length !== uniqueProductIds.length) {
    throw ApiError.badRequest('Satu atau lebih produk tidak ditemukan');
  }
};

/**
 * Get all goods receivings with filtering, search, and pagination
 */
const getGoodsReceivings = async (queryParams) => {
  const { page, limit, search, status, supplierId, dateFrom, dateTo, sort } = queryParams;

  const filter = {};

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { invoiceNumber: { $regex: escaped, $options: 'i' } },
      { deliveryNote: { $regex: escaped, $options: 'i' } },
    ];
  }

  if (status) {
    const statuses = status.split(',').map((s) => s.trim());
    filter.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
  }
  if (supplierId) filter.supplierId = supplierId;

  if (dateFrom || dateTo) {
    filter.receivingDate = {};
    if (dateFrom) filter.receivingDate.$gte = new Date(dateFrom);
    if (dateTo) filter.receivingDate.$lte = new Date(dateTo + 'T23:59:59.999Z');
  }

  return paginate(GoodsReceiving, {
    filter,
    page,
    limit,
    sort: sort || '-createdAt',
    populate: [
      { path: 'supplierId', select: 'name code' },
      { path: 'purchaseOrderId', select: 'poNumber status' },
      { path: 'items.productId', select: 'name sku golongan hargaJual' },
      { path: 'receivedBy', select: 'name' },
      { path: 'createdBy', select: 'name' },
    ],
  });
};

/**
 * Get goods receiving statistics
 */
const getStats = async () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);

  const [
    total,
    statusCounts,
    thisMonth,
    thisWeek,
    itemsReceivedThisMonth,
    discrepancyCount,
    damagedItems,
  ] = await Promise.all([
    GoodsReceiving.countDocuments(),
    GoodsReceiving.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    GoodsReceiving.countDocuments({ receivingDate: { $gte: startOfMonth } }),
    GoodsReceiving.countDocuments({ receivingDate: { $gte: startOfWeek } }),
    GoodsReceiving.aggregate([
      { $match: { receivingDate: { $gte: startOfMonth } } },
      { $project: { itemCount: { $size: '$items' } } },
      { $group: { _id: null, total: { $sum: '$itemCount' } } },
    ]),
    GoodsReceiving.aggregate([
      { $unwind: '$items' },
      { $match: { 'items.orderedQty': { $gt: 0 }, $expr: { $ne: ['$items.receivedQty', '$items.orderedQty'] } } },
      { $group: { _id: '$_id' } },
      { $count: 'total' },
    ]),
    GoodsReceiving.aggregate([
      { $unwind: '$items' },
      { $match: { 'items.conditionStatus': { $in: ['rusak', 'cacat'] } } },
      { $count: 'total' },
    ]),
  ]);

  const statusMap = {};
  for (const s of statusCounts) {
    statusMap[s._id] = s.count;
  }

  const draft = statusMap[GR_STATUS.DRAFT] || 0;
  const checked = statusMap[GR_STATUS.CHECKED] || 0;

  return {
    total,
    draft,
    checked,
    pendingVerification: draft + checked,
    verified: statusMap[GR_STATUS.VERIFIED] || 0,
    completed: statusMap[GR_STATUS.COMPLETED] || 0,
    thisMonth,
    thisWeek,
    itemsReceivedThisMonth: itemsReceivedThisMonth[0]?.total || 0,
    discrepancyCount: discrepancyCount[0]?.total || 0,
    damagedItems: damagedItems[0]?.total || 0,
  };
};

/**
 * Get goods receiving by ID
 */
const getGoodsReceivingById = async (id) => {
  const gr = await GoodsReceiving.findById(id)
    .populate('supplierId', 'name code')
    .populate({
      path: 'purchaseOrderId',
      select: 'poNumber status orderDate',
      populate: { path: 'supplierId', select: 'name code phone' },
    })
    .populate('items.product', 'name sku golongan nie manufacturer suhuPenyimpanan hargaJual')
    .populate('receivedBy', 'name')
    .populate('verifiedBy', 'name')
    .populate('createdBy', 'name')
    .populate('updatedBy', 'name');

  if (!gr) {
    throw ApiError.notFound('Goods receiving not found');
  }

  return gr;
};

/**
 * Create a new goods receiving
 */
const createGoodsReceiving = async (data, userId) => {
  let supplierId = data.supplierId;

  // If PO is provided, validate and auto-fill supplier
  if (data.purchaseOrderId) {
    const po = await PurchaseOrder.findById(data.purchaseOrderId)
      .populate('items.productId', 'name sku');
    if (!po) {
      throw ApiError.notFound('Purchase order tidak ditemukan');
    }
    if (po.status !== PO_STATUS.SENT && po.status !== PO_STATUS.PARTIAL_RECEIVED) {
      throw ApiError.badRequest('PO harus berstatus sent atau partial_received');
    }
    supplierId = po.supplierId;

    // Keep orderedQty as reference from PO when product exists in PO.
    data.items = data.items.map((grItem) => {
      const poItem = po.items.find(
        (pi) => (pi.productId._id || pi.productId).toString() === grItem.productId,
      );

      if (poItem && (grItem.orderedQty === undefined || grItem.orderedQty === null)) {
        return {
          ...grItem,
          orderedQty: poItem.quantity,
        };
      }

      if (!poItem && (grItem.orderedQty === undefined || grItem.orderedQty === null)) {
        return {
          ...grItem,
          orderedQty: 0,
        };
      }

      return grItem;
    });
  }

  if (!supplierId) {
    throw ApiError.badRequest('Supplier wajib dipilih (atau pilih PO yang terkait)');
  }

  // Validate supplier
  const supplier = await Supplier.findById(supplierId);
  if (!supplier) throw ApiError.notFound('Supplier tidak ditemukan');

  // Validate all products (supports duplicate product rows across batches)
  await ensureProductsExist(data.items);

  // Validate expiry dates are in the future
  const now = new Date();
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    if (new Date(item.expiryDate) <= now) {
      throw ApiError.badRequest(`Item ke-${i + 1}: Tanggal kedaluwarsa harus di masa depan`);
    }
    if (item.manufacturingDate && new Date(item.manufacturingDate) >= new Date(item.expiryDate)) {
      throw ApiError.badRequest(`Item ke-${i + 1}: Tanggal produksi harus sebelum tanggal kedaluwarsa`);
    }
  }

  data.supplierId = supplierId;
  data.status = GR_STATUS.DRAFT;
  data.receivedBy = userId;
  data.createdBy = userId;
  data.updatedBy = userId;

  return GoodsReceiving.create(data);
};

/**
 * Update a goods receiving
 */
const updateGoodsReceiving = async (id, data, userId) => {
  const gr = await GoodsReceiving.findById(id);
  if (!gr) {
    throw ApiError.notFound('Goods receiving not found');
  }

  if (gr.status !== GR_STATUS.DRAFT) {
    throw ApiError.badRequest('Penerimaan hanya dapat diedit saat berstatus draft');
  }

  // Re-validate products if items changed
  if (data.items) {
    await ensureProductsExist(data.items);

    const now = new Date();
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];
      if (item.expiryDate && new Date(item.expiryDate) <= now) {
        throw ApiError.badRequest(`Item ke-${i + 1}: Tanggal kedaluwarsa harus di masa depan`);
      }
      if (item.manufacturingDate && item.expiryDate && new Date(item.manufacturingDate) >= new Date(item.expiryDate)) {
        throw ApiError.badRequest(`Item ke-${i + 1}: Tanggal produksi harus sebelum tanggal kedaluwarsa`);
      }
    }
  }

  data.updatedBy = userId;
  Object.assign(gr, data);
  await gr.save();

  return gr;
};

/**
 * Delete a goods receiving
 */
const deleteGoodsReceiving = async (id) => {
  const gr = await GoodsReceiving.findById(id);
  if (!gr) {
    throw ApiError.notFound('Goods receiving not found');
  }

  if (gr.status !== GR_STATUS.DRAFT) {
    throw ApiError.badRequest('Penerimaan hanya dapat dihapus saat berstatus draft');
  }

  await gr.deleteOne();
};

/**
 * Verify goods receiving (by Apoteker)
 */
const verifyGoodsReceiving = async (id, notes, userId) => {
  const gr = await GoodsReceiving.findById(id);
  if (!gr) {
    throw ApiError.notFound('Goods receiving not found');
  }

  if (gr.status !== GR_STATUS.DRAFT && gr.status !== GR_STATUS.CHECKED) {
    throw ApiError.badRequest('Penerimaan harus berstatus draft atau checked untuk diverifikasi');
  }

  // For PO-linked receiving, supplier invoice number must be entered manually.
  if (gr.purchaseOrderId && !gr.invoiceNumber) {
    throw ApiError.badRequest('Nomor faktur supplier wajib diisi sebelum verifikasi penerimaan PO');
  }

  // Validate all items have batch and expiry
  const now = new Date();
  for (let i = 0; i < gr.items.length; i++) {
    const item = gr.items[i];
    if (!item.batchNumber) {
      throw ApiError.badRequest(`Item ke-${i + 1}: Nomor batch wajib diisi (CDOB)`);
    }
    if (!item.expiryDate) {
      throw ApiError.badRequest(`Item ke-${i + 1}: Tanggal kedaluwarsa wajib diisi (CDOB)`);
    }
    if (new Date(item.expiryDate) <= now) {
      throw ApiError.badRequest(`Item ke-${i + 1}: Produk sudah expired, tidak dapat diverifikasi`);
    }
  }

  gr.status = GR_STATUS.VERIFIED;
  gr.verifiedBy = userId;
  gr.verifiedAt = new Date();
  gr.verificationNotes = notes || '';
  gr.updatedBy = userId;

  await gr.save();

  // Update PO receivedQty if linked
  if (gr.purchaseOrderId) {
    await updatePOReceiving(gr.purchaseOrderId);
  }

  // Create stock batches and mutation records
  await inventoryService.createGRMutations(gr, userId);

  // Auto-create journal entry: DR Persediaan, CR Hutang Usaha + PPN Masukan
  // + Create purchase invoice document using manual supplier invoice number.
  try {
    const po = gr.purchaseOrderId ? await PurchaseOrder.findById(gr.purchaseOrderId) : null;
    await financeService.createJournalFromGR(gr, po);
    await financeService.createPurchaseInvoiceFromGR(gr, po, userId);
  } catch (err) {
      }

  return gr;
};

/**
 * Update PO item receivedQty based on all related GRs
 */
async function updatePOReceiving(poId) {
  const po = await PurchaseOrder.findById(poId);
  if (!po) return;

  // Get all verified/completed GRs for this PO
  const grs = await GoodsReceiving.find({
    purchaseOrderId: poId,
    status: { $in: [GR_STATUS.VERIFIED, GR_STATUS.COMPLETED] },
  });

  // Reset receivedQty on PO items
  for (const item of po.items) {
    item.receivedQty = 0;
  }

  // Sum up receivedQty from all GRs
  for (const gr of grs) {
    for (const grItem of gr.items) {
      const poItem = po.items.find(
        (pi) => pi.productId.toString() === grItem.productId.toString(),
      );
      if (poItem) {
        poItem.receivedQty += grItem.receivedQty;
      }
    }
  }

  // Cap PO receivedQty to planned quantity, because GR can now exceed plan.
  for (const item of po.items) {
    item.receivedQty = Math.min(item.receivedQty || 0, item.quantity || 0);
  }

  // Determine PO status
  const allReceived = po.items.every((item) => item.receivedQty >= item.quantity);
  const someReceived = po.items.some((item) => item.receivedQty > 0);

  if (allReceived) {
    po.status = PO_STATUS.RECEIVED;
  } else if (someReceived) {
    po.status = PO_STATUS.PARTIAL_RECEIVED;
  }

  po.updatedBy = null; // system update
  await po.save();
}

/**
 * Get available POs for receiving (status: sent or partial_received)
 */
const getAvailablePOs = async (queryParams) => {
  const { search, supplierId, page, limit } = queryParams;

  const filter = {
    status: { $in: [PO_STATUS.SENT, PO_STATUS.PARTIAL_RECEIVED] },
  };

  if (supplierId) filter.supplierId = supplierId;

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { poNumber: { $regex: escaped, $options: 'i' } },
    ];
  }

  const result = await paginate(PurchaseOrder, {
    filter,
    page: page || 1,
    limit: limit || 20,
    sort: '-createdAt',
    populate: [
      { path: 'supplierId', select: 'name code' },
      { path: 'items.productId', select: 'name sku' },
    ],
  });

  // Add remainingQty to each item
  result.docs = result.docs.map((po) => {
    const poObj = typeof po.toJSON === 'function' ? po.toJSON() : { ...po };
    if (poObj.items) {
      poObj.items = poObj.items.map((item) => ({
        ...item,
        remainingQty: Math.max(0, item.quantity - (item.receivedQty || 0)),
      }));
    }
    return poObj;
  });

  return result;
};

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
