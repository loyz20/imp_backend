const express = require('express');
const router = express.Router();
const soController = require('../controllers/salesOrder.controller');
const { auth, authorize } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const soValidation = require('../validations/salesOrder.validation');
const { USER_ROLES } = require('../constants');

const { SUPERADMIN, ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES } = USER_ROLES;

// All routes require authentication
router.use(auth);

/**
 * @swagger
 * /api/v1/sales-orders/stats:
 *   get:
 *     summary: Get sales order statistics
 *     description: Retrieve statistical data about sales orders including counts by status and time periods
 *     tags: [Sales Order]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: number
 *                       description: Total number of sales orders
 *                     draft:
 *                       type: number
 *                       description: Number of draft sales orders
 *                     packed:
 *                       type: number
 *                       description: Number of packed sales orders
 *                     delivered:
 *                       type: number
 *                       description: Number of delivered sales orders
 *                     partial_delivered:
 *                       type: number
 *                       description: Number of partially delivered sales orders
 *                     returned:
 *                       type: number
 *                       description: Number of returned sales orders
 *                     completed:
 *                       type: number
 *                       description: Number of completed sales orders
 *                     thisMonth:
 *                       type: number
 *                       description: Number of sales orders created this month
 *                     thisWeek:
 *                       type: number
 *                       description: Number of sales orders created this week
 *                     totalRevenue:
 *                       type: number
 *                       description: Total revenue from all sales orders
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 */
router.get(
  '/stats',
  authorize(SUPERADMIN, ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES),
  soController.getStats,
);

// ─── List & Create ───
router
  .route('/')
  .get(
    authorize(SUPERADMIN, ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES),
    validate(soValidation.getSalesOrders),
    soController.getSalesOrders,
  )
  .post(
    authorize(SUPERADMIN, ADMIN, SALES),
    validate(soValidation.createSalesOrder),
    soController.createSalesOrder,
  );

// ─── Single SO ───
router
  .route('/:id')
  .get(
    authorize(SUPERADMIN, ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES),
    validate(soValidation.soIdParam),
    soController.getSalesOrderById,
  )
  .put(
    authorize(SUPERADMIN, ADMIN, SALES),
    validate(soValidation.updateSalesOrder),
    soController.updateSalesOrder,
  )
  .delete(
    authorize(SUPERADMIN, ADMIN),
    validate(soValidation.soIdParam),
    soController.deleteSalesOrder,
  );

// ─── Change Status ───
router.patch(
  '/:id/status',
  authorize(SUPERADMIN, ADMIN, SALES),
  validate(soValidation.changeStatus),
  soController.changeStatus,
);

module.exports = router;
