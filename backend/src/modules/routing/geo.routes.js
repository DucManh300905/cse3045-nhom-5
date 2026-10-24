const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { param, query } = require('express-validator');

const { authenticate } = require('../../middlewares/auth.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const routing = require('./routing.service');

// Mount tại /api/geo — tra địa chỉ bằng chữ cho ô tìm kiếm trên bản đồ (proxy tới Goong, giấu khóa)
const router = express.Router();

// GET /geo/status — công khai: giao diện biết có bật ô tìm kiếm / đường đi thật không
router.get('/status', (req, res) =>
    res.json({ success: true, data: { search: routing.searchAvailable(), routing: routing.providerName() } })
);

// Mỗi lần gõ phím là 1 request -> giới hạn để không đốt hạn mức Goong
const geoLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: Number(process.env.GEO_RATE_LIMIT) || 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ success: false, code: 'RATE_LIMITED', message: 'Too many map searches, slow down' })
});

const requireSearch = (req, res, next) =>
    next(routing.searchAvailable() ? undefined : new AppError(503, 'GEO_UNAVAILABLE', 'Address search is not configured'));

router.use(authenticate, geoLimiter, requireSearch);

const nearRules = [
    query('lat').optional().isFloat({ min: -90, max: 90 }).toFloat(),
    query('lng').optional().isFloat({ min: -180, max: 180 }).toFloat()
];

const failSoft = (fn) =>
    asyncHandler(async (req, res) => {
        try {
            return res.json({ success: true, data: await fn(req) });
        } catch (error) {
            console.warn('[geo]', error.message);
            throw new AppError(502, 'GEO_FAILED', 'Map service is unavailable, try again later');
        }
    });

// GET /geo/autocomplete?input=&lat=&lng= — gợi ý địa chỉ (ưu tiên gần lat/lng)
router.get(
    '/autocomplete',
    [query('input').isString().trim().isLength({ min: 2, max: 120 }).withMessage('input must be 2-120 characters'), ...nearRules],
    validate,
    failSoft((req) => {
        const { input, lat, lng } = req.query;
        return routing.autocomplete(input, lat !== undefined && lng !== undefined ? { lat: Number(lat), lng: Number(lng) } : null);
    })
);

// GET /geo/place/:placeId — tọa độ của gợi ý đã chọn
router.get(
    '/place/:placeId',
    [param('placeId').isString().isLength({ min: 1, max: 300 })],
    validate,
    failSoft((req) => routing.placeDetail(req.params.placeId))
);

// GET /geo/reverse?lat=&lng= — địa chỉ của điểm vừa ghim
router.get(
    '/reverse',
    [
        query('lat').isFloat({ min: -90, max: 90 }).withMessage('lat is not valid').toFloat(),
        query('lng').isFloat({ min: -180, max: 180 }).withMessage('lng is not valid').toFloat()
    ],
    validate,
    failSoft((req) => routing.reverseGeocode({ lat: Number(req.query.lat), lng: Number(req.query.lng) }))
);

module.exports = router;
