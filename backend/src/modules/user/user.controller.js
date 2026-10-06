const User = require('./user.model');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');

const getMyProfile = asyncHandler(async (req, res) => {
    const user = await User.findById(req.user.userId);

    if (!user) {
        throw new AppError(404, 'NOT_FOUND', 'User not found');
    }

    return res.status(200).json({
        success: true,
        data: user
    });
});

// Validate + chuẩn hóa ở user.routes.js
const updateMyProfile = asyncHandler(async (req, res) => {
    const { fullName, phone, avatarUrl } = req.body;

    const user = await User.findById(req.user.userId);

    if (!user) {
        throw new AppError(404, 'NOT_FOUND', 'User not found');
    }

    if (fullName !== undefined) {
        user.fullName = fullName;
    }

    if (phone !== undefined) {
        // Chuỗi rỗng = xóa số điện thoại (không lưu "" để index unique + sparse bỏ qua).
        // Model sẽ báo lỗi nếu xóa cả SĐT lẫn email.
        user.phone = phone || undefined;
    }

    if (avatarUrl !== undefined) {
        user.avatarUrl = avatarUrl || undefined;
    }

    // Lỗi trùng SĐT (11000) và ValidationError do errorHandler xử lý
    await user.save();

    return res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: user
    });
});

module.exports = {
    getMyProfile,
    updateMyProfile
};
