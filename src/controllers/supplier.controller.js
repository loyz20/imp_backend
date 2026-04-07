const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/ApiResponse');
const supplierService = require('../services/supplier.service');

const getSuppliers = catchAsync(async (req, res) => {
  const result = await supplierService.getSuppliers(req.query);
  ApiResponse.success(res, {
    message: 'Suppliers retrieved successfully',
    data: result.docs,
    meta: { pagination: result.pagination },
  });
});

const getStats = catchAsync(async (req, res) => {
  const stats = await supplierService.getStats();
  ApiResponse.success(res, {
    data: stats,
  });
});

const getSupplierById = catchAsync(async (req, res) => {
  const supplier = await supplierService.getSupplierById(req.params.id);
  ApiResponse.success(res, {
    data: supplier,
  });
});

const createSupplier = catchAsync(async (req, res) => {
  const supplier = await supplierService.createSupplier(req.body, req.user.id);
  ApiResponse.created(res, {
    message: 'Supplier created successfully',
    data: supplier,
  });
});

const updateSupplier = catchAsync(async (req, res) => {
  const supplier = await supplierService.updateSupplier(req.params.id, req.body, req.user.id);
  ApiResponse.success(res, {
    message: 'Supplier updated successfully',
    data: supplier,
  });
});

const deleteSupplier = catchAsync(async (req, res) => {
  await supplierService.deleteSupplier(req.params.id);
  ApiResponse.success(res, {
    message: 'Supplier deleted successfully',
  });
});

const changeStatus = catchAsync(async (req, res) => {
  const supplier = await supplierService.changeStatus(req.params.id, req.body.isActive, req.user.id);
  ApiResponse.success(res, {
    message: 'Supplier status updated successfully',
    data: supplier,
  });
});

module.exports = {
  getSuppliers,
  getStats,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
  changeStatus,
};
