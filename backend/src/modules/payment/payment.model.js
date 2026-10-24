const mongoose = require('mongoose');

/**
 * Giao dịch ngân hàng SePay báo về qua webhook (lưu thô để đối soát).
 * providerTxId unique -> SePay gửi lại cùng giao dịch cũng chỉ xử lý một lần.
 */
const PAYMENT_STATUSES = [
    'PROCESSING', // đang xử lý (lỗi giữa chừng -> xóa để SePay gửi lại)
    'MATCHED_ORDER', // đã xác nhận thanh toán đơn
    'MATCHED_TOPUP', // đã cộng ví quán (lệnh nạp)
    'LATE', // đơn đã hủy / hết hạn -> hoàn tiền
    'UNDERPAID', // chuyển thiếu -> hoàn tiền, đơn vẫn chờ
    'DUPLICATE', // đơn đã thanh toán rồi -> hoàn tiền
    'UNMATCHED', // không nhận ra mã -> admin xử lý
    'REFUNDING', // admin đã tạo lệnh hoàn cho giao dịch không khớp
    'IGNORED' // tiền ra / tài khoản khác / admin bỏ qua (không phải tiền của khách MAK)
];

const paymentSchema = new mongoose.Schema(
    {
        provider: {
            type: String,
            default: 'SEPAY'
        },

        providerTxId: {
            type: String,
            required: true,
            unique: true
        },

        gateway: String,
        accountNumber: String,
        transferType: String,
        amount: {
            type: Number,
            required: true
        },
        content: String,
        // Mã nhận ra từ nội dung: MAK… (đơn) hoặc NAP… (nạp ví quán)
        code: String,
        referenceCode: String,
        transactionDate: String,

        status: {
            type: String,
            enum: PAYMENT_STATUSES,
            default: 'PROCESSING'
        },

        order: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order'
        },

        topup: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Topup'
        },

        note: String,

        resolvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        resolvedAt: Date
    },
    {
        timestamps: true
    }
);

paymentSchema.index({ status: 1, createdAt: -1 });
paymentSchema.index({ order: 1 });

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = Payment;
module.exports.PAYMENT_STATUSES = PAYMENT_STATUSES;
