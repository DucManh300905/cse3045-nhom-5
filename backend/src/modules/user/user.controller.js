const User = require('./user.model');

const getMyProfile = async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password');

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        return res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        console.error('Get profile error:', error);

        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

const updateMyProfile = async (req, res) => {
    try {
        const { fullName, phone } = req.body;

        const user = await User.findById(req.user.userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (fullName !== undefined) {
            user.fullName = fullName;
        }

        if (phone !== undefined) {
            // Chuỗi rỗng = xóa số điện thoại (không lưu "" để index unique + sparse bỏ qua)
            user.phone = phone || undefined;
        }

        await user.save();

        return res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            data: {
                id: user._id,
                email: user.email,
                fullName: user.fullName,
                phone: user.phone,
                role: user.role,
                status: user.status,
                updatedAt: user.updatedAt
            }
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'Phone already exists'
            });
        }

        if (error.name === 'ValidationError') {
            return res.status(400).json({
                success: false,
                message: Object.values(error.errors)[0].message
            });
        }

        console.error('Update profile error:', error);

        return res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
};

module.exports = {
    getMyProfile,
    updateMyProfile
};