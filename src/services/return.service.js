const Return = require('../models/Return');
const Supplier = require('../models/Supplier');
const StockBatch = require('../models/StockBatch');
const StockMutation = require('../models/StockMutation');
const AppSetting = require('../models/AppSetting');
const ApiError = require('../utils/ApiError');
const { paginate } = require('../helpers');
const financeService = require('./finance.service');
const {
  RETURN_STATUS,
  RETURN_TYPE,
  ITEM_CONDITION,
  DISPOSITION,
  BATCH_STATUS,
  MUTATION_TYPE,
  MUTATION_REFERENCE_TYPE,
} = require('../constants');

// ─── Valid status transitions ───
const STATUS_TRANSITIONS = {
  [RETURN_STATUS.DRAFT]: [RETURN_STATUS.PENDING_REVIEW, RETURN_STATUS.CANCELLED],
  [RETURN_STATUS.PENDING_REVIEW]: [RETURN_STATUS.APPROVED, RETURN_STATUS.REJECTED],
  [RETURN_STATUS.APPROVED]: [RETURN_STATUS.PICKING],
  [RETURN_STATUS.PICKING]: [RETURN_STATUS.IN_TRANSIT],
  [RETURN_STATUS.IN_TRANSIT]: [RETURN_STATUS.RECEIVED],
  [RETURN_STATUS.RECEIVED]: [RETURN_STATUS.INSPECTED],
  [RETURN_STATUS.INSPECTED]: [RETURN_STATUS.COMPLETED],
};

/**
 * Get all returns
 */
const getReturns = async (queryParams) => {
  const { page, limit, search, status, returnType, customerId, supplierId, dateFrom, dateTo, sort } = queryParams;

  const filter = {};

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { returnNumber: { $regex: escaped, $options: 'i' } },
    ];
  }

  if (status) {
    const statuses = status.split(',').map((s) => s.trim());
    filter.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
  }
  if (returnType) filter.returnType = returnType;
  if (customerId) filter.customerId = customerId;
  if (supplierId) filter.supplierId = supplierId;

  if (dateFrom || dateTo) {
    filter.returnDate = {};
    if (dateFrom) filter.returnDate.$gte = new Date(dateFrom);
    if (dateTo) filter.returnDate.$lte = new Date(dateTo + 'T23:59:59.999Z');
  }

  return paginate(Return, {
    filter,
    page,
    limit,
    sort: sort || '-createdAt',
    populate: [
      { path: 'deliveryId', select: 'deliveryNumber status deliveryDate' },
      { path: 'customerId', select: 'name code type phone' },
      { path: 'supplierId', select: 'name code phone' },
      { path: 'items.productId', select: 'name sku satuan golongan' },
      { path: 'createdBy', select: 'name' },
      { path: 'updatedBy', select: 'name' },
    ],
  });
};

/**
 * Get return statistics
 */
const getStats = async () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [statusCounts, typeCounts, completedThisMonth, itemStats] = await Promise.all([
    Return.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Return.aggregate([
      { $group: { _id: '$returnType', count: { $sum: 1 } } },
    ]),
    Return.countDocuments({
      status: RETURN_STATUS.COMPLETED,
      completedAt: { $gte: startOfMonth },
    }),
    Return.aggregate([
      { $match: { status: RETURN_STATUS.COMPLETED } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.disposition',
          totalItems: { $sum: '$items.quantityReturned' },
        },
      },
    ]),
  ]);

  const statusMap = {};
  let total = 0;
  for (const s of statusCounts) {
    statusMap[s._id] = s.count;
    total += s.count;
  }

  const typeMap = {};
  for (const t of typeCounts) {
    typeMap[t._id] = t.count;
  }

  const itemDispoMap = {};
  let totalReturnedItems = 0;
  for (const i of itemStats) {
    itemDispoMap[i._id] = i.totalItems;
    totalReturnedItems += i.totalItems;
  }

  return {
    total,
    draft: statusMap[RETURN_STATUS.DRAFT] || 0,
    pendingReview: statusMap[RETURN_STATUS.PENDING_REVIEW] || 0,
    approved: statusMap[RETURN_STATUS.APPROVED] || 0,
    picking: statusMap[RETURN_STATUS.PICKING] || 0,
    inTransit: statusMap[RETURN_STATUS.IN_TRANSIT] || 0,
    received: statusMap[RETURN_STATUS.RECEIVED] || 0,
    inspected: statusMap[RETURN_STATUS.INSPECTED] || 0,
    completed: statusMap[RETURN_STATUS.COMPLETED] || 0,
    rejected: statusMap[RETURN_STATUS.REJECTED] || 0,
    cancelled: statusMap[RETURN_STATUS.CANCELLED] || 0,
    customerReturn: typeMap[RETURN_TYPE.CUSTOMER_RETURN] || 0,
    supplierReturn: typeMap[RETURN_TYPE.SUPPLIER_RETURN] || 0,
    completedThisMonth,
    totalReturnedItems,
    restockedItems: itemDispoMap[DISPOSITION.RESTOCK] || 0,
    destroyedItems: itemDispoMap[DISPOSITION.DESTROY] || 0,
  };
};

