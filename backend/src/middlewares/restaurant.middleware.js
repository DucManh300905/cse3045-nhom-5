const Restaurant = require('../modules/restaurant/restaurant.model');

// Dùng cho route /merchant/*: tìm quán của chủ đang đăng nhập -> req.restaurant
// (đặt sau authenticate + authorizeRoles('RESTAURANT_OWNER'))
const loadMyRestaurant = async (req, res, next) => {
    try {
        const restaurant = await Restaurant.findOne({ owner: req.user.userId });

        if (!restaurant) {
            return res.status(404).json({
                success: false,
                message: 'Restaurant not found',
                code: 'NOT_FOUND'
            });
        }

        req.restaurant = restaurant;
        next();
    } catch (error) {
        next(error);
    }
};

// Thao tác chỉ dành cho quán đã duyệt (BR-12)
const requireApprovedRestaurant = (req, res, next) => {
    if (req.restaurant?.status !== 'APPROVED') {
        return res.status(422).json({
            success: false,
            message: 'Restaurant is not approved',
            code: 'RESTAURANT_NOT_APPROVED'
        });
    }

    next();
};

// Quán bị admin khóa thì không được sửa gì (hồ sơ, menu...)
const requireNotBlockedRestaurant = (req, res, next) => {
    if (req.restaurant?.status === 'BLOCKED') {
        return res.status(403).json({
            success: false,
            message: 'Your restaurant is blocked',
            code: 'RESTAURANT_BLOCKED'
        });
    }

    next();
};

module.exports = {
    loadMyRestaurant,
    requireApprovedRestaurant,
    requireNotBlockedRestaurant
};
