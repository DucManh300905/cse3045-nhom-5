const mongoose = require('mongoose');

const Review = require('./review.model');
const Order = require('../order/order.model');
const Restaurant = require('../restaurant/restaurant.model');
const AppError = require('../../utils/AppError');

// Xếp hạng có trọng số (Bayes): score = (n × avg + W × C) / (n + W)
// C = điểm "trung bình giả định" của một quán chưa ai đánh giá, W = số lượt "ảo" ở mức C.
// Quán mới (n = 0) đứng ở 3.5 — giữa bảng; 1 lượt 5★ chỉ lên 3.75; 200 lượt 4.8★ ≈ 4.77.
const PRIOR_MEAN = 3.5;
const PRIOR_WEIGHT = 5;

const round = (n, digits) => Math.round(n * 10 ** digits) / 10 ** digits;

/** Tính lại điểm của quán từ các đánh giá đang hiện (gọi sau mọi thay đổi đánh giá) */
const recomputeRating = async (restaurantId) => {
    const [stats] = await Review.aggregate([
        { $match: { restaurant: new mongoose.Types.ObjectId(String(restaurantId)), isHidden: false } },
        { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);
    const count = stats?.count ?? 0;
    const avg = stats?.avg ?? 0;

    await Restaurant.updateOne(
        { _id: restaurantId },
        {
            $set: {
                ratingAvg: round(avg, 1),
                ratingCount: count,
                ratingScore: round((count * avg + PRIOR_WEIGHT * PRIOR_MEAN) / (count + PRIOR_WEIGHT), 4)
            }
        }
    );
};

/** Số lượt theo từng mức sao (đánh giá đang hiện): { 1: n, ..., 5: n } */
const ratingDistribution = async (restaurantId) => {
    const rows = await Review.aggregate([
        { $match: { restaurant: new mongoose.Types.ObjectId(String(restaurantId)), isHidden: false } },
        { $group: { _id: '$rating', count: { $sum: 1 } } }
    ]);
    const result = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    rows.forEach((r) => {
        result[r._id] = r.count;
    });
    return result;
};

// Chỉ khách đã nhận ít nhất 1 đơn hoàn thành của quán mới được đánh giá (chống đánh giá ảo)
const hasCompletedOrder = (customerId, restaurantId) =>
    Order.exists({ customer: customerId, restaurant: restaurantId, status: 'COMPLETED' });

/**
 * Viết mới hoặc sửa đánh giá của chính mình. Mỗi khách 1 đánh giá / quán.
 * @returns { review, created }
 */
const upsertMyReview = async ({ customerId, restaurantId, rating, comment }) => {
    if (!(await hasCompletedOrder(customerId, restaurantId))) {
        throw new AppError(403, 'REVIEW_NOT_ALLOWED', 'Only customers with a completed order can review this restaurant');
    }

    const existing = await Review.findOne({ restaurant: restaurantId, customer: customerId });
    const review = existing ?? new Review({ restaurant: restaurantId, customer: customerId });

    review.rating = rating;
    review.comment = comment || undefined;
    await review.save();
    await recomputeRating(restaurantId);

    return { review, created: !existing };
};

const deleteMyReview = async ({ customerId, restaurantId }) => {
    const review = await Review.findOneAndDelete({ restaurant: restaurantId, customer: customerId });

    if (!review) {
        throw new AppError(404, 'NOT_FOUND', 'Review not found');
    }

    await recomputeRating(restaurantId);
    return review;
};

/** Ẩn / hiện đánh giá (admin). Đổi điểm quán ngay. */
const setHidden = async ({ reviewId, hidden, reason }) => {
    const review = await Review.findById(reviewId);

    if (!review) {
        throw new AppError(404, 'NOT_FOUND', 'Review not found');
    }

    const before = review.isHidden;
    review.isHidden = hidden;
    review.hiddenReason = hidden ? reason : undefined;
    await review.save();
    await recomputeRating(review.restaurant);

    return { review, before };
};

/** "Nguyễn Văn An" -> "An N." — tên hiện công khai, không lộ họ tên đầy đủ */
const displayName = (fullName = '') => {
    const words = fullName.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return 'Khách hàng';
    if (words.length === 1) return words[0];
    return `${words[words.length - 1]} ${words[0].charAt(0).toUpperCase()}.`;
};

module.exports = {
    PRIOR_MEAN,
    PRIOR_WEIGHT,
    recomputeRating,
    ratingDistribution,
    hasCompletedOrder,
    upsertMyReview,
    deleteMyReview,
    setHidden,
    displayName
};
