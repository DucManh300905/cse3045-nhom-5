const mongoose = require('mongoose');

// Lệnh nạp tiền của quán (trả nợ hoa hồng). Quán chuyển khoản với nội dung = code;
// hiện admin xác nhận tay, W2 sẽ để webhook SePay tự xác nhận qua wallet.service.confirmTopup.
const TOPUP_STATUSES = ['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED'];

const topupSchema = new mongoose.Schema(
    {
        // Nội dung chuyển khoản: NAP2610110001 (không dấu gạch, ngân hàng hay bỏ ký tự đặc biệt)
        code: {
            type: String,
            required: true,
            unique: true
        },

        restaurant: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Restaurant',
            required: true
        },

        requestedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },

        // Số tiền quán định nạp
        amount: {
            type: Number,
            required: true,
            min: 1
        },

        // Số tiền thực nhận (admin nhập theo sao kê, có thể khác amount)
        receivedAmount: Number,

        status: {
            type: String,
            enum: TOPUP_STATUSES,
            default: 'PENDING'
        },

        // Mã giao dịch ngân hàng
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

topupSchema.index({ restaurant: 1, createdAt: -1 });
topupSchema.index({ status: 1, createdAt: -1 });

const Topup = mongoose.model('Topup', topupSchema);

module.exports = Topup;
module.exports.TOPUP_STATUSES = TOPUP_STATUSES;
