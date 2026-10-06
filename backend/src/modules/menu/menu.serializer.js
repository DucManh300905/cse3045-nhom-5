// Số suất còn lại hôm nay; null = không giới hạn (BR-23)
const remainingToday = (item) =>
    item.dailyLimit === null || item.dailyLimit === undefined
        ? null
        : Math.max(0, item.dailyLimit - item.soldToday);

// Khách có đặt được món này không (chưa tính giờ mở cửa của quán)
const isOrderable = (item) => item.isAvailable && !item.isDeleted && remainingToday(item) !== 0;

const toMenuItemResponse = (item) => {
    const data = item.toJSON();

    delete data.nameNoAccent;
    delete data.isDeleted;
    data.remainingToday = remainingToday(item);
    data.isOrderable = isOrderable(item);

    return data;
};

// Cho khách: bỏ số liệu nội bộ (soldToday, dailyLimit, timestamps).
// restaurantSummary: thông tin quán rút gọn đi kèm (kết quả tìm món toàn hệ thống).
const toPublicMenuItemResponse = (item, restaurantSummary) => {
    const data = toMenuItemResponse(item);

    delete data.soldToday;
    delete data.dailyLimit;
    delete data.createdAt;
    delete data.updatedAt;

    if (restaurantSummary) {
        data.restaurant = restaurantSummary;
    }

    return data;
};

module.exports = {
    remainingToday,
    isOrderable,
    toMenuItemResponse,
    toPublicMenuItemResponse
};
