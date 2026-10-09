const mongoose = require('mongoose');

// Đánh giá quán (API-8, quyết định 08/10/2026): đánh giá CHUNG cho quán, không theo từng đơn.
// Mỗi khách 1 đánh giá / quán (sửa được); chỉ khách đã có đơn hoàn thành ở quán mới được viết.
const reviewSchema = new mongoose.Schema(
    {
        restaurant: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Restaurant',
            required: true
        },

        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },

        // 1–5 sao, số nguyên
        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5,
            validate: {
                validator: Number.isInteger,
                message: 'rating must be an integer'
            }
        },

        // Lời nhận xét, ai mở trang quán cũng xem được
        comment: {
            type: String,
            trim: true,
            maxlength: 1000
        },

        // Chủ quán trả lời 1 lần (sửa được) — BR-61
        reply: {
            content: { type: String, trim: true, maxlength: 1000 },
            repliedAt: Date
        },

        // Admin ẩn đánh giá vi phạm: không hiện, không tính điểm
        isHidden: {
            type: Boolean,
            default: false
        },

        hiddenReason: String
    },
    {
        timestamps: true
    }
);

reviewSchema.index({ restaurant: 1, customer: 1 }, { unique: true });
reviewSchema.index({ restaurant: 1, isHidden: 1, updatedAt: -1 });

const Review = mongoose.model('Review', reviewSchema);

module.exports = Review;
