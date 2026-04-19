const { randomUUID } = require('crypto');
const ApiError = require('../utils/ApiError');
const {
  BATCH_STATUS,
  MUTATION_TYPE,
  MUTATION_REFERENCE_TYPE,
  OPNAME_STATUS,
  OPNAME_SCOPE,
} = require('../constants');
const { getMySQLPool } = require('../config/database');

// ═══════════════════════════════════════════════
// Sub-modul 1: Stok Gudang
// ═══════════════════════════════════════════════

/**
 * Get stock summary (aggregated per product)
 */
const mysqlUpdateExpiredBatches = async (pool) => {
  await pool.query("UPDATE stock_batches SET status = 'expired' WHERE status = 'active' AND expiry_date <= NOW()");
};

const mysqlGetStockSummary = async (queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  await mysqlUpdateExpiredBatches(pool);
  const { page = 1, limit = 10, search, kategori, golongan, stockStatus } = queryParams;
  const offset = (Number(page) - 1) * Number(limit);
  const [[settingRow]] = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key = 'inventory' LIMIT 1").catch(() => [[]]);
  const settings = settingRow ? JSON.parse(settingRow.setting_value || '{}') : {};
  const lowThreshold = settings?.lowStockThreshold ?? 10;
  const whereClauses = ['p.is_active = 1']; const params = [];
  if (search) { whereClauses.push('(p.name LIKE ? OR p.sku LIKE ?)'); const sl = `%${search}%`; params.push(sl, sl); }
  if (kategori) { whereClauses.push('p.category = ?'); params.push(kategori); }
  if (golongan) { whereClauses.push('p.golongan = ?'); params.push(golongan); }
  const baseWhere = `WHERE ${whereClauses.join(' AND ')}`;
  const [allRows] = await pool.query(
    `SELECT p.id as product_id, p.name, p.sku, p.category, p.golongan, p.satuan, p.stok_minimum,
      COALESCE(SUM(CASE WHEN sb.status = 'active' THEN sb.quantity ELSE 0 END), 0) as total_stock,
      COUNT(CASE WHEN sb.status = 'active' THEN 1 END) as total_batches,
      COUNT(CASE WHEN sb.status = 'expired' THEN 1 END) as expired_batches,
      MIN(CASE WHEN sb.status = 'active' AND sb.expiry_date > NOW() THEN sb.expiry_date END) as nearest_expiry,
      COALESCE(SUM(CASE WHEN sb.status = 'active' THEN sb.quantity * sb.unit_price ELSE 0 END), 0) as stock_value
     FROM products p LEFT JOIN stock_batches sb ON p.id = sb.product_id ${baseWhere} GROUP BY p.id ORDER BY total_stock DESC`, params,
  );
  const enriched = allRows.map((r) => {
    const threshold = r.stok_minimum > 0 ? r.stok_minimum : lowThreshold;
    const stockStatusVal = r.total_stock === 0 ? 'out_of_stock' : r.total_stock <= threshold ? 'low' : 'normal';
    return { ...r, stockStatus: stockStatusVal };
  }).filter((r) => !stockStatus || r.stockStatus === stockStatus);
  const total = enriched.length;
  const docs = enriched.slice(offset, offset + Number(limit)).map((r) => ({
    productId: r.product_id,
    product: { _id: r.product_id, id: r.product_id, name: r.name, sku: r.sku, kategori: r.category, golongan: r.golongan, satuan: r.satuan },
    totalStock: Number(r.total_stock), totalBatches: Number(r.total_batches), expiredBatches: Number(r.expired_batches),
    nearestExpiry: r.nearest_expiry, stockValue: Number(r.stock_value), stockStatus: r.stockStatus,
  }));
  return { docs, pagination: { totalDocs: total, totalPages: Math.ceil(total / Number(limit)), page: Number(page), limit: Number(limit) } };
};

