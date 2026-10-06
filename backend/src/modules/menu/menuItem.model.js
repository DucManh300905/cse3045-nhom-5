const mongoose = require('mongoose');
const { removeAccents } = require('../../utils/text');

const MENU_ITEM_TYPES = ['FOOD', 'DRINK'];

// Tiền: số nguyên VND, không âm (BR-21)
const price = {
    type: Number,
    required: true,
    min: 0,
    validate: {
        validator: Number.isInteger,
        message: '{PATH} must be an integer'
    }
};

// Biến thể, vd size S/M/L. Có biến thể thì giá bán lấy theo biến thể.
const variantSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },

    price,

    isDefault: {
        type: Boolean,
        default: false
    }
});

const optionSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },

    // Giá cộng thêm, có thể 0 (vd: mức đường)
    price,

    isAvailable: {
        type: Boolean,
        default: true
    }
});

// Nhóm tùy chọn/topping (BR-22): required <=> minSelect >= 1
const optionGroupSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },

    minSelect: {
        type: Number,
        default: 0,
        min: 0
    },

    maxSelect: {
        type: Number,
        default: 1,
        min: 1
    },

    options: {
        type: [optionSchema],
        validate: {
            validator: (list) => list.length > 0,
            message: 'Option group must have at least one option'
        }
    }
});

optionGroupSchema.pre('validate', function () {
    if (this.minSelect > this.maxSelect) {
        this.invalidate('minSelect', 'minSelect must be <= maxSelect');
    }

    if (this.maxSelect > this.options.length) {
        this.invalidate('maxSelect', 'maxSelect must be <= number of options');
    }
});

// Món ăn (docs/database.md mục 3.4)
const menuItemSchema = new mongoose.Schema(
    {
        // Lưu trùng restaurant để query nhanh và kiểm tra quyền sở hữu
        restaurant: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Restaurant',
            required: true
        },

        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'MenuCategory',
            required: true
        },

        name: {
            type: String,
            required: true,
            trim: true
        },

        // Tự sinh, phục vụ tìm kiếm không dấu ("com ga" -> "Cơm gà")
        nameNoAccent: String,

        description: {
            type: String,
            trim: true
        },

        imageUrl: String,

        type: {
            type: String,
            enum: MENU_ITEM_TYPES,
            default: 'FOOD'
        },

        // Có biến thể thì = giá biến thể mặc định (để hiển thị "từ ...đ")
        basePrice: price,

        tags: {
            type: [String],
            default: []
        },

        variants: {
            type: [variantSchema],
            default: []
        },

        optionGroups: {
            type: [optionGroupSchema],
            default: []
        },

        // Bật/tắt tay (hết món)
        isAvailable: {
            type: Boolean,
            default: true
        },

        // Số suất tối đa mỗi ngày; null = không giới hạn (BR-23)
        dailyLimit: {
            type: Number,
            default: null,
            min: 0
        },

        // Reset về 0 lúc 00:00 bằng job (bước đơn hàng)
        soldToday: {
            type: Number,
            default: 0,
            min: 0
        },

        prepMinutes: {
            type: Number,
            min: 1
        },

        sortOrder: {
            type: Number,
            default: 0
        },

        // Tổng đã bán, dùng cho "món bán chạy"
        soldCount: {
            type: Number,
            default: 0
        },

        // Xóa mềm để không làm hỏng đơn cũ / thống kê (BR-24)
        isDeleted: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);

menuItemSchema.pre('validate', function () {
    if (this.isModified('name')) {
        this.nameNoAccent = removeAccents(this.name).toLowerCase();
    }

    // Luôn có đúng một biến thể mặc định; basePrice theo biến thể mặc định
    if (this.variants.length > 0) {
        const defaults = this.variants.filter((v) => v.isDefault);
        const chosen = defaults[0] || this.variants[0];

        this.variants.forEach((v) => {
            v.isDefault = v === chosen;
        });
        this.basePrice = chosen.price;
    }
});

menuItemSchema.index({ restaurant: 1, category: 1, sortOrder: 1 });
menuItemSchema.index({ restaurant: 1, isDeleted: 1, isAvailable: 1 });
menuItemSchema.index({ name: 'text', nameNoAccent: 'text', description: 'text' });

const MenuItem = mongoose.model('MenuItem', menuItemSchema);

module.exports = MenuItem;
module.exports.MENU_ITEM_TYPES = MENU_ITEM_TYPES;
