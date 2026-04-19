const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventory.controller');
const { auth, authorize } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const invValidation = require('../validations/inventory.validation');
const { USER_ROLES } = require('../constants');

const { ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES } = USER_ROLES;
const allRoles = [ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES];

// All routes require authentication
router.use(auth);

// ═══════════════════════════════════════════════
// Sub-modul 1: Stok Gudang
// ═══════════════════════════════════════════════

router.get(
  '/stock/stats',
  authorize(...allRoles),
  inventoryController.getStockStats,
);

router.get(
  '/stock/:productId/batches',
  authorize(...allRoles),
  validate(invValidation.getProductBatches),
  inventoryController.getProductBatches,
);

router.get(
  '/stock',
  authorize(...allRoles),
  validate(invValidation.getStock),
  inventoryController.getStockSummary,
);

// ═══════════════════════════════════════════════
// Sub-modul 2: Mutasi Stok
// ═══════════════════════════════════════════════

router.get(
  '/mutations/stats',
  authorize(...allRoles),
  inventoryController.getMutationStats,
);

router.get(
  '/mutations',
  authorize(...allRoles),
  validate(invValidation.getMutations),
  inventoryController.getMutations,
);

router.post(
  '/mutations',
  authorize(ADMIN, GUDANG),
  validate(invValidation.createMutation),
  inventoryController.createMutation,
);

// ═══════════════════════════════════════════════
// Sub-modul 3: Stok Opname
// ═══════════════════════════════════════════════

router.get(
  '/opname/stats',
  authorize(...allRoles),
  inventoryController.getOpnameStats,
);

router.get(
  '/opname',
  authorize(...allRoles),
  validate(invValidation.getOpname),
  inventoryController.getOpnameSessions,
);

router.post(
  '/opname',
  authorize(ADMIN, GUDANG),
  validate(invValidation.createOpname),
  inventoryController.createOpname,
);

router.get(
  '/opname/:id',
  authorize(...allRoles),
  validate(invValidation.idParam),
  inventoryController.getOpnameById,
);

router.put(
  '/opname/:id',
  authorize(ADMIN, GUDANG),
  validate(invValidation.updateOpname),
  inventoryController.updateOpname,
);

router.patch(
  '/opname/:id/finalize',
  authorize(ADMIN),
  validate(invValidation.finalizeOpname),
  inventoryController.finalizeOpname,
);

// ═══════════════════════════════════════════════
// Sub-modul 4: Kartu Stok
// ═══════════════════════════════════════════════

router.get(
  '/stock-card/:productId',
  authorize(...allRoles),
  validate(invValidation.getStockCard),
  inventoryController.getStockCard,
);

// ═══════════════════════════════════════════════
// Sub-modul 5: Expired / ED Monitoring
// ═══════════════════════════════════════════════

router.get(
  '/expired/stats',
  authorize(...allRoles),
  inventoryController.getExpiredStats,
);

router.get(
  '/expired',
  authorize(...allRoles),
  validate(invValidation.getExpired),
  inventoryController.getExpiredItems,
);

module.exports = router;
