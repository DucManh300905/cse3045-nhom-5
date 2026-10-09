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
const { listUsers, blockUser, unblockUser, listOrders, getOrder } = require('./admin.user.controller');
const { adminSummary } = require('../report/report.controller');
const { rangeRules } = require('../report/report.rules');
const { ORDER_STATUSES } = require('../order/order.model');
const { listAdminReviews, hideReview } = require('../review/review.controller');

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

// ---- Đánh giá (API-8): ẩn đánh giá vi phạm ----

router.get(
    '/reviews',
    [
        query('hidden').optional().isIn(['true', 'false']).withMessage('hidden must be true or false'),
        query('q').optional().isString().trim().isLength({ max: 100 }),
        ...paginationRules
    ],
    validate,
    listAdminReviews
);

router.patch(
    '/reviews/:id/hide',
    [
        param('id').isMongoId().withMessage('Review not found'),
        body('hidden').isBoolean({ strict: true }).withMessage('hidden must be true or false').toBoolean(),
        body('reason').optional().isString().trim().isLength({ max: 500 })
    ],
    validate,
    hideReview
);

// ---- Người dùng (API-9): xem, khóa / mở (BR-04) ----

router.get(
    '/users',
    [
        query('role').optional().isIn(['CUSTOMER', 'RESTAURANT_OWNER', 'ADMIN']).withMessage('role is not valid'),
        query('status').optional().isIn(['ACTIVE', 'BLOCKED']).withMessage('status must be ACTIVE or BLOCKED'),
        query('q').optional().isString().trim().isLength({ max: 100 }),
        ...paginationRules
    ],
    validate,
    listUsers
);

const userIdRule = param('id').isMongoId().withMessage('User not found');
router.post('/users/:id/block', [userIdRule, reasonRule(false)], validate, blockUser);
router.post('/users/:id/unblock', [userIdRule, reasonRule(false)], validate, unblockUser);

// ---- Đơn hàng (API-9): chỉ đọc ----

router.get(
    '/orders',
    [
        query('status')
            .optional()
            .custom((value) => String(value).split(',').every((s) => ORDER_STATUSES.includes(s)))
            .withMessage('status is not valid'),
        query('restaurant').optional().isMongoId().withMessage('restaurant is not valid'),
        query('q').optional().isString().trim().isLength({ max: 50 }),
        ...rangeRules,
        ...paginationRules
    ],
    validate,
    listOrders
);
router.get('/orders/:id', [param('id').isMongoId().withMessage('Order not found')], validate, getOrder);

// ---- Thống kê toàn hệ thống (API-9) ----

router.get(
    '/reports/summary',
    [...rangeRules, query('groupBy').optional().isIn(['day', 'week', 'month']).withMessage('groupBy must be day, week or month')],
    validate,
    adminSummary
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
