const mongoose = require('mongoose');
const { removeAccents } = require('../../utils/text');

// Vòng đời hồ sơ quán (BR-11): DRAFT -> SUBMITTED -> APPROVED | REJECTED, admin có thể BLOCKED
const RESTAURANT_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'BLOCKED'];
const DOCUMENT_TYPES = ['BUSINESS_LICENSE', 'FOOD_SAFETY', 'ID_CARD'];

const integerValidator = {
    validator: Number.isInteger,
    message: '{PATH} must be an integer'
};

const openingHourSchema = new mongoose.Schema(
    {
        // 0 = Chủ nhật ... 6 = Thứ bảy
        dayOfWeek: {
            type: Number,
            required: true,
            min: 0,
            max: 6
        },

        // 'HH:mm', giờ Việt Nam
        open: {
            type: String,
            required: true
        },

        close: {
            type: String,
            required: true
        }
    },
    {
        _id: false
    }
);

const documentSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: DOCUMENT_TYPES,
            required: true
        },

        // Đường dẫn file trong thư mục private, không public ra ngoài
        fileKey: {
            type: String,
            required: true
        },

        originalName: String,
        mimeType: String,

        uploadedAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        _id: false
    }
);

const restaurantSchema = new mongoose.Schema(
    {
        // MVP: 1 chủ = 1 quán (BR-10)
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true
        },

        name: {
            type: String,
            required: true,
            trim: true
        },

        // Tự sinh, phục vụ tìm quán không dấu
        nameNoAccent: String,

        // Tạo một lần lúc tạo quán, không đổi theo tên để link không bị hỏng
        slug: {
            type: String,
            unique: true,
            sparse: true
        },

        description: {
            type: String,
            trim: true
        },

        address: {
            type: String,
            required: true,
            trim: true
        },

        phone: {
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

        logoUrl: String,
        coverUrl: String,

        cuisineTypes: {
            type: [String],
            default: []
        },

        status: {
            type: String,
            enum: RESTAURANT_STATUSES,
            default: 'DRAFT'
        },

        rejectReason: String,
        submittedAt: Date,
        approvedAt: Date,

        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },

        documents: {
            type: [documentSchema],
            default: []
        },

        isAcceptingOrders: {
            type: Boolean,
            default: false
        },

        openingHours: {
            type: [openingHourSchema],
            default: []
        },

        // Không có phí giao: quán tự giao và nền tảng miễn phí ship cho khách (quyết định 06/10/2026).
        // Tiền: số nguyên VND (BR-21, BR-50)
        minOrderAmount: {
            type: Number,
            default: 0,
            min: 0,
            validate: integerValidator
        },

        deliveryRadiusKm: {
            type: Number,
            default: 5,
            min: 0
        },

        avgPrepMinutes: {
            type: Number,
            default: 15,
            min: 1,
            validate: integerValidator
        },

        // Chỉ admin được sửa (BR-51)
        commissionRate: {
            type: Number,
            default: 0.1,
            min: 0,
            max: 1
        },

        ratingAvg: {
            type: Number,
            default: 0
        },

        ratingCount: {
            type: Number,
            default: 0
        }
    },
    {
        timestamps: true
    }
);

restaurantSchema.pre('validate', function () {
    if (this.isModified('name')) {
        this.nameNoAccent = removeAccents(this.name).toLowerCase();
    }
});

restaurantSchema.index({ status: 1 });
restaurantSchema.index({ location: '2dsphere' }, { sparse: true });
restaurantSchema.index({ name: 'text', description: 'text' });

const Restaurant = mongoose.model('Restaurant', restaurantSchema);

module.exports = Restaurant;
module.exports.RESTAURANT_STATUSES = RESTAURANT_STATUSES;
module.exports.DOCUMENT_TYPES = DOCUMENT_TYPES;
