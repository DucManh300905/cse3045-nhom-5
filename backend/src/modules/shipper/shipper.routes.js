const express = require('express');
const { body, param, query } = require('express-validator');

const { authenticate } = require('../../middlewares/auth.middleware');
const { authorizeRoles } = require('../../middlewares/role.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const { shipperDocumentUpload, deliveryProofUpload, shipperPortraitUpload } = require('../../middlewares/upload.middleware');
const { paginationRules } = require('../../utils/pagination');
const { textRule, phoneRule } = require('../../utils/validationRules');
const { SHIPPER_STATUSES, SHIPPER_DOCUMENT_TYPES, VEHICLE_TYPES } = require('./shipper.model');
const c = require('./shipper.controller');
const a = require('./shipper.admin.controller');
const shiftRoutes = require('../shift/shift.routes');

const MAX_AMOUNT = 100000000;
const idRule = (label = 'Order') => param('id').isMongoId().withMessage(`${label} not found`);

const latLngRules = (optional) => {
    const chain = (field, min, max) => {
        const rule = body(field).isFloat({ min, max }).withMessage(`${field} is not valid`).toFloat();
        return optional ? rule.optional() : rule;
    };
    return [chain('lat', -90, 90), chain('lng', -180, 180)];
};

// ======================= /api/shipper — tài xế =======================

const shipperRouter = express.Router();
shipperRouter.use(authenticate, authorizeRoles('SHIPPER'));

const profileRules = (isCreate) => {
    const required = (rule) => (isCreate ? rule : rule.optional());
    return [
        required(textRule('fullName', 100)),
        required(phoneRule('phone')),
        body('idNumber')
            .optional()
            .isString()
            .trim()
            .matches(/^[0-9]{9,12}$/)
            .withMessage('idNumber must be 9-12 digits'),
        body('vehicleType').optional().isIn(VEHICLE_TYPES).withMessage(`vehicleType must be one of ${VEHICLE_TYPES.join(', ')}`),
        body('licensePlate')
            .optional()
            .isString()
            .trim()
            .matches(/^[0-9A-Za-z.\- ]{4,15}$/)
            .withMessage('licensePlate is not valid')
    ];
};

shipperRouter.post('/profile', profileRules(true), validate, c.createProfile);
shipperRouter.get('/profile', c.getProfile);
shipperRouter.put('/profile', profileRules(false), validate, c.updateProfile);
shipperRouter.post('/profile/documents', shipperDocumentUpload, c.uploadDocument);
shipperRouter.post('/profile/portrait', shipperPortraitUpload, c.uploadPortrait);
shipperRouter.post('/profile/submit', c.submitProfile);
shipperRouter.put(
    '/bank-account',
    [
        textRule('bankName', 100),
        body('accountNumber').isString().trim().matches(/^[0-9]{6,20}$/).withMessage('accountNumber must be 6-20 digits'),
        textRule('accountName', 100)
    ],
    validate,
    c.updateBankAccount
);

shipperRouter.get('/state', c.getState);
shipperRouter.post('/online', latLngRules(true), validate, c.goOnline);
shipperRouter.post('/offline', c.goOffline);
shipperRouter.post('/location', latLngRules(false), validate, c.updateLocation);

shipperRouter.post('/offers/:id/accept', [idRule('Offer')], validate, c.acceptOffer);
shipperRouter.post('/offers/:id/decline', [idRule('Offer')], validate, c.declineOffer);

shipperRouter.get('/orders', paginationRules, validate, c.listOrders);
shipperRouter.get('/orders/:id', [idRule()], validate, c.getOrder);
shipperRouter.post('/orders/:id/arrived', [idRule()], validate, c.markArrived);
shipperRouter.post('/orders/:id/picked-up', [idRule()], validate, c.markPickedUp);
shipperRouter.post('/orders/:id/delivered', [idRule()], validate, deliveryProofUpload, c.markDelivered);
shipperRouter.post('/orders/:id/failed', [idRule()], validate, deliveryProofUpload, c.markFailed);
shipperRouter.post(
    '/orders/:id/withdraw',
    [idRule(), body('reason').optional().isString().trim().isLength({ max: 300 })],
    validate,
    c.withdrawOrder
);

// Đăng ký ca, vi phạm, xác thực email (module shift)
shipperRouter.use(shiftRoutes.shipperRouter);

shipperRouter.get('/wallet', c.getWallet);
shipperRouter.get('/wallet/entries', paginationRules, validate, c.listEntries);
shipperRouter.get('/wallet/payouts', paginationRules, validate, c.listPayouts);
shipperRouter.post(
    '/wallet/payouts',
    [body('amount').isInt({ min: 1, max: MAX_AMOUNT }).withMessage(`amount must be an integer > 0 (VND, max ${MAX_AMOUNT})`).toInt()],
    validate,
    c.requestPayout
);

// ======================= /api/delivery — ảnh xác nhận giao (mọi vai trò có liên quan) =======================

const deliveryRouter = express.Router();
deliveryRouter.use(authenticate);
deliveryRouter.get('/orders/:id/proof', [idRule()], validate, c.getProof);
deliveryRouter.get('/shippers/:id/portrait', [idRule('Driver')], validate, c.getPortrait);

// ======================= /api/admin/... — gắn vào admin.routes.js (đã authenticate ADMIN) =======================

const adminRouter = express.Router();
const reasonRule = body('reason').optional().isString().trim().isLength({ max: 500 });

adminRouter.get(
    '/shippers',
    [
        query('status').optional().isIn([...SHIPPER_STATUSES, 'ALL']).withMessage(`status must be one of ${[...SHIPPER_STATUSES, 'ALL'].join(', ')}`),
        query('q').optional().isString().trim().isLength({ max: 100 }),
        ...paginationRules
    ],
    validate,
    a.listShippers
);
adminRouter.get('/shippers/online', a.listOnline);
adminRouter.get('/shippers/:id', [idRule('Driver')], validate, a.getShipper);
adminRouter.get(
    '/shippers/:id/documents/:type',
    [idRule('Driver'), param('type').isIn(SHIPPER_DOCUMENT_TYPES).withMessage('Document not found')],
    validate,
    a.getDocument
);
adminRouter.post('/shippers/:id/approve', [idRule('Driver')], validate, a.approveShipper);
adminRouter.post('/shippers/:id/reject', [idRule('Driver'), reasonRule], validate, a.rejectShipper);
adminRouter.post('/shippers/:id/block', [idRule('Driver'), reasonRule], validate, a.blockShipper);
adminRouter.post('/shippers/:id/unblock', [idRule('Driver'), reasonRule], validate, a.unblockShipper);

adminRouter.get('/dispatch', a.listDispatch);
adminRouter.post('/orders/:id/assign', [idRule(), body('shipperId').isMongoId().withMessage('shipperId is not valid')], validate, a.assignOrder);
adminRouter.post('/orders/:id/redispatch', [idRule()], validate, a.redispatchOrder);
adminRouter.post(
    '/orders/:id/delivery/resolve',
    [
        idRule(),
        body('action').isIn(['COMPLETE', 'CANCEL']).withMessage('action must be COMPLETE or CANCEL'),
        body('note').optional().isString().trim().isLength({ max: 300 })
    ],
    validate,
    a.resolveDelivery
);

module.exports = {
    shipperRouter,
    deliveryRouter,
    adminRouter
};
