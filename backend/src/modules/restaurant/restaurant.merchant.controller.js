const path = require('path');

const Restaurant = require('./restaurant.model');
const notifications = require('../notification/notification.service');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { slugify } = require('../../utils/text');
const { toRestaurantResponse } = require('./restaurant.serializer');
const { removeFile } = require('../../middlewares/upload.middleware');
const { PRIVATE_DIR, publicFileUrl, publicUrlToPath } = require('../../config/storage');

// Giấy tờ bắt buộc trước khi nộp hồ sơ — nhóm chốt lại theo docs/project.md mục 10
const REQUIRED_DOCUMENTS = ['BUSINESS_LICENSE', 'ID_CARD'];

// Field chủ quán được sửa. status, commissionRate, rating... chỉ hệ thống/admin sửa.
const EDITABLE_FIELDS = [
    'name',
    'description',
    'address',
    'phone',
    'cuisineTypes',
    'minOrderAmount',
    'deliveryRadiusKm',
    'avgPrepMinutes'
];

const applyLocation = (restaurant, { lat, lng }) => {
    if (lat !== undefined && lng !== undefined) {
        restaurant.location = { type: 'Point', coordinates: [lng, lat] };
    }
};

// Slug duy nhất: "com-ga-hoa-lac", trùng thì thêm hậu tố ngẫu nhiên
const generateSlug = async (name) => {
    const base = slugify(name);
    let slug = base;

    while (await Restaurant.exists({ slug })) {
        slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    }

    return slug;
};

// POST /merchant/restaurant
const createRestaurant = asyncHandler(async (req, res) => {
    if (await Restaurant.exists({ owner: req.user.userId })) {
        throw new AppError(409, 'RESTAURANT_ALREADY_EXISTS', 'You already have a restaurant');
    }

    const restaurant = new Restaurant({ owner: req.user.userId, status: 'DRAFT' });

    EDITABLE_FIELDS.forEach((field) => {
        if (req.body[field] !== undefined) {
            restaurant[field] = req.body[field];
        }
    });
    applyLocation(restaurant, req.body);
    restaurant.slug = await generateSlug(restaurant.name);

    try {
        await restaurant.save();
    } catch (error) {
        // Hai request tạo quán gần như đồng thời -> unique index owner chặn
        if (error.code === 11000 && error.keyPattern?.owner) {
            throw new AppError(409, 'RESTAURANT_ALREADY_EXISTS', 'You already have a restaurant');
        }
        throw error;
    }

    return res.status(201).json({
        success: true,
        message: 'Restaurant created successfully',
        data: toRestaurantResponse(restaurant)
    });
});

// GET /merchant/restaurant
const getMyRestaurant = asyncHandler(async (req, res) => {
    return res.status(200).json({
        success: true,
        data: toRestaurantResponse(req.restaurant)
    });
});

// PUT /merchant/restaurant
const updateMyRestaurant = asyncHandler(async (req, res) => {
    const { restaurant } = req;

    EDITABLE_FIELDS.forEach((field) => {
        if (req.body[field] !== undefined) {
            restaurant[field] = req.body[field];
        }
    });
    applyLocation(restaurant, req.body);

    // TODO (BR-14): quán đã APPROVED sửa tên/địa chỉ -> ghi audit log khi có module auditLogs
    await restaurant.save();

    return res.status(200).json({
        success: true,
        message: 'Restaurant updated successfully',
        data: toRestaurantResponse(restaurant)
    });
});

// PUT /merchant/restaurant/opening-hours — ghi đè toàn bộ
const updateOpeningHours = asyncHandler(async (req, res) => {
    const { restaurant } = req;

    restaurant.openingHours = [...req.body.openingHours].sort(
        (a, b) => a.dayOfWeek - b.dayOfWeek || a.open.localeCompare(b.open)
    );
    await restaurant.save();

    return res.status(200).json({
        success: true,
        message: 'Opening hours updated successfully',
        data: toRestaurantResponse(restaurant)
    });
});

