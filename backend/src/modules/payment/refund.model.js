const mongoose = require('mongoose');

// Lệnh hoàn tiền cho khách: tiền nằm ở ví REFUND_HOLD tới khi admin chuyển khoản trả và xác nhận
const REFUND_REASONS = [
    'ORDER_CANCELLED', // đơn đã trả bị quán từ chối / hủy, khách hủy, quá giờ quán không nhận
    'LATE_PAYMENT', // chuyển sau khi đơn đã hết hạn / bị hủy
    'UNDERPAID', // chuyển thiếu
    'OVERPAID', // chuyển thừa (phần thừa)
    'DUPLICATE', // chuyển 2 lần cho cùng đơn
    'UNMATCHED' // giao dịch không khớp mã, admin quyết định hoàn
];
const REFUND_STATUSES = ['PENDING', 'DONE'];

const refundSchema = new mongoose.Schema(
    {
        order: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order'
        },

        payment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Payment'
        },

        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },

        amount: {
            type: Number,
            required: true,
            min: 1
        },

        reason: {
            type: String,
            enum: REFUND_REASONS,
            required: true
        },

        status: {
            type: String,
            enum: REFUND_STATUSES,
            default: 'PENDING'
        },

        note: String,
        bankRef: String,

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

refundSchema.index({ status: 1, createdAt: -1 });
refundSchema.index({ customer: 1, createdAt: -1 });

const Refund = mongoose.model('Refund', refundSchema);

module.exports = Refund;
module.exports.REFUND_REASONS = REFUND_REASONS;
module.exports.REFUND_STATUSES = REFUND_STATUSES;