const mysqlGetStockStats = async () => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  await mysqlUpdateExpiredBatches(pool);
  const [[settingRow]] = await pool.query("SELECT setting_value FROM app_settings WHERE setting_key = 'inventory' LIMIT 1").catch(() => [[]]);
  const settings = settingRow ? JSON.parse(settingRow.setting_value || '{}') : {};
  const lowThreshold = settings?.lowStockThreshold ?? 10;
  const now = new Date(); const nearThree = new Date(now); nearThree.setMonth(nearThree.getMonth() + 3);
  const [[batchRow], [productRows]] = await Promise.all([
    pool.query(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active, SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired, SUM(CASE WHEN status = 'active' AND expiry_date <= ? AND expiry_date > NOW() THEN 1 ELSE 0 END) as near_expiry, SUM(CASE WHEN status = 'active' THEN quantity ELSE 0 END) as total_qty, SUM(CASE WHEN status = 'active' THEN quantity * unit_price ELSE 0 END) as total_value FROM stock_batches`, [nearThree]),
    pool.query(`SELECT p.id, p.stok_minimum, COALESCE(SUM(CASE WHEN sb.status = 'active' THEN sb.quantity ELSE 0 END), 0) as total_stock FROM products p LEFT JOIN stock_batches sb ON p.id = sb.product_id WHERE p.is_active = 1 GROUP BY p.id, p.stok_minimum`),
  ]);
  let outOfStock = 0, low = 0, normal = 0;
  for (const r of productRows) {
    const t = r.stok_minimum > 0 ? r.stok_minimum : lowThreshold;
    if (r.total_stock === 0) outOfStock++;
    else if (r.total_stock <= t) low++;
    else normal++;
  }
  return { totalProducts: productRows.length, outOfStock, lowStock: low, normalStock: normal, totalBatches: batchRow.total || 0, activeBatches: batchRow.active || 0, expiredBatches: batchRow.expired || 0, nearExpiryBatches: batchRow.near_expiry || 0, totalStock: batchRow.total_qty || 0, totalValue: batchRow.total_value || 0 };
};

const mysqlGetProductBatches = async (productId, queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  await mysqlUpdateExpiredBatches(pool);
  const { page = 1, limit = 20, status } = queryParams || {};
  const offset = (Number(page) - 1) * Number(limit);
  const whereClauses = ['sb.product_id = ?']; const params = [productId];
  if (status) { whereClauses.push('sb.status = ?'); params.push(status); }
  const where = `WHERE ${whereClauses.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM stock_batches sb ${where}`, params);
  const [rows] = await pool.query(`SELECT sb.*, p.name as product_name, p.sku FROM stock_batches sb LEFT JOIN products p ON sb.product_id = p.id ${where} ORDER BY sb.expiry_date ASC LIMIT ? OFFSET ?`, [...params, Number(limit), offset]);
  const productInfo = rows.length > 0 ? { _id: rows[0].product_id, name: rows[0].product_name, sku: rows[0].sku } : null;
  return { product: productInfo, docs: rows.map((r) => ({ id: r.id, _id: r.id, productId: { _id: r.product_id, name: r.product_name, sku: r.sku }, batchNumber: r.batch_number, quantity: r.quantity, initialQuantity: r.initial_quantity, expiryDate: r.expiry_date, manufacturingDate: r.manufacturing_date, receivedDate: r.received_date, storageCondition: r.storage_condition, status: r.status, unitPrice: Number(r.unit_price), createdAt: r.created_at })), pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } };
};

const mysqlGetMutations = async (queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const { page = 1, limit = 20, productId, type: mutType, dateFrom, dateTo, referenceType } = queryParams;
  const offset = (Number(page) - 1) * Number(limit);
  const whereClauses = []; const params = [];
  if (productId) { whereClauses.push('sm.product_id = ?'); params.push(productId); }
  if (mutType) { whereClauses.push('sm.type = ?'); params.push(mutType); }
  if (referenceType) { whereClauses.push('sm.reference_type = ?'); params.push(referenceType); }
  if (dateFrom) { whereClauses.push('sm.mutation_date >= ?'); params.push(new Date(dateFrom)); }
  if (dateTo) { whereClauses.push('sm.mutation_date <= ?'); params.push(new Date(`${dateTo}T23:59:59.999Z`)); }
  const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM stock_mutations sm ${where}`, params);
  const [rows] = await pool.query(`SELECT sm.*, p.name as product_name, p.sku FROM stock_mutations sm LEFT JOIN products p ON sm.product_id = p.id ${where} ORDER BY sm.mutation_date DESC LIMIT ? OFFSET ?`, [...params, Number(limit), offset]);
  return { docs: rows.map((r) => ({ id: r.id, _id: r.id, mutationDate: r.mutation_date, type: r.type, productId: { _id: r.product_id, name: r.product_name, sku: r.sku }, batchNumber: r.batch_number, quantity: r.quantity, balanceBefore: r.balance_before, balanceAfter: r.balance_after, referenceType: r.reference_type, referenceNumber: r.reference_number, notes: r.notes, createdAt: r.created_at })), pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } };
};

const mysqlGetMutationStats = async () => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const now = new Date(); const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [typeRows] = await pool.query('SELECT type, COUNT(*) as count, SUM(ABS(quantity)) as qty FROM stock_mutations GROUP BY type');
  const [[monthRow]] = await pool.query('SELECT COUNT(*) as count FROM stock_mutations WHERE mutation_date >= ?', [startOfMonth]);
  const statsMap = {}; for (const r of typeRows) statsMap[r.type] = { count: r.count, qty: r.qty };
  return { in: statsMap[MUTATION_TYPE.IN]?.count || 0, out: statsMap[MUTATION_TYPE.OUT]?.count || 0, adjustment: statsMap[MUTATION_TYPE.ADJUSTMENT]?.count || 0, return: statsMap[MUTATION_TYPE.RETURN]?.count || 0, thisMonth: monthRow.count || 0 };
};

