const express = require('express');
const { body, param } = require('express-validator');

const { authenticate } = require('../../middlewares/auth.middleware');
const { authorizeRoles } = require('../../middlewares/role.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const {
    loadMyRestaurant,
    requireApprovedRestaurant,
    requireNotBlockedRestaurant: notBlocked
} = require('../../middlewares/restaurant.middleware');
const {
    restaurantImageUpload,
    restaurantDocumentUpload
} = require('../../middlewares/upload.middleware');
const AppError = require('../../utils/AppError');
const { TIME_REGEX } = require('../../utils/validators');
const {
    textRule,
    phoneRule,
    locationRules,
    moneyRule
} = require('../../utils/validationRules');
const {
    createRestaurant,
    getMyRestaurant,
    updateMyRestaurant,
    updateOpeningHours,
    uploadImage,
    uploadDocument,
    submitRestaurant,
    setAcceptingOrders
} = require('./restaurant.merchant.controller');

// Mount tại /api/merchant/restaurant — chỉ RESTAURANT_OWNER
const router = express.Router();
router.use(authenticate, authorizeRoles('RESTAURANT_OWNER'));

// ---- Kiểm tra trạng thái quán trước khi cho sửa (đặt trước multer để không lưu file thừa) ----

// Đang chờ duyệt thì không sửa thông tin hồ sơ, tránh admin duyệt dữ liệu đã bị đổi
const profileEditable = (req, res, next) =>
    next(
        req.restaurant.status === 'SUBMITTED'
            ? new AppError(409, 'RESTAURANT_UNDER_REVIEW', 'Restaurant is under review')
            : undefined
    );

// Giấy tờ chỉ sửa khi chưa nộp hoặc bị từ chối (sửa sau khi duyệt cần duyệt lại — để sau MVP)
const documentsEditable = (req, res, next) =>
    next(
        ['DRAFT', 'REJECTED'].includes(req.restaurant.status)
            ? undefined
            : new AppError(409, 'RESTAURANT_DOCUMENTS_LOCKED', 'Documents cannot be changed after submission')
    );

// ---- Validate ----

const profileRules = (isCreate) => {
    const required = (rule) => (isCreate ? rule : rule.optional());

    return [
        required(textRule('name', 100)),
        required(textRule('address', 255)),
        required(phoneRule('phone')),
        body('description').optional().isString().trim().isLength({ max: 1000 }),
        body('cuisineTypes')
            .optional()
            .isArray({ max: 10 })
            .withMessage('cuisineTypes must be an array (max 10)'),
        body('cuisineTypes.*').isString().trim().notEmpty().isLength({ max: 50 }),
        moneyRule('minOrderAmount').optional(),
        body('deliveryRadiusKm')
            .optional()
            .isFloat({ min: 0.5, max: 30 })
            .withMessage('deliveryRadiusKm must be between 0.5 and 30')
            .toFloat(),
        body('avgPrepMinutes')
            .optional()
            .isInt({ min: 1, max: 180 })
            .withMessage('avgPrepMinutes must be between 1 and 180')
            .toInt(),
        ...locationRules
    ];
};

const openingHoursRules = [
    body('openingHours')
        .isArray({ max: 21 })
        .withMessage('openingHours must be an array (max 21 slots)'),
    body('openingHours.*.dayOfWeek')
        .isInt({ min: 0, max: 6 })
        .withMessage('dayOfWeek must be 0 (Sunday) to 6 (Saturday)')
        .toInt(),
    body('openingHours.*.open').matches(TIME_REGEX).withMessage('open must be HH:mm'),
    body('openingHours.*.close')
        .matches(TIME_REGEX)
        .withMessage('close must be HH:mm')
        .custom((close, { req, path }) => {
            const index = Number(path.match(/\[(\d+)\]/)[1]);
            return req.body.openingHours[index].open < close;
        })
        .withMessage('close must be after open'),
    // Các khung giờ trong cùng một ngày không được chồng nhau
    body('openingHours')
        .custom((slots) => {
            const sorted = [...slots].sort(
                (a, b) => a.dayOfWeek - b.dayOfWeek || String(a.open).localeCompare(String(b.open))
            );
            return sorted.every(
                (slot, i) =>
                    i === 0 ||
                    sorted[i - 1].dayOfWeek !== slot.dayOfWeek ||
                    sorted[i - 1].close <= slot.open
            );
        })
        .withMessage('Opening hours overlap in the same day')
];

// ---- Routes ----

router.post('/', profileRules(true), validate, createRestaurant);

// Các route còn lại cần quán đã tồn tại
router.use(loadMyRestaurant);

router.get('/', getMyRestaurant);

router.put('/', notBlocked, profileEditable, profileRules(false), validate, updateMyRestaurant);

router.put('/opening-hours', notBlocked, openingHoursRules, validate, updateOpeningHours);

router.post(
    '/images/:kind',
    [param('kind').isIn(['logo', 'cover']).withMessage('kind must be logo or cover')],
    validate,
    notBlocked,
    restaurantImageUpload,
    uploadImage
);

router.post('/documents', notBlocked, documentsEditable, restaurantDocumentUpload, uploadDocument);

router.post('/submit', submitRestaurant);

router.patch(
    '/accepting-orders',
    requireApprovedRestaurant,
    [body('isAcceptingOrders').isBoolean({ strict: true }).withMessage('isAcceptingOrders must be true or false').toBoolean()],
    validate,
    setAcceptingOrders
);

module.exports = router;