/**
 * Get return by ID
 */
const getReturnById = async (id) => {
  const ret = await Return.findById(id)
    .populate({
      path: 'deliveryId',
      select: 'deliveryNumber status deliveryDate salesOrderId',
      populate: { path: 'salesOrderId', select: 'invoiceNumber status' },
    })
    .populate('customerId', 'name code type phone address')
    .populate('supplierId', 'name code phone address')
    .populate('items.productId', 'name sku satuan golongan')
    .populate('statusHistory.changedBy', 'name')
    .populate('createdBy', 'name')
    .populate('updatedBy', 'name');

  if (!ret) {
    throw ApiError.notFound('Return tidak ditemukan');
  }

  return ret;
};


/**
 * Create a new return
 */
const createReturn = async (data, userId) => {
  // Validate based on return type
  if (data.returnType === RETURN_TYPE.CUSTOMER_RETURN) {
    // Customer return requires customerId
    if (!data.customerId) {
      throw ApiError.badRequest('Customer ID wajib untuk customer return');
    }

    // For customer returns, set default quantityDelivered to quantityReturned
    // since we don't have delivery data anymore
    data.items = data.items.map(item => ({
      ...item,
      quantityDelivered: item.quantityReturned
    }));
  } else if (data.returnType === RETURN_TYPE.SUPPLIER_RETURN) {
    // Validate supplier if provided
    if (data.supplierId) {
      const supplier = await Supplier.findById(data.supplierId);
      if (!supplier) {
        throw ApiError.notFound('Supplier tidak ditemukan');
      }
      if (!data.supplierName) data.supplierName = supplier.name;
    }
  }

  data.status = RETURN_STATUS.DRAFT;
  data.createdBy = userId;
  data.updatedBy = userId;
  data.statusHistory = [
    {
      status: RETURN_STATUS.DRAFT,
      notes: 'Return created',
      changedBy: userId,
      date: new Date(),
    },
  ];

  const ret = new Return(data);
  await ret.save();
  return ret;
};

/**
 * Update a return (draft only)
 */
const updateReturn = async (id, data, userId) => {
  const ret = await Return.findById(id);
  if (!ret) {
    throw ApiError.notFound('Return tidak ditemukan');
  }

  if (ret.status !== RETURN_STATUS.DRAFT) {
    throw ApiError.badRequest('Retur hanya dapat diedit saat berstatus draft');
  }

  // Cannot change returnType
  delete data.returnType;
  delete data.deliveryId; // Remove this field since delivery module is deleted

  // For customer returns, update quantityDelivered if items change
  if (data.items && ret.returnType === RETURN_TYPE.CUSTOMER_RETURN) {
    data.items = data.items.map(item => ({
      ...item,
      quantityDelivered: item.quantityReturned
    }));
  }

  // Check duplicate return number
  if (data.returnNumber) {
    const existing = await Return.findOne({
      _id: { $ne: id },
      returnNumber: data.returnNumber,
    });
    if (existing) {
      throw ApiError.conflict('Nomor retur sudah digunakan');
    }
  }

  data.updatedBy = userId;
  Object.assign(ret, data);
  await ret.save();

  return ret;
};