const mysqlCreateManualMutation = async (data, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[productRow]] = await pool.query('SELECT id FROM products WHERE id = ? LIMIT 1', [data.productId]);
  if (!productRow) throw ApiError.notFound('Produk tidak ditemukan');
  const batchId = data.batchId || null; const batchNumber = data.batchNumber || '';
  if (batchId) {
    const [[batchRow]] = await pool.query('SELECT id, quantity FROM stock_batches WHERE id = ? LIMIT 1', [batchId]);
    if (!batchRow) throw ApiError.notFound('Batch tidak ditemukan');
    if (data.type === MUTATION_TYPE.OUT && batchRow.quantity < Math.abs(data.quantity)) throw ApiError.badRequest(`Stok batch tidak cukup (tersedia: ${batchRow.quantity})`);
    const newQty = Math.max(0, batchRow.quantity + data.quantity);
    await pool.query("UPDATE stock_batches SET quantity = ?, status = CASE WHEN ? <= 0 THEN 'depleted' ELSE 'active' END, updated_at = NOW() WHERE id = ?", [newQty, newQty, batchId]);
  }
  const [[balRow]] = await pool.query("SELECT COALESCE(SUM(quantity), 0) as bal FROM stock_batches WHERE product_id = ? AND status = 'active'", [data.productId]);
  const balanceAfter = Number(balRow.bal || 0);
  const balanceBefore = balanceAfter - data.quantity;
  const id = randomUUID();
  await pool.query('INSERT INTO stock_mutations (id, mutation_date, type, product_id, batch_id, batch_number, quantity, balance_before, balance_after, reference_type, notes, created_by, created_at, updated_at) VALUES (?,NOW(),?,?,?,?,?,?,?,?,?,?,NOW(),NOW())', [id, data.type, data.productId, batchId, batchNumber, data.quantity, balanceBefore, balanceAfter, MUTATION_REFERENCE_TYPE.MANUAL, data.notes || '', userId]);
  const [[row]] = await pool.query('SELECT sm.*, p.name as product_name, p.sku FROM stock_mutations sm LEFT JOIN products p ON sm.product_id = p.id WHERE sm.id = ?', [id]);
  return { id, _id: id, type: row.type, productId: { _id: row.product_id, name: row.product_name, sku: row.sku }, quantity: row.quantity, balanceBefore: row.balance_before, balanceAfter: row.balance_after, notes: row.notes };
};

