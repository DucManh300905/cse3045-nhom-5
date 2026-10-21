const mongoose = require('mongoose');

// Lời mời nhận đơn gửi tới tài xế (điều phối — BR-92). Mời lần lượt từng người, mỗi lời mời 30 giây.
//   OFFERED   : đang chờ tài xế trả lời
//   ACCEPTED  : tài xế đã nhận
//   DECLINED  : tài xế từ chối
//   EXPIRED   : quá thời gian không trả lời
//   CANCELLED : hệ thống thu hồi (đơn bị hủy, admin gán tay, quán tự giao...)
//   WITHDRAWN : tài xế hủy sau khi đã nhận (chưa lấy hàng)
const OFFER_STATUSES = ['OFFERED', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED', 'WITHDRAWN'];

const dispatchOfferSchema = new mongoose.Schema(
    {
        order: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order',
            required: true
        },

        shipper: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Shipper',
            required: true
        },

        // Tài xế -> quán lúc mời (đường thật hoặc ước lượng)
        distanceKm: Number,
        durationMinutes: Number,

        // Thứ tự lời mời của đơn (1 = người gần nhất)
        attempt: Number,

        status: {
            type: String,
            enum: OFFER_STATUSES,
            default: 'OFFERED'
        },

        offeredAt: {
            type: Date,
            default: Date.now
        },
        expiresAt: {
            type: Date,
            required: true
        },
        respondedAt: Date,

        // Admin gán tay (không qua lời mời)
        assignedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    },
    {
        timestamps: true
    }
);

// Mỗi đơn chỉ một lời mời đang chờ tại một thời điểm
dispatchOfferSchema.index({ order: 1 }, { name: 'one_open_offer_per_order', unique: true, partialFilterExpression: { status: 'OFFERED' } });
dispatchOfferSchema.index({ shipper: 1, status: 1, updatedAt: -1 });
dispatchOfferSchema.index({ status: 1, expiresAt: 1 });
dispatchOfferSchema.index({ order: 1, createdAt: 1 });

const DispatchOffer = mongoose.model('DispatchOffer', dispatchOfferSchema);

module.exports = DispatchOffer;
module.exports.OFFER_STATUSES = OFFER_STATUSES;
