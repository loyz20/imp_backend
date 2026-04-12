const express = require('express');
const router = express.Router();
const poController = require('../controllers/purchaseOrder.controller');
const { auth, authorize } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const poValidation = require('../validations/purchaseOrder.validation');
const { USER_ROLES } = require('../constants');

const { SUPERADMIN, ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES } = USER_ROLES;

// All routes require authentication
router.use(auth);

// ─── Stats ───
router.get(
  '/stats',
  authorize(SUPERADMIN, ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES),
  poController.getStats,
);

// ─── List & Create ───
router
  .route('/')
  .get(
    authorize(SUPERADMIN, ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES),
    validate(poValidation.getPurchaseOrders),
    poController.getPurchaseOrders,
  )
  .post(
    authorize(SUPERADMIN, ADMIN, APOTEKER),
    validate(poValidation.createPurchaseOrder),
    poController.createPurchaseOrder,
  );

// ─── Single PO ───
router
  .route('/:id')
  .get(
    authorize(SUPERADMIN, ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES),
    validate(poValidation.poIdParam),
    poController.getPurchaseOrderById,
  )
  .put(
    authorize(SUPERADMIN, ADMIN, APOTEKER),
    validate(poValidation.updatePurchaseOrder),
    poController.updatePurchaseOrder,
  )
  .delete(
    authorize(SUPERADMIN, ADMIN),
    validate(poValidation.poIdParam),
    poController.deletePurchaseOrder,
  );

// ─── Status Change ───
router.patch(
  '/:id/status',
  authorize(SUPERADMIN, ADMIN, APOTEKER),
  validate(poValidation.changeStatus),
  poController.changeStatus,
);

module.exports = router;
