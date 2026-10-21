const mongoose = require('mongoose');

// Hồ sơ tài xế MAK (Kế hoạch triển khai Tài xế, chốt 21/10/2026) — giống hồ sơ quán:
// DRAFT -> SUBMITTED -> APPROVED | REJECTED, admin có thể BLOCKED
const SHIPPER_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'BLOCKED'];
const SHIPPER_DOCUMENT_TYPES = ['ID_CARD', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION'];
const VEHICLE_TYPES = ['MOTORBIKE', 'EBIKE', 'BICYCLE'];

const documentSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: SHIPPER_DOCUMENT_TYPES,
            required: true
        },

        // Đường dẫn file trong thư mục private (chỉ admin xem)
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

const shipperSchema = new mongoose.Schema(
    {
        // 1 tài khoản SHIPPER = 1 hồ sơ
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            unique: true
        },

        fullName: {
            type: String,
            required: true,
            trim: true
        },

        phone: {
            type: String,
            required: true,
            trim: true
        },

        // Số CCCD — dữ liệu cá nhân, chỉ admin và chính tài xế thấy
        idNumber: {
            type: String,
            trim: true
        },

        vehicleType: {
            type: String,
            enum: VEHICLE_TYPES,
            default: 'MOTORBIKE'
        },

        // Biển số: khách thấy để nhận ra tài xế
        licensePlate: {
            type: String,
            trim: true,
            uppercase: true
        },

        documents: {
            type: [documentSchema],
            default: []
        },

        status: {
            type: String,
            enum: SHIPPER_STATUSES,
            default: 'DRAFT'
        },

        rejectReason: String,
        submittedAt: Date,
        approvedAt: Date,

        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },

        // Tài khoản nhận tiền khi rút thu nhập
        bankAccount: {
            bankName: { type: String, trim: true },
            accountNumber: { type: String, trim: true },
            accountName: { type: String, trim: true }
        },

        // ---- Trạng thái làm việc (1 bản ghi / tài xế, cập nhật đè — không lưu hành trình) ----
        isOnline: {
            type: Boolean,
            default: false
        },

        // GeoJSON: coordinates = [lng, lat]. Chỉ khách / quán của đúng đơn đang giao thấy (BR-97)
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
        locationAt: Date,

        // Đơn đang giao (1 tài xế = 1 đơn — Q5). null = rảnh
        activeOrder: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Order',
            default: null
        },

        // Tạm không nhận đơn / không trực tuyến / không đăng ký ca tới thời điểm này
        dispatchBlockedUntil: {
            type: Date,
            default: null
        },
        // WITHDRAWALS: trả 3 đơn liên tiếp (khóa 1 ngày) · PENALTY: thang phạt vắng ca / hủy ca sát giờ
        dispatchBlockReason: {
            type: String,
            enum: ['WITHDRAWALS', 'PENALTY', null],
            default: null
        },

        // Số lần trả đơn đã nhận liên tiếp (giao thành công một đơn -> về 0)
        consecutiveWithdrawals: {
            type: Number,
            default: 0
        },

        // Thang phạt ca (BR-101): 0 sạch · 1 đã cảnh cáo · 2 đã khóa 3 ngày · 3 đã khóa 5 ngày · 4 khóa vĩnh viễn
        penaltyLevel: {
            type: Number,
            min: 0,
            max: 4,
            default: 0
        },
        // Thời điểm giảm bậc kế tiếp nếu không vi phạm thêm (30 ngày tính từ lúc hết khóa)
        penaltyDecayAt: {
            type: Date,
            default: null
        },

        completedCount: {
            type: Number,
            default: 0
        },

        ratingAvg: {
            type: Number,
            default: 0
        },

        ratingCount: {
            type: Number,
            default: 0
        },

        ratingSum: {
            type: Number,
            default: 0
        }
    },
    {
        timestamps: true
    }
);

shipperSchema.index({ location: '2dsphere' }, { sparse: true });
shipperSchema.index({ status: 1, isOnline: 1, activeOrder: 1 });

const Shipper = mongoose.model('Shipper', shipperSchema);

module.exports = Shipper;
module.exports.SHIPPER_STATUSES = SHIPPER_STATUSES;
module.exports.SHIPPER_DOCUMENT_TYPES = SHIPPER_DOCUMENT_TYPES;
module.exports.VEHICLE_TYPES = VEHICLE_TYPES;
