const express = require('express');
const router = express.Router();
const { auth, authorize } = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const c = require('../controllers/appSetting.controller');
const v = require('../validations/appSetting.validation');
const { USER_ROLES } = require('../constants');

// All routes require auth + admin
router.use(auth, authorize(USER_ROLES.ADMIN));

// ── Read ──
router.get('/', c.getSettings);
router.get('/license-warnings', c.getLicenseWarnings);
router.get('/:section', validate(v.getSection), c.getSection);

// ── Initialize ──
router.post('/initialize', c.initializeSettings);

// ── Bulk Update ──
router.put('/', c.updateAll);

// ── Section Updates ──
router.put('/company', validate(v.updateCompany), c.updateCompany);
router.put('/licenses', validate(v.updateLicenses), c.updateLicenses);
router.put('/pharmacist', validate(v.updatePharmacist), c.updatePharmacist);
router.put('/pharmacist-obat', validate(v.updatePharmacistObat), c.updatePharmacistObat);
router.put('/pharmacist-alkes', validate(v.updatePharmacistAlkes), c.updatePharmacistAlkes);
router.put('/tax', validate(v.updateTax), c.updateTax);
router.put('/invoice', validate(v.updateInvoice), c.updateInvoice);
router.put('/purchase-order', validate(v.updatePurchaseOrder), c.updatePurchaseOrder);
router.put('/delivery-order', validate(v.updateDeliveryOrder), c.updateDeliveryOrder);
router.put('/return-order', validate(v.updateReturnOrder), c.updateReturnOrder);
router.put('/inventory', validate(v.updateInventory), c.updateInventory);
router.put('/cdob', validate(v.updateCdob), c.updateCdob);
router.put('/medication', validate(v.updateMedication), c.updateMedication);
router.put('/customer', validate(v.updateCustomer), c.updateCustomer);
router.put('/payment', validate(v.updatePayment), c.updatePayment);
router.put('/notification', validate(v.updateNotification), c.updateNotification);
router.put('/reporting', validate(v.updateReporting), c.updateReporting);
router.put('/general', validate(v.updateGeneral), c.updateGeneral);

// ── Document Number ──
router.post('/doc-number/:type', validate(v.generateDocNumber), c.generateDocNumber);
router.put('/doc-number/:type/reset', authorize(USER_ROLES.ADMIN), validate(v.resetDocNumber), c.resetDocNumber);

// ── SMTP Test ──
router.post('/test-smtp', validate(v.testSmtp), c.testSmtp);

module.exports = router;
