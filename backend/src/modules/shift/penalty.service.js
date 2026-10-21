const Shipper = require('../shipper/shipper.model');
const AuditLog = require('../audit/auditLog.model');
const dispatch = require('../shipper/dispatch.service');
const notifications = require('../notification/notification.service');
const { ShiftAssignment, DriverPenalty, HOLDING_STATUSES } = require('./shift.models');
const { settings } = require('./shift.config');
const { DAY_MS } = require('../../utils/vnTime');

/**
 * Xử phạt tài xế (BR-101, BR-102) — Đặc tả Đăng ký ca tài xế mục 6.
 *
 * Thang phạt (vắng ca, hủy ca sát giờ): mỗi vi phạm lên 1 bậc
 *   0 sạch -> 1 cảnh cáo -> 2 khóa 3 ngày -> 3 khóa 5 ngày -> 4 khóa vĩnh viễn (BLOCKED, admin mở lại -> bậc 3)
 * Giảm bậc: 30 ngày không vi phạm, tính từ lúc hết khóa: 1 -> 0, 2 -> 0, 3 -> 2 (ẩn, không khóa) rồi 30 ngày nữa -> 0.
 * "Bị khóa" chỉ chặn trực tuyến / nhận đơn / đăng ký ca; vẫn đăng nhập và rút tiền được.
 *
 * Luật riêng: trả 3 đơn đã nhận liên tiếp -> khóa nhận đơn 1 ngày (không vào thang).
 */

const REASON_TEXT = {
    NO_SHOW: 'vắng ca (30 phút đầu ca chưa bật trực tuyến)',
    LATE_CANCEL: 'hủy ca khi còn dưới 2 giờ',
    WITHDRAWALS: 'trả 3 đơn đã nhận liên tiếp'
};
const vnTime = (d) => d.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

const audit = (shipper, { action, before, after, note, actor }) =>
    AuditLog.create({
        actor,
        actorRole: actor ? 'ADMIN' : 'SYSTEM',
        action,
        targetType: 'Shipper',
        targetId: shipper._id,
        before,
        after,
        note
    }).catch((error) => console.error('[penalty] audit failed:', error.message));

const notifyShipper = (shipper, title, body) =>
    notifications.send([{ user: shipper.user, type: 'PENALTY', title, body, data: { shipperId: shipper._id, link: '/shipper/shifts' } }], { email: true });

/**
 * Bị khóa: tắt trực tuyến, thu hồi lời mời đang chờ, hủy (không phạt) các ca đã đăng ký bắt đầu trước khi hết khóa.
 * Đơn đang giao dở vẫn giao tiếp được.
 */
const releaseWhileLocked = async (shipper, until, now) => {
    await dispatch.declineOpenOffers(shipper._id, now);
    await ShiftAssignment.updateMany(
        { shipper: shipper._id, status: { $in: HOLDING_STATUSES }, startAt: { $gte: now, ...(until && { $lt: until }) } },
        { $set: { status: 'VOID', cancelledAt: now, note: 'Tài xế bị khóa' } }
    );
};

/** Ghi một vi phạm ca (NO_SHOW | LATE_CANCEL) -> lên bậc + hình phạt của bậc mới */
const applyViolation = async ({ shipperId, reason, shift, now = new Date() }) => {
    const s = settings();
    const shipper = await Shipper.findById(shipperId);
    if (!shipper || shipper.penaltyLevel >= 4) {
        return null;
    }

    const from = shipper.penaltyLevel || 0;
    const to = from + 1;
    const set = { penaltyLevel: to };
    let lockedUntil = null;

    if (to === 1) {
        set.penaltyDecayAt = new Date(now.getTime() + s.decayDays * DAY_MS);
    } else if (to <= 3) {
        lockedUntil = new Date(now.getTime() + s.lockDays[to] * DAY_MS);
        const current = shipper.dispatchBlockedUntil && shipper.dispatchBlockedUntil > lockedUntil ? shipper.dispatchBlockedUntil : lockedUntil;
        Object.assign(set, {
            dispatchBlockedUntil: current,
            dispatchBlockReason: 'PENALTY',
            isOnline: false,
            penaltyDecayAt: new Date(lockedUntil.getTime() + s.decayDays * DAY_MS)
        });
    } else {
        Object.assign(set, { status: 'BLOCKED', isOnline: false, penaltyDecayAt: null });
    }

    await Shipper.updateOne({ _id: shipper._id, penaltyLevel: from }, { $set: set });
    await DriverPenalty.create({ shipper: shipper._id, kind: 'VIOLATION', reason, fromLevel: from, toLevel: to, lockedUntil, shift });
    await audit(shipper, { action: 'SHIPPER_PENALTY', before: { level: from }, after: { level: to, lockedUntil }, note: reason });

    if (to >= 2) {
        await releaseWhileLocked(shipper, to === 4 ? null : lockedUntil, now);
    }

    const what = REASON_TEXT[reason] ?? reason;
    if (to === 1) {
        await notifyShipper(shipper, 'Cảnh cáo: vi phạm ca làm', `Lý do: ${what}. Vi phạm tiếp trong 30 ngày sẽ bị khóa nhận đơn 3 ngày.`);
    } else if (to <= 3) {
        await notifyShipper(
            shipper,
            `Tạm khóa nhận đơn ${s.lockDays[to]} ngày`,
            `Lý do: ${what}. Mở lại lúc ${vnTime(lockedUntil)}. Bạn vẫn đăng nhập và rút tiền được.${to === 3 ? ' Vi phạm tiếp sẽ bị khóa vĩnh viễn.' : ''}`
        );
    } else {
        await notifyShipper(shipper, 'Tài khoản tài xế bị khóa', `Lý do: ${what} (lần thứ 4). Liên hệ MAK nếu cần xem xét lại. Bạn vẫn rút được tiền đã kiếm.`);
    }
    return { from, to, lockedUntil };
};

