const express = require('express');
const { body, param, query } = require('express-validator');

const { authenticate } = require('../../middlewares/auth.middleware');
const { authorizeRoles } = require('../../middlewares/role.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const { loadMyRestaurant, requireNotBlockedRestaurant } = require('../../middlewares/restaurant.middleware');
const { paginationRules } = require('../../utils/pagination');
const { textRule } = require('../../utils/validationRules');
const { TOPUP_STATUSES } = require('./topup.model');
const { PAYOUT_STATUSES } = require('./payout.model');
const c = require('./wallet.controller');

const MAX_AMOUNT = 100000000;

const amountRule = (field, { allowNegative = false } = {}) =>
    body(field)
        .isInt(allowNegative ? { min: -MAX_AMOUNT, max: MAX_AMOUNT } : { min: 1, max: MAX_AMOUNT })
        .withMessage(`${field} must be an integer${allowNegative ? '' : ' > 0'} (VND, max ${MAX_AMOUNT})`)
        .toInt();

const idRule = (name, label) => param(name).isMongoId().withMessage(`${label} not found`);
const bankRefRule = body('bankRef').optional().isString().trim().isLength({ max: 100 });

// ======================= /api/merchant/wallet — chủ quán =======================

const merchantRouter = express.Router();
merchantRouter.use(authenticate, authorizeRoles('RESTAURANT_OWNER'), loadMyRestaurant);

merchantRouter.get('/', c.getMyWallet);
merchantRouter.get('/entries', paginationRules, validate, c.listMyEntries);

merchantRouter.put(
    '/bank-account',
    [
        textRule('bankName', 100),
        body('accountNumber')
            .isString()
            .trim()
            .matches(/^[0-9]{6,20}$/)
            .withMessage('accountNumber must be 6-20 digits'),
        textRule('accountName', 100)
    ],
    validate,
    c.updateBankAccount
);

merchantRouter.get('/topups', paginationRules, validate, c.listMyTopups);
merchantRouter.post('/topups', [amountRule('amount')], validate, c.createTopup);
merchantRouter.post('/topups/:id/cancel', [idRule('id', 'Top-up')], validate, c.cancelMyTopup);

merchantRouter.get('/payouts', paginationRules, validate, c.listMyPayouts);
// Quán bị admin khóa không rút được (chờ admin xử lý)
merchantRouter.post('/payouts', requireNotBlockedRestaurant, [amountRule('amount')], validate, c.requestPayout);

// ======================= /api/admin/... — gắn vào admin.routes.js (đã authenticate ADMIN) =======================

const adminRouter = express.Router();

const listRules = (statuses) => [
    query('status').optional().isIn(statuses).withMessage(`status must be one of ${statuses.join(', ')}`),
    query('q').optional().isString().trim().isLength({ max: 100 }),
    ...paginationRules
];

adminRouter.get('/wallets/overview', c.getOverview);
adminRouter.get('/wallets', listRules(['negative', 'positive', 'locked']), validate, c.listWallets);
adminRouter.get(
    '/wallets/:restaurantId/entries',
    [idRule('restaurantId', 'Restaurant'), ...paginationRules],
    validate,
    c.listRestaurantEntries
);
adminRouter.post(
    '/wallets/:restaurantId/adjustments',
    [
        idRule('restaurantId', 'Restaurant'),
        amountRule('amount', { allowNegative: true }).custom((v) => v !== 0).withMessage('amount must not be 0'),
        textRule('reason', 500)
    ],
    validate,
    c.adjustWallet
);

adminRouter.get('/topups', listRules(TOPUP_STATUSES), validate, c.listTopups);
adminRouter.post(
    '/topups/:id/confirm',
    [idRule('id', 'Top-up'), amountRule('receivedAmount').optional(), bankRefRule],
    validate,
    c.confirmTopup
);
adminRouter.post('/topups/:id/reject', [idRule('id', 'Top-up'), textRule('reason', 500)], validate, c.rejectTopup);

adminRouter.get('/payouts', listRules(PAYOUT_STATUSES), validate, c.listPayouts);
adminRouter.post('/payouts/:id/paid', [idRule('id', 'Payout'), bankRefRule], validate, c.markPayoutPaid);
adminRouter.post('/payouts/:id/reject', [idRule('id', 'Payout'), textRule('reason', 500)], validate, c.rejectPayout);

module.exports = {
    merchantRouter,
    adminRouter
};
