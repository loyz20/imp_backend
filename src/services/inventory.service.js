const mongoose = require('mongoose');
const StockBatch = require('../models/StockBatch');
const StockMutation = require('../models/StockMutation');
const StockOpname = require('../models/StockOpname');
const Product = require('../models/Product');
const PurchaseOrder = require('../models/PurchaseOrder');
const AppSetting = require('../models/AppSetting');
const ApiError = require('../utils/ApiError');
const { paginate } = require('../helpers');
const {
  BATCH_STATUS,
  MUTATION_TYPE,
  MUTATION_REFERENCE_TYPE,
  OPNAME_STATUS,
  OPNAME_SCOPE,
} = require('../constants');
const config = require('../config');
const { getMySQLPool } = require('../config/database');

// ═══════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════

/**
 * Auto-mark active batches past expiryDate as EXPIRED
 */
const updateExpiredBatches = async () => {
  await StockBatch.updateMany(
    {
      status: BATCH_STATUS.ACTIVE,
      expiryDate: { $lte: new Date() },
    },
    { $set: { status: BATCH_STATUS.EXPIRED } },
  );
};

// ═══════════════════════════════════════════════
// Sub-modul 1: Stok Gudang
// ═══════════════════════════════════════════════

/**
 * Get stock summary (aggregated per product)
 */
const mongoGetStockSummary = async (queryParams) => {
  await updateExpiredBatches();
  const {
    page = 1, limit = 10, search, kategori, golongan,
    stockStatus, sort,
  } = queryParams;

  const settings = await AppSetting.getSettings();
  const lowThreshold = settings?.inventory?.lowStockThreshold ?? 10;
  const now = new Date();
  const nearExpiryDate = new Date(now);
  nearExpiryDate.setMonth(nearExpiryDate.getMonth() + 3);

  // Build product match
  const productMatch = { isActive: true };
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    productMatch.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { sku: { $regex: escaped, $options: 'i' } },
    ];
  }
  if (kategori) productMatch.category = kategori;
  if (golongan) productMatch.golongan = golongan;

  const pipeline = [
    // Start from products
    { $match: productMatch },
    // Lookup active batches
    {
      $lookup: {
        from: 'stockbatches',
        let: { pid: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$productId', '$$pid'] }, status: { $in: [BATCH_STATUS.ACTIVE, BATCH_STATUS.EXPIRED] } } },
        ],
        as: 'batches',
      },
    },
    // Compute aggregated fields
    {
      $addFields: {
        activeBatches: {
          $filter: { input: '$batches', as: 'b', cond: { $eq: ['$$b.status', BATCH_STATUS.ACTIVE] } },
        },
        expiredBatchesArr: {
          $filter: { input: '$batches', as: 'b', cond: { $eq: ['$$b.status', BATCH_STATUS.EXPIRED] } },
        },
      },
    },
    {
      $addFields: {
        totalStock: { $sum: '$activeBatches.quantity' },
        totalBatches: { $size: '$activeBatches' },
        expiredBatches: { $size: '$expiredBatchesArr' },
        nearExpiryBatches: {
          $size: {
            $filter: {
              input: '$activeBatches',
              as: 'b',
              cond: { $and: [{ $lte: ['$$b.expiryDate', nearExpiryDate] }, { $gt: ['$$b.expiryDate', now] }] },
            },
          },
        },
        nearestExpiry: {
          $min: {
            $map: {
              input: { $filter: { input: '$activeBatches', as: 'b', cond: { $gt: ['$$b.expiryDate', now] } } },
              as: 'b',
              in: '$$b.expiryDate',
            },
          },
        },
        stockValue: {
          $sum: {
            $map: { input: '$activeBatches', as: 'b', in: { $multiply: ['$$b.quantity', '$$b.unitPrice'] } },
          },
        },
      },
    },
    // Compute stock status (use per-product stokMinimum, fallback to global threshold)
    {
      $addFields: {
        _threshold: {
          $cond: [{ $gt: [{ $ifNull: ['$stokMinimum', 0] }, 0] }, '$stokMinimum', lowThreshold],
        },
      },
    },
    {
      $addFields: {
        stockStatus: {
          $cond: [{ $eq: ['$totalStock', 0] }, 'out_of_stock',
            { $cond: [{ $lte: ['$totalStock', '$_threshold'] }, 'low', 'normal'] },
          ],
        },
      },
    },
    // Lookup last mutation date
    {
      $lookup: {
        from: 'stockmutations',
        let: { pid: '$_id' },
        pipeline: [
          { $match: { $expr: { $eq: ['$productId', '$$pid'] } } },
          { $sort: { mutationDate: -1 } },
          { $limit: 1 },
          { $project: { mutationDate: 1 } },
        ],
        as: 'lastMutation',
      },
    },
    {
      $addFields: {
        lastMutationDate: { $arrayElemAt: ['$lastMutation.mutationDate', 0] },
      },
    },
    // Filter by stockStatus if requested
    ...(stockStatus ? [{ $match: { stockStatus } }] : []),
    // Project final shape
    {
      $project: {
        productId: '$_id',
        product: {
          _id: '$_id',
          name: '$name',
          sku: '$sku',
          kategori: '$category',
          golongan: '$golongan',
          satuan: '$satuan',
          isActive: '$isActive',
        },
        totalStock: 1,
        totalBatches: 1,
        nearestExpiry: 1,
        expiredBatches: 1,
        nearExpiryBatches: 1,
        stockValue: 1,
        stockStatus: 1,
        lastMutationDate: 1,
      },
    },
  ];

  // Sort
  let sortObj = { totalStock: -1 };
  if (sort) {
    const dir = sort.startsWith('-') ? -1 : 1;
    const field = sort.replace(/^-/, '');
    sortObj = { [field]: dir };
  }
  pipeline.push({ $sort: sortObj });

  // Count total
  const countPipeline = [...pipeline, { $count: 'total' }];
  const countResult = await Product.aggregate(countPipeline);
  const totalDocs = countResult[0]?.total || 0;

  // Paginate
  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  pipeline.push({ $skip: (pageNum - 1) * limitNum });
  pipeline.push({ $limit: limitNum });

  const docs = await Product.aggregate(pipeline);
  const totalPages = Math.ceil(totalDocs / limitNum);

  return {
    docs,
    pagination: {
      totalDocs,
      totalPages,
      page: pageNum,
      limit: limitNum,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1,
      nextPage: pageNum < totalPages ? pageNum + 1 : null,
      prevPage: pageNum > 1 ? pageNum - 1 : null,
    },
  };
};

