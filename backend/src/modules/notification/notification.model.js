const mongoose = require('mongoose');

// Thông báo trong app (docs/database.md mục 3.9) — lưu lại để xem sau, đồng thời đẩy realtime `notification:new`
const NOTIFICATION_TYPES = [
    'ORDER_NEW',
    'ORDER_STATUS',
    'RESTAURANT_SUBMITTED',
    'RESTAURANT_APPROVED',
    'RESTAURANT_REJECTED',
    'RESTAURANT_BLOCKED',
    'RESTAURANT_UNBLOCKED',
    'REVIEW_NEW'
];

// Tự xóa sau 90 ngày
const TTL_SECONDS = 90 * 24 * 60 * 60;

const notificationSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },

        type: {
            type: String,
            enum: NOTIFICATION_TYPES,
            required: true
        },

        title: {
            type: String,
            required: true
        },

        body: String,

        // link: trang FE mở khi bấm vào thông báo
        data: {
            orderId: mongoose.Schema.Types.ObjectId,
            restaurantId: mongoose.Schema.Types.ObjectId,
            code: String,
            link: String
        },

        isRead: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: { createdAt: true, updatedAt: false }
    }
);

notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: TTL_SECONDS });

const Notification = mongoose.model('Notification', notificationSchema);

module.exports = Notification;
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;
