const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/modules/user/user.model');
const Order = require('../../src/modules/order/order.model');
const Shipper = require('../../src/modules/shipper/shipper.model');
const DispatchOffer = require('../../src/modules/shipper/dispatchOffer.model');
const Notification = require('../../src/modules/notification/notification.model');
const { DayPlan, Shift, ShiftAssignment, DriverPenalty } = require('../../src/modules/shift/shift.models');
const shiftService = require('../../src/modules/shift/shift.service');
const penalty = require('../../src/modules/shift/penalty.service');
const delivery = require('../../src/modules/shipper/delivery.service');
const { issueVerificationToken } = require('../../src/modules/auth/otp.service');
const { outbox } = require('../../src/config/mailer');
const { vnParts, vnDateTime, addDays, weekdayOf, DAY_MS } = require('../../src/utils/vnTime');
const { toPoint } = require('../../src/utils/geo');
const { setupDatabase } = require('../helpers/db');
const { createUserAndLogin, createAdminAndLogin } = require('../helpers/auth');
const { as, createShop, newKey, delivery: dropoff } = require('../helpers/orders');

setupDatabase();

// Quán "Theo lịch" cần MAK đã bật chuyển khoản
const KEY = 'test-sepay-key-0123456789';
const ENV = { PAYMENT_BANK_ID: 'MB', PAYMENT_ACCOUNT_NO: '0123456789', SEPAY_WEBHOOK_API_KEY: KEY };
beforeAll(() => Object.assign(process.env, ENV));
afterAll(() => Object.keys(ENV).forEach((k) => delete process.env[k]));

const SHOP = { lat: 21.0136, lng: 105.5254 };
const today = () => vnParts().date;
const tomorrow = () => addDays(today(), 1);
const at = (date, time) => vnDateTime(date, time);
const minutes = (n) => n * 60 * 1000;

let shop;
let owner;
let ownerId;
let admin;

beforeEach(async () => {
    outbox.length = 0;
    shop = await createShop({
        deliveryMode: 'SCHEDULED',
        // Lịch tuần cho thứ của ngày mai: ca trưa (8 đơn) + khung sáng tự chọn
        weeklySchedule: [
            { dayOfWeek: weekdayOf(tomorrow()), start: '06:00', end: '08:00', expectedOrders: 0 },
            { dayOfWeek: weekdayOf(tomorrow()), start: '10:30', end: '13:30', expectedOrders: 8 }
        ]
    });
    owner = as(shop.ownerToken);
    ownerId = String(shop.restaurant.owner);
    admin = as((await createAdminAndLogin()).token);
});

let phoneSeq = 30000000;
// Tài xế đã duyệt, đăng ký bằng email (đã xác thực)
const makeShipper = async ({ online = false, where = SHOP } = {}) => {
    const { token, user } = await createUserAndLogin({ role: 'SHIPPER' });
    const shipper = await Shipper.create({
        user: user.id,
        fullName: user.fullName,
        phone: `09${(phoneSeq += 1)}`,
        vehicleType: 'MOTORBIKE',
        licensePlate: '29A-11111',
        portrait: { fileKey: 'shipper-portraits/test.png', mimeType: 'image/png', uploadedAt: new Date() },
        status: 'APPROVED',
        isOnline: online,
        location: toPoint(where),
        locationAt: new Date()
    });
    return { api: as(token), shipper, userId: user.id };
};

// 14:00 hỏi quán -> 18:00 chốt -> ca ngày mai
const closeTomorrow = async () => {
    await shiftService.shiftTick({ now: at(today(), '14:01') });
    await shiftService.shiftTick({ now: at(today(), '18:01') });
    return Shift.find({ date: tomorrow() }).sort({ start: 1 });
};