/**
 * Get stock stats
 */
const mongoGetStockStats = async () => {
  await updateExpiredBatches();
  const settings = await AppSetting.getSettings();
  const lowThreshold = settings?.inventory?.lowStockThreshold ?? 10;
  const now = new Date();
  const nearExpiryDate = new Date(now);
  nearExpiryDate.setMonth(nearExpiryDate.getMonth() + 3);

  // Aggregate from batches
  const [batchStats, productStockAgg] = await Promise.all([
    StockBatch.aggregate([
      {
        $facet: {
          totalBatches: [{ $count: 'count' }],
          activeBatches: [{ $match: { status: BATCH_STATUS.ACTIVE } }, { $count: 'count' }],
          expired: [{ $match: { status: BATCH_STATUS.EXPIRED } }, { $count: 'count' }],
          nearExpiry: [
            { $match: { status: BATCH_STATUS.ACTIVE, expiryDate: { $lte: nearExpiryDate, $gt: now } } },
            { $count: 'count' },
          ],
          totalStockAndValue: [
            { $match: { status: BATCH_STATUS.ACTIVE } },
            { $group: { _id: null, totalStock: { $sum: '$quantity' }, totalValue: { $sum: { $multiply: ['$quantity', '$unitPrice'] } } } },
          ],
          bySuhu: [
            { $match: { status: BATCH_STATUS.ACTIVE } },
            { $group: { _id: '$storageCondition', count: { $sum: 1 } } },
          ],
        },
      },
    ]),
    // Per-product stock for low/out counts (using per-product stokMinimum)
    StockBatch.aggregate([
      { $match: { status: BATCH_STATUS.ACTIVE } },
      { $group: { _id: '$productId', totalStock: { $sum: '$quantity' } } },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          pipeline: [{ $project: { stokMinimum: 1 } }],
          as: 'product',
        },
      },
      {
        $addFields: {
          _threshold: {
            $cond: [
              { $gt: [{ $ifNull: [{ $arrayElemAt: ['$product.stokMinimum', 0] }, 0] }, 0] },
              { $arrayElemAt: ['$product.stokMinimum', 0] },
              lowThreshold,
            ],
          },
        },
      },
      {
        $facet: {
          outOfStock: [{ $match: { totalStock: { $lte: 0 } } }, { $count: 'count' }],
          lowStock: [{ $match: { $expr: { $and: [{ $gt: ['$totalStock', 0] }, { $lte: ['$totalStock', '$_threshold'] }] } } }, { $count: 'count' }],
        },
      },
    ]),
  ]);

  const stats = batchStats[0];
  const sv = stats.totalStockAndValue[0] || { totalStock: 0, totalValue: 0 };

  const bySuhu = {};
  for (const s of stats.bySuhu) {
    bySuhu[s._id] = s.count;
  }

  // Product category counts (active products only)
  const byKategori = {};
  const catCounts = await Product.aggregate([
    { $match: { isActive: true } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);
  for (const c of catCounts) {
    byKategori[c._id] = c.count;
  }

  const totalSKU = Object.values(byKategori).reduce((a, b) => a + b, 0);
  const pStock = productStockAgg[0] || {};

  return {
    totalSKU,
    totalStock: sv.totalStock,
    totalStockValue: sv.totalValue,
    lowStock: pStock.lowStock?.[0]?.count || 0,
    outOfStock: pStock.outOfStock?.[0]?.count || 0,
    nearExpiry: stats.nearExpiry[0]?.count || 0,
    expired: stats.expired[0]?.count || 0,
    totalBatches: stats.totalBatches[0]?.count || 0,
    activeBatches: stats.activeBatches[0]?.count || 0,
    byKategori,
    bySuhu,
  };
};

/**
 * Get product batches (detail per product, FEFO order)
 */
const mongoGetProductBatches = async (productId, queryParams) => {
  const { page = 1, limit = 20, status, sort } = queryParams;

  const product = await Product.findById(productId).select('name sku category golongan satuan').lean();
  if (!product) {
    throw ApiError.notFound('Product not found');
  }

  const filter = { productId };
  if (status) {
    const statuses = status.split(',').map((s) => s.trim());
    filter.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
  }

  const result = await paginate(StockBatch, {
    filter,
    page,
    limit,
    sort: sort || 'expiryDate',
    populate: [
      { path: 'supplierId', select: 'name code' },
    ],
  });

  // Compute total stock for this product
  const totals = await StockBatch.aggregate([
    { $match: { productId: product._id, status: BATCH_STATUS.ACTIVE } },
    { $group: { _id: null, totalStock: { $sum: '$quantity' }, totalBatches: { $sum: 1 } } },
  ]);

  return {
    ...result,
    product: {
      ...product,
      totalStock: totals[0]?.totalStock || 0,
      totalBatches: totals[0]?.totalBatches || 0,
    },
  };
};

// ═══════════════════════════════════════════════
// Sub-modul 2: Mutasi Stok
// ═══════════════════════════════════════════════

/**
 * Get all mutations
 */
const mongoGetMutations = async (queryParams) => {
  const { page, limit, search, type, productId, dateFrom, dateTo, sort } = queryParams;

  const filter = {};

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { mutationNumber: { $regex: escaped, $options: 'i' } },
      { batchNumber: { $regex: escaped, $options: 'i' } },
      { referenceNumber: { $regex: escaped, $options: 'i' } },
    ];
  }

  if (type) {
    const types = type.split(',').map((s) => s.trim());
    filter.type = types.length > 1 ? { $in: types } : types[0];
  }
  if (productId) filter.productId = productId;

  if (dateFrom || dateTo) {
    filter.mutationDate = {};
    if (dateFrom) filter.mutationDate.$gte = new Date(dateFrom);
    if (dateTo) filter.mutationDate.$lte = new Date(dateTo + 'T23:59:59.999Z');
  }

  return paginate(StockMutation, {
    filter,
    page,
    limit,
    sort: sort || '-mutationDate',
    populate: [
      { path: 'productId', select: 'name sku' },
      { path: 'createdBy', select: 'name' },
    ],
  });
};

