const catchAsync = require('../utils/catchAsync');
const ApiResponse = require('../utils/ApiResponse');
const customerService = require('../services/customer.service');

const getCustomers = catchAsync(async (req, res) => {
  const result = await customerService.getCustomers(req.query);
  ApiResponse.success(res, {
    message: 'Customers retrieved successfully',
    data: result.docs,
    meta: { pagination: result.pagination },
  });
});

const getStats = catchAsync(async (req, res) => {
  const stats = await customerService.getStats();
  ApiResponse.success(res, {
    data: stats,
  });
});

const getCustomerById = catchAsync(async (req, res) => {
  const customer = await customerService.getCustomerById(req.params.id);
  ApiResponse.success(res, {
    data: customer,
  });
});

const createCustomer = catchAsync(async (req, res) => {
  const customer = await customerService.createCustomer(req.body, req.user.id);
  ApiResponse.created(res, {
    message: 'Customer created successfully',
    data: customer,
  });
});

const updateCustomer = catchAsync(async (req, res) => {
  const customer = await customerService.updateCustomer(req.params.id, req.body, req.user.id);
  ApiResponse.success(res, {
    message: 'Customer updated successfully',
    data: customer,
  });
});

const deleteCustomer = catchAsync(async (req, res) => {
  await customerService.deleteCustomer(req.params.id);
  ApiResponse.success(res, {
    message: 'Customer deleted successfully',
  });
});

const changeStatus = catchAsync(async (req, res) => {
  const customer = await customerService.changeStatus(req.params.id, req.body.isActive, req.user.id);
  ApiResponse.success(res, {
    message: 'Customer status updated successfully',
    data: customer,
  });
});

module.exports = {
  getCustomers,
  getStats,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  changeStatus,
};