describe('Lịch của quán + chốt ca', () => {
    it('14:00 hỏi quán (kèm email), quán sửa tới 18:00, 18:00 gộp thành ca và gửi danh sách cho tài xế', async () => {
        const driver = await makeShipper();

        await shiftService.shiftTick({ now: at(today(), '14:01') });
        const plan = await DayPlan.findOne({ restaurant: shop.restaurant._id, date: tomorrow() });
        expect(plan.windows.map((w) => w.start)).toEqual(['06:00', '10:30']);
        expect(await Notification.exists({ user: ownerId, type: 'SHIFT_PLAN_REQUEST' })).toBeTruthy();
        expect(outbox.some((m) => m.subject.includes('Xác nhận khung cần tài xế'))).toBe(true);
        // Chạy lại không hỏi lần hai
        await shiftService.shiftTick({ now: at(today(), '14:30') });
        expect(await Notification.countDocuments({ type: 'SHIFT_PLAN_REQUEST' })).toBe(1);

        const view = await owner.get('/api/merchant/schedule').expect(200);
        expect(view.body.data.days[1].closed).toBe(false);

        // Khung tự chọn quá ngắn / chồng nhau bị từ chối
        await owner.put(`/api/merchant/schedule/days/${tomorrow()}`, { windows: [{ start: '06:00', end: '06:30' }] }).expect(400);
        await owner
            .put(`/api/merchant/schedule/days/${tomorrow()}`, { windows: [{ start: '10:30', end: '13:30' }, { start: '12:00', end: '14:00' }] })
            .expect(400);

        await owner
            .put(`/api/merchant/schedule/days/${tomorrow()}`, {
                windows: [
                    { start: '06:00', end: '08:00' },
                    { start: '10:30', end: '13:30', expectedOrders: 13 },
                    { start: '17:00', end: '21:00', expectedOrders: 4 }
                ]
            })
            .expect(200);

        const shifts = (await closeTomorrow()).map((s) => ({ start: s.start, kind: s.kind, label: s.label, needed: s.driversNeeded }));
        expect(shifts).toEqual([
            { start: '06:00', kind: 'CUSTOM', label: '06:00–08:00', needed: 1 },
            { start: '10:30', kind: 'FIXED', label: 'Trưa', needed: 3 },
            { start: '17:00', kind: 'FIXED', label: 'Tối', needed: 1 }
        ]);
        expect(await Notification.exists({ user: driver.userId, type: 'SHIFT_LIST' })).toBeTruthy();

        // Sau chốt: không thêm khung được
        const late = await owner.put(`/api/merchant/schedule/days/${tomorrow()}`, {
            windows: [{ start: '06:00', end: '08:00' }, { start: '10:30', end: '13:30' }, { start: '15:00', end: '17:00' }, { start: '17:00', end: '21:00' }]
        });
        expect(late.status).toBe(409);
        expect(late.body.code).toBe('SCHEDULE_CLOSED');
    });

    it('quán không trả lời -> dùng lịch tuần; quán bỏ khung sau chốt -> ghi hủy muộn, ca bị hủy, tài xế không bị phạt', async () => {
        const driver = await makeShipper();
        const [, lunch] = await closeTomorrow();
        await driver.api.post(`/api/shipper/shifts/${lunch.id}/register`).expect(200);

        await owner.put(`/api/merchant/schedule/days/${tomorrow()}`, { windows: [{ start: '06:00', end: '08:00' }] }).expect(200);

        const plan = await DayPlan.findOne({ restaurant: shop.restaurant._id, date: tomorrow() });
        expect(plan.lateCancels.map((w) => w.start)).toEqual(['10:30']);
        expect((await Shift.findById(lunch.id)).status).toBe('CANCELLED');
        expect((await ShiftAssignment.findOne({ shift: lunch.id })).status).toBe('VOID');
        expect(await Notification.exists({ user: driver.userId, type: 'SHIFT_CANCELLED' })).toBeTruthy();
        expect((await Shipper.findById(driver.shipper.id)).penaltyLevel).toBe(0);
    });
});

