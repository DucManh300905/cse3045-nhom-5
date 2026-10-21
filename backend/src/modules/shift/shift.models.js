const mongoose = require('mongoose');

// Đăng ký ca tài xế (Đặc tả Đăng ký ca tài xế — bản chốt 21/10/2026, giai đoạn A).
// Ca = cam kết trực tuyến trong khung giờ; đơn vẫn điều phối tự động, ưu tiên người đăng ký ca.

const { ObjectId } = mongoose.Schema.Types;

const windowSchema = new mongoose.Schema(
    {
        start: { type: String, required: true },
        end: { type: String, required: true },
        // Số đơn dự kiến (quán ước lượng, không bắt buộc) -> tính số tài xế cần
        expectedOrders: { type: Number, min: 0, default: 0 }
    },
    { _id: false }
);

// ---- Lịch ngày của quán: hỏi 14:00, quán sửa tới 18:00, sau đó chỉ được bỏ khung (ghi "hủy muộn") ----
const dayPlanSchema = new mongoose.Schema(
    {
        restaurant: { type: ObjectId, ref: 'Restaurant', required: true },
        // 'YYYY-MM-DD' giờ VN
        date: { type: String, required: true },
        windows: { type: [windowSchema], default: [] },
        // WEEKLY: lấy từ lịch tuần (quán chưa trả lời) · ANSWER: quán đã xác nhận / sửa
        source: { type: String, enum: ['WEEKLY', 'ANSWER'], default: 'WEEKLY' },
        answeredAt: Date,
        // Quán bỏ khung sau mốc chốt khi đã có ca (chỉ ghi nhận ở giai đoạn A)
        lateCancels: {
            type: [new mongoose.Schema({ start: String, end: String, at: Date }, { _id: false })],
            default: []
        }
    },
    { timestamps: true }
);
dayPlanSchema.index({ restaurant: 1, date: 1 }, { unique: true });
dayPlanSchema.index({ date: 1 });

// ---- Mốc của một ngày (chạy lại an toàn: mỗi mốc chỉ làm một lần) ----
const shiftDaySchema = new mongoose.Schema(
    {
        area: { type: String, required: true },
        date: { type: String, required: true },
        askedAt: Date,
        closedAt: Date,
        reportedAt: Date
    },
    { timestamps: true }
);
shiftDaySchema.index({ area: 1, date: 1 }, { unique: true });

// ---- Ca của khu vực ----
const SHIFT_STATUSES = ['OPEN', 'LOCKED', 'RUNNING', 'DONE', 'CANCELLED'];

const shiftSchema = new mongoose.Schema(
    {
        area: { type: String, required: true },
        date: { type: String, required: true },
        start: { type: String, required: true },
        end: { type: String, required: true },
        startAt: { type: Date, required: true },
        endAt: { type: Date, required: true },
        // FIXED: khung cố định (Trưa / Chiều / Tối) · CUSTOM: khung quán tự chọn
        kind: { type: String, enum: ['FIXED', 'CUSTOM'], required: true },
        label: String,
        restaurants: {
            type: [
                new mongoose.Schema(
                    { restaurant: { type: ObjectId, ref: 'Restaurant' }, name: String, address: String, expectedOrders: Number },
                    { _id: false }
                )
            ],
            default: []
        },
        expectedOrders: { type: Number, default: 0 },
        driversNeeded: { type: Number, default: 1 },
        // OPEN: đang nhận đăng ký · LOCKED: đã chốt (2 giờ trước ca) · RUNNING · DONE · CANCELLED (không còn quán nào)
        status: { type: String, enum: SHIFT_STATUSES, default: 'OPEN' },
        lockedAt: Date,
        remindedAt: Date,
        startedAt: Date,
        check15At: Date,
        check30At: Date,
        endedAt: Date
    },
    { timestamps: true }
);
shiftSchema.index({ area: 1, date: 1, start: 1, end: 1 }, { unique: true });
shiftSchema.index({ status: 1, startAt: 1 });
shiftSchema.index({ startAt: 1, endAt: 1 });

// ---- Tài xế đăng ký ca ----
//   REGISTERED: đã đăng ký · ACTIVE: đã bật trực tuyến trong ca · NO_SHOW: 30 phút đầu ca chưa trực tuyến (vi phạm)
//   CANCELLED: hủy trước ≥ 2 giờ (không phạt) · LATE_CANCELLED: hủy sát giờ (vi phạm) · VOID: ca bị hủy / tài xế bị khóa (không phạt)
const ASSIGNMENT_STATUSES = ['REGISTERED', 'ACTIVE', 'NO_SHOW', 'CANCELLED', 'LATE_CANCELLED', 'VOID'];
const HOLDING_STATUSES = ['REGISTERED', 'ACTIVE'];

const assignmentSchema = new mongoose.Schema(
    {
        shift: { type: ObjectId, ref: 'Shift', required: true },
        shipper: { type: ObjectId, ref: 'Shipper', required: true },
        // Chép từ ca để kiểm tra trùng giờ, tìm người đang trong ca mà không cần join
        startAt: { type: Date, required: true },
        endAt: { type: Date, required: true },
        status: { type: String, enum: ASSIGNMENT_STATUSES, default: 'REGISTERED' },
        registeredAt: { type: Date, default: Date.now },
        activeAt: Date,
        cancelledAt: Date,
        remindedAt: Date,
        note: String
    },
    { timestamps: true }
);
assignmentSchema.index(
    { shift: 1, shipper: 1 },
    { name: 'one_holding_per_shift', unique: true, partialFilterExpression: { status: { $in: HOLDING_STATUSES } } }
);
assignmentSchema.index({ shipper: 1, startAt: 1 });
assignmentSchema.index({ status: 1, startAt: 1, endAt: 1 });

// ---- Lịch sử xử phạt tài xế ----
const penaltySchema = new mongoose.Schema(
    {
        shipper: { type: ObjectId, ref: 'Shipper', required: true },
        // VIOLATION: vi phạm ca · DECAY: giảm bậc · WITHDRAW_LOCK: trả 3 đơn liên tiếp · ADMIN_UNLOCK / ADMIN_UNBLOCK
        kind: { type: String, enum: ['VIOLATION', 'DECAY', 'WITHDRAW_LOCK', 'ADMIN_UNLOCK', 'ADMIN_UNBLOCK'], required: true },
        reason: { type: String, enum: ['NO_SHOW', 'LATE_CANCEL', 'WITHDRAWALS', null] },
        fromLevel: Number,
        toLevel: Number,
        lockedUntil: Date,
        shift: { type: ObjectId, ref: 'Shift' },
        actor: { type: ObjectId, ref: 'User' },
        note: String
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);
penaltySchema.index({ shipper: 1, createdAt: -1 });

const DayPlan = mongoose.model('RestaurantDayPlan', dayPlanSchema);
const ShiftDay = mongoose.model('ShiftDay', shiftDaySchema);
const Shift = mongoose.model('Shift', shiftSchema);
const ShiftAssignment = mongoose.model('ShiftAssignment', assignmentSchema);
const DriverPenalty = mongoose.model('DriverPenalty', penaltySchema);

module.exports = {
    DayPlan,
    ShiftDay,
    Shift,
    ShiftAssignment,
    DriverPenalty,
    SHIFT_STATUSES,
    ASSIGNMENT_STATUSES,
    HOLDING_STATUSES
};
