const Restaurant = require('../restaurant/restaurant.model');
const Shipper = require('../shipper/shipper.model');
const User = require('../user/user.model');
const notifications = require('../notification/notification.service');
const penalty = require('./penalty.service');
const { effectiveDeliveryMode } = require('./shift.query');
const { DayPlan, ShiftDay, Shift, ShiftAssignment, HOLDING_STATUSES } = require('./shift.models');
const { AREA, AREA_NAME, FIXED_SLOTS, settings, fixedSlotOf, slotLabel } = require('./shift.config');
const AppError = require('../../utils/AppError');
const { vnParts, vnDateTime, addDays, weekdayOf, toMinutes } = require('../../utils/vnTime');

/**
 * Đăng ký ca tài xế — giai đoạn A (Đặc tả Đăng ký ca tài xế, bản chốt 21/10/2026).
 *
 * Hằng ngày (giờ VN), cho lịch NGÀY MAI:
 *   14:00 hỏi quán "Theo lịch" (dựng sẵn từ lịch tuần) · 18:00 chốt lịch, gộp thành ca của khu vực, gửi danh sách ca cho tài xế
 *   21:00 báo cáo quán (ca nào đã có / còn thiếu tài xế)
 * Mỗi ca: 2 giờ trước -> chốt đăng ký (ca trống: báo quán + admin) · 1 giờ trước -> nhắc tài xế
 *   bắt đầu -> RUNNING · phút 15 -> nhắc người chưa trực tuyến · phút 30 -> vắng ca (vi phạm) · kết thúc -> DONE
 * Mọi mốc ghi thời điểm đã làm -> job chạy lại / server khởi động lại không làm hai lần, mốc bị lỡ được làm bù.
 */

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const vnClock = (d) => vnParts(d).time;

// ======================= Khung giờ =======================

const STEP_RE = /^([01]\d|2[0-3]):(00|30)$/;

/**
 * Kiểm tra danh sách khung (của 1 ngày): HH:00 / HH:30, dài 1–4 giờ (khung cố định giữ nguyên độ dài), không chồng nhau.
 * @returns khung đã chuẩn hóa, sắp theo giờ bắt đầu
 */
const normalizeWindows = (windows, field = 'windows') => {
    const s = settings();
    const list = (windows || []).map((w) => ({
        start: String(w.start),
        end: String(w.end),
        expectedOrders: Math.max(0, Math.min(500, Number.parseInt(w.expectedOrders, 10) || 0))
    }));
    const errors = [];
    list.forEach((w, i) => {
        const fixed = fixedSlotOf(w.start, w.end);
        const length = toMinutes(w.end) - toMinutes(w.start);
        if (!fixed && (!STEP_RE.test(w.start) || !STEP_RE.test(w.end))) {
            errors.push({ field: `${field}[${i}]`, msg: 'Time must be HH:00 or HH:30' });
        } else if (!fixed && (length < s.minMinutes || length > s.maxMinutes)) {
            errors.push({ field: `${field}[${i}]`, msg: 'A custom window must be 1 to 4 hours long' });
        }
    });
    const sorted = [...list].sort((a, b) => a.start.localeCompare(b.start));
    sorted.forEach((w, i) => {
        if (i > 0 && sorted[i - 1].end > w.start) {
            errors.push({ field, msg: 'Windows overlap' });
        }
    });
    if (errors.length) {
        throw new AppError(400, 'VALIDATION_ERROR', errors[0].msg, errors);
    }
    return sorted;
};

const weeklyFor = (restaurant, date) =>
    (restaurant.weeklySchedule || [])
        .filter((w) => w.dayOfWeek === weekdayOf(date))
        .map(({ start, end, expectedOrders }) => ({ start, end, expectedOrders }))
        .sort((a, b) => a.start.localeCompare(b.start));

// ======================= Lịch của quán =======================

const isClosed = async (date, now) => {
    const { date: today } = vnParts(now);
    if (date <= today) return true;
    const day = await ShiftDay.findOne({ area: AREA, date }).select('closedAt').lean();
    return Boolean(day?.closedAt);
};

