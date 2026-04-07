const express = require('express');
const router = express.Router();
const productController = require('../controllers/product.controller');
const { auth, authorize } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const productValidation = require('../validations/product.validation');
const { USER_ROLES } = require('../constants');

const { SUPERADMIN, ADMIN, APOTEKER, GUDANG } = USER_ROLES;

// All product routes require authentication
router.use(auth);

// ─── Stats ───
router.get(
  '/stats',
  authorize(SUPERADMIN, ADMIN, APOTEKER, GUDANG),
  productController.getProductStats,
);

// ─── List & Create ───
router
  .route('/')
  .get(
    authorize(SUPERADMIN, ADMIN, APOTEKER, GUDANG),
    validate(productValidation.getProducts),
    productController.getProducts,
  )
  .post(
    authorize(SUPERADMIN, ADMIN, APOTEKER),
    validate(productValidation.createProduct),
    productController.createProduct,
  );

// ─── Single Product ───
router
  .route('/:id')
  .get(
    authorize(SUPERADMIN, ADMIN, APOTEKER, GUDANG),
    validate(productValidation.productIdParam),
    productController.getProductById,
  )
  .put(
    authorize(SUPERADMIN, ADMIN, APOTEKER),
    validate(productValidation.updateProduct),
    productController.updateProduct,
  )
  .delete(
    authorize(SUPERADMIN, ADMIN),
    validate(productValidation.productIdParam),
    productController.deleteProduct,
  );

// ─── Status ───
router.patch(
  '/:id/status',
  authorize(SUPERADMIN, ADMIN, APOTEKER),
  validate(productValidation.changeStatus),
  productController.changeStatus,
);

module.exports = router;
