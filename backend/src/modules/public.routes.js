const express = require('express');
const { body, param, query } = require('express-validator');

const { validate } = require('../middlewares/validate.middleware');
const { authenticate } = require('../middlewares/auth.middleware');
const { authorizeRoles } = require('../middlewares/role.middleware');
const { reviewLimiter } = require('../middlewares/rateLimit.middleware');
const reviews = require('./review/review.controller');
const { paginationRules } = require('../utils/pagination');
const restaurantPublic = require('./restaurant/restaurant.public.controller');
const menuPublic = require('./menu/menu.public.controller');
const { MENU_ITEM_TYPES } = require('./menu/menuItem.model');

// API cho khách xem quán và món — không cần đăng nhập (docs/API.md mục 2.4)
const restaurantRouter = express.Router();
const menuItemRouter = express.Router();

const oneOf = (field, values) =>
    query(field).optional().isIn(values).withMessage(`${field} must be one of ${values.join(', ')}`);

const searchRule = query('q').optional().isString().isLength({ max: 100 }).withMessage('q is too long');
const booleanQuery = (field) => oneOf(field, ['true', 'false']);

// ---- /api/restaurants ----

restaurantRouter.get(
    '/',
    [
        searchRule,
        query('cuisine').optional().isString().isLength({ max: 50 }),
        booleanQuery('isOpen'),
        query('minRating').optional().isFloat({ min: 1, max: 5 }).withMessage('minRating must be between 1 and 5'),
        oneOf('sort', Object.keys(restaurantPublic.SORTS)),
        ...paginationRules
    ],
    validate,
    restaurantPublic.listRestaurants
);

const idOrSlugRule = param('idOrSlug').isLength({ max: 100 }).withMessage('Restaurant not found');

restaurantRouter.get('/:idOrSlug', [idOrSlugRule], validate, restaurantPublic.getRestaurant);
restaurantRouter.get('/:idOrSlug/menu', [idOrSlugRule], validate, restaurantPublic.getRestaurantMenu);

// ---- Đánh giá quán (API-8): 1–5 sao, mỗi khách 1 đánh giá / quán, phải có đơn hoàn thành ----

const ratingQuery = query('rating').optional().isInt({ min: 1, max: 5 }).withMessage('rating must be 1-5');
const customerOnly = [authenticate, authorizeRoles('CUSTOMER')];

restaurantRouter.get('/:idOrSlug/reviews', [idOrSlugRule, ratingQuery, ...paginationRules], validate, reviews.listRestaurantReviews);
restaurantRouter.get('/:idOrSlug/reviews/me', customerOnly, [idOrSlugRule], validate, reviews.getMyReview);
restaurantRouter.put(
    '/:idOrSlug/reviews/me',
    customerOnly,
    reviewLimiter,
    [
        idOrSlugRule,
        body('rating').isInt({ min: 1, max: 5 }).withMessage('rating must be an integer from 1 to 5').toInt(),
        body('comment').optional({ values: 'null' }).isString().trim().isLength({ max: 1000 }).withMessage('comment is too long (max 1000)')
    ],
    validate,
    reviews.putMyReview
);
restaurantRouter.delete('/:idOrSlug/reviews/me', customerOnly, [idOrSlugRule], validate, reviews.removeMyReview);

// ---- /api/menu-items ----

menuItemRouter.get(
    '/',
    [
        searchRule,
        oneOf('type', MENU_ITEM_TYPES),
        query('restaurant').optional().isMongoId().withMessage('restaurant is not valid'),
        booleanQuery('inStock'),
        query('minRating').optional().isFloat({ min: 1, max: 5 }).withMessage('minRating must be between 1 and 5'),
        oneOf('sort', Object.keys(menuPublic.SORTS)),
        ...paginationRules
    ],
    validate,
    menuPublic.listMenuItems
);

menuItemRouter.get(
    '/:id',
    [param('id').isMongoId().withMessage('Menu item not found')],
    validate,
    menuPublic.getMenuItem
);

module.exports = {
    restaurantRouter,
    menuItemRouter
};
