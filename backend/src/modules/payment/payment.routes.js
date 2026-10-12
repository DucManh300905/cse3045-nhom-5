const express = require('express');
const { body, param, query } = require('express-validator');

const { validate } = require('../../middlewares/validate.middleware');
const { paginationRules, getPagination, paginate } = require('../../utils/pagination');
const { textRule } = require('../../utils/validationRules');
const asyncHandler = require('../../utils/asyncHandler');
const AppError = require('../../utils/AppError');
const { recordAudit } = require('../audit/audit.service');
const Payment = require('./payment.model');
const Refund = require('./refund.model');
const { PAYMENT_STATUSES } = require('./payment.model');
const { REFUND_STATUSES } = require('./refund.model');
const paymentService = require('./payment.service');

const ok = (res, data) => res.status(200).json({ success: true, data });

// ======================= /api/payments — công khai + webhook =======================

const publicRouter = express.Router();

// GET /payments/methods — trang thanh toán biết có bật chuyển khoản không
publicRouter.get('/methods', (req, res) => ok(res, paymentService.availableMethods()));

/**
 * POST /payments/sepay/webhook — SePay gọi khi tài khoản MAK có biến động.
 * Xác thực: header "Authorization: Apikey <SEPAY_WEBHOOK_API_KEY>".
 * Trả 200 { success: true } khi đã ghi nhận (kể cả giao dịch không khớp / gửi lại);
 * lỗi hệ thống -> 500 để SePay tự gửi lại.
 */
publicRouter.post(
    '/sepay/webhook',
    (req, res, next) =>
        next(paymentService.verifyWebhookAuth(req.get('Authorization')) ? undefined : new AppError(401, 'UNAUTHORIZED', 'Invalid webhook API key')),
    [
        body('id').exists({ values: 'null' }).withMessage('id is required'),
        body('transferAmount').isFloat({ min: 0 }).withMessage('transferAmount is required').toFloat(),
        body('transferType').isIn(['in', 'out']).withMessage('transferType must be in or out')
    ],
    validate,
    asyncHandler(async (req, res) => {
        const status = await paymentService.handleSepayWebhook(req.body);
        return res.status(200).json({ success: true, status });
    })
);

// ======================= /api/admin/... — gắn vào admin.routes.js (đã authenticate ADMIN) =======================

const adminRouter = express.Router();

const listRules = (statuses) => [
    query('status').optional().isIn(statuses).withMessage(`status must be one of ${statuses.join(', ')}`),
    ...paginationRules
];

// GET /admin/refunds?status=PENDING|DONE — kèm khách (để liên hệ / chuyển trả) + mã đơn
adminRouter.get(
    '/refunds',
    listRules(REFUND_STATUSES),
    validate,
    asyncHandler(async (req, res) => {
        const filter = req.query.status ? { status: req.query.status } : {};
        const result = await paginate(Refund, filter, getPagination(req), {
            sort: { createdAt: -1, _id: -1 },
            populate: [
                { path: 'customer', select: 'fullName phone email' },
                { path: 'order', select: 'code total paymentCode' },
                { path: 'payment', select: 'referenceCode gateway content transactionDate' }
            ]
        });
        return ok(res, result);
    })
);

// POST /admin/refunds/:id/done { bankRef? } — admin đã chuyển khoản trả khách
adminRouter.post(
    '/refunds/:id/done',
    [param('id').isMongoId().withMessage('Refund not found'), body('bankRef').optional().isString().trim().isLength({ max: 100 })],
    validate,
    asyncHandler(async (req, res) => {
        const refund = await paymentService.completeRefund({ refundId: req.params.id, bankRef: req.body?.bankRef, actor: req.user.userId });
        await recordAudit(req, {
            action: 'REFUND_DONE',
            targetType: 'Refund',
            targetId: refund._id,
            after: { status: 'DONE', amount: refund.amount, bankRef: refund.bankRef }
        });
        return ok(res, refund);
    })
);

// GET /admin/payments?status= — giao dịch SePay báo về
adminRouter.get(
    '/payments',
    listRules(PAYMENT_STATUSES),
    validate,
    asyncHandler(async (req, res) => {
        const filter = req.query.status ? { status: req.query.status } : {};
        const result = await paginate(Payment, filter, getPagination(req), {
            sort: { createdAt: -1, _id: -1 },
            populate: { path: 'order', select: 'code' }
        });
        return ok(res, result);
    })
);

// POST /admin/payments/:id/resolve { action: refund|ignore, note } — giao dịch không khớp mã
adminRouter.post(
    '/payments/:id/resolve',
    [
        param('id').isMongoId().withMessage('Payment not found'),
        body('action').isIn(['refund', 'ignore']).withMessage('action must be refund or ignore'),
        textRule('note', 500)
    ],
    validate,
    asyncHandler(async (req, res) => {
        const { payment, refund } = await paymentService.resolveUnmatched({
            paymentId: req.params.id,
            action: req.body.action,
            note: req.body.note,
            actor: req.user.userId
        });
        await recordAudit(req, {
            action: req.body.action === 'refund' ? 'PAYMENT_REFUND' : 'PAYMENT_IGNORE',
            targetType: 'Payment',
            targetId: payment._id,
            after: { status: payment.status, amount: payment.amount },
            note: req.body.note
        });
        return ok(res, { payment, refund });
    })
);

module.exports = {
    publicRouter,
    adminRouter
};
