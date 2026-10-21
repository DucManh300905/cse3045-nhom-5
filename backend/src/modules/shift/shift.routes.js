const express = require('express');
const { body, param, query } = require('express-validator');

const { authenticate } = require('../../middlewares/auth.middleware');
const { authorizeRoles } = require('../../middlewares/role.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const { loadMyRestaurant, requireNotBlockedRestaurant } = require('../../middlewares/restaurant.middleware');
const c = require('./shift.controller');

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const windowRules = (field) => [
    body(field).isArray({ max: 10 }).withMessage(`${field} must be an array (max 10)`),
    body(`${field}.*.start`).matches(TIME).withMessage('start must be HH:mm'),
    body(`${field}.*.end`)
        .matches(TIME)
        .withMessage('end must be HH:mm')
        .custom((end, { req, path }) => {
            const i = Number(path.match(/\[(\d+)\]/)[1]);
            return String(req.body[field][i].start) < end;
        })
        .withMessage('end must be after start'),
    body(`${field}.*.expectedOrders`).optional().isInt({ min: 0, max: 500 }).withMessage('expectedOrders must be 0-500').toInt()
];

// ======================= /api/merchant/schedule — chủ quán =======================

const merchantRouter = express.Router();
merchantRouter.use(authenticate, authorizeRoles('RESTAURANT_OWNER'), loadMyRestaurant);

merchantRouter.get('/', c.getSchedule);
merchantRouter.put(
    '/weekly',
    requireNotBlockedRestaurant,
    [
        body('weeklySchedule').isArray({ max: 70 }).withMessage('weeklySchedule must be an array'),
        body('weeklySchedule.*.dayOfWeek').isInt({ min: 0, max: 6 }).withMessage('dayOfWeek must be 0-6').toInt(),
        ...windowRules('weeklySchedule').slice(1)
    ],
    validate,
    c.putWeekly
);
merchantRouter.put(
    '/days/:date',
    requireNotBlockedRestaurant,
    [param('date').matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('date must be YYYY-MM-DD'), ...windowRules('windows')],
    validate,
    c.putDay
);

// ======================= /api/shipper/... — tài xế (gắn vào shipper.routes) =======================

const shipperRouter = express.Router();

shipperRouter.get('/shifts', c.listShifts);
shipperRouter.post('/shifts/:id/register', [param('id').isMongoId().withMessage('Shift not found')], validate, c.registerShift);
shipperRouter.post('/shifts/:id/cancel', [param('id').isMongoId().withMessage('Shift not found')], validate, c.cancelShift);
shipperRouter.get('/penalties', c.myPenalties);
shipperRouter.post(
    '/email',
    [body('email').isEmail().withMessage('Email is not valid'), body('verificationToken').isString().notEmpty().withMessage('verificationToken is required')],
    validate,
    c.setEmail
);

// ======================= /api/admin/... (đã authenticate ADMIN) =======================

const adminRouter = express.Router();

adminRouter.get('/shifts', [query('date').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('date must be YYYY-MM-DD')], validate, c.adminListShifts);
adminRouter.get('/shippers/:id/penalties', [param('id').isMongoId().withMessage('Driver not found')], validate, c.adminPenalties);
adminRouter.post(
    '/shippers/:id/unlock',
    [param('id').isMongoId().withMessage('Driver not found'), body('reason').optional().isString().trim().isLength({ max: 500 })],
    validate,
    c.adminUnlock
);

module.exports = {
    merchantRouter,
    shipperRouter,
    adminRouter
};
