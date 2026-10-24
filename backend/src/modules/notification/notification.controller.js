const mongoose = require('mongoose');

const Notification = require('./notification.model');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { getPagination, paginate } = require('../../utils/pagination');

// GET /notifications?unread=true&page=&limit= — mới nhất trước, kèm số chưa đọc cho huy hiệu chuông
const listNotifications = asyncHandler(async (req, res) => {
    const filter = { user: req.user.userId };

    if (req.query.unread === 'true') {
        filter.isRead = false;
    }

    const [result, unreadCount] = await Promise.all([
        paginate(Notification, filter, getPagination(req), { sort: { createdAt: -1, _id: -1 } }),
        Notification.countDocuments({ user: req.user.userId, isRead: false })
    ]);

    return res.status(200).json({
        success: true,
        data: { ...result, unreadCount }
    });
});

// PATCH /notifications/:id/read — thông báo của người khác trả 404
const markRead = asyncHandler(async (req, res) => {
    const notification = await Notification.findOneAndUpdate(
        { _id: req.params.id, user: req.user.userId },
        { $set: { isRead: true } },
        { returnDocument: 'after' }
    );

    if (!notification) {
        throw new AppError(404, 'NOT_FOUND', 'Notification not found');
    }

    return res.status(200).json({ success: true, data: notification });
});

/**
 * GET /notifications/unread-counts — số chưa đọc theo loại, cho số đỏ trên từng mục menu / tab
 * @returns { total, byType: { ORDER_NEW: 2, ... } }
 */
const unreadCounts = asyncHandler(async (req, res) => {
    const rows = await Notification.aggregate([
        { $match: { user: new mongoose.Types.ObjectId(req.user.userId), isRead: false } },
        { $group: { _id: '$type', count: { $sum: 1 } } }
    ]);
    const byType = Object.fromEntries(rows.map((r) => [r._id, r.count]));
    return res.status(200).json({
        success: true,
        data: { total: rows.reduce((sum, r) => sum + r.count, 0), byType }
    });
});

// PATCH /notifications/read-types { types: [...] } — mở trang / tab nào thì đánh dấu đã đọc thông báo của mục đó
const markTypesRead = asyncHandler(async (req, res) => {
    const { modifiedCount } = await Notification.updateMany(
        { user: req.user.userId, isRead: false, type: { $in: req.body.types } },
        { $set: { isRead: true } }
    );
    return res.status(200).json({ success: true, data: { modifiedCount } });
});

// PATCH /notifications/read-all
const markAllRead = asyncHandler(async (req, res) => {
    const { modifiedCount } = await Notification.updateMany(
        { user: req.user.userId, isRead: false },
        { $set: { isRead: true } }
    );

    return res.status(200).json({ success: true, data: { modifiedCount } });
});

module.exports = {
    unreadCounts,
    markTypesRead,
    listNotifications,
    markRead,
    markAllRead
};
