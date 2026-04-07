const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customer.controller');
const { auth, authorize } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const customerValidation = require('../validations/customer.validation');
const { USER_ROLES } = require('../constants');

const { SUPERADMIN, ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES } = USER_ROLES;

// All customer routes require authentication
router.use(auth);

// ─── Stats ───
router.get(
  '/stats',
  authorize(SUPERADMIN, ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES),
  customerController.getStats,
);

// ─── List & Create ───
router
  .route('/')
  .get(
    authorize(SUPERADMIN, ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES),
    validate(customerValidation.getCustomers),
    customerController.getCustomers,
  )
  .post(
    authorize(SUPERADMIN, ADMIN, SALES),
    validate(customerValidation.createCustomer),
    customerController.createCustomer,
  );

// ─── Single Customer ───
router
  .route('/:id')
  .get(
    authorize(SUPERADMIN, ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES),
    validate(customerValidation.customerIdParam),
    customerController.getCustomerById,
  )
  .put(
    authorize(SUPERADMIN, ADMIN, SALES),
    validate(customerValidation.updateCustomer),
    customerController.updateCustomer,
  )
  .delete(
    authorize(SUPERADMIN, ADMIN),
    validate(customerValidation.customerIdParam),
    customerController.deleteCustomer,
  );

// ─── Status ───
router.patch(
  '/:id/status',
  authorize(SUPERADMIN, ADMIN, SALES),
  validate(customerValidation.changeStatus),
  customerController.changeStatus,
);

module.exports = router;