/**
 * Get mutation stats
 */
const mongoGetMutationStats = async () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [total, thisMonthByType, byTypeAll] = await Promise.all([
    StockMutation.countDocuments(),
    StockMutation.aggregate([
      { $match: { mutationDate: { $gte: startOfMonth } } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]),
    StockMutation.aggregate([
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]),
  ]);

  const monthMap = {};
  let thisMonth = 0;
  for (const m of thisMonthByType) {
    monthMap[m._id] = m.count;
    thisMonth += m.count;
  }

  const byType = {};
  for (const t of byTypeAll) {
    byType[t._id] = t.count;
  }

  return {
    total,
    thisMonth,
    inThisMonth: monthMap[MUTATION_TYPE.IN] || 0,
    outThisMonth: monthMap[MUTATION_TYPE.OUT] || 0,
    adjustmentThisMonth: monthMap[MUTATION_TYPE.ADJUSTMENT] || 0,
    disposalThisMonth: monthMap[MUTATION_TYPE.DISPOSAL] || 0,
    byType,
  };
};

/**
 * Create a manual stock mutation (adjustment, disposal, transfer)
 */
const mongoCreateManualMutation = async (data, userId) => {
  const { type, productId, batchId, quantity, reason, notes } = data;

  // Validate product
  const product = await Product.findById(productId);
  if (!product) throw ApiError.notFound('Produk tidak ditemukan');

  // Validate batch
  const batch = await StockBatch.findById(batchId);
  if (!batch) throw ApiError.notFound('Batch tidak ditemukan');
  if (batch.productId.toString() !== productId) {
    throw ApiError.badRequest('Batch tidak sesuai dengan produk');
  }

  // For disposal, batch must be expired or have qty > 0
  if (type === MUTATION_TYPE.DISPOSAL) {
    if (batch.quantity <= 0) {
      throw ApiError.badRequest('Batch tidak memiliki stok untuk dimusnahkan');
    }
  }

  // For negative qty, validate enough stock
  if (quantity < 0 && batch.quantity + quantity < 0) {
    throw ApiError.badRequest(`Stok batch tidak cukup. Tersedia: ${batch.quantity}`);
  }

  const balanceBefore = batch.quantity;
  const balanceAfter = balanceBefore + quantity;

  // Update batch
  batch.quantity = balanceAfter;
  if (balanceAfter <= 0) {
    batch.status = type === MUTATION_TYPE.DISPOSAL ? BATCH_STATUS.DISPOSED : BATCH_STATUS.DEPLETED;
  }
  await batch.save();

  // Create mutation record
  const mutation = await StockMutation.create({
    mutationDate: new Date(),
    type,
    productId,
    batchId,
    batchNumber: batch.batchNumber,
    quantity,
    balanceBefore,
    balanceAfter,
    referenceType: type === MUTATION_TYPE.DISPOSAL ? MUTATION_REFERENCE_TYPE.DISPOSAL : MUTATION_REFERENCE_TYPE.MANUAL,
    reason,
    notes,
    createdBy: userId,
  });

  return mutation;
};

/**
 * Create stock mutation from Goods Receiving verification (called by GR service)
 */
const mongoCreateGRMutations = async (goodsReceiving, userId) => {
  const mutations = [];

  // Get unit prices and discount from PO if available
  let poItemMap = {};
  if (goodsReceiving.purchaseOrderId) {
    const poId = typeof goodsReceiving.purchaseOrderId === 'object'
      ? goodsReceiving.purchaseOrderId._id || goodsReceiving.purchaseOrderId
      : goodsReceiving.purchaseOrderId;
    const po = await PurchaseOrder.findById(poId).select('items').lean();
    if (po) {
      for (const poItem of po.items) {
        poItemMap[poItem.productId.toString()] = {
          unitPrice: poItem.unitPrice || 0,
          discount: poItem.discount || 0,
        };
      }
    }
  }

  for (const item of goodsReceiving.items) {
    const productIdStr = typeof item.productId === 'object'
      ? (item.productId._id || item.productId).toString()
      : item.productId.toString();
    const poItemPrice = poItemMap[productIdStr] || {};
    const rawUnitPrice = Number.isFinite(item.unitPrice)
      ? Number(item.unitPrice)
      : Number(poItemPrice.unitPrice || 0);
    const rawDiscount = Number.isFinite(item.discount)
      ? Number(item.discount)
      : Number(poItemPrice.discount || 0);
    const discount = Math.min(100, Math.max(0, rawDiscount));
    const unitPrice = Math.round(rawUnitPrice * (1 - discount / 100));

    // Create or find batch (match by productId + batchNumber to avoid duplicates across GRs)
    let batch = await StockBatch.findOne({
      productId: item.productId,
      batchNumber: item.batchNumber,
    });

    if (!batch) {
      batch = await StockBatch.create({
        productId: item.productId,
        batchNumber: item.batchNumber,
        quantity: item.receivedQty,
        initialQuantity: item.receivedQty,
        expiryDate: item.expiryDate,
        manufacturingDate: item.manufacturingDate || null,
        receivedDate: goodsReceiving.receivingDate || new Date(),
        storageCondition: item.storageCondition || 'Suhu Kamar',
        status: BATCH_STATUS.ACTIVE,
        goodsReceivingId: goodsReceiving._id,
        supplierId: goodsReceiving.supplierId,
        unitPrice,
        createdBy: userId,
      });
    } else {
      // Batch already exists — add quantity and reactivate if depleted
      const prevQty = batch.quantity;
      const nextQty = prevQty + item.receivedQty;

      if (nextQty > 0) {
        batch.unitPrice = Math.round(((Number(batch.unitPrice || 0) * prevQty) + (unitPrice * item.receivedQty)) / nextQty);
      }

      batch.quantity += item.receivedQty;
      batch.initialQuantity += item.receivedQty;
      if (batch.status === BATCH_STATUS.DEPLETED) {
        batch.status = BATCH_STATUS.ACTIVE;
      }
      await batch.save();
    }

    // Get current total stock for balance tracking
    const totalBefore = await StockBatch.aggregate([
      { $match: { productId: item.productId, status: BATCH_STATUS.ACTIVE, _id: { $ne: batch._id } } },
      { $group: { _id: null, total: { $sum: '$quantity' } } },
    ]);
    const balanceBefore = (totalBefore[0]?.total || 0) + (batch.quantity - item.receivedQty);
    const balanceAfter = balanceBefore + item.receivedQty;

    const mutation = await StockMutation.create({
      mutationDate: new Date(),
      type: MUTATION_TYPE.IN,
      productId: item.productId,
      batchId: batch._id,
      batchNumber: item.batchNumber,
      quantity: item.receivedQty,
      balanceBefore,
      balanceAfter,
      referenceType: MUTATION_REFERENCE_TYPE.GOODS_RECEIVING,
      referenceId: goodsReceiving._id,
      referenceNumber: goodsReceiving.invoiceNumber,
      notes: `Penerimaan dari ${goodsReceiving.invoiceNumber}`,
      createdBy: userId,
    });

    mutations.push(mutation);
  }

  return mutations;
};

