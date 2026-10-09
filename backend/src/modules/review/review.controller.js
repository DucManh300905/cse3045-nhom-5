const Review = require('./review.model');
const Restaurant = require('../restaurant/restaurant.model');
const { findApprovedRestaurant } = require('../restaurant/restaurant.public.controller');
const {
    ratingDistribution,
    hasCompletedOrder,
    upsertMyReview,
    deleteMyReview,
    setHidden,
    displayName
} = require('./review.service');
const notifications = require('../notification/notification.service');
const { recordAudit } = require('../audit/audit.service');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { getPagination, paginate, escapeRegex } = require('../../utils/pagination');

// Ai mở trang quán cũng xem được: chỉ tên rút gọn của khách, không lộ id / email / SĐT
const toPublicReview = (review) => ({
    id: review._id,
    rating: review.rating,
    comment: review.comment,
    author: displayName(review.customer?.fullName),
    reply: review.reply?.content ? review.reply : undefined,
    createdAt: review.createdAt,
    updatedAt: review.updatedAt
});

// ======================= Khách / công khai =======================

// GET /restaurants/:idOrSlug/reviews?rating=&page=&limit= — chỉ đánh giá đang hiện, mới sửa nhất trước
const listRestaurantReviews = asyncHandler(async (req, res) => {
    const restaurant = await findApprovedRestaurant(req.params.idOrSlug);
    const filter = { restaurant: restaurant._id, isHidden: false };

    if (req.query.rating) {
        filter.rating = Number(req.query.rating);
    }

    const [result, distribution] = await Promise.all([
        paginate(Review, filter, getPagination(req), {
            sort: { updatedAt: -1, _id: -1 },
            populate: { path: 'customer', select: 'fullName' }
        }),
        ratingDistribution(restaurant._id)
    ]);

    return res.status(200).json({
        success: true,
        data: {
            ...result,
            items: result.items.map(toPublicReview),
            summary: { ratingAvg: restaurant.ratingAvg, ratingCount: restaurant.ratingCount, distribution }
        }
    });
});

// GET /restaurants/:idOrSlug/reviews/me — đánh giá của tôi + tôi có được đánh giá không
const getMyReview = asyncHandler(async (req, res) => {
    const restaurant = await findApprovedRestaurant(req.params.idOrSlug);
    const [review, canReview] = await Promise.all([
        Review.findOne({ restaurant: restaurant._id, customer: req.user.userId }).populate('customer', 'fullName'),
        hasCompletedOrder(req.user.userId, restaurant._id)
    ]);

    return res.status(200).json({
        success: true,
        data: {
            canReview: Boolean(canReview),
            review: review && { ...toPublicReview(review), isHidden: review.isHidden }
        }
    });
});

// PUT /restaurants/:idOrSlug/reviews/me { rating 1-5, comment? } — viết mới hoặc sửa
const putMyReview = asyncHandler(async (req, res) => {
    const restaurant = await findApprovedRestaurant(req.params.idOrSlug);
    const { review, created } = await upsertMyReview({
        customerId: req.user.userId,
        restaurantId: restaurant._id,
        rating: req.body.rating,
        comment: req.body.comment
    });

    await notifications.reviewPosted(review, created);
    await review.populate('customer', 'fullName');

    return res.status(created ? 201 : 200).json({
        success: true,
        message: created ? 'Review created' : 'Review updated',
        data: { ...toPublicReview(review), isHidden: review.isHidden }
    });
});

// DELETE /restaurants/:idOrSlug/reviews/me
const removeMyReview = asyncHandler(async (req, res) => {
    const restaurant = await findApprovedRestaurant(req.params.idOrSlug);
    await deleteMyReview({ customerId: req.user.userId, restaurantId: restaurant._id });

    return res.status(200).json({ success: true, message: 'Review deleted' });
});

// ======================= Chủ quán =======================