const mysqlCreateGRMutations = async (goodsReceiving, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const mutations = [];
  let poItemMap = {};
  if (goodsReceiving.purchaseOrderId) {
    const poId = goodsReceiving.purchaseOrderId?._id || goodsReceiving.purchaseOrderId;
    const [poItems] = await pool.query('SELECT product_id, unit_price, discount FROM purchase_order_items WHERE purchase_order_id = ?', [poId]).catch(() => [[]]);
    for (const pi of poItems) poItemMap[pi.product_id] = { unitPrice: pi.unit_price, discount: pi.discount };
  }
  for (const item of goodsReceiving.items) {
    const productId = (item.productId?._id || item.productId || '').toString();
    const poItemPrice = poItemMap[productId] || {};
    const rawUnitPrice = Number.isFinite(item.unitPrice) ? Number(item.unitPrice) : Number(poItemPrice.unitPrice || 0);
    const rawDiscount = Number.isFinite(item.discount) ? Number(item.discount) : Number(poItemPrice.discount || 0);
    const discount = Math.min(100, Math.max(0, rawDiscount));
    const unitPrice = Math.round(rawUnitPrice * (1 - discount / 100));
    const [[existingBatch]] = await pool.query('SELECT id, quantity, unit_price FROM stock_batches WHERE product_id = ? AND batch_number = ? LIMIT 1', [productId, item.batchNumber]);
    let batchId;
    if (!existingBatch) {
      batchId = randomUUID();
      // eslint-disable-next-line no-await-in-loop
      await pool.query('INSERT INTO stock_batches (id, product_id, batch_number, quantity, initial_quantity, expiry_date, manufacturing_date, received_date, storage_condition, status, goods_receiving_id, supplier_id, unit_price, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())', [batchId, productId, item.batchNumber, item.receivedQty, item.receivedQty, item.expiryDate || null, item.manufacturingDate || null, goodsReceiving.receivingDate || new Date(), item.storageCondition || 'Suhu Kamar', BATCH_STATUS.ACTIVE, goodsReceiving._id || goodsReceiving.id, (goodsReceiving.supplierId?._id || goodsReceiving.supplierId || null), unitPrice, userId]);
    } else {
      batchId = existingBatch.id;
      const prevQty = existingBatch.quantity; const nextQty = prevQty + item.receivedQty;
      const newUnitPrice = nextQty > 0 ? Math.round((Number(existingBatch.unit_price) * prevQty + unitPrice * item.receivedQty) / nextQty) : unitPrice;
      // eslint-disable-next-line no-await-in-loop
      await pool.query("UPDATE stock_batches SET quantity = ?, initial_quantity = initial_quantity + ?, unit_price = ?, status = CASE WHEN status = 'depleted' THEN 'active' ELSE status END, updated_at = NOW() WHERE id = ?", [nextQty, item.receivedQty, newUnitPrice, batchId]);
    }
    const [[balRow]] = await pool.query("SELECT COALESCE(SUM(quantity), 0) as bal FROM stock_batches WHERE product_id = ? AND status = 'active'", [productId]);
    const balanceAfter = Number(balRow.bal || 0);
    const mutId = randomUUID();
    // eslint-disable-next-line no-await-in-loop
    await pool.query('INSERT INTO stock_mutations (id, mutation_date, type, product_id, batch_id, batch_number, quantity, balance_before, balance_after, reference_type, reference_id, reference_number, notes, created_by, created_at, updated_at) VALUES (?,NOW(),?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())', [mutId, MUTATION_TYPE.IN, productId, batchId, item.batchNumber, item.receivedQty, balanceAfter - item.receivedQty, balanceAfter, MUTATION_REFERENCE_TYPE.GOODS_RECEIVING, goodsReceiving._id || goodsReceiving.id, goodsReceiving.invoiceNumber || '', `Penerimaan dari ${goodsReceiving.invoiceNumber || ''}`, userId]);
    mutations.push({ id: mutId, type: MUTATION_TYPE.IN, productId, batchNumber: item.batchNumber, quantity: item.receivedQty });
  }
  return mutations;
};

