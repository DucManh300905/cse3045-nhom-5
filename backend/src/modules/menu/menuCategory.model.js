const mongoose = require('mongoose');

// Danh mục món của một quán (docs/database.md mục 3.3)
const menuCategorySchema = new mongoose.Schema(
    {
        restaurant: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Restaurant',
            required: true
        },

        name: {
            type: String,
            required: true,
            trim: true
        },

        sortOrder: {
            type: Number,
            default: 0
        },

        // Ẩn cả danh mục khỏi menu khách mà không phải xóa
        isActive: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
);

// Tên danh mục không trùng trong cùng một quán (không phân biệt hoa thường)
menuCategorySchema.index(
    { restaurant: 1, name: 1 },
    { unique: true, collation: { locale: 'vi', strength: 2 } }
);
menuCategorySchema.index({ restaurant: 1, sortOrder: 1 });

const MenuCategory = mongoose.model('MenuCategory', menuCategorySchema);

module.exports = MenuCategory;
