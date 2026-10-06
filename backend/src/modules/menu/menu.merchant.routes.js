const express = require('express');
const { body, param, query } = require('express-validator');

const { authenticate } = require('../../middlewares/auth.middleware');
const { authorizeRoles } = require('../../middlewares/role.middleware');
const { validate } = require('../../middlewares/validate.middleware');
const {
    loadMyRestaurant,
    requireNotBlockedRestaurant
} = require('../../middlewares/restaurant.middleware');
const { menuItemImageUpload } = require('../../middlewares/upload.middleware');
const { textRule, moneyRule } = require('../../utils/validationRules');
const { MENU_ITEM_TYPES } = require('./menuItem.model');
const {
    listCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    reorderCategories
} = require('./category.merchant.controller');
const {
    listMenuItems,
    getMenuItem,
    createMenuItem,
    updateMenuItem,
    updateAvailability,
    uploadMenuItemImage,
    deleteMenuItem
} = require('./menuItem.merchant.controller');

// Chủ quán quản lý menu của quán mình. Quán DRAFT vẫn soạn menu được; quán bị khóa thì không sửa.
const ownerOnly = [authenticate, authorizeRoles('RESTAURANT_OWNER'), loadMyRestaurant];
const canEdit = requireNotBlockedRestaurant;

const idRule = (message) => param('id').isMongoId().withMessage(message);
const booleanRule = (field) =>
    body(field).optional().isBoolean({ strict: true }).withMessage(`${field} must be true or false`).toBoolean();

// ================= /api/merchant/categories =================

const categoryRouter = express.Router();
categoryRouter.use(...ownerOnly);

categoryRouter.get('/', listCategories);

categoryRouter.post('/', canEdit, [textRule('name', 100), booleanRule('isActive')], validate, createCategory);

// Đặt trước '/:id' để "reorder" không bị hiểu là id
categoryRouter.patch(
    '/reorder',
    canEdit,
    [
        body('ids').isArray({ min: 1 }).withMessage('ids must be a non-empty array'),
        body('ids.*').isMongoId().withMessage('ids must contain category ids')
    ],
    validate,
    reorderCategories
);

categoryRouter.put(
    '/:id',
    canEdit,
    [idRule('Category not found'), textRule('name', 100).optional(), booleanRule('isActive')],
    validate,
    updateCategory
);

categoryRouter.delete('/:id', canEdit, [idRule('Category not found')], validate, deleteCategory);

// ================= /api/merchant/menu-items =================

const variantRules = [
    body('variants').optional().isArray({ max: 10 }).withMessage('variants must be an array (max 10)'),
    body('variants.*.id').optional().isMongoId(),
    textRule('variants.*.name', 50),
    moneyRule('variants.*.price'),
    booleanRule('variants.*.isDefault')
];

// null = không giới hạn suất
const dailyLimitRule = body('dailyLimit')
    .optional({ values: 'undefined' })
    .custom((value) => value === null || (Number.isInteger(value) && value >= 0 && value <= 10000))
    .withMessage('dailyLimit must be null or an integer between 0 and 10000');

const optionGroupRules = [
    body('optionGroups').optional().isArray({ max: 10 }).withMessage('optionGroups must be an array (max 10)'),
    body('optionGroups.*.id').optional().isMongoId(),
    textRule('optionGroups.*.name', 50),
    body('optionGroups.*.minSelect')
        .optional()
        .isInt({ min: 0, max: 30 })
        .withMessage('minSelect must be between 0 and 30')
        .toInt(),
    body('optionGroups.*.maxSelect')
        .optional()
        .isInt({ min: 1, max: 30 })
        .withMessage('maxSelect must be between 1 and 30')
        .toInt(),
    body('optionGroups.*.options')
        .isArray({ min: 1, max: 30 })
        .withMessage('Each option group needs 1-30 options'),
    body('optionGroups.*.options.*.id').optional().isMongoId(),
    textRule('optionGroups.*.options.*.name', 50),
    moneyRule('optionGroups.*.options.*.price', 1000000),
    booleanRule('optionGroups.*.options.*.isAvailable')
];

const menuItemRules = (isCreate) => {
    const required = (rule) => (isCreate ? rule : rule.optional());

    return [
        required(body('category').isMongoId().withMessage('category is required')),
        required(textRule('name', 100)),
        body('description').optional().isString().trim().isLength({ max: 1000 }),
        body('type').optional().isIn(MENU_ITEM_TYPES).withMessage(`type must be one of ${MENU_ITEM_TYPES.join(', ')}`),
        body('tags').optional().isArray({ max: 10 }).withMessage('tags must be an array (max 10)'),
        body('tags.*').isString().trim().notEmpty().isLength({ max: 30 }),
        moneyRule('basePrice').optional(),
        // Món không có biến thể thì bắt buộc có basePrice
        ...(isCreate
            ? [
                  body('basePrice')
                      .custom((value, { req }) => value !== undefined || req.body.variants?.length > 0)
                      .withMessage('basePrice is required when there are no variants')
              ]
            : []),
        body('prepMinutes')
            .optional()
            .isInt({ min: 1, max: 180 })
            .withMessage('prepMinutes must be between 1 and 180')
            .toInt(),
        booleanRule('isAvailable'),
        dailyLimitRule,
        ...variantRules,
        ...optionGroupRules
    ];
};

const menuItemRouter = express.Router();
menuItemRouter.use(...ownerOnly);

menuItemRouter.get(
    '/',
    [
        query('category').optional().isMongoId().withMessage('category is not valid'),
        query('q').optional().isString().isLength({ max: 100 })
    ],
    validate,
    listMenuItems
);

menuItemRouter.post('/', canEdit, menuItemRules(true), validate, createMenuItem);

menuItemRouter.get('/:id', [idRule('Menu item not found')], validate, getMenuItem);

menuItemRouter.put('/:id', canEdit, [idRule('Menu item not found'), ...menuItemRules(false)], validate, updateMenuItem);

menuItemRouter.patch(
    '/:id/availability',
    canEdit,
    [idRule('Menu item not found'), booleanRule('isAvailable'), dailyLimitRule],
    validate,
    updateAvailability
);

menuItemRouter.post(
    '/:id/image',
    canEdit,
    [idRule('Menu item not found')],
    validate,
    menuItemImageUpload,
    uploadMenuItemImage
);

menuItemRouter.delete('/:id', canEdit, [idRule('Menu item not found')], validate, deleteMenuItem);

module.exports = {
    categoryRouter,
    menuItemRouter
};
