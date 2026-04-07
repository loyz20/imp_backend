const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/ApiResponse');
const productService = require('../services/product.service');

const getProducts = catchAsync(async (req, res) => {
  const result = await productService.getProducts(req.query);

  return ApiResponse.success(res, {
    message: 'Products retrieved successfully',
    data: result.docs,
    meta: { pagination: result.pagination },
  });
});

const getProductStats = catchAsync(async (req, res) => {
  const stats = await productService.getProductStats();

  return ApiResponse.success(res, {
    message: 'Product statistics retrieved',
    data: stats,
  });
});

const getProductById = catchAsync(async (req, res) => {
  const product = await productService.getProductById(req.params.id);

  return ApiResponse.success(res, {
    message: 'Product retrieved successfully',
    data: product,
  });
});

const createProduct = catchAsync(async (req, res) => {
  const product = await productService.createProduct(req.body, req.user.id);

  return ApiResponse.created(res, {
    message: 'Product created successfully',
    data: product,
  });
});

const updateProduct = catchAsync(async (req, res) => {
  const product = await productService.updateProduct(req.params.id, req.body, req.user.id);

  return ApiResponse.success(res, {
    message: 'Product updated successfully',
    data: product,
  });
});

const deleteProduct = catchAsync(async (req, res) => {
  await productService.deleteProduct(req.params.id);

  return ApiResponse.success(res, {
    message: 'Product deleted successfully',
  });
});

const changeStatus = catchAsync(async (req, res) => {
  const product = await productService.changeStatus(req.params.id, req.body.isActive, req.user.id);

  return ApiResponse.success(res, {
    message: 'Product status updated successfully',
    data: product,
  });
});

module.exports = {
  getProducts,
  getProductStats,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  changeStatus,
};