/**
 * Create stock OUT mutations from Delivery creation (called by delivery service)
 * Reduces batch quantity using FEFO (First Expired First Out)
 */
const mongoCreateDeliveryMutations = async (delivery, userId) => {
  const mutations = [];

  for (const item of delivery.items) {
    const productId = typeof item.productId === 'object'
      ? (item.productId._id || item.productId)
      : item.productId;

    let remainingQty = item.quantityShipped;

    // If delivery specifies a batch, use that batch directly
    if (item.batchNumber) {
      const batch = await StockBatch.findOne({
        productId,
        batchNumber: item.batchNumber,
        status: BATCH_STATUS.ACTIVE,
      });

      if (!batch) {
        throw ApiError.badRequest(`Batch ${item.batchNumber} tidak ditemukan atau sudah habis`);
      }
      if (batch.quantity < remainingQty) {
        throw ApiError.badRequest(
          `Stok batch ${item.batchNumber} tidak cukup (tersedia: ${batch.quantity}, dibutuhkan: ${remainingQty})`,
        );
      }

      const balanceBefore = batch.quantity;
      batch.quantity -= remainingQty;
      if (batch.quantity <= 0) {
        batch.status = BATCH_STATUS.DEPLETED;
      }
      await batch.save();

      // Get total product balance
      const totalStock = await StockBatch.aggregate([
        { $match: { productId: mongoose.Types.ObjectId.createFromHexString(productId.toString()), status: BATCH_STATUS.ACTIVE } },
        { $group: { _id: null, total: { $sum: '$quantity' } } },
      ]);
      const productBalanceAfter = (totalStock[0]?.total || 0);

      const mutation = await StockMutation.create({
        mutationDate: new Date(),
        type: MUTATION_TYPE.OUT,
        productId,
        batchId: batch._id,
        batchNumber: item.batchNumber,
        quantity: -remainingQty,
        balanceBefore: productBalanceAfter + remainingQty,
        balanceAfter: productBalanceAfter,
        referenceType: MUTATION_REFERENCE_TYPE.SALES_ORDER,
        referenceId: delivery._id,
        referenceNumber: delivery.deliveryNumber,
        notes: `Pengiriman ${delivery.deliveryNumber}`,
        createdBy: userId,
      });

      mutations.push(mutation);
    } else {
      // FEFO: pick batches sorted by expiry date (earliest first)
      const batches = await StockBatch.find({
        productId,
        status: BATCH_STATUS.ACTIVE,
        quantity: { $gt: 0 },
      }).sort({ expiryDate: 1 });

      if (!batches.length) {
        throw ApiError.badRequest(`Stok produk tidak tersedia`);
      }

      // Check total available stock
      const totalAvailable = batches.reduce((sum, b) => sum + b.quantity, 0);
      if (totalAvailable < remainingQty) {
        throw ApiError.badRequest(
          `Stok tidak cukup (tersedia: ${totalAvailable}, dibutuhkan: ${remainingQty})`,
        );
      }

      for (const batch of batches) {
        if (remainingQty <= 0) break;

        const deductQty = Math.min(batch.quantity, remainingQty);
        const balanceBefore = batch.quantity;
        batch.quantity -= deductQty;
        if (batch.quantity <= 0) {
          batch.status = BATCH_STATUS.DEPLETED;
        }
        await batch.save();
        remainingQty -= deductQty;

        // Get total product balance
        const totalStock = await StockBatch.aggregate([
          { $match: { productId: mongoose.Types.ObjectId.createFromHexString(productId.toString()), status: BATCH_STATUS.ACTIVE } },
          { $group: { _id: null, total: { $sum: '$quantity' } } },
        ]);
        const productBalanceAfter = (totalStock[0]?.total || 0);

        const mutation = await StockMutation.create({
          mutationDate: new Date(),
          type: MUTATION_TYPE.OUT,
          productId,
          batchId: batch._id,
          batchNumber: batch.batchNumber,
          quantity: -deductQty,
          balanceBefore: productBalanceAfter + deductQty,
          balanceAfter: productBalanceAfter,
          referenceType: MUTATION_REFERENCE_TYPE.SALES_ORDER,
          referenceId: delivery._id,
          referenceNumber: delivery.deliveryNumber,
          notes: `Pengiriman ${delivery.deliveryNumber} (FEFO)`,
          createdBy: userId,
        });

        mutations.push(mutation);
      }
    }
  }

  return mutations;
};

/**
 * Revert stock mutations from a delivery (called on delete/cancel/return)
 * Restores batch quantities and creates return mutations
 */