describe('Tài xế đăng ký / hủy ca', () => {
    it('đăng ký, không trùng giờ, đóng đăng ký 2 giờ trước ca; hủy sớm không phạt, hủy sát giờ bị cảnh cáo', async () => {
        const driver = await makeShipper();
        const [morning, lunch] = await closeTomorrow();

        const list = await driver.api.get('/api/shipper/shifts').expect(200);
        expect(list.body.data.shifts.map((s) => s.label)).toEqual(['06:00–08:00', 'Trưa']);

        await driver.api.post(`/api/shipper/shifts/${lunch.id}/register`).expect(200);
        await driver.api.post(`/api/shipper/shifts/${lunch.id}/register`).expect(409);
        // Ca khác trùng giờ
        const overlap = await Shift.create({
            area: 'HOA_LAC', date: tomorrow(), start: '12:00', end: '14:00', startAt: at(tomorrow(), '12:00'), endAt: at(tomorrow(), '14:00'),
            kind: 'CUSTOM', label: '12:00–14:00', restaurants: [{ restaurant: shop.restaurant._id, name: 'x' }]
        });
        const res = await driver.api.post(`/api/shipper/shifts/${overlap.id}/register`);
        expect(res.body.code).toBe('SHIFT_OVERLAP');

        // Quá mốc đăng ký
        await expect(shiftService.register({ shipper: driver.shipper, shiftId: morning.id, now: at(tomorrow(), '04:30') })).rejects.toMatchObject({ code: 'SHIFT_REGISTRATION_CLOSED' });

        // Hủy sớm: không phạt
        await driver.api.post(`/api/shipper/shifts/${lunch.id}/cancel`).expect(200);
        expect((await ShiftAssignment.findOne({ shift: lunch.id })).status).toBe('CANCELLED');

        // Đăng ký lại rồi hủy sát giờ (còn 1 giờ): vi phạm -> cảnh cáo
        await driver.api.post(`/api/shipper/shifts/${lunch.id}/register`).expect(200);
        const result = await shiftService.cancel({ shipper: driver.shipper, shiftId: lunch.id, now: at(tomorrow(), '09:30') });
        expect(result.late).toBe(true);
        const after = await Shipper.findById(driver.shipper.id);
        expect(after.penaltyLevel).toBe(1);
        expect(after.dispatchBlockedUntil).toBeNull();
        expect(await DriverPenalty.exists({ shipper: driver.shipper.id, reason: 'LATE_CANCEL' })).toBeTruthy();
        expect(outbox.some((m) => m.subject.includes('Cảnh cáo'))).toBe(true);
    });

    it('tài xế bắt buộc email: đăng ký bằng SĐT bị từ chối; tài khoản cũ thêm email đã xác thực rồi mới đăng ký ca', async () => {
        const reg = await request(app).post('/api/auth/register').send({ fullName: 'TX', phone: '0933000001', password: 'Test@1234', role: 'SHIPPER' });
        expect(reg.status).toBe(400);
        expect(reg.body.code).toBe('EMAIL_REQUIRED');

        // Tài khoản tài xế cũ (tạo trước khi có quy định) chỉ có SĐT
        const user = await User.create({ phone: '0933000002', password: await bcrypt.hash('Test@1234', 4), fullName: 'TX cũ', role: 'SHIPPER' });
        const shipper = await Shipper.create({ user: user._id, fullName: 'TX cũ', phone: '0933000002', vehicleType: 'BICYCLE', status: 'APPROVED' });
        const login = await request(app).post('/api/auth/login').send({ identifier: '0933000002', password: 'Test@1234' }).expect(200);
        const driver = as(login.body.data.token);
        const [, lunch] = await closeTomorrow();

        const blocked = await driver.post(`/api/shipper/shifts/${lunch.id}/register`);
        expect(blocked.body.code).toBe('EMAIL_VERIFICATION_REQUIRED');
        await driver.post('/api/shipper/email', { email: 'txcu@test.com', verificationToken: 'sai' }).expect(400);
        await driver.post('/api/shipper/email', { email: 'txcu@test.com', verificationToken: issueVerificationToken('txcu@test.com') }).expect(200);
        expect((await driver.get('/api/shipper/profile').expect(200)).body.data.emailVerified).toBe(true);
        await driver.post(`/api/shipper/shifts/${lunch.id}/register`).expect(200);
        expect(String((await ShiftAssignment.findOne({ shift: lunch.id })).shipper)).toBe(shipper.id);
    });
});

