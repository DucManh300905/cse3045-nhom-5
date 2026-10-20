const express = require('express');
const { body, param, query } = require('express-validator');

const { authenticate } = require('../../middlewares/auth.middleware');
const { authorizeRoles } = require('../../middlewares/role.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const {
    loadMyRestaurant,
    requireApprovedRestaurant,
    requireNotBlockedRestaurant
} = require('../../middlewares/restaurant.middleware');
const { paginationRules } = require('../../utils/pagination');
const { VOUCHER_TYPES, FUNDED_BY, VOUCHER_PAYMENT_METHODS } = require('./voucher.model');
const c = require('./voucher.controller');

const MAX_MONEY = 10000000;

const intRule = (field, min, max) =>
    body(field).isInt({ min, max }).withMessage(`${field} must be an integer between ${min} and ${max}`).toInt();
const nullableInt = (field, min, max) =>
    body(field)
        .optional()
        .customSanitizer((v) => (v === '' || v === null ? null : v))
        .if((v) => v !== null)
        .isInt({ min, max })
        .withMessage(`${field} must be an integer between ${min} and ${max} or null`)
        .toInt();

/** Rule cho tạo (bắt buộc đủ) / sửa (tùy chọn từng trường) */
const voucherRules = (isCreate, { isAdmin = false } = {}) => {
    const req = (rule) => (isCreate ? rule : rule.optional());
    return [
        req(
            body('code')
                .isString()
                .trim()
                .toUpperCase()
                .matches(/^[A-Z0-9]{4,20}$/)
                .withMessage('code must be 4-20 letters or digits')
        ),
        body('description').optional().isString().trim().isLength({ max: 200 }).withMessage('description is too long'),
        req(body('type').isIn(VOUCHER_TYPES).withMessage(`type must be one of ${VOUCHER_TYPES.join(', ')}`)),
        req(intRule('value', 1, MAX_MONEY)),
        nullableInt('maxDiscount', 1000, MAX_MONEY),
        intRule('minOrderAmount', 0, MAX_MONEY).optional(),
        body('paymentMethods')
            .optional()
            .isArray({ min: 1, max: VOUCHER_PAYMENT_METHODS.length })
            .withMessage('paymentMethods must have at least one method'),
        body('paymentMethods.*')
            .isIn(VOUCHER_PAYMENT_METHODS)
            .withMessage(`paymentMethods must contain ${VOUCHER_PAYMENT_METHODS.join(', ')}`),
        nullableInt('usageLimit', 1, 1000000),
        intRule('perUserLimit', 1, 100).optional(),
        req(body('startAt').isISO8601().withMessage('startAt must be a date').toDate()),
        req(body('endAt').isISO8601().withMessage('endAt must be a date').toDate()),
        body('isActive').optional().isBoolean({ strict: true }).withMessage('isActive must be true or false').toBoolean(),
        ...(isAdmin
            ? [
                  body('restaurants').optional().isArray({ max: 200 }).withMessage('restaurants must be an array'),
                  body('restaurants.*').isMongoId().withMessage('restaurants must contain restaurant ids')
              ]
            : [])
    ];
};

const idRule = param('id').isMongoId().withMessage('Voucher not found');
const listRules = (isAdmin) => [
    query('status').optional().isIn(['ACTIVE', 'INACTIVE', 'EXPIRED']).withMessage('status must be ACTIVE, INACTIVE or EXPIRED'),
    ...(isAdmin ? [query('fundedBy').optional().isIn(FUNDED_BY).withMessage(`fundedBy must be one of ${FUNDED_BY.join(', ')}`)] : []),
    query('q').optional().isString().trim().isLength({ max: 20 }),
    ...paginationRules
];

const mountManager = (router, handlers, isAdmin) => {
    router.get('/', listRules(isAdmin), validate, handlers.list);
    router.post('/', voucherRules(true, { isAdmin }), validate, handlers.create);
    router.patch('/:id', [idRule, ...voucherRules(false, { isAdmin })], validate, handlers.update);
    router.delete('/:id', [idRule], validate, handlers.remove);
    router.get('/:id/usage', [idRule, ...paginationRules], validate, handlers.usage);
};

// ---- /api/vouchers — khách ----
const customerRouter = express.Router();
customerRouter.get(
    '/available',
    authenticate,
    authorizeRoles('CUSTOMER'),
    [query('restaurantId').isMongoId().withMessage('restaurantId is required')],
    validate,
    c.listAvailable
);

// ---- /api/merchant/vouchers — chủ quán (quán đã duyệt, không bị khóa) ----
const merchantRouter = express.Router();
merchantRouter.use(authenticate, authorizeRoles('RESTAURANT_OWNER'), loadMyRestaurant, requireApprovedRestaurant, requireNotBlockedRestaurant);
mountManager(merchantRouter, c.merchant, false);

// ---- /api/admin/vouchers — gắn vào admin.routes.js (đã authenticate ADMIN) ----
const adminRouter = express.Router();
mountManager(adminRouter, c.admin, true);

module.exports = {
    customerRouter,
    merchantRouter,
    adminRouter
};