/** Lịch tuần (ghi đè toàn bộ) */
const setWeeklySchedule = async (restaurant, weekly) => {
    const byDay = new Map();
    (weekly || []).forEach((w) => {
        const day = Number(w.dayOfWeek);
        if (!Number.isInteger(day) || day < 0 || day > 6) {
            throw new AppError(400, 'VALIDATION_ERROR', 'dayOfWeek must be 0-6');
        }
        byDay.set(day, [...(byDay.get(day) || []), w]);
    });
    const list = [];
    for (const [day, windows] of byDay) {
        normalizeWindows(windows, `weeklySchedule (day ${day})`).forEach((w) => list.push({ dayOfWeek: day, ...w }));
    }
    restaurant.weeklySchedule = list.sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.start.localeCompare(b.start));
    await restaurant.save();
    return restaurant;
};

/** Gỡ quán khỏi ca (quán bỏ khung sau khi chốt); ca không còn quán nào -> hủy ca, báo tài xế (không phạt) */
const removeFromShift = async (restaurant, date, window, now) => {
    const shift = await Shift.findOne({ area: AREA, date, start: window.start, end: window.end, status: { $ne: 'CANCELLED' } });
    if (!shift) return;
    shift.restaurants = shift.restaurants.filter((r) => String(r.restaurant) !== String(restaurant._id));
    shift.expectedOrders = shift.restaurants.reduce((sum, r) => sum + (r.expectedOrders || 0), 0);
    shift.driversNeeded = Math.max(1, Math.ceil(shift.expectedOrders / settings().ordersPerDriver));
    if (shift.restaurants.length === 0) {
        shift.status = 'CANCELLED';
    }
    await shift.save();

    if (shift.status === 'CANCELLED') {
        const holders = await ShiftAssignment.find({ shift: shift._id, status: { $in: HOLDING_STATUSES } }).populate('shipper', 'user');
        await ShiftAssignment.updateMany(
            { shift: shift._id, status: { $in: HOLDING_STATUSES } },
            { $set: { status: 'VOID', cancelledAt: now, note: 'Ca bị hủy (quán không cần nữa)' } }
        );
        await notifications.send(
            holders.filter((a) => a.shipper?.user).map((a) => ({
                user: a.shipper.user,
                type: 'SHIFT_CANCELLED',
                title: `Ca ${shift.label} ngày ${shift.date} đã bị hủy`,
                body: 'Quán không còn cần tài xế khung này. Ca được hủy, bạn không bị tính vi phạm.',
                data: { link: '/shipper/shifts' }
            })),
            { email: true }
        );
    }
};

/**
 * Quán sửa lịch một ngày (hôm nay / ngày mai).
 * Trước mốc chốt (18:00 hôm trước): sửa tự do. Sau mốc chốt: chỉ được BỎ khung (ghi "hủy muộn", gỡ khỏi ca), không thêm / sửa.
 */
const setDayPlan = async ({ restaurant, date, windows, now = new Date() }) => {
    const { date: today } = vnParts(now);
    if (![today, addDays(today, 1)].includes(date)) {
        throw new AppError(400, 'VALIDATION_ERROR', 'date must be today or tomorrow');
    }
    const next = normalizeWindows(windows);
    const closed = await isClosed(date, now);
    const plan = (await DayPlan.findOne({ restaurant: restaurant._id, date })) ?? new DayPlan({ restaurant: restaurant._id, date, windows: weeklyFor(restaurant, date) });

    if (!closed) {
        plan.windows = next;
        plan.source = 'ANSWER';
        plan.answeredAt = now;
        await plan.save();
        return plan;
    }

    const key = (w) => `${w.start}-${w.end}`;
    const current = new Map(plan.windows.map((w) => [key(w), w]));
    const added = next.filter((w) => !current.has(key(w)));
    if (added.length) {
        throw new AppError(409, 'SCHEDULE_CLOSED', 'The schedule for this day is closed: you can only remove windows', [
            { field: 'windows', msg: 'Cannot add windows after the cutoff' }
        ]);
    }
    const keep = new Set(next.map(key));
    const removed = plan.windows.filter((w) => !keep.has(key(w)));
    plan.windows = plan.windows.filter((w) => keep.has(key(w)));
    plan.lateCancels.push(...removed.map((w) => ({ start: w.start, end: w.end, at: now })));
    plan.source = 'ANSWER';
    plan.answeredAt = plan.answeredAt ?? now;
    await plan.save();
    for (const w of removed) {
        await removeFromShift(restaurant, date, w, now);
    }
    return plan;
};

// ======================= Ca của khu vực =======================

