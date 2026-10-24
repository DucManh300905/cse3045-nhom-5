const mongoose = require('mongoose');

// Mã OTP đang chờ xác thực — mỗi (email, mục đích) chỉ có 1 bản ghi, gửi lại thì ghi đè mã cũ.
// Chỉ lưu bản băm của mã, không lưu mã gốc.
const otpSchema = new mongoose.Schema({
    // Email (đã chuẩn hóa chữ thường)
    target: {
        type: String,
        required: true
    },

    purpose: {
        type: String,
        enum: ['REGISTER', 'RESET_PASSWORD'],
        required: true
    },

    codeHash: {
        type: String,
        required: true
    },

    // Mã hết hạn sau 5 phút (bản ghi vẫn giữ để đếm số lần gửi trong giờ)
    expiresAt: {
        type: Date,
        required: true
    },

    attempts: {
        type: Number,
        default: 0
    },

    lastSentAt: {
        type: Date,
        default: Date.now
    },

    // Số mã đã gửi trong cửa sổ 1 giờ bắt đầu từ windowStart
    sendCount: {
        type: Number,
        default: 1
    },

    windowStart: {
        type: Date,
        default: Date.now
    }
});

otpSchema.index({ target: 1, purpose: 1 }, { unique: true });
// Tự xóa 1 giờ sau lần gửi gần nhất
otpSchema.index({ lastSentAt: 1 }, { expireAfterSeconds: 60 * 60 });

const Otp = mongoose.model('Otp', otpSchema);

module.exports = Otp;
