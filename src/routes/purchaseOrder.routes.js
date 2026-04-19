const express = require('express');
const router = express.Router();
const poController = require('../controllers/purchaseOrder.controller');
const { auth, authorize } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const poValidation = require('../validations/purchaseOrder.validation');
const { USER_ROLES } = require('../constants');

const { ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES } = USER_ROLES;

// All routes require authentication
router.use(auth);

// ─── Stats ───
router.get(
  '/stats',
  authorize(ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES),
  poController.getStats,
);

// ─── List & Create ───
router
  .route('/')
  .get(
    authorize(ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES),
    validate(poValidation.getPurchaseOrders),
    poController.getPurchaseOrders,
  )
  .post(
    authorize(ADMIN, APOTEKER),
    validate(poValidation.createPurchaseOrder),
    poController.createPurchaseOrder,
  );

// ─── Single PO ───
router
  .route('/:id')
  .get(
    authorize(ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES),
    validate(poValidation.poIdParam),
    poController.getPurchaseOrderById,
  )
  .put(
    authorize(ADMIN, APOTEKER),
    validate(poValidation.updatePurchaseOrder),
    poController.updatePurchaseOrder,
  )
  .delete(
    authorize(ADMIN),
    validate(poValidation.poIdParam),
    poController.deletePurchaseOrder,
  );

// ─── Status Change ───
router.patch(
  '/:id/status',
  authorize(ADMIN, APOTEKER),
  validate(poValidation.changeStatus),
  poController.changeStatus,
);

module.exports = router;
