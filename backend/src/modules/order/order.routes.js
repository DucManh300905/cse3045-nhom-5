const express = require('express');
const { body, param, query } = require('express-validator');

const { authenticate } = require('../../middlewares/auth.middleware');
const { authorizeRoles } = require('../../middlewares/role.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const { paginationRules } = require('../../utils/pagination');
const { textRule, phoneRule } = require('../../utils/validationRules');
const { ORDER_STATUSES, FULFILLMENT_TYPES, PAYMENT_METHODS } = require('./order.model');
const { preview, createOrder, listMyOrders, getMyOrder, cancelMyOrder } = require('./order.controller');

// Mount tại /api/orders — đơn của khách (docs/API.md mục 2.6)
const router = express.Router();
router.use(authenticate, authorizeRoles('CUSTOMER'));

const MAX_LINES = 50;
const MAX_QTY = 50;

// Dòng món trong giỏ. Giá không nhận từ client — server tự tính (BR-31).
const itemRules = [
    body('restaurantId').isMongoId().withMessage('restaurantId is required'),
    body('fulfillmentType')
        .optional()
        .isIn(FULFILLMENT_TYPES)
        .withMessage(`fulfillmentType must be one of ${FULFILLMENT_TYPES.join(', ')}`),
    body('items').isArray({ min: 1, max: MAX_LINES }).withMessage(`items must have 1-${MAX_LINES} lines`),
    body('items.*.menuItemId').isMongoId().withMessage('menuItemId is not valid'),
    body('items.*.variantId').optional({ values: 'null' }).isMongoId().withMessage('variantId is not valid'),
    body('items.*.optionIds').optional().isArray({ max: 30 }).withMessage('optionIds must be an array'),
    body('items.*.optionIds.*').isMongoId().withMessage('optionIds must contain option ids'),
    body('items.*.qty').isInt({ min: 1, max: MAX_QTY }).withMessage(`qty must be between 1 and ${MAX_QTY}`).toInt(),
    body('items.*.note').optional().isString().trim().isLength({ max: 200 }).withMessage('note is too long')
];

const deliveryRules = [
    body('addressId').optional().isMongoId().withMessage('addressId is not valid'),
    textRule('delivery.receiverName', 100).optional(),
    phoneRule('delivery.phone').optional(),
    textRule('delivery.addressLine', 255).optional(),
    body('delivery.note').optional().isString().trim().isLength({ max: 200 }).withMessage('note is too long'),
    body('paymentMethod')
        .optional()
        .isIn(PAYMENT_METHODS)
        .withMessage(`paymentMethod must be one of ${PAYMENT_METHODS.join(', ')}`)
];

const idRule = param('id').isMongoId().withMessage('Order not found');

router.post('/preview', itemRules, validate, preview);
router.post('/', [...itemRules, ...deliveryRules], validate, createOrder);

router.get(
    '/',
    [
        query('status')
            .optional()
            .custom((value) => String(value).split(',').every((s) => ORDER_STATUSES.includes(s)))
            .withMessage(`status must be a comma-separated list of ${ORDER_STATUSES.join(', ')}`),
        ...paginationRules
    ],
    validate,
    listMyOrders
);

router.get('/:id', [idRule], validate, getMyOrder);

router.post(
    '/:id/cancel',
    [idRule, body('note').optional().isString().trim().isLength({ max: 200 }).withMessage('note is too long')],
    validate,
    cancelMyOrder
);

module.exports = router;
