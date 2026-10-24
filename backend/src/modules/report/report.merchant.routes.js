const express = require('express');
const { query } = require('express-validator');

const { authenticate } = require('../../middlewares/auth.middleware');
const { authorizeRoles } = require('../../middlewares/role.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const { loadMyRestaurant } = require('../../middlewares/restaurant.middleware');
const { merchantSummary, merchantRevenue, merchantTopItems } = require('./report.controller');
const { rangeRules } = require('./report.rules');

// Mount tại /api/merchant/reports — số liệu của quán mình (API-9)
const router = express.Router();
router.use(authenticate, authorizeRoles('RESTAURANT_OWNER'), loadMyRestaurant);

router.get('/summary', rangeRules, validate, merchantSummary);
router.get(
    '/revenue',
    [...rangeRules, query('groupBy').optional().isIn(['day', 'week', 'month']).withMessage('groupBy must be day, week or month')],
    validate,
    merchantRevenue
);
router.get(
    '/top-items',
    [...rangeRules, query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('limit must be 1-50')],
    validate,
    merchantTopItems
);

module.exports = router;
