const mongoose = require('mongoose');

/**
 * Ví đối soát (docs/database.md mục 3.11) — không phải ví điện tử giữ tiền thật.
 * Mỗi ví là một "tài khoản" trong sổ cái kép: tổng số dư mọi ví luôn = 0.
 *   RESTAURANT  : số dư > 0 = MAK nợ quán (rút được); < 0 = quán nợ MAK (hoa hồng đơn COD)
 *   PLATFORM    : doanh thu nền tảng (hoa hồng − voucher MAK chịu)
 *   PAYOUT_HOLD : tiền quán đã yêu cầu rút, chờ admin chuyển khoản
 *   EXTERNAL    : đối ứng tiền thật ra / vào tài khoản ngân hàng của MAK
 *                 (nạp: −, chi trả cho quán: +) -> tiền thật MAK đang giữ = −balance
 *   ESCROW      : tiền khách trả trước đang giữ, chờ đơn hoàn thành (W2 — VietQR)
 *   REFUND_HOLD : tiền MAK phải hoàn cho khách (đơn đã trả bị hủy, chuyển muộn / thiếu / thừa)
 *   SHIPPER     : thu nhập tài xế MAK chưa rút (tiền công giao đơn, tiền bù khi đơn bị hủy)
 */
const WALLET_TYPES = ['RESTAURANT', 'PLATFORM', 'PAYOUT_HOLD', 'EXTERNAL', 'ESCROW', 'REFUND_HOLD', 'SHIPPER'];

const walletSchema = new mongoose.Schema(
    {
        // 'PLATFORM', 'EXTERNAL'... hoặc 'restaurant:<id>' / 'shipper:<id>'
        key: {
            type: String,
            required: true,
            unique: true
        },

        type: {
            type: String,
            enum: WALLET_TYPES,
            required: true
        },

        restaurant: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Restaurant'
        },

        shipper: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Shipper'
        },

        // Số nguyên VND. Chỉ đổi qua wallet.service.postJournal
        balance: {
            type: Number,
            default: 0
        },

        // Thời điểm ví quán bắt đầu âm (đếm hạn 3 ngày), null khi số dư >= 0
        negativeSince: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

walletSchema.index({ type: 1, balance: 1 });

const Wallet = mongoose.model('Wallet', walletSchema);

module.exports = Wallet;
module.exports.WALLET_TYPES = WALLET_TYPES;
