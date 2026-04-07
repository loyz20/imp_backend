const express = require('express');
const router = express.Router();

const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const appSettingRoutes = require('./appSetting.routes');
const productRoutes = require('./product.routes');
const supplierRoutes = require('./supplier.routes');
const purchaseOrderRoutes = require('./purchaseOrder.routes');
const goodsReceivingRoutes = require('./goodsReceiving.routes');
const inventoryRoutes = require('./inventory.routes');
const customerRoutes = require('./customer.routes');
const salesOrderRoutes = require('./salesOrder.routes');
const returnRoutes = require('./return.routes');
const financeRoutes = require('./finance.routes');
const reportRoutes = require('./report.routes');
const regulationRoutes = require('./regulation.routes');

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/settings', appSettingRoutes);
router.use('/products', productRoutes);
router.use('/suppliers', supplierRoutes);
router.use('/purchase-orders', purchaseOrderRoutes);
router.use('/goods-receivings', goodsReceivingRoutes);
router.use('/inventory', inventoryRoutes);
router.use('/customers', customerRoutes);
router.use('/sales-orders', salesOrderRoutes);
router.use('/returns', returnRoutes);
router.use('/finance', financeRoutes);
router.use('/reports', reportRoutes);
router.use('/regulation', regulationRoutes);

module.exports = router;