const mysqlCreateDeliveryMutations = async (delivery, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const mutations = [];
  for (const item of delivery.items) {
    const productId = (item.productId?._id || item.productId || '').toString();
    let remainingQty = item.quantityShipped || item.quantity || 0;
    if (item.batchNumber) {
      const [[batch]] = await pool.query("SELECT id, quantity FROM stock_batches WHERE product_id = ? AND batch_number = ? AND status = 'active' LIMIT 1", [productId, item.batchNumber]);
      if (!batch) throw ApiError.badRequest(`Batch ${item.batchNumber} tidak ditemukan atau sudah habis`);
      if (batch.quantity < remainingQty) throw ApiError.badRequest(`Stok batch ${item.batchNumber} tidak cukup (tersedia: ${batch.quantity}, dibutuhkan: ${remainingQty})`);
      const newQty = batch.quantity - remainingQty;
      // eslint-disable-next-line no-await-in-loop
      await pool.query("UPDATE stock_batches SET quantity = ?, status = CASE WHEN ? <= 0 THEN 'depleted' ELSE status END, updated_at = NOW() WHERE id = ?", [newQty, newQty, batch.id]);
      const [[balRow]] = await pool.query("SELECT COALESCE(SUM(quantity), 0) as bal FROM stock_batches WHERE product_id = ? AND status = 'active'", [productId]);
      const balAfter = Number(balRow.bal || 0);
      const mutId = randomUUID();
      // eslint-disable-next-line no-await-in-loop
      await pool.query('INSERT INTO stock_mutations (id, mutation_date, type, product_id, batch_id, batch_number, quantity, balance_before, balance_after, reference_type, reference_id, reference_number, notes, created_by, created_at, updated_at) VALUES (?,NOW(),?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())', [mutId, MUTATION_TYPE.OUT, productId, batch.id, item.batchNumber, -remainingQty, balAfter + remainingQty, balAfter, MUTATION_REFERENCE_TYPE.SALES_ORDER, delivery._id || delivery.id, delivery.deliveryNumber || delivery.invoiceNumber || '', `Pengiriman ${delivery.deliveryNumber || ''}`, userId]);
      mutations.push({ id: mutId });
    } else {
      const [batches] = await pool.query("SELECT id, quantity, batch_number FROM stock_batches WHERE product_id = ? AND status = 'active' AND quantity > 0 ORDER BY expiry_date ASC", [productId]);
      const totalAvailable = batches.reduce((s, b) => s + b.quantity, 0);
      if (totalAvailable < remainingQty) throw ApiError.badRequest(`Stok tidak cukup (tersedia: ${totalAvailable}, dibutuhkan: ${remainingQty})`);
      for (const batch of batches) {
        if (remainingQty <= 0) break;
        const deduct = Math.min(batch.quantity, remainingQty);
        const newQty = batch.quantity - deduct;
        // eslint-disable-next-line no-await-in-loop
        await pool.query("UPDATE stock_batches SET quantity = ?, status = CASE WHEN ? <= 0 THEN 'depleted' ELSE status END, updated_at = NOW() WHERE id = ?", [newQty, newQty, batch.id]);
        const [[balRow]] = await pool.query("SELECT COALESCE(SUM(quantity), 0) as bal FROM stock_batches WHERE product_id = ? AND status = 'active'", [productId]);
        const balAfter = Number(balRow.bal || 0);
        const mutId = randomUUID();
        // eslint-disable-next-line no-await-in-loop
        await pool.query('INSERT INTO stock_mutations (id, mutation_date, type, product_id, batch_id, batch_number, quantity, balance_before, balance_after, reference_type, reference_id, reference_number, notes, created_by, created_at, updated_at) VALUES (?,NOW(),?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())', [mutId, MUTATION_TYPE.OUT, productId, batch.id, batch.batch_number, -deduct, balAfter + deduct, balAfter, MUTATION_REFERENCE_TYPE.SALES_ORDER, delivery._id || delivery.id, delivery.deliveryNumber || '', `Pengiriman ${delivery.deliveryNumber || ''} (FEFO)`, userId]);
        mutations.push({ id: mutId });
        remainingQty -= deduct;
      }
    }
  }
  return mutations;
};

const mysqlRevertDeliveryMutations = async (delivery, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const deliveryId = delivery._id || delivery.id;
  const [existingMuts] = await pool.query('SELECT id, batch_id, product_id, batch_number, quantity FROM stock_mutations WHERE reference_id = ? AND type = ?', [deliveryId, MUTATION_TYPE.OUT]);
  const mutations = [];
  for (const mut of existingMuts) {
    const restoreQty = Math.abs(mut.quantity);
    // eslint-disable-next-line no-await-in-loop
    await pool.query("UPDATE stock_batches SET quantity = quantity + ?, status = 'active', updated_at = NOW() WHERE id = ?", [restoreQty, mut.batch_id]);
    const [[balRow]] = await pool.query("SELECT COALESCE(SUM(quantity), 0) as bal FROM stock_batches WHERE product_id = ? AND status = 'active'", [mut.product_id]);
    const balAfter = Number(balRow.bal || 0);
    const mutId = randomUUID();
    // eslint-disable-next-line no-await-in-loop
    await pool.query('INSERT INTO stock_mutations (id, mutation_date, type, product_id, batch_id, batch_number, quantity, balance_before, balance_after, reference_type, reference_id, reference_number, notes, created_by, created_at, updated_at) VALUES (?,NOW(),?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())', [mutId, MUTATION_TYPE.RETURN, mut.product_id, mut.batch_id, mut.batch_number, restoreQty, balAfter - restoreQty, balAfter, MUTATION_REFERENCE_TYPE.SALES_ORDER, deliveryId, delivery.deliveryNumber || '', `Pengembalian stok dari ${delivery.deliveryNumber || ''}`, userId]);
    mutations.push({ id: mutId });
  }
  return mutations;
};

