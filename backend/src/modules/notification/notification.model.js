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
    'REVIEW_NEW',
    // Ví đối soát (API-11)
    'WALLET_NEGATIVE',
    'WALLET_LOCKED',
    'WALLET_UNLOCKED',
    'TOPUP_REQUESTED',
    'TOPUP_CONFIRMED',
    'TOPUP_REJECTED',
    'PAYOUT_REQUESTED',
    'PAYOUT_PAID',
    'PAYOUT_REJECTED',
    // Trả trước (W2)
    'PAYMENT_ISSUE',
    'PAYMENT_UNMATCHED',
    'REFUND_REQUESTED',
    'REFUND_DONE',
    // Tài xế MAK
    'SHIPPER_SUBMITTED',
    'SHIPPER_APPROVED',
    'SHIPPER_REJECTED',
    'SHIPPER_BLOCKED',
    'SHIPPER_UNBLOCKED',
    'DELIVERY_ASSIGNED',
    'DELIVERY_NO_SHIPPER',
    'DELIVERY_CANCELLED',
    'DELIVERY_FAILED',
    'DELIVERY_STALE',
    'SHIPPER_EARNING',
    // Đăng ký ca tài xế
    'SHIFT_PLAN_REQUEST',
    'SHIFT_LIST',
    'SHIFT_REPORT',
    'SHIFT_UNFILLED',
    'SHIFT_REMINDER',
    'SHIFT_CANCELLED',
    'PENALTY'
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
            shipperId: mongoose.Schema.Types.ObjectId,
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
