const { rateLimit } = require('express-rate-limit');

// Chống dò mật khẩu / spam tạo tài khoản (đề xuất bảo mật P0). Đếm theo IP:
// chạy sau nginx thì phải đặt TRUST_PROXY=1 trong .env, nếu không mọi người dùng chung IP của nginx.
// AUTH_RATE_LIMIT ghi đè số lần cho phép (test đặt số lớn để không bị chặn).

const MINUTE = 60 * 1000;
const override = () => Number(process.env.AUTH_RATE_LIMIT) || 0;

const tooMany = (req, res) =>
    res.status(429).json({
        success: false,
        message: 'Too many attempts, please try again later',
        code: 'RATE_LIMITED'
    });

const limiter = ({ windowMs, limit, onlyFailures = false }) =>
    rateLimit({
        windowMs,
        limit: override() || limit,
        // Chỉ đếm lần thất bại: người dùng đăng nhập đúng không bị chặn
        skipSuccessfulRequests: onlyFailures,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        handler: tooMany
    });

// Đăng nhập sai quá 10 lần / 15 phút / IP
const loginLimiter = limiter({ windowMs: 15 * MINUTE, limit: 10, onlyFailures: true });

// Tạo quá 10 tài khoản / giờ / IP
const registerLimiter = limiter({ windowMs: 60 * MINUTE, limit: 10 });

// Đổi mật khẩu sai mật khẩu cũ quá 10 lần / 15 phút / IP
const changePasswordLimiter = limiter({ windowMs: 15 * MINUTE, limit: 10, onlyFailures: true });

// Viết / sửa đánh giá quá 20 lần / giờ / IP (chống spam)
const reviewLimiter = limiter({ windowMs: 60 * MINUTE, limit: 20 });

// Gửi mã OTP quá 10 lần / 15 phút / IP (ngoài giới hạn 60 giây + 5 mã / giờ cho mỗi email)
const otpSendLimiter = limiter({ windowMs: 15 * MINUTE, limit: 10 });

// Nhập sai mã quá 20 lần / 15 phút / IP (mỗi mã còn giới hạn 5 lần sai)
const otpVerifyLimiter = limiter({ windowMs: 15 * MINUTE, limit: 20, onlyFailures: true });

module.exports = {
    otpSendLimiter,
    otpVerifyLimiter,
    reviewLimiter,
    loginLimiter,
    registerLimiter,
    changePasswordLimiter
};
