const mongoose = require('mongoose');

const MAX_ADDRESSES = 5;

// Địa chỉ giao hàng của khách (docs/database.md mục 3.1)
const addressSchema = new mongoose.Schema({
    label: {
        type: String,
        trim: true
    },

    receiverName: {
        type: String,
        required: true,
        trim: true
    },

    phone: {
        type: String,
        required: true,
        trim: true
    },

    addressLine: {
        type: String,
        required: true,
        trim: true
    },

    // GeoJSON: coordinates = [lng, lat]
    location: {
        type: {
            type: String,
            enum: ['Point']
        },
        coordinates: {
            type: [Number],
            default: undefined
        }
    },

    isDefault: {
        type: Boolean,
        default: false
    }
});

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
        },

        // true khi đăng ký bằng email đã xác thực OTP (tài khoản cũ: chưa có trường này)
        emailVerified: {
            type: Boolean,
            default: false
        },

        avatarUrl: {
            type: String,
            trim: true
        },

        addresses: {
            type: [addressSchema],
            validate: {
                validator: (list) => list.length <= MAX_ADDRESSES,
                message: `At most ${MAX_ADDRESSES} addresses`
            }
        },

        // Token cấp trước thời điểm này bị coi là hết hạn
        passwordChangedAt: {
            type: Date
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
module.exports.MAX_ADDRESSES = MAX_ADDRESSES;