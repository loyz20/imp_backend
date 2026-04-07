const express = require('express');
const router = express.Router();
const returnController = require('../controllers/return.controller');
const { auth, authorize } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const returnValidation = require('../validations/return.validation');
const { USER_ROLES } = require('../constants');

const { SUPERADMIN, ADMIN, APOTEKER, GUDANG, SALES, KEUANGAN } = USER_ROLES;

// All routes require authentication
router.use(auth);

// ─── Stats ───
router.get(
  '/stats',
  authorize(SUPERADMIN, ADMIN, APOTEKER, GUDANG, SALES, KEUANGAN),
  returnController.getStats,
);


// ─── List & Create ───
router
  .route('/')
  .get(
    authorize(SUPERADMIN, ADMIN, APOTEKER, GUDANG, SALES, KEUANGAN),
    validate(returnValidation.getReturns),
    returnController.getReturns,
  )
  .post(
    authorize(SUPERADMIN, ADMIN, GUDANG, SALES),
    validate(returnValidation.createReturn),
    returnController.createReturn,
  );

// ─── Single Return ───
router
  .route('/:id')
  .get(
    authorize(SUPERADMIN, ADMIN, APOTEKER, GUDANG, SALES, KEUANGAN),
    validate(returnValidation.returnIdParam),
    returnController.getReturnById,
  )
  .put(
    authorize(SUPERADMIN, ADMIN, GUDANG, SALES),
    validate(returnValidation.updateReturn),
    returnController.updateReturn,
  )
  .delete(
    authorize(SUPERADMIN, ADMIN),
    validate(returnValidation.returnIdParam),
    returnController.deleteReturn,
  );

// ─── Change Status ───
router.patch(
  '/:id/status',
  authorize(SUPERADMIN, ADMIN, APOTEKER, GUDANG, SALES),
  validate(returnValidation.changeStatus),
  returnController.changeStatus,
);

module.exports = router;
