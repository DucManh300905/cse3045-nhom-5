const mongoose = require('mongoose');

// Vòng đời đơn (BR-35) — chuyển trạng thái xem docs/project.md
// PENDING_PAYMENT: đơn chuyển khoản trả trước đang chờ tiền về (W2) — quán chưa thấy đơn
const ORDER_STATUSES = ['PENDING_PAYMENT', 'PLACED', 'ACCEPTED', 'REJECTED', 'PREPARING', 'READY', 'DELIVERING', 'COMPLETED', 'CANCELLED'];
const FULFILLMENT_TYPES = ['DELIVERY', 'PICKUP'];
// BANK_TRANSFER: khách chuyển khoản VietQR trước, webhook SePay tự xác nhận
const PAYMENT_METHODS = ['COD', 'BANK_TRANSFER'];
const PAYMENT_STATUSES = ['UNPAID', 'PAID', 'REFUND_PENDING', 'REFUNDED'];
const CANCEL_REASONS = ['OUT_OF_STOCK', 'OVERLOADED', 'CLOSED', 'CUSTOMER_CHANGED_MIND', 'TIMEOUT', 'PAYMENT_TIMEOUT', 'DELIVERY_FAILED', 'OTHER'];
// SELF: quán tự giao · PLATFORM: tài xế MAK giao (chỉ đơn trả trước — BR-91)
const DELIVERY_MODES = ['SELF', 'PLATFORM'];
// Các bước của tài xế (đơn PLATFORM), tách khỏi status chính của đơn (BR-93)
const DELIVERY_STATUSES = ['SEARCHING', 'NO_SHIPPER', 'ASSIGNED', 'ARRIVED_AT_STORE', 'PICKED_UP', 'DELIVERED', 'FAILED'];

const money = {
    type: Number,
    required: true,
    min: 0,
    validate: {
        validator: Number.isInteger,
        message: '{PATH} must be an integer'
    }
};

// Snapshot từng dòng đơn (BR-33): đổi giá / xóa món sau này không ảnh hưởng đơn cũ
const orderItemSchema = new mongoose.Schema({
    menuItem: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MenuItem',
        required: true
    },

    name: {
        type: String,
        required: true
    },

    imageUrl: String,

    variant: {
        type: new mongoose.Schema({ name: String, price: money }),
        default: undefined
    },

    options: {
        type: [new mongoose.Schema({ groupName: String, name: String, price: money })],
        default: []
    },

    // (variant.price ?? basePrice) + Σ options.price
    unitPrice: money,

    qty: {
        type: Number,
        required: true,
        min: 1
    },

    lineTotal: money,

    note: String
});

const statusHistorySchema = new mongoose.Schema(
    {
        from: String,
        to: {
            type: String,
            required: true
        },
        actorType: {
            type: String,
            enum: ['CUSTOMER', 'OWNER', 'ADMIN', 'SYSTEM', 'SHIPPER'],
            required: true
        },
        actor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        reason: String,
        at: {
            type: Date,
            default: Date.now
        }
    },
    {
        _id: false
    }
);

