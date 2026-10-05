const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
    {
        // Người dùng đăng ký bằng email hoặc số điện thoại (ít nhất một trong hai).
        // sparse: cho phép nhiều tài khoản không có email / không có số điện thoại.
        email: {
            type: String,
            unique: true,
            sparse: true,
            lowercase: true,
            trim: true
        },

        password: {
            type: String,
            required: true,
            minlength: 6
        },

        fullName: {
            type: String,
            required: true,
            trim: true
        },

        phone: {
            type: String,
            unique: true,
            sparse: true,
            trim: true
        },

        role: {
            type: String,
            enum: ['CUSTOMER', 'RESTAURANT_OWNER', 'ADMIN'],
            default: 'CUSTOMER'
        },

        status: {
            type: String,
            enum: ['ACTIVE', 'BLOCKED'],
            default: 'ACTIVE'
        }
    },
    {
        timestamps: true
    }
);

userSchema.pre('validate', function () {
    if (!this.email && !this.phone) {
        this.invalidate('email', 'Email or phone is required');
    }
});

const User = mongoose.model('User', userSchema);

module.exports = User;