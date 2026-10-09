const MenuCategory = require('./menuCategory.model');
const MenuItem = require('./menuItem.model');
const Restaurant = require('../restaurant/restaurant.model');
const { toPublicMenuItemResponse } = require('./menu.serializer');
const { toRestaurantSummary } = require('../restaurant/restaurant.serializer');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { removeAccents } = require('../../utils/text');
const { getPagination, paginate, escapeRegex } = require('../../utils/pagination');

const RESTAURANT_FIELDS = 'name slug status isAcceptingOrders openingHours';

const SORTS = {
    popular: { soldCount: -1, _id: 1 },
    price: { basePrice: 1, _id: 1 },
    '-price': { basePrice: -1, _id: 1 },
    newest: { createdAt: -1, _id: 1 }
};

// Khách chỉ thấy món: chưa xóa + quán đã duyệt + danh mục đang hiện
const visibleItemFilter = async ({ minRating } = {}) => {
    const restaurantFilter = { status: 'APPROVED' };
    // Lọc món của quán từ N★ trở lên (quán đã có đánh giá)
    if (minRating) {
        Object.assign(restaurantFilter, { ratingAvg: { $gte: Number(minRating) }, ratingCount: { $gte: 1 } });
    }

    const [approvedIds, hiddenCategoryIds] = await Promise.all([
        Restaurant.find(restaurantFilter).distinct('_id'),
        MenuCategory.find({ isActive: false }).distinct('_id')
    ]);

    return {
        isDeleted: false,
        restaurant: { $in: approvedIds },
        category: { $nin: hiddenCategoryIds }
    };
};

const withRestaurant = (item) => toPublicMenuItemResponse(item, toRestaurantSummary(item.restaurant));

// GET /menu-items?q=&type=FOOD|DRINK&restaurant=&inStock=true&sort=popular|price|-price|newest&page=&limit=
const listMenuItems = asyncHandler(async (req, res) => {
    const { q, type, restaurant, inStock, minRating, sort = 'popular' } = req.query;
    const filter = await visibleItemFilter({ minRating });

    if (q) {
        // Tìm không dấu: "com ga" khớp "Cơm gà"
        filter.nameNoAccent = new RegExp(escapeRegex(removeAccents(q).toLowerCase().trim()));
    }

    if (type) {
        filter.type = type;
    }

    if (restaurant) {
        filter.restaurant = { $in: filter.restaurant.$in.filter((id) => String(id) === restaurant) };
    }

    // Còn hàng: đang bật + chưa bán hết suất hôm nay (BR-23)
    if (inStock === 'true') {
        filter.isAvailable = true;
        filter.$or = [{ dailyLimit: null }, { $expr: { $lt: ['$soldToday', '$dailyLimit'] } }];
    }

    const result = await paginate(MenuItem, filter, getPagination(req), {
        sort: SORTS[sort],
        populate: { path: 'restaurant', select: RESTAURANT_FIELDS }
    });

    return res.status(200).json({
        success: true,
        data: { ...result, items: result.items.map(withRestaurant) }
    });
});

// GET /menu-items/:id
const getMenuItem = asyncHandler(async (req, res) => {
    const item = await MenuItem.findOne({ _id: req.params.id, ...(await visibleItemFilter()) }).populate(
        'restaurant',
        RESTAURANT_FIELDS
    );

    if (!item) {
        throw new AppError(404, 'NOT_FOUND', 'Menu item not found');
    }

    return res.status(200).json({
        success: true,
        data: withRestaurant(item)
    });
});

module.exports = {
    SORTS,
    listMenuItems,
    getMenuItem
};
