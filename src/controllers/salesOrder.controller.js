const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/ApiResponse');
const salesOrderService = require('../services/salesOrder.service');

const getSalesOrders = catchAsync(async (req, res) => {
  const result = await salesOrderService.getSalesOrders(req.query);
  ApiResponse.success(res, {
    message: 'Sales orders retrieved successfully',
    data: result.docs,
    meta: { pagination: result.pagination },
  });
});

const getStats = catchAsync(async (req, res) => {
  const stats = await salesOrderService.getStats();
  ApiResponse.success(res, { data: stats });
});

const getSalesOrderById = catchAsync(async (req, res) => {
  const so = await salesOrderService.getSalesOrderById(req.params.id);
  ApiResponse.success(res, { data: so });
});

const createSalesOrder = catchAsync(async (req, res) => {
  const so = await salesOrderService.createSalesOrder(req.body, req.user.id);
  ApiResponse.created(res, {
    message: 'Sales order created successfully',
    data: so,
  });
});

const updateSalesOrder = catchAsync(async (req, res) => {
  const so = await salesOrderService.updateSalesOrder(req.params.id, req.body, req.user.id);
  ApiResponse.success(res, {
    message: 'Sales order updated successfully',
    data: so,
  });
});

const deleteSalesOrder = catchAsync(async (req, res) => {
  await salesOrderService.deleteSalesOrder(req.params.id);
  ApiResponse.success(res, { message: 'Sales order deleted successfully' });
});

const changeStatus = catchAsync(async (req, res) => {
  const so = await salesOrderService.changeStatus(req.params.id, req.body.status, req.body.notes, req.user.id);
  ApiResponse.success(res, {
    message: 'Sales order status updated successfully',
    data: so,
  });
});

module.exports = {
  getSalesOrders,
  getStats,
  getSalesOrderById,
  createSalesOrder,
  updateSalesOrder,
  deleteSalesOrder,
  changeStatus,
};
