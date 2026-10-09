const mongoose = require('mongoose');

const Restaurant = require('./restaurant.model');
const MenuCategory = require('../menu/menuCategory.model');
const MenuItem = require('../menu/menuItem.model');
const { toPublicRestaurantResponse } = require('./restaurant.serializer');
const { toPublicMenuItemResponse } = require('../menu/menu.serializer');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { removeAccents } = require('../../utils/text');
const { toLocalParts } = require('../../utils/openingHours');
const { getPagination, paginate, escapeRegex } = require('../../utils/pagination');

const SORTS = {
    // Điểm có trọng số (review.service): quán ít đánh giá không vượt quán nhiều đánh giá tốt
    rating: { ratingScore: -1, ratingCount: -1, _id: 1 },
    name: { nameNoAccent: 1, _id: 1 },
    newest: { approvedAt: -1, _id: 1 }
};

// Chỉ quán đã duyệt mới hiện với khách (BR-12)
const findApprovedRestaurant = async (idOrSlug) => {
    const filter = mongoose.isValidObjectId(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };
    const restaurant = await Restaurant.findOne({ ...filter, status: 'APPROVED' });

    if (!restaurant) {
        throw new AppError(404, 'NOT_FOUND', 'Restaurant not found');
    }

    return restaurant;
};

// GET /restaurants?q=&cuisine=&isOpen=true&sort=rating|name|newest&page=&limit=
const listRestaurants = asyncHandler(async (req, res) => {
    const filter = { status: 'APPROVED' };
    const { q, cuisine, isOpen, minRating, sort = 'rating' } = req.query;

    if (q) {
        const keyword = escapeRegex(removeAccents(q).toLowerCase().trim());
        filter.$or = [{ nameNoAccent: new RegExp(keyword) }, { name: new RegExp(escapeRegex(q.trim()), 'i') }];
    }

    if (cuisine) {
        filter.cuisineTypes = cuisine;
    }

    // Lọc "từ 4★ trở lên": chỉ quán đã có đánh giá
    if (minRating) {
        filter.ratingAvg = { $gte: Number(minRating) };
        filter.ratingCount = { $gte: 1 };
    }

    // Đang nhận đơn: bật nhận đơn + có khung giờ chứa thời điểm hiện tại (giờ VN, BR-13)
    if (isOpen === 'true') {
        const { dayOfWeek, time } = toLocalParts(new Date());

        filter.isAcceptingOrders = true;
        filter.openingHours = { $elemMatch: { dayOfWeek, open: { $lte: time }, close: { $gt: time } } };
    }

    const result = await paginate(Restaurant, filter, getPagination(req), { sort: SORTS[sort] });

    return res.status(200).json({
        success: true,
        data: { ...result, items: result.items.map(toPublicRestaurantResponse) }
    });
});

// GET /restaurants/:idOrSlug
const getRestaurant = asyncHandler(async (req, res) => {
    const restaurant = await findApprovedRestaurant(req.params.idOrSlug);

    return res.status(200).json({
        success: true,
        data: toPublicRestaurantResponse(restaurant)
    });
});

// GET /restaurants/:idOrSlug/menu — danh mục đang hiện + món chưa xóa (món hết vẫn hiện, isOrderable=false)
const getRestaurantMenu = asyncHandler(async (req, res) => {
    const restaurant = await findApprovedRestaurant(req.params.idOrSlug);

    const [categories, items] = await Promise.all([
        MenuCategory.find({ restaurant: restaurant._id, isActive: true }).sort({ sortOrder: 1, createdAt: 1 }),
        MenuItem.find({ restaurant: restaurant._id, isDeleted: false }).sort({ sortOrder: 1, createdAt: 1 })
    ]);

    const itemsByCategory = new Map(categories.map((c) => [String(c._id), []]));
    items.forEach((item) => {
        itemsByCategory.get(String(item.category))?.push(toPublicMenuItemResponse(item));
    });

    return res.status(200).json({
        success: true,
        data: {
            restaurant: toPublicRestaurantResponse(restaurant),
            categories: categories
                .map((c) => ({ id: c._id, name: c.name, items: itemsByCategory.get(String(c._id)) }))
                .filter((c) => c.items.length > 0)
        }
    });
});

module.exports = {
    SORTS,
    findApprovedRestaurant,
    listRestaurants,
    getRestaurant,
    getRestaurantMenu
};