/**
 * Delete a return (draft/cancelled only)
 */
const deleteReturn = async (id) => {
  const ret = await Return.findById(id);
  if (!ret) {
    throw ApiError.notFound('Return tidak ditemukan');
  }

  if (ret.status !== RETURN_STATUS.DRAFT && ret.status !== RETURN_STATUS.CANCELLED) {
    throw ApiError.badRequest('Retur hanya dapat dihapus saat berstatus draft atau cancelled');
  }

  await ret.deleteOne();
};

/**
 * Execute dispositions on return completion
 * - restock: add stock back to batch
 * - destroy: reduce stock (mark as disposed)
 */
const executeDispositions = async (ret, userId) => {
  for (const item of ret.items) {
    if (!item.disposition) continue;

    if (item.disposition === DISPOSITION.RESTOCK) {
      // Add stock back to batch
      if (item.batchNumber && item.productId) {
        let batch = await StockBatch.findOne({
          productId: item.productId,
          batchNumber: item.batchNumber,
        });

        if (!batch) {
          // Batch not found — create a new batch from available data
          const Delivery = require('../models/Delivery');
          let delivery = null;
          if (ret.deliveryId) {
            delivery = await Delivery.findById(ret.deliveryId).lean();
          }
          batch = await StockBatch.create({
            productId: item.productId,
            batchNumber: item.batchNumber,
            quantity: 0,
            initialQuantity: 0,
            expiryDate: item.expiryDate || new Date(Date.now() + 365 * 86400000),
            receivedDate: new Date(),
            status: BATCH_STATUS.ACTIVE,
            createdBy: userId,
          });
                  }

        const balanceBefore = batch.quantity;
        batch.quantity += item.quantityReturned;
        if (batch.status === BATCH_STATUS.DEPLETED) {
          batch.status = BATCH_STATUS.ACTIVE;
        }
        await batch.save();

        await StockMutation.create({
          mutationDate: new Date(),
          type: MUTATION_TYPE.RETURN,
          productId: item.productId,
          batchId: batch._id,
          batchNumber: item.batchNumber,
          quantity: item.quantityReturned,
          balanceBefore,
          balanceAfter: balanceBefore + item.quantityReturned,
          referenceType: MUTATION_REFERENCE_TYPE.RETURN,
          referenceId: ret._id,
          referenceNumber: ret.returnNumber,
          notes: `Restock dari retur ${ret.returnNumber}`,
          createdBy: userId,
        });
      }
    } else if (item.disposition === DISPOSITION.DESTROY) {
      // Record disposal mutation (reduce stock if batch exists)
      if (item.batchNumber && item.productId) {
        const batch = await StockBatch.findOne({
          productId: item.productId,
          batchNumber: item.batchNumber,
        });

        if (batch && batch.quantity > 0) {
          const deductQty = Math.min(batch.quantity, item.quantityReturned);
          const balanceBefore = batch.quantity;
          batch.quantity -= deductQty;
          if (batch.quantity <= 0) {
            batch.status = BATCH_STATUS.DISPOSED;
          }
          await batch.save();

          await StockMutation.create({
            mutationDate: new Date(),
            type: MUTATION_TYPE.DISPOSAL,
            productId: item.productId,
            batchId: batch._id,
            batchNumber: item.batchNumber,
            quantity: -deductQty,
            balanceBefore,
            balanceAfter: balanceBefore - deductQty,
            referenceType: MUTATION_REFERENCE_TYPE.DISPOSAL,
            referenceId: ret._id,
            referenceNumber: ret.returnNumber,
            notes: `Pemusnahan dari retur ${ret.returnNumber}`,
            createdBy: userId,
          });
        }
      }
    }
    // quarantine & return_to_supplier: no stock movement, just documented
  }
};

/**
 * Auto-create credit memo for customer return
 * Reduces customer's receivables by the value of returned items
 */
