const inventoryService = require('../services/inventory.service');
const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/ApiResponse');

// ═══════════════════════════════════════════════
// Sub-modul 1: Stok Gudang
// ═══════════════════════════════════════════════

const getStockSummary = catchAsync(async (req, res) => {
  const result = await inventoryService.getStockSummary(req.query);
  ApiResponse.success(res, {
    message: 'Stock summary retrieved successfully',
    data: result.docs,
    meta: { pagination: result.pagination },
  });
});

const getStockStats = catchAsync(async (req, res) => {
  const data = await inventoryService.getStockStats();
  ApiResponse.success(res, { message: 'Stock stats retrieved successfully', data });
});

const getProductBatches = catchAsync(async (req, res) => {
  const result = await inventoryService.getProductBatches(req.params.productId, req.query);
  const { product, ...rest } = result;
  ApiResponse.success(res, {
    message: 'Product batches retrieved successfully',
    data: rest.docs,
    meta: { pagination: rest.pagination, product },
  });
});

// ═══════════════════════════════════════════════
// Sub-modul 2: Mutasi Stok
// ═══════════════════════════════════════════════

const getMutations = catchAsync(async (req, res) => {
  const result = await inventoryService.getMutations(req.query);
  ApiResponse.success(res, {
    message: 'Mutations retrieved successfully',
    data: result.docs,
    meta: { pagination: result.pagination },
  });
});

const getMutationStats = catchAsync(async (req, res) => {
  const data = await inventoryService.getMutationStats();
  ApiResponse.success(res, { message: 'Mutation stats retrieved successfully', data });
});

const createMutation = catchAsync(async (req, res) => {
  const mutation = await inventoryService.createManualMutation(req.body, req.user.id);
  ApiResponse.created(res, { message: 'Stock mutation created successfully', data: mutation });
});

// ═══════════════════════════════════════════════
// Sub-modul 3: Stok Opname
// ═══════════════════════════════════════════════

const getOpnameSessions = catchAsync(async (req, res) => {
  const result = await inventoryService.getOpnameSessions(req.query);
  ApiResponse.success(res, {
    message: 'Opname sessions retrieved successfully',
    data: result.docs,
    meta: { pagination: result.pagination },
  });
});

const getOpnameStats = catchAsync(async (req, res) => {
  const data = await inventoryService.getOpnameStats();
  ApiResponse.success(res, { message: 'Opname stats retrieved successfully', data });
});

const createOpname = catchAsync(async (req, res) => {
  const opname = await inventoryService.createOpname(req.body, req.user.id);
  ApiResponse.created(res, { message: 'Opname session created successfully', data: opname });
});

const getOpnameById = catchAsync(async (req, res) => {
  const opname = await inventoryService.getOpnameById(req.params.id);
  ApiResponse.success(res, { message: 'Opname retrieved successfully', data: opname });
});

const updateOpname = catchAsync(async (req, res) => {
  const opname = await inventoryService.updateOpname(req.params.id, req.body, req.user.id);
  ApiResponse.success(res, { message: 'Opname updated successfully', data: opname });
});

const finalizeOpname = catchAsync(async (req, res) => {
  const opname = await inventoryService.finalizeOpname(req.params.id, req.body.notes, req.user.id);
  ApiResponse.success(res, {
    message: `Opname finalized. ${opname.discrepancyItems} adjustments created.`,
    data: opname,
  });
});

// ═══════════════════════════════════════════════
// Sub-modul 4: Kartu Stok
// ═══════════════════════════════════════════════

const getStockCard = catchAsync(async (req, res) => {
  const result = await inventoryService.getStockCard(req.params.productId, req.query);
  ApiResponse.success(res, { message: 'Stock card retrieved successfully', data: result });
});

// ═══════════════════════════════════════════════
// Sub-modul 5: Expired / ED Monitoring
// ═══════════════════════════════════════════════

const getExpiredItems = catchAsync(async (req, res) => {
  const result = await inventoryService.getExpiredItems(req.query);
  ApiResponse.success(res, {
    message: 'Expired items retrieved successfully',
    data: result.docs,
    meta: { pagination: result.pagination },
  });
});

const getExpiredStats = catchAsync(async (req, res) => {
  const data = await inventoryService.getExpiredStats();
  ApiResponse.success(res, { message: 'Expired stats retrieved successfully', data });
});

module.exports = {
  getStockSummary,
  getStockStats,
  getProductBatches,
  getMutations,
  getMutationStats,
  createMutation,
  getOpnameSessions,
  getOpnameStats,
  createOpname,
  getOpnameById,
  updateOpname,
  finalizeOpname,
  getStockCard,
  getExpiredItems,
  getExpiredStats,
};
