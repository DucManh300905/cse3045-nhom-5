const mongoose = require('mongoose');

// Yêu cầu rút tiền của quán / tài xế: tiền bị giữ (PAYOUT_HOLD) ngay khi yêu cầu, admin chuyển khoản rồi xác nhận.
// Mỗi lệnh thuộc đúng một trong hai: restaurant hoặc shipper.
const PAYOUT_STATUSES = ['REQUESTED', 'PAID', 'REJECTED'];

const payoutSchema = new mongoose.Schema(
    {
        restaurant: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Restaurant'
        },

        shipper: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Shipper'
        },

        requestedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },

        amount: {
            type: Number,
            required: true,
            min: 1
        },

        // Snapshot tài khoản nhận lúc yêu cầu (quán đổi sau cũng không ảnh hưởng lệnh đang chờ)
        bankAccount: {
            bankName: String,
            accountNumber: String,
            accountName: String
        },

        status: {
            type: String,
            enum: PAYOUT_STATUSES,
            default: 'REQUESTED'
        },

        bankRef: String,
        rejectReason: String,

        processedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        processedAt: Date
    },
    {
        timestamps: true
    }
);

// Mỗi quán / mỗi tài xế chỉ một yêu cầu đang chờ.
// Index cũ `restaurant_1` (không có $exists) chặn nhầm lệnh của tài xế -> xóa bằng npm run migrate:003
payoutSchema.index(
    { restaurant: 1 },
    { name: 'one_pending_per_restaurant', unique: true, partialFilterExpression: { status: 'REQUESTED', restaurant: { $exists: true } } }
);
payoutSchema.index(
    { shipper: 1 },
    { name: 'one_pending_per_shipper', unique: true, partialFilterExpression: { status: 'REQUESTED', shipper: { $exists: true } } }
);
payoutSchema.index({ status: 1, createdAt: -1 });

const Payout = mongoose.model('Payout', payoutSchema);

module.exports = Payout;
module.exports.PAYOUT_STATUSES = PAYOUT_STATUSES;
