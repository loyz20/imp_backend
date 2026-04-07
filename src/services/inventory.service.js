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
const getStockSummary = async (queryParams) => {
  await updateExpiredBatches();
  const {
    page = 1, limit = 10, search, kategori, golongan,
    stockStatus, suhuPenyimpanan, sort,
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
  if (suhuPenyimpanan) productMatch.suhuPenyimpanan = suhuPenyimpanan;

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
          suhuPenyimpanan: '$suhuPenyimpanan',
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
const getStockStats = async () => {
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
const getProductBatches = async (productId, queryParams) => {
  const { page = 1, limit = 20, status, sort } = queryParams;

  const product = await Product.findById(productId).select('name sku category golongan satuan suhuPenyimpanan').lean();
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
const getMutations = async (queryParams) => {
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
const getMutationStats = async () => {
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
const createManualMutation = async (data, userId) => {
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
const createGRMutations = async (goodsReceiving, userId) => {
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
const createDeliveryMutations = async (delivery, userId) => {
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
const revertDeliveryMutations = async (delivery, userId) => {
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
const getOpnameSessions = async (queryParams) => {
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
const getOpnameStats = async () => {
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
const createOpname = async (data, userId) => {
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
const getOpnameById = async (id) => {
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
const updateOpname = async (id, data, userId) => {
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
const finalizeOpname = async (id, notes, userId) => {
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
const getStockCard = async (productId, queryParams) => {
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
const getExpiredItems = async (queryParams) => {
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
const getExpiredStats = async () => {
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