// GET /merchant/reviews?rating=&replied=true|false&page=&limit= — kể cả đánh giá bị admin ẩn (có cờ)
const listMerchantReviews = asyncHandler(async (req, res) => {
    const filter = { restaurant: req.restaurant._id };

    if (req.query.rating) {
        filter.rating = Number(req.query.rating);
    }
    if (req.query.replied === 'true') {
        filter['reply.content'] = { $exists: true, $ne: '' };
    }
    if (req.query.replied === 'false') {
        filter['reply.content'] = { $in: [null, ''] };
    }

    const [result, distribution] = await Promise.all([
        paginate(Review, filter, getPagination(req), {
            sort: { updatedAt: -1, _id: -1 },
            populate: { path: 'customer', select: 'fullName' }
        }),
        ratingDistribution(req.restaurant._id)
    ]);

    return res.status(200).json({
        success: true,
        data: {
            ...result,
            items: result.items.map((r) => ({ ...toPublicReview(r), isHidden: r.isHidden, hiddenReason: r.hiddenReason })),
            summary: { ratingAvg: req.restaurant.ratingAvg, ratingCount: req.restaurant.ratingCount, distribution }
        }
    });
});

// PUT /merchant/reviews/:id/reply { content } — trả lời / sửa trả lời (BR-61); đánh giá quán khác -> 404
const replyReview = asyncHandler(async (req, res) => {
    const review = await Review.findOneAndUpdate(
        { _id: req.params.id, restaurant: req.restaurant._id },
        { $set: { reply: { content: req.body.content, repliedAt: new Date() } } },
        { returnDocument: 'after' }
    ).populate('customer', 'fullName');

    if (!review) {
        throw new AppError(404, 'NOT_FOUND', 'Review not found');
    }

    return res.status(200).json({ success: true, data: { ...toPublicReview(review), isHidden: review.isHidden } });
});

// ======================= Admin =======================

// GET /admin/reviews?hidden=true|false&q=<tên quán>&page=&limit=
const listAdminReviews = asyncHandler(async (req, res) => {
    const filter = {};

    if (req.query.hidden) {
        filter.isHidden = req.query.hidden === 'true';
    }
    if (req.query.q) {
        const ids = await Restaurant.find({ name: new RegExp(escapeRegex(req.query.q), 'i') }).distinct('_id');
        filter.restaurant = { $in: ids };
    }

    const result = await paginate(Review, filter, getPagination(req), {
        sort: { updatedAt: -1, _id: -1 },
        populate: [
            { path: 'customer', select: 'fullName email phone' },
            { path: 'restaurant', select: 'name slug' }
        ]
    });

    return res.status(200).json({
        success: true,
        data: {
            ...result,
            items: result.items.map((r) => ({
                ...toPublicReview(r),
                isHidden: r.isHidden,
                hiddenReason: r.hiddenReason,
                customer: r.customer && { id: r.customer._id, fullName: r.customer.fullName, email: r.customer.email },
                restaurant: r.restaurant && { id: r.restaurant._id, name: r.restaurant.name, slug: r.restaurant.slug }
            }))
        }
    });
});

// PATCH /admin/reviews/:id/hide { hidden: true|false, reason? } — ghi audit log
const hideReview = asyncHandler(async (req, res) => {
    const { review, before } = await setHidden({ reviewId: req.params.id, hidden: req.body.hidden, reason: req.body.reason });

    await recordAudit(req, {
        action: req.body.hidden ? 'REVIEW_HIDE' : 'REVIEW_UNHIDE',
        targetType: 'Review',
        targetId: review._id,
        before: { isHidden: before },
        after: { isHidden: review.isHidden },
        note: req.body.reason
    });

    await review.populate('customer', 'fullName');
    return res.status(200).json({
        success: true,
        data: { ...toPublicReview(review), isHidden: review.isHidden, hiddenReason: review.hiddenReason }
    });
});

module.exports = {
    listRestaurantReviews,
    getMyReview,
    putMyReview,
    removeMyReview,
    listMerchantReviews,
    replyReview,
    listAdminReviews,
    hideReview
};
