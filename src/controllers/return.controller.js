const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/ApiResponse');
const returnService = require('../services/return.service');

const getReturns = catchAsync(async (req, res) => {
  const result = await returnService.getReturns(req.query);
  ApiResponse.success(res, {
    message: 'Returns retrieved successfully',
    data: result.docs,
    meta: { pagination: result.pagination },
  });
});

const getStats = catchAsync(async (req, res) => {
  const stats = await returnService.getStats();
  ApiResponse.success(res, { data: stats });
});

const getReturnById = catchAsync(async (req, res) => {
  const ret = await returnService.getReturnById(req.params.id);
  ApiResponse.success(res, { data: ret });
});

const getAvailableDeliveries = catchAsync(async (req, res) => {
  const deliveries = await returnService.getAvailableDeliveries(req.query);
  ApiResponse.success(res, { data: deliveries });
});

const createReturn = catchAsync(async (req, res) => {
  const ret = await returnService.createReturn(req.body, req.user.id);
  ApiResponse.created(res, {
    message: 'Return created successfully',
    data: ret,
  });
});

const updateReturn = catchAsync(async (req, res) => {
  const ret = await returnService.updateReturn(req.params.id, req.body, req.user.id);
  ApiResponse.success(res, {
    message: 'Return updated successfully',
    data: ret,
  });
});

const deleteReturn = catchAsync(async (req, res) => {
  await returnService.deleteReturn(req.params.id);
  ApiResponse.success(res, { message: 'Return deleted successfully' });
});

const changeStatus = catchAsync(async (req, res) => {
  const ret = await returnService.changeStatus(req.params.id, req.body.status, req.body.notes, req.user.id);
  ApiResponse.success(res, {
    message: 'Return status updated successfully',
    data: ret,
  });
});

module.exports = {
  getReturns,
  getStats,
  getReturnById,
  getAvailableDeliveries,
  createReturn,
  updateReturn,
  deleteReturn,
  changeStatus,
};