/** Gộp lịch các quán "Theo lịch" của một ngày thành ca (gọi lúc chốt 18:00 hoặc làm bù) */
const buildShifts = async (date) => {
    const s = settings();
    const restaurants = await Restaurant.find({ status: 'APPROVED', deliveryMode: 'SCHEDULED' }).select('name address weeklySchedule');
    const plans = new Map((await DayPlan.find({ date, restaurant: { $in: restaurants.map((r) => r._id) } })).map((p) => [String(p.restaurant), p]));

    const groups = new Map();
    for (const r of restaurants) {
        let plan = plans.get(String(r._id));
        if (!plan) {
            // Quán chuyển sang "Theo lịch" sau 14:00 -> dùng lịch tuần
            plan = await DayPlan.findOneAndUpdate(
                { restaurant: r._id, date },
                { $setOnInsert: { windows: weeklyFor(r, date), source: 'WEEKLY' } },
                { upsert: true, returnDocument: 'after' }
            );
        }
        for (const w of plan.windows) {
            const k = `${w.start}-${w.end}`;
            const g = groups.get(k) ?? { start: w.start, end: w.end, restaurants: [] };
            g.restaurants.push({ restaurant: r._id, name: r.name, address: r.address, expectedOrders: w.expectedOrders || 0 });
            groups.set(k, g);
        }
    }

    const created = [];
    for (const g of groups.values()) {
        const expectedOrders = g.restaurants.reduce((sum, r) => sum + r.expectedOrders, 0);
        const shift = await Shift.findOneAndUpdate(
            { area: AREA, date, start: g.start, end: g.end },
            {
                $set: {
                    restaurants: g.restaurants,
                    expectedOrders,
                    driversNeeded: Math.max(1, Math.ceil(expectedOrders / s.ordersPerDriver))
                },
                $setOnInsert: {
                    startAt: vnDateTime(date, g.start),
                    endAt: vnDateTime(date, g.end),
                    kind: fixedSlotOf(g.start, g.end) ? 'FIXED' : 'CUSTOM',
                    label: slotLabel(g.start, g.end),
                    status: 'OPEN'
                }
            },
            { upsert: true, returnDocument: 'after' }
        );
        created.push(shift);
    }
    return created.sort((a, b) => a.start.localeCompare(b.start));
};

const ownerIdsOf = async (restaurantIds) =>
    (await Restaurant.find({ _id: { $in: restaurantIds } }).select('owner').lean()).map((r) => r.owner);

const approvedShipperUsers = async () => (await Shipper.find({ status: 'APPROVED' }).select('user').lean()).map((s) => s.user);

const holdingCount = (shiftId) => ShiftAssignment.countDocuments({ shift: shiftId, status: { $in: HOLDING_STATUSES } });

// ---- Mốc hằng ngày ----

const askRestaurants = async (date) => {
    const restaurants = await Restaurant.find({ status: 'APPROVED', deliveryMode: 'SCHEDULED' }).select('owner name weeklySchedule');
    const list = [];
    for (const r of restaurants) {
        const plan = await DayPlan.findOneAndUpdate(
            { restaurant: r._id, date },
            { $setOnInsert: { windows: weeklyFor(r, date), source: 'WEEKLY' } },
            { upsert: true, returnDocument: 'after' }
        );
        list.push({
            user: r.owner,
            type: 'SHIFT_PLAN_REQUEST',
            title: `Xác nhận khung cần tài xế ngày ${date}`,
            body: `${plan.windows.length ? `Theo lịch tuần: ${plan.windows.map((w) => slotLabel(w.start, w.end)).join(', ')}.` : 'Lịch tuần không có khung nào.'} Sửa trước ${settings().closeAt} hôm nay; không sửa thì dùng lịch tuần.`,
            data: { restaurantId: r._id, link: '/owner/schedule' }
        });
    }
    await notifications.send(list, { email: true });
    return list.length;
};

const closeDay = async (date) => {
    const shifts = await buildShifts(date);
    if (shifts.length) {
        const lines = shifts.map((sh) => `${sh.label} (${sh.start}–${sh.end}): ${sh.restaurants.map((r) => r.name).join(', ')} · cần ${sh.driversNeeded} tài xế`);
        await notifications.send(
            (await approvedShipperUsers()).map((user) => ({
                user,
                type: 'SHIFT_LIST',
                title: `Ca cần tài xế ngày ${date} (${AREA_NAME})`,
                body: `${lines.join('\n')}\nĐăng ký tới ${settings().cutoffHours} giờ trước giờ bắt đầu ca.`,
                data: { link: '/shipper/shifts' }
            })),
            { email: true }
        );
    }
    return shifts.length;
};

