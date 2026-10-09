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

// PATCH /notifications/read-all
const markAllRead = asyncHandler(async (req, res) => {
    const { modifiedCount } = await Notification.updateMany(
        { user: req.user.userId, isRead: false },
        { $set: { isRead: true } }
    );

    return res.status(200).json({ success: true, data: { modifiedCount } });
});

module.exports = {
    listNotifications,
    markRead,
    markAllRead
};