/** Trả đơn đã nhận: đếm liên tiếp; đủ N lần -> khóa nhận đơn 1 ngày, bộ đếm về 0 */
const recordWithdrawal = async (shipperId, now = new Date()) => {
    const s = settings();
    const shipper = await Shipper.findByIdAndUpdate(shipperId, { $inc: { consecutiveWithdrawals: 1 } }, { returnDocument: 'after' });
    if (!shipper || shipper.consecutiveWithdrawals < s.maxConsecutiveWithdrawals) {
        return { blocked: false, count: shipper?.consecutiveWithdrawals ?? 0 };
    }

    const lockedUntil = new Date(now.getTime() + s.withdrawLockHours * 60 * 60 * 1000);
    const until = shipper.dispatchBlockedUntil && shipper.dispatchBlockedUntil > lockedUntil ? shipper.dispatchBlockedUntil : lockedUntil;
    await Shipper.updateOne(
        { _id: shipper._id },
        {
            $set: {
                consecutiveWithdrawals: 0,
                dispatchBlockedUntil: until,
                dispatchBlockReason: until === lockedUntil ? 'WITHDRAWALS' : shipper.dispatchBlockReason,
                isOnline: false
            }
        }
    );
    await DriverPenalty.create({ shipper: shipper._id, kind: 'WITHDRAW_LOCK', reason: 'WITHDRAWALS', lockedUntil });
    await audit(shipper, { action: 'SHIPPER_WITHDRAW_LOCK', after: { lockedUntil }, note: 'WITHDRAWALS' });
    await releaseWhileLocked(shipper, lockedUntil, now);
    await notifyShipper(shipper, 'Tạm khóa nhận đơn 1 ngày', `Lý do: ${REASON_TEXT.WITHDRAWALS}. Mở lại lúc ${vnTime(lockedUntil)}.`);
    return { blocked: true, count: s.maxConsecutiveWithdrawals, lockedUntil };
};

/** Job: giảm bậc cho tài xế đủ 30 ngày không vi phạm (tính từ lúc hết khóa). Trả về số tài xế được giảm. */
const decayPenalties = async (now = new Date()) => {
    const s = settings();
    const due = await Shipper.find({ penaltyLevel: { $gte: 1, $lte: 3 }, penaltyDecayAt: { $ne: null, $lte: now } });
    let count = 0;
    for (const shipper of due) {
        const from = shipper.penaltyLevel;
        const to = from === 3 ? 2 : 0;
        const nextDecay = to === 2 ? new Date(shipper.penaltyDecayAt.getTime() + s.decayDays * DAY_MS) : null;
        const { modifiedCount } = await Shipper.updateOne(
            { _id: shipper._id, penaltyLevel: from, penaltyDecayAt: shipper.penaltyDecayAt },
            { $set: { penaltyLevel: to, penaltyDecayAt: nextDecay } }
        );
        if (!modifiedCount) continue;
        count += 1;
        await DriverPenalty.create({ shipper: shipper._id, kind: 'DECAY', fromLevel: from, toLevel: to });
        await notifyShipper(
            shipper,
            to === 0 ? 'Đã xóa hết vi phạm' : 'Đã giảm mức vi phạm',
            to === 0 ? '30 ngày không vi phạm — bạn không còn lỗi nào.' : 'Thêm 30 ngày không vi phạm nữa để xóa hết lỗi. Vi phạm trong thời gian này sẽ bị khóa 5 ngày.'
        );
    }
    return count;
};

/** Admin mở khóa tạm thời sớm (thang phạt / trả đơn). 30 ngày giảm bậc tính lại từ lúc mở. */
const adminUnlock = async ({ shipper, actor, note, now = new Date() }) => {
    const set = { dispatchBlockedUntil: null, dispatchBlockReason: null };
    if (shipper.penaltyLevel >= 2 && shipper.penaltyLevel <= 3) {
        set.penaltyDecayAt = new Date(now.getTime() + settings().decayDays * DAY_MS);
    }
    await Shipper.updateOne({ _id: shipper._id }, { $set: set });
    await DriverPenalty.create({ shipper: shipper._id, kind: 'ADMIN_UNLOCK', fromLevel: shipper.penaltyLevel, toLevel: shipper.penaltyLevel, actor, note });
    await audit(shipper, { action: 'SHIPPER_UNLOCK', before: { lockedUntil: shipper.dispatchBlockedUntil }, after: { lockedUntil: null }, note, actor });
    await notifyShipper(shipper, 'Đã được mở khóa nhận đơn', note || 'Admin đã mở khóa cho bạn.');
};

/** Admin mở lại tài khoản khóa vĩnh viễn (BLOCKED -> APPROVED): về bậc 3, đếm lại 30 ngày */
const onAdminUnblock = async ({ shipper, actor, now = new Date() }) => {
    if ((shipper.penaltyLevel || 0) < 4) {
        return;
    }
    await Shipper.updateOne(
        { _id: shipper._id },
        { $set: { penaltyLevel: 3, penaltyDecayAt: new Date(now.getTime() + settings().decayDays * DAY_MS) } }
    );
    await DriverPenalty.create({ shipper: shipper._id, kind: 'ADMIN_UNBLOCK', fromLevel: 4, toLevel: 3, actor });
};

module.exports = {
    REASON_TEXT,
    applyViolation,
    recordWithdrawal,
    decayPenalties,
    adminUnlock,
    onAdminUnblock
};