const reportDay = async (date) => {
    const shifts = await Shift.find({ area: AREA, date, status: { $ne: 'CANCELLED' } }).sort({ start: 1 });
    const byRestaurant = new Map();
    for (const sh of shifts) {
        const count = await holdingCount(sh._id);
        for (const r of sh.restaurants) {
            const rows = byRestaurant.get(String(r.restaurant)) ?? [];
            rows.push(`${sh.label} (${sh.start}–${sh.end}): ${count ? `${count} tài xế` : 'chưa có tài xế'}`);
            byRestaurant.set(String(r.restaurant), rows);
        }
    }
    const owners = await Restaurant.find({ _id: { $in: [...byRestaurant.keys()] } }).select('owner').lean();
    await notifications.send(
        owners.map((r) => ({
            user: r.owner,
            type: 'SHIFT_REPORT',
            title: `Tình hình tài xế ngày ${date}`,
            body: `${byRestaurant.get(String(r._id)).join('\n')}\nTài xế vẫn đăng ký được tới ${settings().cutoffHours} giờ trước mỗi ca.`,
            data: { restaurantId: r._id, link: '/owner/schedule' }
        })),
        { email: true }
    );
    return owners.length;
};

/** Làm mốc nếu đã tới giờ và chưa làm (đặt cờ nguyên tử trước để không làm hai lần) */
const runMilestone = async (date, field, due, fn) => {
    if (!due) return 0;
    const day = await ShiftDay.findOneAndUpdate(
        { area: AREA, date, [field]: null },
        { $set: { [field]: new Date() } },
        { returnDocument: 'after' }
    ).catch(() => null);
    if (!day) return 0;
    try {
        return (await fn(date)) || 1;
    } catch (error) {
        // Lỗi giữa chừng -> bỏ cờ để lần chạy sau làm lại
        await ShiftDay.updateOne({ area: AREA, date }, { $set: { [field]: null } });
        throw error;
    }
};

const dailyMilestones = async (now) => {
    const s = settings();
    const { date: today, time } = vnParts(now);
    const tomorrow = addDays(today, 1);
    for (const date of [today, tomorrow]) {
        await ShiftDay.updateOne({ area: AREA, date }, { $setOnInsert: { area: AREA, date } }, { upsert: true });
    }
    let count = 0;
    // Server tắt cả buổi tối hôm trước -> làm bù chốt lịch hôm nay (không hỏi / báo cáo nữa)
    count += await runMilestone(today, 'closedAt', true, closeDay);
    count += await runMilestone(tomorrow, 'askedAt', time >= s.askAt, askRestaurants);
    count += await runMilestone(tomorrow, 'closedAt', time >= s.closeAt, closeDay);
    count += await runMilestone(tomorrow, 'reportedAt', time >= s.reportAt, reportDay);
    return count;
};

// ---- Mốc của từng ca ----

const setOnce = (shift, field, extra = {}) =>
    Shift.findOneAndUpdate({ _id: shift._id, [field]: null }, { $set: { [field]: new Date(), ...extra } }, { returnDocument: 'after' });

const notifyRestaurantsUnfilled = async (shift, why) => {
    const owners = await ownerIdsOf(shift.restaurants.map((r) => r.restaurant));
    const admins = await notifications.adminIds();
    await notifications.send(
        [
            ...owners.map((user) => ({
                user,
                type: 'SHIFT_UNFILLED',
                title: `Khung ${shift.label} (${shift.start}–${shift.end}) ngày ${shift.date} chưa có tài xế`,
                body: `${why} Quán tự giao các đơn trong khung này.`,
                data: { link: '/owner/schedule' }
            })),
            ...admins.map((user) => ({
                user,
                type: 'SHIFT_UNFILLED',
                title: `Ca ${shift.label} ${shift.date} không có tài xế`,
                body: `${why} Quán: ${shift.restaurants.map((r) => r.name).join(', ')}`,
                data: { link: '/admin/shifts' }
            }))
        ],
        { email: true }
    );
};

