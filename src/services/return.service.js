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
const config = require('../config');
const { getMySQLPool } = require('../config/database');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

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
const mongoGetReturns = async (queryParams) => {
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
const mongoGetStats = async () => {
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
const mongoGetReturnById = async (id) => {
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
const mongoCreateReturn = async (data, userId) => {
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
const mongoUpdateReturn = async (id, data, userId) => {
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
const mongoDeleteReturn = async (id) => {
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
const mongoChangeStatus = async (id, newStatus, notes, userId) => {
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
        logger.error(`Failed to create credit memo for return ${ret.returnNumber}: ${err.message}`);
      }
    }

    // Auto-create COGS reversal journal for restocked items
    if (ret.returnType === RETURN_TYPE.CUSTOMER_RETURN) {
      try {
        await financeService.createReturnCOGSReversal(ret);
      } catch (err) {
        logger.error(`Failed to create COGS reversal for return ${ret.returnNumber}: ${err.message}`);
      }
    }
  }

  await ret.save();
  return ret;
};

// ─── MySQL Helpers ───

const mapReturnRow = (row, items = []) => ({
  id: row.id, _id: row.id,
  returnNumber: row.return_number,
  returnType: row.return_type,
  status: row.status,
  customerId: row.customer_id ? { _id: row.customer_id, id: row.customer_id, name: row.customer_name } : null,
  supplierId: row.supplier_id ? { _id: row.supplier_id, id: row.supplier_id, name: row.supplier_name } : null,
  salesOrderId: row.sales_order_id,
  returnDate: row.return_date,
  approvedAt: row.approved_at, receivedAt: row.received_at, inspectedAt: row.inspected_at, completedAt: row.completed_at,
  reason: row.reason, notes: row.notes,
  items: items.map((i) => ({
    id: i.id, _id: i.id,
    productId: { _id: i.product_id, id: i.product_id, name: i.product_name, sku: i.product_sku },
    batchNumber: i.batch_number, quantityReturned: i.quantity_returned, condition: i.condition, disposition: i.disposition, reason: i.reason, expiryDate: i.expiry_date, notes: i.notes,
  })),
  createdBy: row.created_by ? { _id: row.created_by, name: row.created_by_name } : null,
  updatedBy: row.updated_by,
  createdAt: row.created_at, updatedAt: row.updated_at,
});

const getReturnWithItems = async (pool, id) => {
  const [[row]] = await pool.query(
    `SELECT r.*, c.name as customer_name, s.name as supplier_name, u.name as created_by_name FROM returns r LEFT JOIN customers c ON r.customer_id = c.id LEFT JOIN suppliers s ON r.supplier_id = s.id LEFT JOIN users u ON r.created_by = u.id WHERE r.id = ? LIMIT 1`, [id],
  );
  if (!row) return null;
  const [items] = await pool.query(
    `SELECT ri.*, p.name as product_name, p.sku as product_sku FROM return_items ri LEFT JOIN products p ON ri.product_id = p.id WHERE ri.return_id = ? ORDER BY ri.sort_order ASC`, [id],
  );
  return mapReturnRow(row, items);
};

const generateReturnNumber = async (pool) => {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const prefix = `RET-${ymd}-`;
  const [rows] = await pool.query('SELECT return_number FROM returns WHERE return_number LIKE ? ORDER BY return_number DESC LIMIT 1', [`${prefix}%`]);
  const seq = rows.length > 0 ? parseInt(rows[0].return_number.split('-').pop(), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

// ─── MySQL Implementations ───

const mysqlGetReturns = async (queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const { page = 1, limit = 10, search, status, returnType, customerId, supplierId, dateFrom, dateTo } = queryParams;
  const offset = (Number(page) - 1) * Number(limit);
  const whereClauses = []; const params = [];
  if (search) { whereClauses.push('r.return_number LIKE ?'); params.push(`%${search}%`); }
  if (status) { const ss = status.split(',').map((s) => s.trim()); whereClauses.push(`r.status IN (${ss.map(() => '?').join(',')})`); params.push(...ss); }
  if (returnType) { whereClauses.push('r.return_type = ?'); params.push(returnType); }
  if (customerId) { whereClauses.push('r.customer_id = ?'); params.push(customerId); }
  if (supplierId) { whereClauses.push('r.supplier_id = ?'); params.push(supplierId); }
  if (dateFrom) { whereClauses.push('r.return_date >= ?'); params.push(new Date(dateFrom)); }
  if (dateTo) { whereClauses.push('r.return_date <= ?'); params.push(new Date(`${dateTo}T23:59:59.999Z`)); }
  const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM returns r ${where}`, params);
  const [rows] = await pool.query(`SELECT r.*, c.name as customer_name, s.name as supplier_name, u.name as created_by_name FROM returns r LEFT JOIN customers c ON r.customer_id = c.id LEFT JOIN suppliers s ON r.supplier_id = s.id LEFT JOIN users u ON r.created_by = u.id ${where} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`, [...params, Number(limit), offset]);
  const retIds = rows.map((r) => r.id); let itemsMap = {};
  if (retIds.length > 0) {
    const [items] = await pool.query(`SELECT ri.*, p.name as product_name, p.sku as product_sku FROM return_items ri LEFT JOIN products p ON ri.product_id = p.id WHERE ri.return_id IN (${retIds.map(() => '?').join(',')})`, retIds);
    for (const item of items) { (itemsMap[item.return_id] = itemsMap[item.return_id] || []).push(item); }
  }
  return { docs: rows.map((r) => mapReturnRow(r, itemsMap[r.id] || [])), pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } };
};

const mysqlGetStats = async () => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [statusRows] = await pool.query('SELECT status, COUNT(*) as count FROM returns GROUP BY status');
  const map = {}; for (const r of statusRows) map[r.status] = r.count;
  const total = Object.values(map).reduce((a, b) => a + b, 0);
  return { total, draft: map[RETURN_STATUS.DRAFT] || 0, pendingReview: map[RETURN_STATUS.PENDING_REVIEW] || 0, approved: map[RETURN_STATUS.APPROVED] || 0, completed: map[RETURN_STATUS.COMPLETED] || 0, cancelled: map[RETURN_STATUS.CANCELLED] || 0, rejected: map[RETURN_STATUS.REJECTED] || 0 };
};

const mysqlGetReturnById = async (id) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const ret = await getReturnWithItems(pool, id);
  if (!ret) throw ApiError.notFound('Return tidak ditemukan');
  return ret;
};

const mysqlCreateReturn = async (data, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const id = new mongoose.Types.ObjectId().toString();
  const returnNumber = data.returnNumber || await generateReturnNumber(pool);
  await pool.query('INSERT INTO returns (id, return_number, return_type, status, customer_id, supplier_id, sales_order_id, return_date, reason, notes, created_by, updated_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())', [id, returnNumber, data.returnType || RETURN_TYPE.CUSTOMER_RETURN, RETURN_STATUS.DRAFT, data.customerId || null, data.supplierId || null, data.salesOrderId || null, data.returnDate || new Date(), data.reason || '', data.notes || '', userId, userId]);
  for (let i = 0; i < (data.items || []).length; i++) {
    const item = data.items[i]; const itemId = new mongoose.Types.ObjectId().toString();
    // eslint-disable-next-line no-await-in-loop
    await pool.query('INSERT INTO return_items (id, return_id, product_id, batch_number, quantity_returned, condition, disposition, reason, expiry_date, notes, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [itemId, id, item.productId, item.batchNumber || null, item.quantityReturned || 0, item.condition || ITEM_CONDITION?.GOOD || 'good', item.disposition || null, item.reason || '', item.expiryDate || null, item.notes || '', i]);
  }
  return mysqlGetReturnById(id);
};

const mysqlUpdateReturn = async (id, data, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[existing]] = await pool.query('SELECT id, status FROM returns WHERE id = ? LIMIT 1', [id]);
  if (!existing) throw ApiError.notFound('Return tidak ditemukan');
  if (existing.status !== RETURN_STATUS.DRAFT) throw ApiError.badRequest('Retur hanya dapat diedit saat berstatus draft');
  const fieldMap = { reason: 'reason', notes: 'notes', returnDate: 'return_date' };
  const setClauses = ['updated_by = ?', 'updated_at = NOW()']; const values = [userId];
  for (const [key, col] of Object.entries(fieldMap)) { if (data[key] !== undefined) { setClauses.push(`${col} = ?`); values.push(data[key]); } }
  values.push(id);
  await pool.query(`UPDATE returns SET ${setClauses.join(', ')} WHERE id = ?`, values);
  if (data.items) {
    await pool.query('DELETE FROM return_items WHERE return_id = ?', [id]);
    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i]; const itemId = new mongoose.Types.ObjectId().toString();
      // eslint-disable-next-line no-await-in-loop
      await pool.query('INSERT INTO return_items (id, return_id, product_id, batch_number, quantity_returned, condition, disposition, reason, expiry_date, notes, sort_order) VALUES (?,?,?,?,?,?,?,?,?,?,?)', [itemId, id, item.productId, item.batchNumber || null, item.quantityReturned || 0, item.condition || 'good', item.disposition || null, item.reason || '', item.expiryDate || null, item.notes || '', i]);
    }
  }
  return mysqlGetReturnById(id);
};

const mysqlDeleteReturn = async (id) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[existing]] = await pool.query('SELECT id, status FROM returns WHERE id = ? LIMIT 1', [id]);
  if (!existing) throw ApiError.notFound('Return tidak ditemukan');
  if (existing.status !== RETURN_STATUS.DRAFT && existing.status !== RETURN_STATUS.CANCELLED) throw ApiError.badRequest('Retur hanya dapat dihapus saat berstatus draft atau cancelled');
  await pool.query('DELETE FROM return_items WHERE return_id = ?', [id]);
  await pool.query('DELETE FROM returns WHERE id = ?', [id]);
};

const mysqlExecuteDispositions = async (pool, ret, userId) => {
  for (const item of ret.items || []) {
    if (!item.disposition) continue;
    const productId = item.productId?._id || item.productId;
    if (item.disposition === DISPOSITION.RESTOCK) {
      if (item.batchNumber && productId) {
        const [[batch]] = await pool.query('SELECT id, quantity, status FROM stock_batches WHERE product_id = ? AND batch_number = ? LIMIT 1', [productId, item.batchNumber]);
        if (batch) {
          const newQty = batch.quantity + item.quantityReturned;
          // eslint-disable-next-line no-await-in-loop
          await pool.query("UPDATE stock_batches SET quantity = ?, status = 'active', updated_at = NOW() WHERE id = ?", [newQty, batch.id]);
          const [[balRow]] = await pool.query("SELECT COALESCE(SUM(quantity), 0) as bal FROM stock_batches WHERE product_id = ? AND status = 'active'", [productId]);
          const balAfter = Number(balRow.bal || 0);
          const mutId = new mongoose.Types.ObjectId().toString();
          // eslint-disable-next-line no-await-in-loop
          await pool.query('INSERT INTO stock_mutations (id, mutation_date, type, product_id, batch_id, batch_number, quantity, balance_before, balance_after, reference_type, reference_id, reference_number, notes, created_by, created_at, updated_at) VALUES (?,NOW(),?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())', [mutId, MUTATION_TYPE.RETURN, productId, batch.id, item.batchNumber, item.quantityReturned, balAfter - item.quantityReturned, balAfter, MUTATION_REFERENCE_TYPE.RETURN, ret.id, ret.returnNumber, `Restock dari retur ${ret.returnNumber}`, userId]);
        }
      }
    } else if (item.disposition === DISPOSITION.DESTROY) {
      if (item.batchNumber && productId) {
        const [[batch]] = await pool.query('SELECT id, quantity FROM stock_batches WHERE product_id = ? AND batch_number = ? LIMIT 1', [productId, item.batchNumber]);
        if (batch && batch.quantity > 0) {
          const deduct = Math.min(batch.quantity, item.quantityReturned);
          const newQty = batch.quantity - deduct;
          // eslint-disable-next-line no-await-in-loop
          await pool.query("UPDATE stock_batches SET quantity = ?, status = CASE WHEN ? <= 0 THEN 'disposed' ELSE status END, updated_at = NOW() WHERE id = ?", [newQty, newQty, batch.id]);
          const mutId = new mongoose.Types.ObjectId().toString();
          const [[balRow]] = await pool.query("SELECT COALESCE(SUM(quantity), 0) as bal FROM stock_batches WHERE product_id = ? AND status = 'active'", [productId]);
          // eslint-disable-next-line no-await-in-loop
          await pool.query('INSERT INTO stock_mutations (id, mutation_date, type, product_id, batch_id, batch_number, quantity, balance_before, balance_after, reference_type, reference_id, reference_number, notes, created_by, created_at, updated_at) VALUES (?,NOW(),?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())', [mutId, MUTATION_TYPE.DISPOSAL || 'disposal', productId, batch.id, item.batchNumber, -deduct, batch.quantity, Number(balRow.bal || 0), MUTATION_REFERENCE_TYPE.DISPOSAL || 'disposal', ret.id, ret.returnNumber, `Pemusnahan dari retur ${ret.returnNumber}`, userId]);
        }
      }
    }
  }
};

const mysqlChangeStatus = async (id, newStatus, notes, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const ret = await getReturnWithItems(pool, id);
  if (!ret) throw ApiError.notFound('Return tidak ditemukan');
  const allowed = STATUS_TRANSITIONS[ret.status];
  if (!allowed || !allowed.includes(newStatus)) throw ApiError.badRequest(`Tidak dapat mengubah status dari '${ret.status}' ke '${newStatus}'`);
  const setClauses = ['status = ?', 'updated_by = ?', 'updated_at = NOW()']; const values = [newStatus, userId];
  const now = new Date();
  if (newStatus === RETURN_STATUS.APPROVED) { setClauses.push('approved_at = ?'); values.push(now); }
  if (newStatus === RETURN_STATUS.RECEIVED) { setClauses.push('received_at = ?'); values.push(now); }
  if (newStatus === RETURN_STATUS.INSPECTED) { setClauses.push('inspected_at = ?'); values.push(now); }
  if (newStatus === RETURN_STATUS.COMPLETED) { setClauses.push('completed_at = ?'); values.push(now); }
  values.push(id);
  await pool.query(`UPDATE returns SET ${setClauses.join(', ')} WHERE id = ?`, values);
  const histId = new mongoose.Types.ObjectId().toString();
  await pool.query('INSERT INTO return_status_history (id, return_id, status, notes, changed_by, date) VALUES (?,?,?,?,?,NOW())', [histId, id, newStatus, notes || '', userId]);
  if (newStatus === RETURN_STATUS.COMPLETED) {
    const missingDisp = (ret.items || []).filter((item) => !item.disposition);
    if (missingDisp.length > 0) throw ApiError.badRequest(`Semua item harus memiliki disposisi sebelum retur diselesaikan. ${missingDisp.length} item belum memiliki disposisi.`);
    await mysqlExecuteDispositions(pool, ret, userId);
    if (ret.returnType === RETURN_TYPE.CUSTOMER_RETURN && ret.customerId) {
      try { const memoData = { type: 'credit_memo', customerId: ret.customerId?._id || ret.customerId, reason: `Retur barang ${ret.returnNumber}` }; const memo = await financeService.createMemo(memoData, userId); await financeService.approveMemo(memo._id || memo.id, `Auto-approve dari return ${ret.returnNumber}`, userId); } catch (err) { logger.error(`Failed to create memo for return ${ret.returnNumber}: ${err.message}`); }
    }
    if (ret.returnType === RETURN_TYPE.CUSTOMER_RETURN) {
      try { await financeService.createReturnCOGSReversal(ret); } catch (err) { logger.error(`Failed to create COGS reversal for return ${ret.returnNumber}: ${err.message}`); }
    }
  }
  return mysqlGetReturnById(id);
};

// ─── Exported Functions with Provider Branching ───

const getReturns = (q) => config.dbProvider === 'mysql' ? mysqlGetReturns(q) : mongoGetReturns(q);
const getStats = () => config.dbProvider === 'mysql' ? mysqlGetStats() : mongoGetStats();
const getReturnById = (id) => config.dbProvider === 'mysql' ? mysqlGetReturnById(id) : mongoGetReturnById(id);
const createReturn = (data, userId) => config.dbProvider === 'mysql' ? mysqlCreateReturn(data, userId) : mongoCreateReturn(data, userId);
const updateReturn = (id, data, userId) => config.dbProvider === 'mysql' ? mysqlUpdateReturn(id, data, userId) : mongoUpdateReturn(id, data, userId);
const deleteReturn = (id) => config.dbProvider === 'mysql' ? mysqlDeleteReturn(id) : mongoDeleteReturn(id);
const changeStatus = (id, newStatus, notes, userId) => config.dbProvider === 'mysql' ? mysqlChangeStatus(id, newStatus, notes, userId) : mongoChangeStatus(id, newStatus, notes, userId);

module.exports = {
  getReturns,
  getStats,
  getReturnById,
  createReturn,
  updateReturn,
  deleteReturn,
  changeStatus,
};
