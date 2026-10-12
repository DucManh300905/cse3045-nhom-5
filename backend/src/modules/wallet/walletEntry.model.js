const mongoose = require('mongoose');

// Sổ cái: mỗi bút toán (journal) gồm >= 2 dòng có tổng = 0. Chỉ ghi thêm, không sửa / xóa.
const ENTRY_KINDS = [
    'ORDER_SETTLE', // đơn hoàn thành: hoa hồng (COD), bù voucher
    'TOPUP', // quán nạp tiền trả nợ
    'PAYOUT_REQUEST', // quán yêu cầu rút: ví quán -> PAYOUT_HOLD
    'PAYOUT_PAID', // admin đã chuyển khoản: PAYOUT_HOLD -> EXTERNAL
    'PAYOUT_REJECT', // admin từ chối: trả lại ví quán
    'ADJUSTMENT', // admin điều chỉnh tay (bắt buộc lý do + audit log)
    'ORDER_PAYMENT', // tiền khách chuyển về (webhook SePay): EXTERNAL -> ESCROW / REFUND_HOLD
    'REFUND_PENDING', // đơn đã trả bị hủy: ESCROW -> REFUND_HOLD
    'REFUND_PAID' // admin đã hoàn tiền: REFUND_HOLD -> EXTERNAL
];

const walletEntrySchema = new mongoose.Schema(
    {
        journal: {
            type: mongoose.Schema.Types.ObjectId,
            required: true
        },

        // Khóa chống ghi trùng cho cả bút toán, vd 'ORDER_SETTLE:<orderId>'
        ref: {
            type: String,
            required: true
        },

        wallet: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Wallet',
            required: true
        },

        walletType: {
            type: String,
            required: true
        },

        restaurant: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Restaurant'
        },

        kind: {
            type: String,
            enum: ENTRY_KINDS,
            required: true
        },

        // Số nguyên VND có dấu
        amount: {
            type: Number,
            required: true
        },

        balanceAfter: {
            type: Number,
            required: true
        },

        order: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order'
        },

        topup: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Topup'
        },

        payout: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Payout'
        },

        payment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Payment'
        },

        refund: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Refund'
        },

        note: String,

        actor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        }
    },
    {
        timestamps: { createdAt: true, updatedAt: false }
    }
);

walletEntrySchema.index({ ref: 1, wallet: 1 }, { unique: true });
walletEntrySchema.index({ wallet: 1, createdAt: -1 });
walletEntrySchema.index({ restaurant: 1, createdAt: -1 });

const forbid = function () {
    throw new Error('Wallet entries are append-only');
};
['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete'].forEach((op) =>
    walletEntrySchema.pre(op, forbid)
);

const WalletEntry = mongoose.model('WalletEntry', walletEntrySchema);

module.exports = WalletEntry;
module.exports.ENTRY_KINDS = ENTRY_KINDS;