// Đơn hàng (docs/database.md mục 3.5)
const orderSchema = new mongoose.Schema(
    {
        // Mã hiển thị, vd MAK261006-0042
        code: {
            type: String,
            required: true,
            unique: true
        },

        customer: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },

        restaurant: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Restaurant',
            required: true
        },

        restaurantSnapshot: {
            name: String,
            slug: String,
            phone: String,
            address: String
        },

        items: {
            type: [orderItemSchema],
            validate: {
                validator: (list) => list.length > 0,
                message: 'Order must have at least one item'
            }
        },

        fulfillmentType: {
            type: String,
            enum: FULFILLMENT_TYPES,
            default: 'DELIVERY'
        },

        // Bắt buộc khi DELIVERY
        delivery: {
            receiverName: String,
            phone: String,
            addressLine: String,
            note: String,
            // Vị trí nơi nhận (BR-81, bắt buộc với DELIVERY từ 20/10/2026) — dữ liệu cá nhân (BR-85)
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

            // ---- Giao bằng tài xế MAK (deliveryMode = PLATFORM) ----
            status: {
                type: String,
                enum: [...DELIVERY_STATUSES, null]
            },
            shipper: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Shipper'
            },
            // Tài khoản người dùng của tài xế: phòng socket + kiểm tra quyền
            shipperUser: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            // Khách / quán thấy để nhận ra tài xế
            shipperSnapshot: {
                fullName: String,
                phone: String,
                vehicleType: String,
                licensePlate: String
            },
            searchStartedAt: Date,
            // Số lời mời đã gửi trong lượt tìm hiện tại
            attempts: Number,
            assignedAt: Date,
            arrivedAt: Date,
            pickedUpAt: Date,
            deliveredAt: Date,
            failedAt: Date,
            failReason: String,
            // Ảnh xác nhận giao (Q8, chốt 21/10/2026) / ảnh giao thất bại — file private, xem qua API có kiểm quyền
            proof: {
                kind: { type: String, enum: ['DELIVERED', 'FAILED'] },
                fileKey: String,
                mimeType: String,
                takenAt: Date
            },
            // Giờ đến dự kiến (tính lại tối đa mỗi phút theo vị trí tài xế)
            eta: {
                minutes: Number,
                target: { type: String, enum: ['STORE', 'CUSTOMER'] },
                updatedAt: Date
            },
            // Mất tín hiệu khi đang giao: đã báo admin lúc này (báo 1 lần)
            staleAlertAt: Date,
            // Khách đánh giá tài xế sau khi nhận hàng
            rating: {
                stars: { type: Number, min: 1, max: 5 },
                comment: String,
                at: Date
            }
        },

        // SELF (quán tự giao) | PLATFORM (tài xế MAK) — chụp theo chế độ của quán lúc đặt
        deliveryMode: {
            type: String,
            enum: DELIVERY_MODES
        },
        // Tiền công tài xế (MAK trả, khách vẫn miễn phí ship — Q3, Q4): tính lúc đặt từ route.distanceKm
        shipperFee: { ...money, default: 0 },

        // Tuyến quán -> nơi nhận lúc đặt (BR-82): đường đi thật (ROUTING) hoặc ước lượng (ESTIMATE)
        route: {
            distanceKm: Number,
            durationMinutes: Number,
            source: { type: String, enum: ['ROUTING', 'ESTIMATE'] },
            provider: String,
            polyline: String
        },
        // Thời gian giao dự kiến từ lúc quán nhận = chuẩn bị + di chuyển (BR-84)
        estimatedDeliveryMinutes: Number,

        subtotal: money,
        // Luôn 0: miễn phí giao hàng (quyết định 06/10/2026)
        deliveryFee: { ...money, default: 0 },
        // Tổng giảm = restaurantDiscount (quán chịu) + platformDiscount (MAK chịu)
        discount: { ...money, default: 0 },
        restaurantDiscount: { ...money, default: 0 },
        platformDiscount: { ...money, default: 0 },
        total: money,

        // Snapshot voucher đã áp (tối đa 1 voucher quán + 1 voucher MAK)
        vouchers: {
            type: [
                new mongoose.Schema(
                    {
                        voucher: { type: mongoose.Schema.Types.ObjectId, ref: 'Voucher', required: true },
                        code: { type: String, required: true },
                        fundedBy: { type: String, enum: ['PLATFORM', 'RESTAURANT'], required: true },
                        type: { type: String, enum: ['PERCENT', 'FIXED'], required: true },
                        value: { type: Number, required: true },
                        discount: money
                    },
                    { _id: false }
                )
            ],
            default: []
        },

        // Snapshot hoa hồng tại lúc đặt (BR-51)
        commissionRate: {
            type: Number,
            required: true
        },
        commissionAmount: money,

        paymentMethod: {
            type: String,
            enum: PAYMENT_METHODS,
            default: 'COD'
        },

        paymentStatus: {
            type: String,
            enum: PAYMENT_STATUSES,
            default: 'UNPAID'
        },

        // ---- Trả trước (BANK_TRANSFER) ----
        // Nội dung chuyển khoản = mã đơn bỏ dấu gạch (MAK2610110001): ngân hàng hay bỏ ký tự đặc biệt
        paymentCode: {
            type: String,
            unique: true,
            sparse: true
        },
        // Quá hạn chưa nhận đủ tiền -> job hủy đơn, hoàn suất
        paymentDeadline: Date,
        paidAt: Date,
        paidAmount: Number,

        status: {
            type: String,
            enum: ORDER_STATUSES,
            default: 'PLACED'
        },

        statusHistory: {
            type: [statusHistorySchema],
            default: []
        },

        cancelReason: {
            code: {
                type: String,
                enum: CANCEL_REASONS
            },
            note: String
        },

        estimatedReadyAt: Date,
        // Lúc đơn tới quán: COD = lúc đặt; trả trước = lúc nhận đủ tiền (null khi đang chờ thanh toán
        // -> quán không thấy, báo cáo không tính, hạn 5 phút quán nhận đơn đếm từ đây)
        placedAt: {
            type: Date,
            default: Date.now
        },
        acceptedAt: Date,
        completedAt: Date,
        cancelledAt: Date,

        isReviewed: {
            type: Boolean,
            default: false
        }
    },
    {
        timestamps: true
    }
);

orderSchema.index({ customer: 1, createdAt: -1 });
orderSchema.index({ restaurant: 1, status: 1, createdAt: -1 });
orderSchema.index({ status: 1, placedAt: 1 });
orderSchema.index({ restaurant: 1, completedAt: -1 });
orderSchema.index({ status: 1, paymentDeadline: 1 });
orderSchema.index({ 'delivery.status': 1, status: 1 }, { sparse: true });
orderSchema.index({ 'delivery.shipper': 1, createdAt: -1 }, { sparse: true });

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
module.exports.ORDER_STATUSES = ORDER_STATUSES;
module.exports.FULFILLMENT_TYPES = FULFILLMENT_TYPES;
module.exports.PAYMENT_METHODS = PAYMENT_METHODS;
module.exports.PAYMENT_STATUSES = PAYMENT_STATUSES;
module.exports.CANCEL_REASONS = CANCEL_REASONS;
module.exports.DELIVERY_MODES = DELIVERY_MODES;
module.exports.DELIVERY_STATUSES = DELIVERY_STATUSES;