/** Tài xế đã đăng ký đang trực tuyến trong ca -> ACTIVE (đã đi làm) */
const markOnlineActive = async (shift, now) => {
    const regs = await ShiftAssignment.find({ shift: shift._id, status: 'REGISTERED' }).select('shipper');
    if (!regs.length) return;
    const online = await Shipper.find({ _id: { $in: regs.map((a) => a.shipper) }, isOnline: true }).distinct('_id');
    if (online.length) {
        await ShiftAssignment.updateMany({ shift: shift._id, status: 'REGISTERED', shipper: { $in: online } }, { $set: { status: 'ACTIVE', activeAt: now } });
    }
};

const usersOf = async (assignments) =>
    (await Shipper.find({ _id: { $in: assignments.map((a) => a.shipper) } }).select('user').lean()).map((s) => s.user);

const shiftMilestones = async (now) => {
    const s = settings();
    const shifts = await Shift.find({
        status: { $in: ['OPEN', 'LOCKED', 'RUNNING'] },
        startAt: { $lte: new Date(now.getTime() + s.cutoffHours * HOUR) }
    });
    let count = 0;

    for (const shift of shifts) {
        const start = shift.startAt.getTime();

        // 2 giờ trước: chốt đăng ký; không có ai -> báo quán + admin
        if (now.getTime() >= start - s.cutoffHours * HOUR && !shift.lockedAt) {
            const locked = await setOnce(shift, 'lockedAt', shift.status === 'OPEN' ? { status: 'LOCKED' } : {});
            if (locked && now.getTime() < start && (await holdingCount(shift._id)) === 0) {
                await notifyRestaurantsUnfilled(shift, 'Không có tài xế đăng ký ca.');
                count += 1;
            }
        }

        // 1 giờ trước: nhắc tài xế đã đăng ký (bỏ qua nếu đã quá giờ bắt đầu)
        if (now.getTime() >= start - s.remindBeforeMinutes * MIN && !shift.remindedAt) {
            const reminded = await setOnce(shift, 'remindedAt');
            if (reminded && now.getTime() < start) {
                const regs = await ShiftAssignment.find({ shift: shift._id, status: 'REGISTERED' });
                await notifications.send(
                    (await usersOf(regs)).map((user) => ({
                        user,
                        type: 'SHIFT_REMINDER',
                        title: `Sắp tới ca ${shift.label} (${shift.start}–${shift.end})`,
                        body: `Bật "Trực tuyến" trong app trước ${shift.start}. Chưa trực tuyến sau 30 phút đầu ca sẽ tính vắng ca.`,
                        data: { link: '/shipper' }
                    })),
                    { email: true }
                );
                count += 1;
            }
        }

        if (now.getTime() < start) continue;

        // Bắt đầu ca
        if (!shift.startedAt) {
            await setOnce(shift, 'startedAt', { status: 'RUNNING' });
            count += 1;
        }
        await markOnlineActive(shift, now);

        // Phút 15: nhắc người chưa trực tuyến
        if (now.getTime() >= start + s.remindLateMinutes * MIN && !shift.check15At) {
            const done = await setOnce(shift, 'check15At');
            if (done && now.getTime() < start + s.noShowMinutes * MIN) {
                const late = await ShiftAssignment.find({ shift: shift._id, status: 'REGISTERED' });
                await notifications.send(
                    (await usersOf(late)).map((user) => ({
                        user,
                        type: 'SHIFT_REMINDER',
                        title: `Ca ${shift.label} đã bắt đầu — bạn chưa trực tuyến`,
                        body: `Bật "Trực tuyến" trước ${vnClock(new Date(start + s.noShowMinutes * MIN))} để không bị tính vắng ca.`,
                        data: { link: '/shipper' }
                    })),
                    { email: true }
                );
            }
        }

        // Phút 30: vắng ca -> vi phạm; ca không còn ai -> báo quán
        if (now.getTime() >= start + s.noShowMinutes * MIN && !shift.check30At) {
            const done = await setOnce(shift, 'check30At');
            if (done) {
                const absent = await ShiftAssignment.find({ shift: shift._id, status: 'REGISTERED' });
                for (const a of absent) {
                    const { modifiedCount } = await ShiftAssignment.updateOne({ _id: a._id, status: 'REGISTERED' }, { $set: { status: 'NO_SHOW' } });
                    if (modifiedCount) {
                        await penalty.applyViolation({ shipperId: a.shipper, reason: 'NO_SHOW', shift: shift._id, now });
                        count += 1;
                    }
                }
                if (absent.length && (await holdingCount(shift._id)) === 0) {
                    await notifyRestaurantsUnfilled(shift, 'Tài xế đăng ký ca không có mặt.');
                }
            }
        }

        // Kết thúc ca
        if (now.getTime() >= shift.endAt.getTime() && !shift.endedAt) {
            await setOnce(shift, 'endedAt', { status: 'DONE' });
            count += 1;
        }
    }
    return count;
};