const mongoRevertDeliveryMutations = async (delivery, userId) => {
  const mutations = [];

  // Find all OUT mutations for this delivery
  const existingMutations = await StockMutation.find({
    referenceId: delivery._id,
    type: MUTATION_TYPE.OUT,
  });

  for (const mut of existingMutations) {
    const batch = await StockBatch.findById(mut.batchId);
    if (!batch) continue;

    const restoreQty = Math.abs(mut.quantity);
    batch.quantity += restoreQty;
    if (batch.status === BATCH_STATUS.DEPLETED) {
      batch.status = BATCH_STATUS.ACTIVE;
    }
    await batch.save();

    // Get total product balance
    const totalStock = await StockBatch.aggregate([
      { $match: { productId: batch.productId, status: BATCH_STATUS.ACTIVE } },
      { $group: { _id: null, total: { $sum: '$quantity' } } },
    ]);
    const productBalanceAfter = (totalStock[0]?.total || 0);

    const returnMutation = await StockMutation.create({
      mutationDate: new Date(),
      type: MUTATION_TYPE.RETURN,
      productId: mut.productId,
      batchId: mut.batchId,
      batchNumber: mut.batchNumber,
      quantity: restoreQty,
      balanceBefore: productBalanceAfter - restoreQty,
      balanceAfter: productBalanceAfter,
      referenceType: MUTATION_REFERENCE_TYPE.SALES_ORDER,
      referenceId: delivery._id,
      referenceNumber: delivery.deliveryNumber,
      notes: `Pengembalian stok dari ${delivery.deliveryNumber}`,
      createdBy: userId,
    });

    mutations.push(returnMutation);
  }

  return mutations;
};

// ═══════════════════════════════════════════════
// Sub-modul 3: Stok Opname
// ═══════════════════════════════════════════════

/**
 * Get all opname sessions
 */
const mongoGetOpnameSessions = async (queryParams) => {
  const { page, limit, search, status, dateFrom, dateTo, sort } = queryParams;

  const filter = {};

  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.opnameNumber = { $regex: escaped, $options: 'i' };
  }

  if (status) {
    const statuses = status.split(',').map((s) => s.trim());
    filter.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
  }

  if (dateFrom || dateTo) {
    filter.opnameDate = {};
    if (dateFrom) filter.opnameDate.$gte = new Date(dateFrom);
    if (dateTo) filter.opnameDate.$lte = new Date(dateTo + 'T23:59:59.999Z');
  }

  return paginate(StockOpname, {
    filter,
    page,
    limit,
    sort: sort || '-createdAt',
    select: '-items',
    populate: [
      { path: 'assignedTo', select: 'name' },
      { path: 'verifiedBy', select: 'name' },
      { path: 'createdBy', select: 'name' },
    ],
  });
};

/**
 * Get opname stats
 */
const mongoGetOpnameStats = async () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [total, inProgress, completedThisMonth, discrepancies, lastOpname] = await Promise.all([
    StockOpname.countDocuments(),
    StockOpname.countDocuments({ status: OPNAME_STATUS.IN_PROGRESS }),
    StockOpname.countDocuments({ status: OPNAME_STATUS.COMPLETED, completedAt: { $gte: startOfMonth } }),
    StockOpname.aggregate([
      { $match: { status: OPNAME_STATUS.COMPLETED } },
      { $group: { _id: null, total: { $sum: '$discrepancyItems' } } },
    ]),
    StockOpname.findOne({ status: OPNAME_STATUS.COMPLETED }).sort({ completedAt: -1 }).select('opnameDate').lean(),
  ]);

  return {
    total,
    inProgress,
    completedThisMonth,
    totalDiscrepancies: discrepancies[0]?.total || 0,
    lastOpnameDate: lastOpname?.opnameDate || null,
  };
};

/**
 * Create opname session — auto-populate items from active batches
 */
const mongoCreateOpname = async (data, userId) => {
  const { opnameDate, scope, scopeFilter, assignedTo, notes } = data;

  // Build batch filter based on scope
  const batchFilter = { status: BATCH_STATUS.ACTIVE, quantity: { $gt: 0 } };

  if (scope === OPNAME_SCOPE.CATEGORY && scopeFilter?.kategori) {
    // Get product IDs for the category
    const products = await Product.find({ category: scopeFilter.kategori, isActive: true }).select('_id').lean();
    batchFilter.productId = { $in: products.map((p) => p._id) };
  }

  const batches = await StockBatch.find(batchFilter)
    .populate('productId', 'name sku')
    .sort({ productId: 1, expiryDate: 1 })
    .lean();

  if (batches.length === 0) {
    throw ApiError.badRequest('Tidak ada batch aktif untuk di-opname');
  }

  const items = batches.map((b) => ({
    productId: b.productId._id,
    batchId: b._id,
    batchNumber: b.batchNumber,
    expiryDate: b.expiryDate,
    systemQty: b.quantity,
    actualQty: null,
    difference: null,
    notes: '',
  }));

  const opname = await StockOpname.create({
    opnameDate,
    scope,
    scopeFilter: scope === OPNAME_SCOPE.CATEGORY ? scopeFilter : null,
    assignedTo: assignedTo || null,
    notes: notes || '',
    items,
    totalItems: items.length,
    createdBy: userId,
    updatedBy: userId,
  });

  return opname;
};

/**
 * Get opname by ID (with populated items)
 */
const mongoGetOpnameById = async (id) => {
  const opname = await StockOpname.findById(id)
    .populate('items.productId', 'name sku golongan')
    .populate('assignedTo', 'name')
    .populate('verifiedBy', 'name')
    .populate('createdBy', 'name');

  if (!opname) {
    throw ApiError.notFound('Opname session not found');
  }

  return opname;
};

/**
 * Update opname (input actual qty)
 */
const mongoUpdateOpname = async (id, data, userId) => {
  const opname = await StockOpname.findById(id);
  if (!opname) {
    throw ApiError.notFound('Opname session not found');
  }

  if (opname.status !== OPNAME_STATUS.DRAFT && opname.status !== OPNAME_STATUS.IN_PROGRESS) {
    throw ApiError.badRequest('Opname hanya dapat diedit saat status draft atau in_progress');
  }

  // Update status if provided
  if (data.status) {
    opname.status = data.status;
  }

  // Update items actualQty
  if (data.items && Array.isArray(data.items)) {
    for (const update of data.items) {
      const item = opname.items.find(
        (i) =>
          (update._id && i._id.toString() === update._id) ||
          (update.productId &&
            update.batchId &&
            i.productId.toString() === update.productId &&
            i.batchId.toString() === update.batchId)
      );
      if (item) {
        if (update.actualQty !== undefined && update.actualQty !== null) {
          item.actualQty = update.actualQty;
          item.difference = update.actualQty - item.systemQty;
        }
        if (update.notes !== undefined) {
          item.notes = update.notes;
        }
      }
    }
  }

  // Recalculate summary
  const filled = opname.items.filter((i) => i.actualQty !== null);
  const matched = filled.filter((i) => i.difference === 0);
  const discrepancy = filled.filter((i) => i.difference !== 0);

  opname.matchedItems = matched.length;
  opname.discrepancyItems = discrepancy.length;
  opname.totalDiscrepancyQty = discrepancy.reduce((sum, i) => sum + Math.abs(i.difference), 0);

  if (data.notes !== undefined) {
    opname.notes = data.notes;
  }
  opname.updatedBy = userId;

  await opname.save();
  return opname;
};

