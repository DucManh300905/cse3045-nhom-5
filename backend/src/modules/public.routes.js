const express = require('express');
const { param, query } = require('express-validator');

const { validate } = require('../middlewares/validate.middleware');
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
        oneOf('sort', Object.keys(restaurantPublic.SORTS)),
        ...paginationRules
    ],
    validate,
    restaurantPublic.listRestaurants
);

const idOrSlugRule = param('idOrSlug').isLength({ max: 100 }).withMessage('Restaurant not found');

restaurantRouter.get('/:idOrSlug', [idOrSlugRule], validate, restaurantPublic.getRestaurant);
restaurantRouter.get('/:idOrSlug/menu', [idOrSlugRule], validate, restaurantPublic.getRestaurantMenu);

// ---- /api/menu-items ----

menuItemRouter.get(
    '/',
    [
        searchRule,
        oneOf('type', MENU_ITEM_TYPES),
        query('restaurant').optional().isMongoId().withMessage('restaurant is not valid'),
        booleanQuery('inStock'),
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