const mysqlGetOpnameSessions = async (queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const { page = 1, limit = 10, status } = queryParams;
  const offset = (Number(page) - 1) * Number(limit);
  const whereClauses = []; const params = [];
  if (status) { whereClauses.push('op.status = ?'); params.push(status); }
  const where = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM stock_opnames op ${where}`, params);
  const [rows] = await pool.query(`SELECT op.*, u1.name as assigned_name, u2.name as created_by_name FROM stock_opnames op LEFT JOIN users u1 ON op.assigned_to = u1.id LEFT JOIN users u2 ON op.created_by = u2.id ${where} ORDER BY op.opname_date DESC LIMIT ? OFFSET ?`, [...params, Number(limit), offset]);
  return { docs: rows.map((r) => ({ id: r.id, _id: r.id, opnameNumber: r.opname_number, status: r.status, opnameDate: r.opname_date, completedAt: r.completed_at, scope: r.scope, totalItems: r.total_items, matchedItems: r.matched_items, discrepancyItems: r.discrepancy_items, assignedTo: r.assigned_to ? { _id: r.assigned_to, name: r.assigned_name } : null, createdBy: r.created_by ? { _id: r.created_by, name: r.created_by_name } : null, createdAt: r.created_at })), pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } };
};

const mysqlGetOpnameStats = async () => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [statusRows] = await pool.query('SELECT status, COUNT(*) as count FROM stock_opnames GROUP BY status');
  const map = {}; for (const r of statusRows) map[r.status] = r.count;
  return { draft: map[OPNAME_STATUS.DRAFT] || 0, inProgress: map[OPNAME_STATUS.IN_PROGRESS] || 0, completed: map[OPNAME_STATUS.COMPLETED] || 0, total: Object.values(map).reduce((a, b) => a + b, 0) };
};

const mysqlGetOpnameById = async (id) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[row]] = await pool.query('SELECT op.*, u1.name as assigned_name, u2.name as verified_name FROM stock_opnames op LEFT JOIN users u1 ON op.assigned_to = u1.id LEFT JOIN users u2 ON op.verified_by = u2.id WHERE op.id = ? LIMIT 1', [id]);
  if (!row) throw ApiError.notFound('Opname session not found');
  const [items] = await pool.query('SELECT soi.*, p.name as product_name, p.sku FROM stock_opname_items soi LEFT JOIN products p ON soi.product_id = p.id WHERE soi.opname_id = ?', [id]);
  return { id: row.id, _id: row.id, opnameNumber: row.opname_number, status: row.status, opnameDate: row.opname_date, completedAt: row.completed_at, scope: row.scope, totalItems: row.total_items, matchedItems: row.matched_items, discrepancyItems: row.discrepancy_items, totalDiscrepancyQty: row.total_discrepancy_qty, notes: row.notes, assignedTo: row.assigned_to ? { _id: row.assigned_to, name: row.assigned_name } : null, verifiedBy: row.verified_by ? { _id: row.verified_by, name: row.verified_name } : null, items: items.map((i) => ({ id: i.id, _id: i.id, productId: { _id: i.product_id, name: i.product_name, sku: i.sku }, batchId: i.batch_id, batchNumber: i.batch_number, expiryDate: i.expiry_date, systemQty: i.system_qty, actualQty: i.actual_qty, difference: i.difference, notes: i.notes })), createdAt: row.created_at };
};

const mysqlCreateOpname = async (data, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const id = randomUUID();
  const opnameNumber = await generateOpnameNumber(pool);
  await pool.query('INSERT INTO stock_opnames (id, opname_number, status, opname_date, scope, notes, assigned_to, total_items, matched_items, discrepancy_items, total_discrepancy_qty, created_by, updated_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,0,0,0,0,?,?,NOW(),NOW())', [id, opnameNumber, OPNAME_STATUS.DRAFT, data.opnameDate || new Date(), data.scope || OPNAME_SCOPE.ALL, data.notes || '', data.assignedTo || null, userId, userId]);
  const [activeBatches] = await pool.query("SELECT sb.id, sb.product_id, sb.batch_number, sb.expiry_date, sb.quantity FROM stock_batches sb WHERE sb.status = 'active' AND sb.quantity > 0");
  let totalItems = 0;
  for (const batch of activeBatches) {
    const itemId = randomUUID();
    // eslint-disable-next-line no-await-in-loop
    await pool.query('INSERT INTO stock_opname_items (id, opname_id, product_id, batch_id, batch_number, expiry_date, system_qty, actual_qty, difference) VALUES (?,?,?,?,?,?,?,NULL,NULL)', [itemId, id, batch.product_id, batch.id, batch.batch_number, batch.expiry_date, batch.quantity]);
    totalItems++;
  }
  await pool.query('UPDATE stock_opnames SET total_items = ?, updated_at = NOW() WHERE id = ?', [totalItems, id]);
  return mysqlGetOpnameById(id);
};

const mysqlUpdateOpname = async (id, data, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const [[existing]] = await pool.query('SELECT id, status FROM stock_opnames WHERE id = ? LIMIT 1', [id]);
  if (!existing) throw ApiError.notFound('Opname session not found');
  if (existing.status === OPNAME_STATUS.COMPLETED) throw ApiError.badRequest('Opname sudah selesai, tidak dapat diedit');
  if (data.items) {
    for (const item of data.items) {
      if (item.id && item.actualQty !== undefined) {
        // eslint-disable-next-line no-await-in-loop
        await pool.query('UPDATE stock_opname_items SET actual_qty = ?, notes = COALESCE(?, notes) WHERE id = ? AND opname_id = ?', [item.actualQty, item.notes || null, item.id, id]);
      }
    }
  }
  const setClauses = ['status = ?', 'updated_by = ?', 'updated_at = NOW()']; const values = [OPNAME_STATUS.IN_PROGRESS, userId];
  if (data.notes !== undefined) { setClauses.push('notes = ?'); values.push(data.notes); }
  values.push(id);
  await pool.query(`UPDATE stock_opnames SET ${setClauses.join(', ')} WHERE id = ?`, values);
  return mysqlGetOpnameById(id);
};

const mysqlFinalizeOpname = async (id, notes, userId) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const opname = await mysqlGetOpnameById(id);
  if (opname.status !== OPNAME_STATUS.DRAFT && opname.status !== OPNAME_STATUS.IN_PROGRESS) throw ApiError.badRequest('Opname harus berstatus draft atau in_progress untuk difinalisasi');
  const unfilled = opname.items.filter((i) => i.actualQty === null || i.actualQty === undefined);
  if (unfilled.length > 0) throw ApiError.badRequest(`Masih ada ${unfilled.length} item yang belum diisi qty aktual`);
  let matchedItems = 0, discrepancyItems = 0, totalDiscrepancyQty = 0;
  for (const item of opname.items) {
    const diff = (item.actualQty || 0) - item.systemQty;
    // eslint-disable-next-line no-await-in-loop
    await pool.query('UPDATE stock_opname_items SET difference = ? WHERE id = ?', [diff, item.id]);
    if (diff === 0) { matchedItems++; } else {
      discrepancyItems++;
      totalDiscrepancyQty += Math.abs(diff);
      const newQty = Math.max(0, item.actualQty || 0);
      // eslint-disable-next-line no-await-in-loop
      await pool.query("UPDATE stock_batches SET quantity = ?, status = CASE WHEN ? <= 0 THEN 'depleted' WHEN status = 'depleted' AND ? > 0 THEN 'active' ELSE status END, updated_at = NOW() WHERE id = ?", [newQty, newQty, newQty, item.batchId]);
      const [[balRow]] = await pool.query("SELECT COALESCE(SUM(quantity), 0) as bal FROM stock_batches WHERE product_id = ? AND status = 'active'", [item.productId._id || item.productId]);
      const mutId = randomUUID();
      // eslint-disable-next-line no-await-in-loop
      await pool.query('INSERT INTO stock_mutations (id, mutation_date, type, product_id, batch_id, batch_number, quantity, balance_before, balance_after, reference_type, reference_id, reference_number, notes, created_by, created_at, updated_at) VALUES (?,NOW(),?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())', [mutId, MUTATION_TYPE.ADJUSTMENT, item.productId._id || item.productId, item.batchId, item.batchNumber, diff, item.systemQty, newQty, MUTATION_REFERENCE_TYPE.OPNAME, id, opname.opnameNumber, `Penyesuaian stok opname ${opname.opnameNumber}`, userId]);
      void balRow;
    }
  }
  await pool.query('UPDATE stock_opnames SET status = ?, completed_at = NOW(), verified_by = ?, matched_items = ?, discrepancy_items = ?, total_discrepancy_qty = ?, notes = COALESCE(?, notes), updated_by = ?, updated_at = NOW() WHERE id = ?', [OPNAME_STATUS.COMPLETED, userId, matchedItems, discrepancyItems, totalDiscrepancyQty, notes || null, userId, id]);
  return mysqlGetOpnameById(id);
};

const mysqlGetStockCard = async (productId, queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  const { page = 1, limit = 50, dateFrom, dateTo, type: mutType } = queryParams || {};
  const offset = (Number(page) - 1) * Number(limit);
  const whereClauses = ['sm.product_id = ?']; const params = [productId];
  if (mutType) { whereClauses.push('sm.type = ?'); params.push(mutType); }
  if (dateFrom) { whereClauses.push('sm.mutation_date >= ?'); params.push(new Date(dateFrom)); }
  if (dateTo) { whereClauses.push('sm.mutation_date <= ?'); params.push(new Date(`${dateTo}T23:59:59.999Z`)); }
  const where = `WHERE ${whereClauses.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM stock_mutations sm ${where}`, params);
  const [rows] = await pool.query(`SELECT sm.* FROM stock_mutations sm ${where} ORDER BY sm.mutation_date DESC LIMIT ? OFFSET ?`, [...params, Number(limit), offset]);
  const [[productRow]] = await pool.query('SELECT id, name, sku FROM products WHERE id = ? LIMIT 1', [productId]);
  return { product: productRow ? { _id: productRow.id, name: productRow.name, sku: productRow.sku } : null, mutations: rows.map((r) => ({ id: r.id, type: r.type, mutationDate: r.mutation_date, batchNumber: r.batch_number, quantity: r.quantity, balanceBefore: r.balance_before, balanceAfter: r.balance_after, referenceType: r.reference_type, referenceNumber: r.reference_number, notes: r.notes })), pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } };
};

const mysqlGetExpiredItems = async (queryParams) => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  await mysqlUpdateExpiredBatches(pool);
  const { page = 1, limit = 20 } = queryParams || {};
  const offset = (Number(page) - 1) * Number(limit);
  const [[{ total }]] = await pool.query("SELECT COUNT(*) as total FROM stock_batches sb WHERE sb.status = 'expired'");
  const [rows] = await pool.query("SELECT sb.*, p.name as product_name, p.sku FROM stock_batches sb LEFT JOIN products p ON sb.product_id = p.id WHERE sb.status = 'expired' ORDER BY sb.expiry_date ASC LIMIT ? OFFSET ?", [Number(limit), offset]);
  return { docs: rows.map((r) => ({ id: r.id, _id: r.id, productId: { _id: r.product_id, name: r.product_name, sku: r.sku }, batchNumber: r.batch_number, quantity: r.quantity, expiryDate: r.expiry_date, unitPrice: Number(r.unit_price), totalValue: Number(r.quantity) * Number(r.unit_price) })), pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / Number(limit)) } };
};

const mysqlGetExpiredStats = async () => {
  const pool = getMySQLPool();
  if (!pool) throw ApiError.internal('MySQL pool not initialized');
  await mysqlUpdateExpiredBatches(pool);
  const [[row]] = await pool.query("SELECT COUNT(*) as batch_count, COUNT(DISTINCT product_id) as product_count, COALESCE(SUM(quantity), 0) as total_qty, COALESCE(SUM(quantity * unit_price), 0) as total_value FROM stock_batches WHERE status = 'expired'");
  return { batchCount: row.batch_count, productCount: row.product_count, totalQty: row.total_qty, totalValue: row.total_value };
};

const getStockSummary = (q) => mysqlGetStockSummary(q);
const getStockStats = () => mysqlGetStockStats();
const getProductBatches = (productId, q) => mysqlGetProductBatches(productId, q);
const getMutations = (q) => mysqlGetMutations(q);
const getMutationStats = () => mysqlGetMutationStats();
const createManualMutation = (data, userId) => mysqlCreateManualMutation(data, userId);
const createGRMutations = (gr, userId) => mysqlCreateGRMutations(gr, userId);
const createDeliveryMutations = (delivery, userId) => mysqlCreateDeliveryMutations(delivery, userId);
const revertDeliveryMutations = (delivery, userId) => mysqlRevertDeliveryMutations(delivery, userId);
const getOpnameSessions = (q) => mysqlGetOpnameSessions(q);
const getOpnameStats = () => mysqlGetOpnameStats();
const createOpname = (data, userId) => mysqlCreateOpname(data, userId);
const getOpnameById = (id) => mysqlGetOpnameById(id);
const updateOpname = (id, data, userId) => mysqlUpdateOpname(id, data, userId);
const finalizeOpname = (id, notes, userId) => mysqlFinalizeOpname(id, notes, userId);
const getStockCard = (productId, q) => mysqlGetStockCard(productId, q);
const getExpiredItems = (q) => mysqlGetExpiredItems(q);
const getExpiredStats = () => mysqlGetExpiredStats();

module.exports = {
  // Stock
  getStockSummary,
  getStockStats,
  getProductBatches,
  // Mutations
  getMutations,
  getMutationStats,
  createManualMutation,
  createGRMutations,
  createDeliveryMutations,
  revertDeliveryMutations,
  // Opname
  getOpnameSessions,
  getOpnameStats,
  createOpname,
  getOpnameById,
  updateOpname,
  finalizeOpname,
  // Stock Card
  getStockCard,
  // Expired
  getExpiredItems,
  getExpiredStats,
};


