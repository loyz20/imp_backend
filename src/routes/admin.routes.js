const express = require('express');
const router = express.Router();
const { clearData } = require('../controllers/admin.controller');
const { auth, authorize } = require('../middlewares/auth');
const { SUPERADMIN } = require('../constants').USER_ROLES;

// Only superadmin can clear all data
router.post('/clear-data', auth, authorize(SUPERADMIN), clearData);

module.exports = router;
