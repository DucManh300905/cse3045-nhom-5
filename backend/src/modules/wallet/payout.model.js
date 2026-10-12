const mongoose = require('mongoose');

// Yêu cầu rút tiền của quán: tiền bị giữ (PAYOUT_HOLD) ngay khi yêu cầu, admin chuyển khoản rồi xác nhận
const PAYOUT_STATUSES = ['REQUESTED', 'PAID', 'REJECTED'];

const payoutSchema = new mongoose.Schema(
    {
        restaurant: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Restaurant',
            required: true
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

// Mỗi quán chỉ một yêu cầu đang chờ
payoutSchema.index({ restaurant: 1 }, { unique: true, partialFilterExpression: { status: 'REQUESTED' } });
payoutSchema.index({ status: 1, createdAt: -1 });

const Payout = mongoose.model('Payout', payoutSchema);

module.exports = Payout;
module.exports.PAYOUT_STATUSES = PAYOUT_STATUSES;
