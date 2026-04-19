const express = require('express');
const router = express.Router();
const grController = require('../controllers/goodsReceiving.controller');
const { auth, authorize } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const grValidation = require('../validations/goodsReceiving.validation');
const { USER_ROLES } = require('../constants');

const { ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES } = USER_ROLES;

// All routes require authentication
router.use(auth);

/**
 * @swagger
 * /api/v1/goods-receivings/stats:
 *   get:
 *     summary: Get goods receiving statistics
 *     description: Retrieve statistical data about goods receivings including counts by status and time periods
 *     tags: [Goods Receiving]
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
 *                       description: Total number of goods receivings
 *                     draft:
 *                       type: number
 *                       description: Number of draft goods receivings
 *                     checked:
 *                       type: number
 *                       description: Number of checked goods receivings
 *                     verified:
 *                       type: number
 *                       description: Number of verified goods receivings
 *                     completed:
 *                       type: number
 *                       description: Number of completed goods receivings
 *                     thisMonth:
 *                       type: number
 *                       description: Number of goods receivings created this month
 *                     thisWeek:
 *                       type: number
 *                       description: Number of goods receivings created this week
 *                     itemsReceivedThisMonth:
 *                       type: number
 *                       description: Total items received this month
 *                     discrepancyCount:
 *                       type: number
 *                       description: Number of goods receivings with quantity discrepancies
 *                     damagedItems:
 *                       type: number
 *                       description: Number of damaged items received
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 */
router.get(
  '/stats',
  authorize(ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES),
  grController.getStats,
);

/**
 * @swagger
 * /api/v1/goods-receivings/available-pos:
 *   get:
 *     summary: Get available purchase orders for receiving
 *     description: Retrieve list of purchase orders that can be used for goods receiving
 *     tags: [Goods Receiving]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by PO number or supplier name
 *       - in: query
 *         name: supplierId
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: Filter by supplier ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Available POs retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/PurchaseOrder'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 */
router.get(
  '/available-pos',
  authorize(ADMIN, APOTEKER, GUDANG),
  validate(grValidation.getAvailablePOs),
  grController.getAvailablePOs,
);

/**
 * @swagger
 * /api/v1/goods-receivings:
 *   get:
 *     summary: Get list of goods receivings
 *     description: Retrieve paginated list of goods receivings with filtering and search capabilities
 *     tags: [Goods Receiving]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *           maximum: 100
 *         description: Number of items per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by invoice number or delivery note
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [draft, checked, verified, completed]
 *         description: Filter by status (comma-separated for multiple)
 *       - in: query
 *         name: supplierId
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: Filter by supplier ID
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by receiving date from (YYYY-MM-DD)
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by receiving date to (YYYY-MM-DD)
 *       - in: query
 *         name: sort
 *         schema:
 *           type: string
 *           default: "-createdAt"
 *         description: Sort field (prefix with - for descending)
 *     responses:
 *       200:
 *         description: Goods receivings retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/GoodsReceiving'
 *                 meta:
 *                   type: object
 *                   properties:
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *   post:
 *     summary: Create new goods receiving
 *     description: Create a new goods receiving record with manual invoice number input
 *     tags: [Goods Receiving]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateGoodsReceiving'
 *     responses:
 *       201:
 *         description: Goods receiving created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Goods receiving created successfully
 *                 data:
 *                   $ref: '#/components/schemas/GoodsReceiving'
 *       400:
 *         description: Bad request - validation errors
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 */
router
  .route('/')
  .get(
    authorize(ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES),
    validate(grValidation.getGoodsReceivings),
    grController.getGoodsReceivings,
  )
  .post(
    authorize(ADMIN, GUDANG),
    validate(grValidation.createGoodsReceiving),
    grController.createGoodsReceiving,
  );

/**
 * @swagger
 * /api/v1/goods-receivings/{id}:
 *   get:
 *     summary: Get goods receiving by ID
 *     description: Retrieve detailed information about a specific goods receiving
 *     tags: [Goods Receiving]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: Goods receiving ID
 *     responses:
 *       200:
 *         description: Goods receiving retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/GoodsReceiving'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Goods receiving not found
 *   put:
 *     summary: Update goods receiving
 *     description: Update an existing goods receiving record
 *     tags: [Goods Receiving]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: Goods receiving ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateGoodsReceiving'
 *     responses:
 *       200:
 *         description: Goods receiving updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Goods receiving updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/GoodsReceiving'
 *       400:
 *         description: Bad request - validation errors
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Goods receiving not found
 *   delete:
 *     summary: Delete goods receiving
 *     description: Delete a goods receiving record (only draft or cancelled status)
 *     tags: [Goods Receiving]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: Goods receiving ID
 *     responses:
 *       200:
 *         description: Goods receiving deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Goods receiving deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Goods receiving not found
 *       400:
 *         description: Bad request - Cannot delete goods receiving with current status
 */
router
  .route('/:id')
  .get(
    authorize(ADMIN, APOTEKER, GUDANG, KEUANGAN, SALES),
    validate(grValidation.grIdParam),
    grController.getGoodsReceivingById,
  )
  .put(
    authorize(ADMIN, GUDANG),
    validate(grValidation.updateGoodsReceiving),
    grController.updateGoodsReceiving,
  )
  .delete(
    authorize(ADMIN, GUDANG),
    validate(grValidation.grIdParam),
    grController.deleteGoodsReceiving,
  );

/**
 * @swagger
 * /api/v1/goods-receivings/{id}/verify:
 *   patch:
 *     summary: Verify goods receiving
 *     description: Verify a goods receiving record, changing status from 'checked' to 'verified'
 *     tags: [Goods Receiving]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: ObjectId
 *         description: Goods receiving ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *                 maxLength: 1000
 *                 description: Verification notes
 *     responses:
 *       200:
 *         description: Goods receiving verified successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Goods receiving verified successfully
 *                 data:
 *                   $ref: '#/components/schemas/GoodsReceiving'
 *       400:
 *         description: Bad request - validation errors
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Insufficient permissions
 *       404:
 *         description: Goods receiving not found
 */
router.patch(
  '/:id/verify',
  authorize(ADMIN, APOTEKER),
  validate(grValidation.verify),
  grController.verifyGoodsReceiving,
);

module.exports = router;