describe('Trong ca', () => {
    it('phút 15 nhắc, phút 30 chưa trực tuyến -> vắng ca (cảnh cáo), báo quán; người bật trực tuyến thì không sao', async () => {
        const absent = await makeShipper();
        const present = await makeShipper();
        const [, lunch] = await closeTomorrow();
        await absent.api.post(`/api/shipper/shifts/${lunch.id}/register`).expect(200);
        await present.api.post(`/api/shipper/shifts/${lunch.id}/register`).expect(200);

        // 1 giờ trước: nhắc
        await shiftService.shiftTick({ now: at(tomorrow(), '09:35') });
        expect(await Notification.countDocuments({ type: 'SHIFT_REMINDER' })).toBe(2);

        await shiftService.shiftTick({ now: at(tomorrow(), '10:31') });
        await delivery.goOnline({ shipper: await Shipper.findById(present.shipper.id), now: at(tomorrow(), '10:40') });
        await shiftService.shiftTick({ now: at(tomorrow(), '10:46') });
        expect(await Notification.exists({ user: absent.userId, type: 'SHIFT_REMINDER', title: /chưa trực tuyến/ })).toBeTruthy();

        await shiftService.shiftTick({ now: at(tomorrow(), '11:01') });
        expect((await ShiftAssignment.findOne({ shift: lunch.id, shipper: absent.shipper.id })).status).toBe('NO_SHOW');
        expect((await ShiftAssignment.findOne({ shift: lunch.id, shipper: present.shipper.id })).status).toBe('ACTIVE');
        expect((await Shipper.findById(absent.shipper.id)).penaltyLevel).toBe(1);
        expect((await Shipper.findById(present.shipper.id)).penaltyLevel).toBe(0);
        // Còn tài xế đang làm -> không báo quán ca trống
        expect(await Notification.exists({ type: 'SHIFT_UNFILLED' })).toBeFalsy();

        await shiftService.shiftTick({ now: at(tomorrow(), '13:31') });
        expect((await Shift.findById(lunch.id)).status).toBe('DONE');
    });

    it('2 giờ trước ca không ai đăng ký -> báo quán + admin', async () => {
        await closeTomorrow();
        await shiftService.shiftTick({ now: at(tomorrow(), '08:31') });
        expect(await Notification.exists({ user: ownerId, type: 'SHIFT_UNFILLED' })).toBeTruthy();
    });

    it('quán "Theo lịch": trong ca có tài xế -> đơn tài xế MAK (trả trước) và ưu tiên tài xế của ca; ngoài ca -> quán tự giao', async () => {
        // Ngoài ca: tiền mặt được, đơn quán tự giao
        const cod = await as((await createUserAndLogin()).token).post(
            '/api/orders',
            { restaurantId: shop.restaurant.id, items: [{ menuItemId: shop.rice.id, qty: 1 }], fulfillmentType: 'DELIVERY', delivery: dropoff },
            newKey()
        );
        expect(cod.status).toBe(201);
        expect(cod.body.data.deliveryMode).toBe('SELF');

        // Ca đang chạy có 1 tài xế đăng ký (ở xa hơn), 1 tài xế tự do đứng ngay quán
        const now = Date.now();
        const shift = await Shift.create({
            area: 'HOA_LAC', date: today(), start: '00:00', end: '23:30', startAt: new Date(now - minutes(10)), endAt: new Date(now + minutes(60)),
            kind: 'CUSTOM', label: 'test', status: 'RUNNING', restaurants: [{ restaurant: shop.restaurant._id, name: 'Quán Test' }]
        });
        await makeShipper({ online: true, where: SHOP });
        const onShift = await makeShipper({ online: true, where: { lat: 21.0, lng: 105.5254 } });
        await ShiftAssignment.create({ shift: shift._id, shipper: onShift.shipper._id, startAt: shift.startAt, endAt: shift.endAt, status: 'ACTIVE' });

        const detail = await request(app).get(`/api/restaurants/${shop.restaurant.slug}`).expect(200);
        expect(detail.body.data.deliveryModeNow).toBe('PLATFORM');

        const { token } = await createUserAndLogin();
        const customer = as(token);
        const blocked = await customer.post(
            '/api/orders',
            { restaurantId: shop.restaurant.id, items: [{ menuItemId: shop.rice.id, qty: 1 }], fulfillmentType: 'DELIVERY', delivery: dropoff },
            newKey()
        );
        expect(blocked.body.code).toBe('PREPAID_REQUIRED');

        const placed = await customer.post(
            '/api/orders',
            { restaurantId: shop.restaurant.id, items: [{ menuItemId: shop.rice.id, qty: 2 }], fulfillmentType: 'DELIVERY', paymentMethod: 'BANK_TRANSFER', delivery: dropoff },
            newKey()
        );
        expect(placed.body.data.deliveryMode).toBe('PLATFORM');
        await request(app)
            .post('/api/payments/sepay/webhook')
            .set('Authorization', `Apikey ${KEY}`)
            .send({ id: 991, gateway: 'MB', transactionDate: '2026-10-22 10:00:00', accountNumber: '0123456789', content: placed.body.data.paymentCode, transferType: 'in', transferAmount: placed.body.data.total, referenceCode: 'FT991' })
            .expect(200);
        await owner.post(`/api/merchant/orders/${placed.body.data.id}/accept`).expect(200);

        const offer = await DispatchOffer.findOne({ order: placed.body.data.id, status: 'OFFERED' });
        expect(String(offer.shipper)).toBe(onShift.shipper.id);
        expect((await Order.findById(placed.body.data.id)).deliveryMode).toBe('PLATFORM');
    });
});