/**
 * Finalize opname — create adjustment mutations for discrepancies
 */
const mongoFinalizeOpname = async (id, notes, userId) => {
  const opname = await StockOpname.findById(id);
  if (!opname) {
    throw ApiError.notFound('Opname session not found');
  }

  if (opname.status !== OPNAME_STATUS.DRAFT && opname.status !== OPNAME_STATUS.IN_PROGRESS) {
    throw ApiError.badRequest('Opname harus berstatus draft atau in_progress untuk difinalisasi');
  }

  // Validate all items have actualQty
  const unfilled = opname.items.filter((i) => i.actualQty === null || i.actualQty === undefined);
  if (unfilled.length > 0) {
    throw ApiError.badRequest(`Masih ada ${unfilled.length} item yang belum diisi qty aktual`);
  }

  // Recalc differences
  let matchedItems = 0;
  let discrepancyItems = 0;
  let totalDiscrepancyQty = 0;
  const adjustmentItems = [];

  for (const item of opname.items) {
    item.difference = item.actualQty - item.systemQty;
    if (item.difference === 0) {
      matchedItems++;
    } else {
      discrepancyItems++;
      totalDiscrepancyQty += Math.abs(item.difference);
      adjustmentItems.push(item);
    }
  }

  // Create adjustment mutations for each discrepancy
  for (const item of adjustmentItems) {
    const batch = await StockBatch.findById(item.batchId);
    if (!batch) continue;

    const balanceBefore = batch.quantity;
    batch.quantity = item.actualQty;
    if (batch.quantity <= 0) {
      batch.status = BATCH_STATUS.DEPLETED;
    } else if (batch.status === BATCH_STATUS.DEPLETED) {
      batch.status = BATCH_STATUS.ACTIVE;
    }
    await batch.save();

    await StockMutation.create({
      mutationDate: new Date(),
      type: MUTATION_TYPE.ADJUSTMENT,
      productId: item.productId,
      batchId: item.batchId,
      batchNumber: item.batchNumber,
      quantity: item.difference,
      balanceBefore,
      balanceAfter: item.actualQty,
      referenceType: MUTATION_REFERENCE_TYPE.OPNAME,
      referenceId: opname._id,
      referenceNumber: opname.opnameNumber,
      reason: `Penyesuaian stok opname ${opname.opnameNumber}`,
      notes: item.notes || '',
      createdBy: userId,
    });
  }

  // Update opname
  opname.status = OPNAME_STATUS.COMPLETED;
  opname.completedAt = new Date();
  opname.verifiedBy = userId;
  opname.matchedItems = matchedItems;
  opname.discrepancyItems = discrepancyItems;
  opname.totalDiscrepancyQty = totalDiscrepancyQty;
  if (notes) opname.notes = notes;
  opname.updatedBy = userId;

  await opname.save();
  return opname;
};

// ═══════════════════════════════════════════════
// Sub-modul 4: Kartu Stok
// ═══════════════════════════════════════════════

/**
 * Get stock card for a product
 */
const mongoGetStockCard = async (productId, queryParams) => {
  const { page = 1, limit = 50, dateFrom, dateTo, type } = queryParams;
  const productOid = new mongoose.Types.ObjectId(productId);

  const product = await Product.findById(productId)
    .select('name sku category golongan satuan')
    .lean();
  if (!product) {
    throw ApiError.notFound('Product not found');
  }

  // Total stock
  const totals = await StockBatch.aggregate([
    { $match: { productId: product._id, status: BATCH_STATUS.ACTIVE } },
    { $group: { _id: null, totalStock: { $sum: '$quantity' }, totalBatches: { $sum: 1 } } },
  ]);

  // Build mutations filter
  const filter = { productId };
  if (type) {
    const types = type.split(',').map((s) => s.trim());
    filter.type = types.length > 1 ? { $in: types } : types[0];
  }
  if (dateFrom || dateTo) {
    filter.mutationDate = {};
    if (dateFrom) filter.mutationDate.$gte = new Date(dateFrom);
    if (dateTo) filter.mutationDate.$lte = new Date(dateTo + 'T23:59:59.999Z');
  }

  const result = await paginate(StockMutation, {
    filter,
    page,
    limit,
    sort: '-mutationDate',
    populate: [
      { path: 'createdBy', select: 'name' },
    ],
  });

  // Compute summary for the filtered range
  const summaryFilter = { productId: productOid };
  if (dateFrom || dateTo) {
    summaryFilter.mutationDate = {};
    if (dateFrom) summaryFilter.mutationDate.$gte = new Date(dateFrom);
    if (dateTo) summaryFilter.mutationDate.$lte = new Date(dateTo + 'T23:59:59.999Z');
  }

  const summaryAgg = await StockMutation.aggregate([
    { $match: summaryFilter },
    {
      $group: {
        _id: null,
        totalIn: { $sum: { $cond: [{ $gt: ['$quantity', 0] }, '$quantity', 0] } },
        totalOut: { $sum: { $cond: [{ $lt: ['$quantity', 0] }, { $abs: '$quantity' }, 0] } },
      },
    },
  ]);

  const summary = summaryAgg[0] || { totalIn: 0, totalOut: 0 };

  // Compute opening/closing balance based on date filter
  let openingBalance, closingBalance;
  if (dateFrom) {
    // Opening = sum of all mutations before dateFrom
    const priorAgg = await StockMutation.aggregate([
      { $match: { productId: productOid, mutationDate: { $lt: new Date(dateFrom) } } },
      { $group: { _id: null, total: { $sum: '$quantity' } } },
    ]);
    openingBalance = priorAgg[0]?.total || 0;
    closingBalance = openingBalance + (summary.totalIn - summary.totalOut);
  } else {
    closingBalance = totals[0]?.totalStock || 0;
    openingBalance = closingBalance - (summary.totalIn - summary.totalOut);
  }

  // Map entries to card format
  const entries = result.docs.map((m) => ({
    _id: m._id || m.id,
    mutationDate: m.mutationDate,
    mutationNumber: m.mutationNumber,
    type: m.type,
    batchNumber: m.batchNumber,
    referenceNumber: m.referenceNumber,
    description: getDescription(m.type, m.referenceType),
    quantityIn: m.quantity > 0 ? m.quantity : 0,
    quantityOut: m.quantity < 0 ? Math.abs(m.quantity) : 0,
    balance: m.balanceAfter,
    createdBy: m.createdBy,
  }));

  return {
    product: {
      ...product,
      totalStock: closingBalance,
      totalBatches: totals[0]?.totalBatches || 0,
    },
    summary: {
      totalIn: summary.totalIn,
      totalOut: summary.totalOut,
      netChange: summary.totalIn - summary.totalOut,
      openingBalance,
      closingBalance,
    },
    entries,
    pagination: result.pagination,
  };
};