const createReturnCreditMemo = async (ret, userId) => {
  const Invoice = require('../models/Invoice');

  // Since delivery module is removed, we can't link to specific invoice
  // We'll create credit memo without specific invoice reference
  let invoice = null;

  // Build memo items from return items
  const memoItems = [];
  for (const item of ret.items) {
    if (!item.quantityReturned || item.quantityReturned <= 0) continue;

    // Calculate unit price from invoice if available
    let unitPrice = 0;
    if (invoice) {
      const invItem = invoice.items.find(
        (i) => i.productId.toString() === item.productId.toString(),
      );
      if (invItem) {
        // discount is absolute amount, compute effective unit price from subtotal
        unitPrice = invItem.quantity > 0 ? Math.round(invItem.subtotal / invItem.quantity) : invItem.unitPrice;
      }
    }

    if (unitPrice > 0) {
      memoItems.push({
        description: `Retur barang - ${item.productId} (${item.quantityReturned} unit)`,
        amount: Math.round(item.quantityReturned * unitPrice),
      });
    }
  }

  if (memoItems.length === 0) return;

  // Create credit memo via finance service
  const memoData = {
    type: 'credit_memo',
    memoDate: new Date().toISOString(),
    customerId: ret.customerId,
    invoiceId: invoice ? invoice._id : undefined,
    items: memoItems,
    reason: `Retur barang ${ret.returnNumber}`,
    notes: `Auto-generated dari return ${ret.returnNumber}`,
  };

  const memo = await financeService.createMemo(memoData, userId);

  // Auto-approve the memo
  await financeService.approveMemo(memo._id || memo.id, `Auto-approve dari return ${ret.returnNumber}`, userId);
};

/**
 * Change return status
 */
const changeStatus = async (id, newStatus, notes, userId) => {
  const ret = await Return.findById(id);
  if (!ret) {
    throw ApiError.notFound('Return tidak ditemukan');
  }

  const allowed = STATUS_TRANSITIONS[ret.status];
  if (!allowed || !allowed.includes(newStatus)) {
    throw ApiError.badRequest(
      `Tidak dapat mengubah status dari '${ret.status}' ke '${newStatus}'`,
    );
  }

  ret.status = newStatus;
  ret.updatedBy = userId;

  // Set timestamp fields
  const now = new Date();
  if (newStatus === RETURN_STATUS.APPROVED) ret.approvedAt = now;
  if (newStatus === RETURN_STATUS.RECEIVED) ret.receivedAt = now;
  if (newStatus === RETURN_STATUS.INSPECTED) ret.inspectedAt = now;
  if (newStatus === RETURN_STATUS.COMPLETED) ret.completedAt = now;

  // Add to status history
  ret.statusHistory.push({
    status: newStatus,
    notes: notes || '',
    changedBy: userId,
    date: now,
  });

  // Side effect: execute dispositions on completion
  if (newStatus === RETURN_STATUS.COMPLETED) {
    // Validate all items have a disposition
    const missingDisposition = ret.items.filter((item) => !item.disposition);
    if (missingDisposition.length > 0) {
      throw ApiError.badRequest(
        `Semua item harus memiliki disposisi sebelum retur diselesaikan. ${missingDisposition.length} item belum memiliki disposisi.`,
      );
    }

    await executeDispositions(ret, userId);

    // Auto-create credit memo for customer returns
    if (ret.returnType === RETURN_TYPE.CUSTOMER_RETURN && ret.customerId) {
      try {
        await createReturnCreditMemo(ret, userId);
      } catch (err) {
        // Log error but don't fail the return process
      }
    }

    // Auto-create COGS reversal journal for restocked items
    if (ret.returnType === RETURN_TYPE.CUSTOMER_RETURN) {
      try {
        await financeService.createReturnCOGSReversal(ret);
      } catch (err) {
        // Log error but don't fail the return process
      }
    }
  }

  await ret.save();
  return ret;
};

module.exports = {
  getReturns,
  getStats,
  getReturnById,
  createReturn,
  updateReturn,
  deleteReturn,
  changeStatus,
};
