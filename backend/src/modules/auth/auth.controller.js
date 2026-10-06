const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../user/user.model');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const {
    EMAIL_REGEX,
    PHONE_REGEX,
    normalizeEmail,
    normalizePhone
} = require('../../utils/validators');

// Chỉ cho phép tự đăng ký hai vai trò này. ADMIN chỉ tạo bằng script seed.
const SELF_REGISTER_ROLES = ['CUSTOMER', 'RESTAURANT_OWNER'];

const signToken = (user) =>
    jwt.sign(
        { userId: user._id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: '1d' }
    );

const toUserResponse = (user) => ({
    id: user._id,
    email: user.email,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt
});

const register = async (req, res) => {
    try {
        const email = normalizeEmail(req.body.email);
        const phone = normalizePhone(req.body.phone);
        const { password } = req.body;
        const fullName =
            typeof req.body.fullName === 'string' ? req.body.fullName.trim() : '';
        const role = req.body.role || 'CUSTOMER';

        // Bắt buộc có email hoặc số điện thoại (ít nhất một)
        if ((!email && !phone) || !password || !fullName) {
            return res.status(400).json({
                success: false,
                message: 'Email or phone, password and fullName are required'
            });
        }

        if (email && !EMAIL_REGEX.test(email)) {
            return res.status(400).json({
                success: false,
                message: 'Email is not valid'
            });
        }

        if (phone && !PHONE_REGEX.test(phone)) {
            return res.status(400).json({
                success: false,
                message: 'Phone is not valid'
            });
        }

        if (typeof password !== 'string' || password.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 6 characters'
            });
        }

        if (!SELF_REGISTER_ROLES.includes(role)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid role'
            });
        }

        if (email && (await User.exists({ email }))) {
            return res.status(409).json({
                success: false,
                message: 'Email already exists'
            });
        }

        if (phone && (await User.exists({ phone }))) {
            return res.status(409).json({
                success: false,
                message: 'Phone already exists'
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Không lưu chuỗi rỗng để index unique + sparse bỏ qua trường trống
        const user = await User.create({
            email: email || undefined,
            phone: phone || undefined,
            password: hashedPassword,
            fullName,
            role
        });

        return res.status(201).json({
            success: true,
            message: 'User registered successfully',
            data: toUserResponse(user)
        });
    } catch (error) {
        // Hai request đăng ký cùng email gần như đồng thời
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: error.keyPattern?.phone ? 'Phone already exists' : 'Email already exists'
            });
        }

        console.error('Register error:', error);

        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

const login = async (req, res) => {
    try {
        // identifier là email hoặc số điện thoại; vẫn nhận trường email cũ để tương thích
        const identifier =
            typeof req.body.identifier === 'string' ? req.body.identifier : req.body.email;
        const { password } = req.body;

        if (typeof identifier !== 'string' || !identifier.trim() || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email or phone and password are required'
            });
        }

        const query = identifier.includes('@')
            ? { email: normalizeEmail(identifier) }
            : { phone: normalizePhone(identifier) };

        const user = await User.findOne(query);

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        const isPasswordCorrect = await bcrypt.compare(password, user.password);

        if (!isPasswordCorrect) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        if (user.status !== 'ACTIVE') {
            return res.status(403).json({
                success: false,
                message: 'Your account is blocked'
            });
        }

        const token = signToken(user);

        return res.status(200).json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                user: toUserResponse(user)
            }
        });
    } catch (error) {
        console.error('Login error:', error);

        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

// PUT /auth/change-password — validate ở auth.routes.js
// Sai mật khẩu hiện tại trả 400 (không phải 401) để FE không tự đăng xuất.
const changePassword = asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.userId);

    if (!(await bcrypt.compare(currentPassword, user.password))) {
        throw new AppError(400, 'INVALID_PASSWORD', 'Current password is incorrect');
    }

    if (currentPassword === newPassword) {
        throw new AppError(400, 'VALIDATION_ERROR', 'New password must be different from current password');
    }

    user.password = await bcrypt.hash(newPassword, 10);
    // Token cấp trước thời điểm này sẽ bị authenticate từ chối
    user.passwordChangedAt = new Date();
    await user.save();

    return res.status(200).json({
        success: true,
        message: 'Password changed successfully',
        data: {
            token: signToken(user)
        }
    });
});

module.exports = {
    register,
    login,
    changePassword
};
