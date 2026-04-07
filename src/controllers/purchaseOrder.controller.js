const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/ApiResponse');
const purchaseOrderService = require('../services/purchaseOrder.service');

const getPurchaseOrders = catchAsync(async (req, res) => {
  const result = await purchaseOrderService.getPurchaseOrders(req.query);
  ApiResponse.success(res, {
    message: 'Purchase orders retrieved successfully',
    data: result.docs,
    meta: { pagination: result.pagination },
  });
});

const getStats = catchAsync(async (req, res) => {
  const stats = await purchaseOrderService.getStats();
  ApiResponse.success(res, { data: stats });
});

const getPurchaseOrderById = catchAsync(async (req, res) => {
  const po = await purchaseOrderService.getPurchaseOrderById(req.params.id);
  ApiResponse.success(res, { data: po });
});

const createPurchaseOrder = catchAsync(async (req, res) => {
  const po = await purchaseOrderService.createPurchaseOrder(req.body, req.user.id);
  ApiResponse.created(res, {
    message: 'Purchase order created successfully',
    data: po,
  });
});

const updatePurchaseOrder = catchAsync(async (req, res) => {
  const po = await purchaseOrderService.updatePurchaseOrder(req.params.id, req.body, req.user.id);
  ApiResponse.success(res, {
    message: 'Purchase order updated successfully',
    data: po,
  });
});

const deletePurchaseOrder = catchAsync(async (req, res) => {
  await purchaseOrderService.deletePurchaseOrder(req.params.id);
  ApiResponse.success(res, { message: 'Purchase order deleted successfully' });
});

const changeStatus = catchAsync(async (req, res) => {
  const po = await purchaseOrderService.changeStatus(req.params.id, req.body.status, req.body.notes, req.user.id);
  ApiResponse.success(res, {
    message: 'Purchase order status updated successfully',
    data: po,
  });
});

const approvePurchaseOrder = catchAsync(async (req, res) => {
  const po = await purchaseOrderService.approvePurchaseOrder(req.params.id, req.body.notes, req.user.id);
  ApiResponse.success(res, {
    message: 'Purchase order approved successfully',
    data: po,
  });
});

const rejectPurchaseOrder = catchAsync(async (req, res) => {
  const po = await purchaseOrderService.rejectPurchaseOrder(req.params.id, req.body.notes, req.user.id);
  ApiResponse.success(res, {
    message: 'Purchase order rejected',
    data: po,
  });
});

module.exports = {
  getPurchaseOrders,
  getStats,
  getPurchaseOrderById,
  createPurchaseOrder,
  updatePurchaseOrder,
  deletePurchaseOrder,
  changeStatus,
  approvePurchaseOrder,
  rejectPurchaseOrder,
};