/** Job mỗi phút: mốc ngày + mốc ca + giảm bậc phạt */
const shiftTick = async ({ now = new Date() } = {}) =>
    (await dailyMilestones(now)) + (await shiftMilestones(now)) + (await penalty.decayPenalties(now));

// ======================= Tài xế đăng ký / hủy ca =======================

const requireEmailVerified = async (shipper) => {
    const user = await User.findById(shipper.user).select('email emailVerified').lean();
    if (!user?.email || !user.emailVerified) {
        throw new AppError(403, 'EMAIL_VERIFICATION_REQUIRED', 'Add and verify your email first');
    }
};

const register = async ({ shipper, shiftId, now = new Date() }) => {
    if (shipper.status !== 'APPROVED') {
        throw new AppError(403, 'SHIPPER_NOT_APPROVED', 'Your driver profile is not approved');
    }
    await requireEmailVerified(shipper);

    const shift = await Shift.findById(shiftId);
    if (!shift || shift.status === 'CANCELLED') {
        throw new AppError(404, 'NOT_FOUND', 'Shift not found');
    }
    if (now.getTime() >= shift.startAt.getTime() - settings().cutoffHours * HOUR) {
        throw new AppError(409, 'SHIFT_REGISTRATION_CLOSED', `Registration closes ${settings().cutoffHours} hours before the shift starts`);
    }
    if (shipper.dispatchBlockedUntil && shipper.dispatchBlockedUntil > shift.startAt) {
        throw new AppError(409, 'SHIPPER_DISPATCH_BLOCKED', 'You are locked until after this shift starts', [
            { field: 'dispatchBlockedUntil', until: shipper.dispatchBlockedUntil }
        ]);
    }
    const overlap = await ShiftAssignment.exists({
        shipper: shipper._id,
        status: { $in: HOLDING_STATUSES },
        startAt: { $lt: shift.endAt },
        endAt: { $gt: shift.startAt }
    });
    if (overlap) {
        throw new AppError(409, 'SHIFT_OVERLAP', 'You already have a shift at this time');
    }

    try {
        return await ShiftAssignment.create({ shift: shift._id, shipper: shipper._id, startAt: shift.startAt, endAt: shift.endAt, registeredAt: now });
    } catch (error) {
        if (error.code === 11000) {
            throw new AppError(409, 'SHIFT_OVERLAP', 'You already registered for this shift');
        }
        throw error;
    }
};

/** Hủy ca: trước ≥ 2 giờ không phạt; sát giờ (< 2 giờ) = vi phạm; đã bắt đầu thì không hủy được */
const cancel = async ({ shipper, shiftId, now = new Date() }) => {
    const assignment = await ShiftAssignment.findOne({ shift: shiftId, shipper: shipper._id, status: 'REGISTERED' }).populate('shift');
    if (!assignment) {
        throw new AppError(404, 'NOT_FOUND', 'Registration not found');
    }
    const { shift } = assignment;
    if (now >= shift.startAt) {
        throw new AppError(409, 'SHIFT_STARTED', 'The shift has already started');
    }
    const late = now.getTime() >= shift.startAt.getTime() - settings().cutoffHours * HOUR;
    const { modifiedCount } = await ShiftAssignment.updateOne(
        { _id: assignment._id, status: 'REGISTERED' },
        { $set: { status: late ? 'LATE_CANCELLED' : 'CANCELLED', cancelledAt: now } }
    );
    if (!modifiedCount) {
        throw new AppError(409, 'INVALID_STATUS_TRANSITION', 'Registration was just changed');
    }
    let result = null;
    if (late) {
        result = await penalty.applyViolation({ shipperId: shipper._id, reason: 'LATE_CANCEL', shift: shift._id, now });
        if (shift.lockedAt && (await holdingCount(shift._id)) === 0) {
            await notifyRestaurantsUnfilled(shift, 'Tài xế duy nhất vừa hủy ca.');
        }
    }
    return { late, penalty: result };
};

