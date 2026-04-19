const express = require('express');
const router = express.Router();
const { clearData } = require('../controllers/admin.controller');
const { auth, authorize } = require('../middlewares/auth');
const { ADMIN } = require('../constants').USER_ROLES;

// Only admin can clear all data
router.post('/clear-data', auth, authorize(ADMIN), clearData);

module.exports = router;
