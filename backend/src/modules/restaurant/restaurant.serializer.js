const { isWithinOpeningHours, canAcceptOrders } = require('../../utils/openingHours');

// Dùng cho chủ quán và admin.
// Không bao giờ trả đường dẫn file giấy tờ (dữ liệu nhạy cảm).
// documentUrl: hàm tạo link xem giấy tờ qua API (chỉ admin dùng).
const toRestaurantResponse = (restaurant, { documentUrl } = {}) => {
    const data = restaurant.toJSON();

    delete data.nameNoAccent;
    data.documents = restaurant.documents.map((d) => ({
        type: d.type,
        originalName: d.originalName,
        mimeType: d.mimeType,
        uploadedAt: d.uploadedAt,
        ...(documentUrl && { url: documentUrl(restaurant, d) })
    }));
    data.isOpenNow = isWithinOpeningHours(restaurant.openingHours);
    data.canAcceptOrders = canAcceptOrders(restaurant);

    return data;
};

// Dùng cho khách (API public): chỉ liệt kê field được phép, không lộ giấy tờ, hoa hồng, chủ quán...
const toPublicRestaurantResponse = (restaurant) => ({
    id: restaurant._id,
    name: restaurant.name,
    slug: restaurant.slug,
    description: restaurant.description,
    address: restaurant.address,
    phone: restaurant.phone,
    location: restaurant.location?.coordinates ? restaurant.location : undefined,
    logoUrl: restaurant.logoUrl,
    coverUrl: restaurant.coverUrl,
    cuisineTypes: restaurant.cuisineTypes,
    openingHours: restaurant.openingHours.map(({ dayOfWeek, open, close }) => ({ dayOfWeek, open, close })),
    minOrderAmount: restaurant.minOrderAmount,
    deliveryRadiusKm: restaurant.deliveryRadiusKm,
    avgPrepMinutes: restaurant.avgPrepMinutes,
    ratingAvg: restaurant.ratingAvg,
    ratingCount: restaurant.ratingCount,
    isOpenNow: isWithinOpeningHours(restaurant.openingHours),
    canAcceptOrders: canAcceptOrders(restaurant)
});

// Bản rút gọn đi kèm từng món trong kết quả tìm món
const toRestaurantSummary = (restaurant) => ({
    id: restaurant._id,
    name: restaurant.name,
    slug: restaurant.slug,
    isOpenNow: isWithinOpeningHours(restaurant.openingHours),
    canAcceptOrders: canAcceptOrders(restaurant)
});

module.exports = {
    toRestaurantResponse,
    toPublicRestaurantResponse,
    toRestaurantSummary
};
