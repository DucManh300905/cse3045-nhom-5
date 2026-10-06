const express = require('express');
const { body, param, query } = require('express-validator');

const { authenticate } = require('../../middlewares/auth.middleware');
const { authorizeRoles } = require('../../middlewares/role.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const { paginationRules } = require('../../utils/pagination');
const { RESTAURANT_STATUSES, DOCUMENT_TYPES } = require('../restaurant/restaurant.model');
const {
    listRestaurants,
    getRestaurant,
    getDocument,
    approveRestaurant,
    rejectRestaurant,
    blockRestaurant,
    unblockRestaurant,
    updateCommission
} = require('./admin.restaurant.controller');
const { listAuditLogs } = require('./admin.auditLog.controller');

// Mount tại /api/admin — chỉ ADMIN
const router = express.Router();
router.use(authenticate, authorizeRoles('ADMIN'));

const idRule = param('id').isMongoId().withMessage('Restaurant not found');

const reasonRule = (required) => {
    const rule = body('reason')
        .isString()
        .withMessage('reason must be a string')
        .trim()
        .isLength({ min: 1, max: 500 })
        .withMessage('reason is required (max 500 characters)');

    return required ? rule : rule.optional();
};

// ---- Quán ----

router.get(
    '/restaurants',
    [
        query('status')
            .optional()
            .isIn([...RESTAURANT_STATUSES, 'ALL'])
            .withMessage(`status must be one of ${[...RESTAURANT_STATUSES, 'ALL'].join(', ')}`),
        query('q').optional().isString().trim().isLength({ max: 100 }),
        ...paginationRules
    ],
    validate,
    listRestaurants
);

router.get('/restaurants/:id', [idRule], validate, getRestaurant);

router.get(
    '/restaurants/:id/documents/:type',
    [idRule, param('type').isIn(DOCUMENT_TYPES).withMessage('Document not found')],
    validate,
    getDocument
);

router.post('/restaurants/:id/approve', [idRule], validate, approveRestaurant);
router.post('/restaurants/:id/reject', [idRule, reasonRule(true)], validate, rejectRestaurant);
router.post('/restaurants/:id/block', [idRule, reasonRule(false)], validate, blockRestaurant);
router.post('/restaurants/:id/unblock', [idRule, reasonRule(false)], validate, unblockRestaurant);

router.patch(
    '/restaurants/:id/commission',
    [
        idRule,
        body('commissionRate')
            .isFloat({ min: 0, max: 1 })
            .withMessage('commissionRate must be between 0 and 1 (e.g. 0.1 = 10%)')
            .toFloat()
    ],
    validate,
    updateCommission
);

// ---- Audit log ----

router.get(
    '/audit-logs',
    [
        query('action').optional().isString().trim(),
        query('targetId').optional().isMongoId().withMessage('targetId is not valid'),
        ...paginationRules
    ],
    validate,
    listAuditLogs
);

module.exports = router;