describe('Xử phạt', () => {
    it('thang phạt: cảnh cáo -> khóa 3 ngày -> khóa 5 ngày -> vĩnh viễn; admin mở lại về bậc 3', async () => {
        const driver = await makeShipper();
        const t0 = new Date();
        const id = driver.shipper._id;

        await penalty.applyViolation({ shipperId: id, reason: 'NO_SHOW', now: t0 });
        await penalty.applyViolation({ shipperId: id, reason: 'NO_SHOW', now: t0 });
        let s = await Shipper.findById(id);
        expect(s.penaltyLevel).toBe(2);
        expect(Math.round((s.dispatchBlockedUntil - t0) / DAY_MS)).toBe(3);
        await driver.api.post('/api/shipper/online').expect(409);
        // Bị khóa vẫn rút tiền được (chỉ báo thiếu tài khoản ngân hàng)
        expect((await driver.api.post('/api/shipper/wallet/payouts', { amount: 50000 })).body.code).toBe('BANK_ACCOUNT_REQUIRED');

        await penalty.applyViolation({ shipperId: id, reason: 'LATE_CANCEL', now: t0 });
        s = await Shipper.findById(id);
        expect(s.penaltyLevel).toBe(3);
        expect(Math.round((s.dispatchBlockedUntil - t0) / DAY_MS)).toBe(5);

        await penalty.applyViolation({ shipperId: id, reason: 'NO_SHOW', now: t0 });
        s = await Shipper.findById(id);
        expect(s.penaltyLevel).toBe(4);
        expect(s.status).toBe('BLOCKED');

        await admin.post(`/api/admin/shippers/${id}/unblock`, {}).expect(200);
        s = await Shipper.findById(id);
        expect(s.status).toBe('APPROVED');
        expect(s.penaltyLevel).toBe(3);
    });

    it('giảm bậc: 30 ngày (tính từ lúc hết khóa) không vi phạm; bậc 3 xuống 2 rồi thêm 30 ngày mới sạch', async () => {
        const driver = await makeShipper();
        const id = driver.shipper._id;
        const t0 = new Date();
        await Shipper.updateOne({ _id: id }, { $set: { penaltyLevel: 2 } });
        await penalty.applyViolation({ shipperId: id, reason: 'NO_SHOW', now: t0 });
        const lockEnd = (await Shipper.findById(id)).dispatchBlockedUntil;

        // Chưa đủ 30 ngày kể từ lúc hết khóa
        await penalty.decayPenalties(new Date(lockEnd.getTime() + 29 * DAY_MS));
        expect((await Shipper.findById(id)).penaltyLevel).toBe(3);

        await penalty.decayPenalties(new Date(lockEnd.getTime() + 30 * DAY_MS + 1000));
        expect((await Shipper.findById(id)).penaltyLevel).toBe(2);
        // Vi phạm trong 30 ngày tiếp theo -> khóa 5 ngày
        await penalty.applyViolation({ shipperId: id, reason: 'NO_SHOW', now: new Date(lockEnd.getTime() + 31 * DAY_MS) });
        expect((await Shipper.findById(id)).penaltyLevel).toBe(3);

        // Bậc 2 "ẩn" không vi phạm thêm -> về 0
        const other = await makeShipper();
        await Shipper.updateOne({ _id: other.shipper._id }, { $set: { penaltyLevel: 3, penaltyDecayAt: t0 } });
        await penalty.decayPenalties(new Date(t0.getTime() + 1000));
        expect((await Shipper.findById(other.shipper._id)).penaltyLevel).toBe(2);
        await penalty.decayPenalties(new Date(t0.getTime() + 30 * DAY_MS + 1000));
        expect((await Shipper.findById(other.shipper._id)).penaltyLevel).toBe(0);
    });

    it('trả 3 đơn liên tiếp -> khóa nhận đơn 1 ngày (không vào thang phạt); admin mở khóa sớm', async () => {
        const driver = await makeShipper();
        const id = driver.shipper._id;
        expect((await penalty.recordWithdrawal(id)).blocked).toBe(false);
        expect((await penalty.recordWithdrawal(id)).blocked).toBe(false);
        expect((await penalty.recordWithdrawal(id)).blocked).toBe(true);
        let s = await Shipper.findById(id);
        expect(s.dispatchBlockReason).toBe('WITHDRAWALS');
        expect(s.penaltyLevel).toBe(0);
        expect(s.consecutiveWithdrawals).toBe(0);

        const view = await driver.api.get('/api/shipper/penalties').expect(200);
        expect(view.body.data.lockReason).toBe('WITHDRAWALS');

        await admin.post(`/api/admin/shippers/${id}/unlock`, { reason: 'Xe hỏng thật' }).expect(200);
        s = await Shipper.findById(id);
        expect(s.dispatchBlockedUntil).toBeNull();
        await driver.api.post('/api/shipper/online').expect(200);
    });

    it('admin xem ca theo ngày kèm tài xế đăng ký', async () => {
        const driver = await makeShipper();
        const [, lunch] = await closeTomorrow();
        await driver.api.post(`/api/shipper/shifts/${lunch.id}/register`).expect(200);
        const res = await admin.get(`/api/admin/shifts?date=${tomorrow()}`).expect(200);
        const row = res.body.data.shifts.find((s) => s.id === lunch.id);
        expect(row.driversRegistered).toBe(1);
        expect(row.assignments[0].shipper.fullName).toBe(driver.shipper.fullName);
    });
});
