const express = require('express');
const router = express.Router();
const supplierController = require('../controllers/supplier.controller');
const { auth, authorize } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const supplierValidation = require('../validations/supplier.validation');
const { USER_ROLES } = require('../constants');

const { SUPERADMIN, ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES } = USER_ROLES;

// All supplier routes require authentication
router.use(auth);

// ─── Stats ───
router.get(
  '/stats',
  authorize(SUPERADMIN, ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES),
  supplierController.getStats,
);

// ─── List & Create ───
router
  .route('/')
  .get(
    authorize(SUPERADMIN, ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES),
    validate(supplierValidation.getSuppliers),
    supplierController.getSuppliers,
  )
  .post(
    authorize(SUPERADMIN, ADMIN, APOTEKER),
    validate(supplierValidation.createSupplier),
    supplierController.createSupplier,
  );

// ─── Single Supplier ───
router
  .route('/:id')
  .get(
    authorize(SUPERADMIN, ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES),
    validate(supplierValidation.supplierIdParam),
    supplierController.getSupplierById,
  )
  .put(
    authorize(SUPERADMIN, ADMIN, APOTEKER),
    validate(supplierValidation.updateSupplier),
    supplierController.updateSupplier,
  )
  .delete(
    authorize(SUPERADMIN, ADMIN),
    validate(supplierValidation.supplierIdParam),
    supplierController.deleteSupplier,
  );

// ─── Status ───
router.patch(
  '/:id/status',
  authorize(SUPERADMIN, ADMIN, APOTEKER),
  validate(supplierValidation.changeStatus),
  supplierController.changeStatus,
);

module.exports = router;