function getDescription(type, referenceType) {
  const map = {
    [MUTATION_TYPE.IN]: 'Penerimaan Barang',
    [MUTATION_TYPE.OUT]: 'Penjualan',
    [MUTATION_TYPE.ADJUSTMENT]: 'Penyesuaian Stok',
    [MUTATION_TYPE.DISPOSAL]: 'Pemusnahan',
    [MUTATION_TYPE.TRANSFER]: 'Transfer',
    [MUTATION_TYPE.RETURN]: 'Retur',
  };
  return map[type] || type;
}

// ═══════════════════════════════════════════════
// Sub-modul 5: Expired / ED Monitoring
// ═══════════════════════════════════════════════

/**
 * Get expired/near-expiry items
 */
const mongoGetExpiredItems = async (queryParams) => {
  await updateExpiredBatches();
  const { page = 1, limit = 10, search, expiryStatus, kategori, storageCondition, sort } = queryParams;
  const now = new Date();

  const filter = { status: BATCH_STATUS.ACTIVE };

  if (storageCondition) filter.storageCondition = storageCondition;

  // Expiry status filter
  if (expiryStatus) {
    const statuses = expiryStatus.split(',').map((s) => s.trim());
    const dateConditions = [];

    for (const s of statuses) {
      const d30 = new Date(now); d30.setDate(d30.getDate() + 30);
      const d90 = new Date(now); d90.setDate(d90.getDate() + 90);
      const d180 = new Date(now); d180.setDate(d180.getDate() + 180);

      if (s === 'expired') dateConditions.push({ expiryDate: { $lte: now } });
      else if (s === 'critical') dateConditions.push({ expiryDate: { $gt: now, $lte: d30 } });
      else if (s === 'warning') dateConditions.push({ expiryDate: { $gt: d30, $lte: d90 } });
      else if (s === 'caution') dateConditions.push({ expiryDate: { $gt: d90, $lte: d180 } });
      else if (s === 'safe') dateConditions.push({ expiryDate: { $gt: d180 } });
    }

    if (dateConditions.length === 1) Object.assign(filter, dateConditions[0]);
    else if (dateConditions.length > 1) filter.$or = dateConditions;

    // Include expired batch status for the expired filter
    if (statuses.includes('expired')) {
      filter.status = { $in: [BATCH_STATUS.ACTIVE, BATCH_STATUS.EXPIRED] };
    }
  }

  // Search and kategori need product lookup
  let productIds = null;
  if (search || kategori) {
    const pFilter = { isActive: true };
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      pFilter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { sku: { $regex: escaped, $options: 'i' } },
      ];
    }
    if (kategori) pFilter.category = kategori;

    // Also search by batch number
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const products = await Product.find(pFilter).select('_id').lean();
      productIds = products.map((p) => p._id);

      // Combine product search OR batch number search
      const batchSearchFilter = { batchNumber: { $regex: escaped, $options: 'i' } };
      if (productIds.length > 0) {
        filter.$or = filter.$or || [];
        filter.$or.push({ productId: { $in: productIds } }, batchSearchFilter);
      } else {
        Object.assign(filter, batchSearchFilter);
      }
    } else {
      const products = await Product.find(pFilter).select('_id').lean();
      filter.productId = { $in: products.map((p) => p._id) };
    }
  }

  const result = await paginate(StockBatch, {
    filter,
    page,
    limit,
    sort: sort || 'expiryDate',
    populate: [
      { path: 'productId', select: 'name sku category golongan' },
      { path: 'supplierId', select: 'name' },
    ],
  });

  // Add computed fields
  const docs = result.docs.map((doc) => {
    const d = doc.toJSON ? doc.toJSON() : doc;
    const expiryDate = new Date(d.expiryDate);
    const diffMs = expiryDate - now;
    const daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    let computedStatus;
    if (daysUntilExpiry <= 0) computedStatus = 'expired';
    else if (daysUntilExpiry <= 30) computedStatus = 'critical';
    else if (daysUntilExpiry <= 90) computedStatus = 'warning';
    else if (daysUntilExpiry <= 180) computedStatus = 'caution';
    else computedStatus = 'safe';

    return { ...d, daysUntilExpiry, expiryStatus: computedStatus };
  });

  return { docs, pagination: result.pagination };
};

/**
 * Get expired stats
 */
