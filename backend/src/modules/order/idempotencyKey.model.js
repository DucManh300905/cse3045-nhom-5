const mongoose = require('mongoose');

// Chống đặt trùng đơn khi bấm 2 lần / mạng chập chờn (BR-38, docs/database.md mục 3.6)
const idempotencyKeySchema = new mongoose.Schema({
    key: {
        type: String,
        required: true
    },

    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    order: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order',
        required: true
    },

    // Tự xóa sau 24h
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 86400
    }
});

idempotencyKeySchema.index({ user: 1, key: 1 }, { unique: true });

const IdempotencyKey = mongoose.model('IdempotencyKey', idempotencyKeySchema);

module.exports = IdempotencyKey;
