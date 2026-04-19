const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customer.controller');
const { auth, authorize } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const customerValidation = require('../validations/customer.validation');
const { USER_ROLES } = require('../constants');

const { ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES } = USER_ROLES;

// All customer routes require authentication
router.use(auth);

// ─── Stats ───
router.get(
  '/stats',
  authorize(ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES),
  customerController.getStats,
);

// ─── List & Create ───
router
  .route('/')
  .get(
    authorize(ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES),
    validate(customerValidation.getCustomers),
    customerController.getCustomers,
  )
  .post(
    authorize(ADMIN, SALES),
    validate(customerValidation.createCustomer),
    customerController.createCustomer,
  );

// ─── Single Customer ───
router
  .route('/:id')
  .get(
    authorize(ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES),
    validate(customerValidation.customerIdParam),
    customerController.getCustomerById,
  )
  .put(
    authorize(ADMIN, SALES),
    validate(customerValidation.updateCustomer),
    customerController.updateCustomer,
  )
  .delete(
    authorize(ADMIN),
    validate(customerValidation.customerIdParam),
    customerController.deleteCustomer,
  );

// ─── Status ───
router.patch(
  '/:id/status',
  authorize(ADMIN, SALES),
  validate(customerValidation.changeStatus),
  customerController.changeStatus,
);

module.exports = router;
