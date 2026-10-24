const jwt = require('jsonwebtoken');
const User = require('../modules/user/user.model');
const AppError = require('../utils/AppError');

const tokenExpired = () => new AppError(401, 'TOKEN_EXPIRED', 'Invalid or expired token');

/**
 * Giải mã JWT và đọc lại user trong DB (dùng chung cho REST và Socket.IO).
 * Tài khoản bị khóa / đã đổi mật khẩu sau khi cấp token -> mất hiệu lực ngay (BR-04, BR-05).
 * @returns { userId, role } — role lấy từ DB, không tin role trong token
 * @throws AppError 401 TOKEN_EXPIRED | 403 ACCOUNT_BLOCKED
 */
const verifyToken = async (token) => {
    let decoded;

    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
        throw tokenExpired();
    }

    const user = await User.findById(decoded.userId).select('role status passwordChangedAt').lean();

    if (!user) {
        throw tokenExpired();
    }

    if (user.status !== 'ACTIVE') {
        throw new AppError(403, 'ACCOUNT_BLOCKED', 'Your account is blocked');
    }

    // iat tính bằng giây
    if (user.passwordChangedAt && Math.floor(user.passwordChangedAt.getTime() / 1000) > decoded.iat) {
        throw tokenExpired();
    }

    return {
        userId: String(user._id),
        role: user.role
    };
};

const authenticate = async (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
            success: false,
            message: 'Authentication required',
            code: 'UNAUTHORIZED'
        });
    }

    try {
        req.user = await verifyToken(authHeader.split(' ')[1]);
        next();
    } catch (error) {
        next(error);
    }
};

module.exports = {
    authenticate,
    verifyToken
};