/** Tài xế vừa bật trực tuyến -> các ca đang chạy của họ thành ACTIVE */
const markActive = (shipperId, now = new Date()) =>
    ShiftAssignment.updateMany(
        { shipper: shipperId, status: 'REGISTERED', startAt: { $lte: now }, endAt: { $gt: now } },
        { $set: { status: 'ACTIVE', activeAt: now } }
    );

// ======================= Dữ liệu cho màn hình =======================

const shiftView = async (shift, shipperId) => {
    const holders = await ShiftAssignment.countDocuments({ shift: shift._id, status: { $in: HOLDING_STATUSES } });
    const mine = shipperId ? await ShiftAssignment.findOne({ shift: shift._id, shipper: shipperId }).sort({ createdAt: -1 }).lean() : null;
    return {
        id: shift._id,
        date: shift.date,
        start: shift.start,
        end: shift.end,
        startAt: shift.startAt,
        endAt: shift.endAt,
        kind: shift.kind,
        label: shift.label,
        status: shift.status,
        restaurants: shift.restaurants.map((r) => ({ id: r.restaurant, name: r.name, address: r.address, expectedOrders: r.expectedOrders })),
        expectedOrders: shift.expectedOrders,
        driversNeeded: shift.driversNeeded,
        driversRegistered: holders,
        registrationClosesAt: new Date(shift.startAt.getTime() - settings().cutoffHours * HOUR),
        ...(shipperId && { myStatus: mine?.status ?? null })
    };
};

/** Trang Lịch giao của quán: lịch tuần + lịch hôm nay / ngày mai + tình trạng ca */
const merchantSchedule = async (restaurant, now = new Date()) => {
    const s = settings();
    const { date: today } = vnParts(now);
    const days = [];
    for (const date of [today, addDays(today, 1)]) {
        const plan = await DayPlan.findOne({ restaurant: restaurant._id, date }).lean();
        const shifts = await Shift.find({ 'restaurants.restaurant': restaurant._id, date }).sort({ start: 1 });
        days.push({
            date,
            closed: await isClosed(date, now),
            answered: Boolean(plan?.answeredAt),
            windows: plan ? plan.windows : weeklyFor(restaurant, date),
            lateCancels: plan?.lateCancels ?? [],
            shifts: await Promise.all(shifts.map((sh) => shiftView(sh)))
        });
    }
    return {
        deliveryMode: restaurant.deliveryMode || 'SELF',
        weeklySchedule: restaurant.weeklySchedule || [],
        fixedSlots: FIXED_SLOTS,
        times: { askAt: s.askAt, closeAt: s.closeAt, reportAt: s.reportAt, cutoffHours: s.cutoffHours, ordersPerDriver: s.ordersPerDriver },
        days
    };
};

/** Trang Ca làm của tài xế: ca hôm nay + ngày mai, trạng thái của tôi */
const shipperShifts = async (shipper, now = new Date()) => {
    const { date: today } = vnParts(now);
    const shifts = await Shift.find({ area: AREA, date: { $in: [today, addDays(today, 1)] }, status: { $ne: 'CANCELLED' } }).sort({ startAt: 1 });
    return {
        area: AREA_NAME,
        cutoffHours: settings().cutoffHours,
        shifts: await Promise.all(shifts.map((sh) => shiftView(sh, shipper._id)))
    };
};

const adminShifts = async (date) => {
    const shifts = await Shift.find({ area: AREA, date }).sort({ start: 1 });
    return Promise.all(
        shifts.map(async (sh) => ({
            ...(await shiftView(sh)),
            assignments: (
                await ShiftAssignment.find({ shift: sh._id }).populate('shipper', 'fullName phone licensePlate penaltyLevel').sort({ registeredAt: 1 }).lean()
            ).map((a) => ({
                id: a._id,
                status: a.status,
                registeredAt: a.registeredAt,
                activeAt: a.activeAt,
                cancelledAt: a.cancelledAt,
                shipper: a.shipper ? { id: a.shipper._id, fullName: a.shipper.fullName, phone: a.shipper.phone, licensePlate: a.shipper.licensePlate, penaltyLevel: a.shipper.penaltyLevel } : null
            }))
        }))
    );
};

module.exports = {
    normalizeWindows,
    setWeeklySchedule,
    setDayPlan,
    buildShifts,
    shiftTick,
    dailyMilestones,
    shiftMilestones,
    register,
    cancel,
    markActive,
    effectiveDeliveryMode,
    merchantSchedule,
    shipperShifts,
    adminShifts,
    requireEmailVerified
};
