const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/ApiResponse');
const goodsReceivingService = require('../services/goodsReceiving.service');

const getGoodsReceivings = catchAsync(async (req, res) => {
  const result = await goodsReceivingService.getGoodsReceivings(req.query);
  ApiResponse.success(res, {
    message: 'Goods receivings retrieved successfully',
    data: result.docs,
    meta: { pagination: result.pagination },
  });
});

const getStats = catchAsync(async (req, res) => {
  const stats = await goodsReceivingService.getStats();
  ApiResponse.success(res, { data: stats });
});

const getGoodsReceivingById = catchAsync(async (req, res) => {
  const gr = await goodsReceivingService.getGoodsReceivingById(req.params.id);
  ApiResponse.success(res, { data: gr });
});

const createGoodsReceiving = catchAsync(async (req, res) => {
  const gr = await goodsReceivingService.createGoodsReceiving(req.body, req.user.id);
  ApiResponse.created(res, {
    message: 'Goods receiving created successfully',
    data: gr,
  });
});

const updateGoodsReceiving = catchAsync(async (req, res) => {
  const gr = await goodsReceivingService.updateGoodsReceiving(req.params.id, req.body, req.user.id);
  ApiResponse.success(res, {
    message: 'Goods receiving updated successfully',
    data: gr,
  });
});

const deleteGoodsReceiving = catchAsync(async (req, res) => {
  await goodsReceivingService.deleteGoodsReceiving(req.params.id);
  ApiResponse.success(res, { message: 'Goods receiving deleted successfully' });
});

const verifyGoodsReceiving = catchAsync(async (req, res) => {
  const gr = await goodsReceivingService.verifyGoodsReceiving(req.params.id, req.body.notes, req.user.id);
  ApiResponse.success(res, {
    message: 'Goods receiving verified successfully',
    data: gr,
  });
});

const getAvailablePOs = catchAsync(async (req, res) => {
  const result = await goodsReceivingService.getAvailablePOs(req.query);
  ApiResponse.success(res, {
    data: result.docs,
    meta: { pagination: result.pagination },
  });
});

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
