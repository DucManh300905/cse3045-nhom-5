const express = require('express');
const { body, param, query } = require('express-validator');

const { authenticate } = require('../../middlewares/auth.middleware');
const { authorizeRoles } = require('../../middlewares/role.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const { loadMyRestaurant } = require('../../middlewares/restaurant.middleware');
const { paginationRules } = require('../../utils/pagination');
const { listMerchantReviews, replyReview } = require('./review.controller');

// Mount tại /api/merchant/reviews — chủ quán xem và trả lời đánh giá của quán mình
const router = express.Router();
router.use(authenticate, authorizeRoles('RESTAURANT_OWNER'), loadMyRestaurant);

router.get(
    '/',
    [
        query('rating').optional().isInt({ min: 1, max: 5 }).withMessage('rating must be 1-5'),
        query('replied').optional().isIn(['true', 'false']).withMessage('replied must be true or false'),
        ...paginationRules
    ],
    validate,
    listMerchantReviews
);

router.put(
    '/:id/reply',
    [
        param('id').isMongoId().withMessage('Review not found'),
        body('content').isString().trim().isLength({ min: 1, max: 1000 }).withMessage('content is required (max 1000)')
    ],
    validate,
    replyReview
);

module.exports = router;
