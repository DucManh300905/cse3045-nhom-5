const express = require('express');
const { body, param, query } = require('express-validator');

const { authenticate } = require('../../middlewares/auth.middleware');
const { authorizeRoles } = require('../../middlewares/role.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const { loadMyRestaurant } = require('../../middlewares/restaurant.middleware');
const { paginationRules } = require('../../utils/pagination');
const { ORDER_STATUSES } = require('./order.model');
const { OWNER_REJECT_REASONS, OWNER_FORWARD } = require('./orderStateMachine');
const { listOrders, getOrder, acceptOrder, rejectOrder, cancelOrder, updateStatus } = require('./order.merchant.controller');

// Mount tại /api/merchant/orders — chủ quán xử lý đơn của quán mình (docs/API.md mục 2.5).
// Quán bị khóa vẫn xử lý được đơn đang dở (không nhận đơn mới vì đã tắt nhận đơn).
const router = express.Router();
router.use(authenticate, authorizeRoles('RESTAURANT_OWNER'), loadMyRestaurant);

const idRule = param('id').isMongoId().withMessage('Order not found');
const FORWARD_TARGETS = [...new Set(Object.values(OWNER_FORWARD).flat())];

const reasonRules = [
    body('reasonCode')
        .isIn(OWNER_REJECT_REASONS)
        .withMessage(`reasonCode must be one of ${OWNER_REJECT_REASONS.join(', ')}`),
    body('note').optional().isString().trim().isLength({ max: 200 }).withMessage('note is too long')
];

router.get(
    '/',
    [
        query('status')
            .optional()
            .custom((value) => String(value).split(',').every((s) => ORDER_STATUSES.includes(s)))
            .withMessage(`status must be a comma-separated list of ${ORDER_STATUSES.join(', ')}`),
        query('from').optional().isISO8601().withMessage('from must be an ISO date'),
        query('to').optional().isISO8601().withMessage('to must be an ISO date'),
        ...paginationRules
    ],
    validate,
    listOrders
);

router.get('/:id', [idRule], validate, getOrder);
router.post('/:id/accept', [idRule], validate, acceptOrder);
router.post('/:id/reject', [idRule, ...reasonRules], validate, rejectOrder);
router.post('/:id/cancel', [idRule, ...reasonRules], validate, cancelOrder);
router.post(
    '/:id/status',
    [idRule, body('to').isIn(FORWARD_TARGETS).withMessage(`to must be one of ${FORWARD_TARGETS.join(', ')}`)],
    validate,
    updateStatus
);

module.exports = router;
