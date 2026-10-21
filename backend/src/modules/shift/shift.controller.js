const Shipper = require('../shipper/shipper.model');
const User = require('../user/user.model');
const shiftService = require('./shift.service');
const penalty = require('./penalty.service');
const { findShipper } = require('../shipper/delivery.service');
const { DriverPenalty } = require('./shift.models');
const { isVerifiedEmail } = require('../auth/otp.service');
const { recordAudit } = require('../audit/audit.service');
const AppError = require('../../utils/AppError');
const asyncHandler = require('../../utils/asyncHandler');
const { vnParts, isDateKey } = require('../../utils/vnTime');

const ok = (res, data, message) => res.status(200).json({ success: true, ...(message && { message }), data });

// ======================= Quán: /merchant/schedule =======================

// GET /merchant/schedule — lịch tuần, lịch hôm nay / ngày mai, tình trạng ca
const getSchedule = asyncHandler(async (req, res) => ok(res, await shiftService.merchantSchedule(req.restaurant)));

// PUT /merchant/schedule/weekly { weeklySchedule: [{ dayOfWeek, start, end, expectedOrders? }] }
const putWeekly = asyncHandler(async (req, res) => {
    await shiftService.setWeeklySchedule(req.restaurant, req.body.weeklySchedule);
    return ok(res, await shiftService.merchantSchedule(req.restaurant), 'Weekly schedule saved');
});

// PUT /merchant/schedule/days/:date { windows: [{ start, end, expectedOrders? }] }
const putDay = asyncHandler(async (req, res) => {
    await shiftService.setDayPlan({ restaurant: req.restaurant, date: req.params.date, windows: req.body.windows });
    return ok(res, await shiftService.merchantSchedule(req.restaurant), 'Schedule saved');
});

// ======================= Tài xế: /shipper/shifts, /shipper/penalties, /shipper/email =======================

const me = (req) => findShipper(req.user.userId);

// GET /shipper/shifts — ca hôm nay + ngày mai
const listShifts = asyncHandler(async (req, res) => ok(res, await shiftService.shipperShifts(await me(req))));

// POST /shipper/shifts/:id/register
const registerShift = asyncHandler(async (req, res) => {
    await shiftService.register({ shipper: await me(req), shiftId: req.params.id });
    return ok(res, await shiftService.shipperShifts(await me(req)), 'Shift registered');
});

// POST /shipper/shifts/:id/cancel — sát giờ (< 2 giờ) tính vi phạm
const cancelShift = asyncHandler(async (req, res) => {
    const result = await shiftService.cancel({ shipper: await me(req), shiftId: req.params.id });
    return ok(res, { ...(await shiftService.shipperShifts(await me(req))), late: result.late, penalty: result.penalty }, 'Shift cancelled');
});

const penaltySummary = async (shipper) => ({
    level: shipper.penaltyLevel || 0,
    decayAt: shipper.penaltyDecayAt,
    lockedUntil: shipper.dispatchBlockedUntil && shipper.dispatchBlockedUntil > new Date() ? shipper.dispatchBlockedUntil : null,
    lockReason: shipper.dispatchBlockReason,
    consecutiveWithdrawals: shipper.consecutiveWithdrawals || 0,
    blocked: shipper.status === 'BLOCKED',
    history: await DriverPenalty.find({ shipper: shipper._id }).sort({ createdAt: -1 }).limit(50).populate('shift', 'date start end label').lean()
});

// GET /shipper/penalties — bậc vi phạm, khóa tới khi nào, lịch sử
const myPenalties = asyncHandler(async (req, res) => ok(res, await penaltySummary(await me(req))));

/**
 * POST /shipper/email { email, verificationToken } — tài khoản tài xế cũ chưa có email:
 * lấy mã qua /auth/otp/send + /auth/otp/verify rồi gửi vé xác thực vào đây (BR-103).
 */
const setEmail = asyncHandler(async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!isVerifiedEmail(req.body.verificationToken, email)) {
        throw new AppError(400, 'OTP_REQUIRED', 'Email must be verified with an OTP code first');
    }
    try {
        await User.updateOne({ _id: req.user.userId }, { $set: { email, emailVerified: true } });
    } catch (error) {
        if (error.code === 11000) {
            throw new AppError(409, 'DUPLICATE', 'Email already exists');
        }
        throw error;
    }
    return ok(res, { email, emailVerified: true }, 'Email verified');
});

// ======================= Admin =======================

// GET /admin/shifts?date=YYYY-MM-DD (mặc định hôm nay)
const adminListShifts = asyncHandler(async (req, res) => {
    const date = isDateKey(req.query.date) ? req.query.date : vnParts().date;
    return ok(res, { date, shifts: await shiftService.adminShifts(date) });
});

const findShipperById = async (id) => {
    const shipper = await Shipper.findById(id);
    if (!shipper) {
        throw new AppError(404, 'NOT_FOUND', 'Driver not found');
    }
    return shipper;
};

// GET /admin/shippers/:id/penalties
const adminPenalties = asyncHandler(async (req, res) => ok(res, await penaltySummary(await findShipperById(req.params.id))));

// POST /admin/shippers/:id/unlock { reason? } — mở khóa tạm thời sớm
const adminUnlock = asyncHandler(async (req, res) => {
    const shipper = await findShipperById(req.params.id);
    if (!shipper.dispatchBlockedUntil || shipper.dispatchBlockedUntil <= new Date()) {
        throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'Driver is not locked');
    }
    await penalty.adminUnlock({ shipper, actor: req.user.userId, note: req.body?.reason });
    await recordAudit(req, { action: 'SHIPPER_UNLOCK', targetType: 'Shipper', targetId: shipper._id, note: req.body?.reason });
    return ok(res, await penaltySummary(await findShipperById(req.params.id)), 'Driver unlocked');
});

module.exports = {
    getSchedule,
    putWeekly,
    putDay,
    listShifts,
    registerShift,
    cancelShift,
    myPenalties,
    setEmail,
    adminListShifts,
    adminPenalties,
    adminUnlock
};