const mongoGetExpiredStats = async () => {
  await updateExpiredBatches();
  const now = new Date();
  const d30 = new Date(now); d30.setDate(d30.getDate() + 30);
  const d90 = new Date(now); d90.setDate(d90.getDate() + 90);
  const d180 = new Date(now); d180.setDate(d180.getDate() + 180);

  const [stats] = await StockBatch.aggregate([
    { $match: { status: { $in: [BATCH_STATUS.ACTIVE, BATCH_STATUS.EXPIRED] }, quantity: { $gt: 0 } } },
    {
      $facet: {
        totalActive: [{ $match: { status: BATCH_STATUS.ACTIVE } }, { $count: 'count' }],
        expired: [
          { $match: { expiryDate: { $lte: now } } },
          { $group: { _id: null, count: { $sum: 1 }, value: { $sum: { $multiply: ['$quantity', '$unitPrice'] } } } },
        ],
        critical: [
          { $match: { expiryDate: { $gt: now, $lte: d30 } } },
          { $group: { _id: null, count: { $sum: 1 }, value: { $sum: { $multiply: ['$quantity', '$unitPrice'] } } } },
        ],
        warning: [
          { $match: { expiryDate: { $gt: d30, $lte: d90 } } },
          { $group: { _id: null, count: { $sum: 1 }, value: { $sum: { $multiply: ['$quantity', '$unitPrice'] } } } },
        ],
        caution: [
          { $match: { expiryDate: { $gt: d90, $lte: d180 } } },
          { $group: { _id: null, count: { $sum: 1 } } },
        ],
        safe: [
          { $match: { expiryDate: { $gt: d180 } } },
          { $count: 'count' },
        ],
        undisposed: [
          { $match: { status: BATCH_STATUS.EXPIRED, expiryDate: { $lte: now } } },
          { $count: 'count' },
        ],
      },
    },
  ]);

  const expired = stats.expired[0] || { count: 0, value: 0 };
  const critical = stats.critical[0] || { count: 0, value: 0 };
  const warning = stats.warning[0] || { count: 0, value: 0 };
  const undisposed = stats.undisposed[0]?.count || 0;

  return {
    totalActiveBatches: stats.totalActive[0]?.count || 0,
    expired: expired.count,
    expiredValue: expired.value,
    critical: critical.count,
    criticalValue: critical.value,
    warning: warning.count,
    warningValue: warning.value,
    caution: stats.caution[0]?.count || 0,
    safe: stats.safe[0]?.count || 0,
    undisposedExpired: undisposed,
    disposalNeeded: undisposed > 0,
  };
};

// ─── MySQL Helpers ───

const generateOpnameNumber = async (pool) => {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const prefix = `OP-${ymd}-`;
  const [rows] = await pool.query('SELECT opname_number FROM stock_opnames WHERE opname_number LIKE ? ORDER BY opname_number DESC LIMIT 1', [`${prefix}%`]);
  const seq = rows.length > 0 ? parseInt(rows[0].opname_number.split('-').pop(), 10) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, '0')}`;
};

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
  const id = new mongoose.Types.ObjectId().toString();
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
      batchId = new mongoose.Types.ObjectId().toString();
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
    const mutId = new mongoose.Types.ObjectId().toString();
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
      const mutId = new mongoose.Types.ObjectId().toString();
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
        const mutId = new mongoose.Types.ObjectId().toString();
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
    const mutId = new mongoose.Types.ObjectId().toString();
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
  const id = new mongoose.Types.ObjectId().toString();
  const opnameNumber = await generateOpnameNumber(pool);
  await pool.query('INSERT INTO stock_opnames (id, opname_number, status, opname_date, scope, notes, assigned_to, total_items, matched_items, discrepancy_items, total_discrepancy_qty, created_by, updated_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,0,0,0,0,?,?,NOW(),NOW())', [id, opnameNumber, OPNAME_STATUS.DRAFT, data.opnameDate || new Date(), data.scope || OPNAME_SCOPE.ALL, data.notes || '', data.assignedTo || null, userId, userId]);
  const [activeBatches] = await pool.query("SELECT sb.id, sb.product_id, sb.batch_number, sb.expiry_date, sb.quantity FROM stock_batches sb WHERE sb.status = 'active' AND sb.quantity > 0");
  let totalItems = 0;
  for (const batch of activeBatches) {
    const itemId = new mongoose.Types.ObjectId().toString();
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
      const mutId = new mongoose.Types.ObjectId().toString();
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

// ─── Exported Functions with Provider Branching ───

const getStockSummary = (q) => config.dbProvider === 'mysql' ? mysqlGetStockSummary(q) : mongoGetStockSummary(q);
const getStockStats = () => config.dbProvider === 'mysql' ? mysqlGetStockStats() : mongoGetStockStats();
const getProductBatches = (productId, q) => config.dbProvider === 'mysql' ? mysqlGetProductBatches(productId, q) : mongoGetProductBatches(productId, q);
const getMutations = (q) => config.dbProvider === 'mysql' ? mysqlGetMutations(q) : mongoGetMutations(q);
const getMutationStats = () => config.dbProvider === 'mysql' ? mysqlGetMutationStats() : mongoGetMutationStats();
const createManualMutation = (data, userId) => config.dbProvider === 'mysql' ? mysqlCreateManualMutation(data, userId) : mongoCreateManualMutation(data, userId);
const createGRMutations = (gr, userId) => config.dbProvider === 'mysql' ? mysqlCreateGRMutations(gr, userId) : mongoCreateGRMutations(gr, userId);
const createDeliveryMutations = (delivery, userId) => config.dbProvider === 'mysql' ? mysqlCreateDeliveryMutations(delivery, userId) : mongoCreateDeliveryMutations(delivery, userId);
const revertDeliveryMutations = (delivery, userId) => config.dbProvider === 'mysql' ? mysqlRevertDeliveryMutations(delivery, userId) : mongoRevertDeliveryMutations(delivery, userId);
const getOpnameSessions = (q) => config.dbProvider === 'mysql' ? mysqlGetOpnameSessions(q) : mongoGetOpnameSessions(q);
const getOpnameStats = () => config.dbProvider === 'mysql' ? mysqlGetOpnameStats() : mongoGetOpnameStats();
const createOpname = (data, userId) => config.dbProvider === 'mysql' ? mysqlCreateOpname(data, userId) : mongoCreateOpname(data, userId);
const getOpnameById = (id) => config.dbProvider === 'mysql' ? mysqlGetOpnameById(id) : mongoGetOpnameById(id);
const updateOpname = (id, data, userId) => config.dbProvider === 'mysql' ? mysqlUpdateOpname(id, data, userId) : mongoUpdateOpname(id, data, userId);
const finalizeOpname = (id, notes, userId) => config.dbProvider === 'mysql' ? mysqlFinalizeOpname(id, notes, userId) : mongoFinalizeOpname(id, notes, userId);
const getStockCard = (productId, q) => config.dbProvider === 'mysql' ? mysqlGetStockCard(productId, q) : mongoGetStockCard(productId, q);
const getExpiredItems = (q) => config.dbProvider === 'mysql' ? mysqlGetExpiredItems(q) : mongoGetExpiredItems(q);
const getExpiredStats = () => config.dbProvider === 'mysql' ? mysqlGetExpiredStats() : mongoGetExpiredStats();

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