// POST /merchant/restaurant/images/:kind  (kind = logo | cover), multipart field "image"
const uploadImage = asyncHandler(async (req, res) => {
    const { restaurant } = req;
    const field = req.params.kind === 'logo' ? 'logoUrl' : 'coverUrl';
    const oldPath = publicUrlToPath(restaurant[field]);

    restaurant[field] = publicFileUrl('restaurants', req.file.filename);
    await restaurant.save();
    removeFile(oldPath);

    return res.status(200).json({
        success: true,
        message: 'Image uploaded successfully',
        data: toRestaurantResponse(restaurant)
    });
});

// POST /merchant/restaurant/documents — multipart: type + file. Cùng loại thì thay file cũ.
const uploadDocument = asyncHandler(async (req, res) => {
    const { restaurant } = req;
    const { type } = req.body;

    if (!Restaurant.DOCUMENT_TYPES.includes(type)) {
        removeFile(req.file.path);
        throw new AppError(400, 'VALIDATION_ERROR', `type must be one of ${Restaurant.DOCUMENT_TYPES.join(', ')}`);
    }

    const old = restaurant.documents.find((d) => d.type === type);
    const oldPath = old && path.join(PRIVATE_DIR, old.fileKey);

    restaurant.documents = restaurant.documents.filter((d) => d.type !== type);
    restaurant.documents.push({
        type,
        fileKey: `documents/${req.file.filename}`,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype
    });
    await restaurant.save();
    removeFile(oldPath);

    return res.status(200).json({
        success: true,
        message: 'Document uploaded successfully',
        data: toRestaurantResponse(restaurant)
    });
});

// POST /merchant/restaurant/submit — DRAFT | REJECTED -> SUBMITTED (BR-11)
const submitRestaurant = asyncHandler(async (req, res) => {
    const { restaurant } = req;

    if (!['DRAFT', 'REJECTED'].includes(restaurant.status)) {
        throw new AppError(
            409,
            'INVALID_STATUS_TRANSITION',
            `Cannot submit a restaurant with status ${restaurant.status}`
        );
    }

    const missing = [];

    if (restaurant.openingHours.length === 0) {
        missing.push({ field: 'openingHours', msg: 'Opening hours are required' });
    }

    REQUIRED_DOCUMENTS.forEach((type) => {
        if (!restaurant.documents.some((d) => d.type === type)) {
            missing.push({ field: 'documents', msg: `Document ${type} is required` });
        }
    });

    if (missing.length > 0) {
        throw new AppError(422, 'PROFILE_INCOMPLETE', 'Restaurant profile is incomplete', missing);
    }

    restaurant.status = 'SUBMITTED';
    restaurant.submittedAt = new Date();
    restaurant.rejectReason = undefined;
    await restaurant.save();

    // Báo các admin có hồ sơ mới cần duyệt
    await notifications.restaurantSubmitted(restaurant);

    return res.status(200).json({
        success: true,
        message: 'Restaurant submitted for review',
        data: toRestaurantResponse(restaurant)
    });
});

// PATCH /merchant/restaurant/accepting-orders — chỉ quán APPROVED (BR-13)
const setAcceptingOrders = asyncHandler(async (req, res) => {
    const { restaurant } = req;

    restaurant.isAcceptingOrders = req.body.isAcceptingOrders;
    await restaurant.save();

    return res.status(200).json({
        success: true,
        message: restaurant.isAcceptingOrders ? 'Restaurant is accepting orders' : 'Restaurant stopped accepting orders',
        data: toRestaurantResponse(restaurant)
    });
});

module.exports = {
    REQUIRED_DOCUMENTS,
    createRestaurant,
    getMyRestaurant,
    updateMyRestaurant,
    updateOpeningHours,
    uploadImage,
    uploadDocument,
    submitRestaurant,
    setAcceptingOrders
};
