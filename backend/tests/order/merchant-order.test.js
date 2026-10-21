const MenuItem = require('../../src/modules/menu/menuItem.model');
const Order = require('../../src/modules/order/order.model');
const { cancelExpiredOrders, resetDailyStock } = require('../../src/modules/order/order.service');
const { setupDatabase } = require('../helpers/db');
const { createUserAndLogin } = require('../helpers/auth');
const { as, createShop, placeOrder } = require('../helpers/orders');

setupDatabase();

const M = '/api/merchant/orders';

let customer;
let shop;
let owner;

beforeEach(async () => {
    customer = as((await createUserAndLogin()).token);
    shop = await createShop();
    owner = as(shop.ownerToken);
});

const soldToday = async () => (await MenuItem.findById(shop.rice._id)).soldToday;

describe('Luồng chuẩn (BR-35, quán tự giao)', () => {
    test('giao tận nơi: nhận đơn (= đang làm) → đi giao → đã giao (đã thu tiền)', async () => {
        const order = await placeOrder(customer, shop);

        const accepted = await owner.post(`${M}/${order.id}/accept`);
        expect(accepted.status).toBe(200);
        expect(accepted.body.data).toMatchObject({ status: 'PREPARING', nextStatus: 'DELIVERING', customer: { fullName: expect.any(String) } });
        // avgPrepMinutes mặc định 15 phút
        const eta = new Date(accepted.body.data.estimatedReadyAt) - new Date(accepted.body.data.acceptedAt);
        expect(Math.round(eta / 60000)).toBe(15);

        // Đơn giao tận nơi không còn bước "món đã xong"
        expect((await owner.post(`${M}/${order.id}/status`, { to: 'READY' })).status).toBe(409);

        for (const [to, next] of [['DELIVERING', 'COMPLETED'], ['COMPLETED', null]]) {
            const res = await owner.post(`${M}/${order.id}/status`, { to });
            expect(res.status).toBe(200);
            expect(res.body.data).toMatchObject({ status: to, nextStatus: next });
        }

        const done = await Order.findById(order.id);
        expect(done).toMatchObject({ paymentStatus: 'PAID' });
        expect(done.completedAt).toBeInstanceOf(Date);
        expect(done.statusHistory.map((h) => `${h.from ?? ''}>${h.to}:${h.actorType}`)).toEqual([
            '>PLACED:CUSTOMER',
            'PLACED>ACCEPTED:OWNER',
            'ACCEPTED>PREPARING:OWNER',
            'PREPARING>DELIVERING:OWNER',
            'DELIVERING>COMPLETED:OWNER'
        ]);
    });

    test('tự đến lấy: nhận đơn → món đã xong (READY) → khách đã lấy; không có bước đi giao', async () => {
        const order = await placeOrder(customer, shop, { fulfillmentType: 'PICKUP' });
        const accepted = await owner.post(`${M}/${order.id}/accept`).expect(200);
        expect(accepted.body.data).toMatchObject({ status: 'PREPARING', nextStatus: 'READY' });

        expect((await owner.post(`${M}/${order.id}/status`, { to: 'DELIVERING' })).status).toBe(409);
        const ready = await owner.post(`${M}/${order.id}/status`, { to: 'READY' });
        expect(ready.body.data.nextStatus).toBe('COMPLETED');

        expect((await owner.post(`${M}/${order.id}/status`, { to: 'DELIVERING' })).status).toBe(409);
        expect((await owner.post(`${M}/${order.id}/status`, { to: 'COMPLETED' })).body.data.status).toBe('COMPLETED');
    });

    test('đơn cũ đang dở (ACCEPTED / READY của đơn giao tận nơi) vẫn đi tiếp được', async () => {
        const a = await placeOrder(customer, shop);
        await Order.updateOne({ _id: a.id }, { status: 'ACCEPTED' });
        expect((await owner.post(`${M}/${a.id}/status`, { to: 'PREPARING' })).body.data.nextStatus).toBe('DELIVERING');

        const b = await placeOrder(customer, shop);
        await Order.updateOne({ _id: b.id }, { status: 'READY' });
        expect((await owner.post(`${M}/${b.id}/status`, { to: 'DELIVERING' })).status).toBe(200);
    });

    test.each([
        ['PLACED', 'PREPARING', 'phải nhận đơn trước'],
        ['ACCEPTED', 'READY', 'không được bỏ bước'],
        ['PREPARING', 'COMPLETED', 'không được bỏ bước'],
        ['PREPARING', 'READY', 'đơn giao tận nơi không có bước món đã xong'],
        ['READY', 'COMPLETED', 'đơn giao tận nơi phải qua DELIVERING'],
        ['COMPLETED', 'DELIVERING', 'đơn đã xong'],
        ['CANCELLED', 'PREPARING', 'đơn đã hủy']
    ])('409 khi %s → %s (%s)', async (from, to) => {
        const order = await placeOrder(customer, shop);
        await Order.updateOne({ _id: order.id }, { status: from });

        const res = await owner.post(`${M}/${order.id}/status`, { to });
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('INVALID_STATUS_TRANSITION');
    });

    test('nhận đơn 2 lần -> 409; "to" không hợp lệ -> 400', async () => {
        const order = await placeOrder(customer, shop);
        await owner.post(`${M}/${order.id}/accept`).expect(200);
        expect((await owner.post(`${M}/${order.id}/accept`)).status).toBe(409);
        expect((await owner.post(`${M}/${order.id}/status`, { to: 'PLACED' })).status).toBe(400);
    });

    test('khách hủy và quán nhận cùng lúc: đúng 1 bên thành công', async () => {
        const order = await placeOrder(customer, shop);

        const [cancel, accept] = await Promise.all([
            customer.post(`/api/orders/${order.id}/cancel`),
            owner.post(`${M}/${order.id}/accept`)
        ]);

        expect([cancel.status, accept.status].sort()).toEqual([200, 409]);
        const final = await Order.findById(order.id);
        // Khách thắng: PLACED -> CANCELLED (2 dòng); quán thắng: PLACED -> ACCEPTED -> PREPARING (3 dòng, luồng rút gọn 19/10)
        expect(final.statusHistory).toHaveLength(final.status === 'CANCELLED' ? 2 : 3);
        expect(await soldToday()).toBe(final.status === 'CANCELLED' ? 0 : 1);
    });
});

describe('Từ chối / hủy (hoàn suất — BR-37)', () => {
    test('từ chối đơn PLACED: bắt buộc lý do, hoàn suất, khách thấy lý do', async () => {
        const order = await placeOrder(customer, shop, { qty: 3 });
        expect(await soldToday()).toBe(3);

        expect((await owner.post(`${M}/${order.id}/reject`, {})).status).toBe(400);

        const res = await owner.post(`${M}/${order.id}/reject`, { reasonCode: 'OUT_OF_STOCK', note: 'Hết gà' });
        expect(res.body.data).toMatchObject({ status: 'REJECTED', cancelReason: { code: 'OUT_OF_STOCK', note: 'Hết gà' } });
        expect(await soldToday()).toBe(0);

        const seen = await customer.get(`/api/orders/${order.id}`);
        expect(seen.body.data).toMatchObject({ status: 'REJECTED', cancelReason: { code: 'OUT_OF_STOCK' } });
    });

    test('quán hủy được khi đã nhận / đang làm (hoàn suất); chưa nhận hoặc đã đi giao -> 409', async () => {
        const order = await placeOrder(customer, shop, { qty: 2 });

        // Chưa nhận: phải dùng "Từ chối"
        expect((await owner.post(`${M}/${order.id}/cancel`, { reasonCode: 'OVERLOADED' })).status).toBe(409);

        await owner.post(`${M}/${order.id}/accept`).expect(200); // -> PREPARING
        const res = await owner.post(`${M}/${order.id}/cancel`, { reasonCode: 'OVERLOADED' });
        expect(res.body.data.status).toBe('CANCELLED');
        expect(res.body.data.statusHistory.at(-1)).toMatchObject({ from: 'PREPARING', to: 'CANCELLED' });
        expect(await soldToday()).toBe(0);

        const delivering = await placeOrder(customer, shop);
        await owner.post(`${M}/${delivering.id}/accept`).expect(200);
        await owner.post(`${M}/${delivering.id}/status`, { to: 'DELIVERING' }).expect(200);
        expect((await owner.post(`${M}/${delivering.id}/cancel`, { reasonCode: 'OTHER' })).status).toBe(409);
    });
});

describe('GET /merchant/orders', () => {
    test('chỉ thấy đơn của quán mình, lọc trạng thái; đơn chờ nhận cũ nhất lên đầu', async () => {
        const first = await placeOrder(customer, shop);
        const second = await placeOrder(customer, shop);
        const third = await placeOrder(customer, shop);
        await owner.post(`${M}/${third.id}/accept`).expect(200);

        const other = await createShop({ name: 'Quán Khác' });
        await placeOrder(customer, other);

        const all = await owner.get(M);
        expect(all.body.data.total).toBe(3);
        expect(all.body.data.items[0].customer).toHaveProperty('fullName');

        const placed = await owner.get(`${M}?status=PLACED`);
        expect(placed.body.data.items.map((o) => o.id)).toEqual([first.id, second.id]);

        const active = await owner.get(`${M}?status=PLACED,PREPARING`);
        expect(active.body.data.total).toBe(3);

        expect((await owner.get(`${M}?status=NOPE`)).status).toBe(400);
    });

    test('chủ quán khác không xem / không xử lý được đơn (404); khách gọi API quán -> 403', async () => {
        const order = await placeOrder(customer, shop);
        const otherOwner = as((await createShop({ name: 'Quán B' })).ownerToken);

        expect((await otherOwner.get(`${M}/${order.id}`)).status).toBe(404);
        expect((await otherOwner.post(`${M}/${order.id}/accept`)).status).toBe(404);
        expect((await otherOwner.post(`${M}/${order.id}/reject`, { reasonCode: 'OTHER' })).status).toBe(404);
        expect((await otherOwner.post(`${M}/${order.id}/status`, { to: 'PREPARING' })).status).toBe(404);
        expect((await Order.findById(order.id)).status).toBe('PLACED');

        const res = await customer.get(M);
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('FORBIDDEN');
    });
});

describe('Job', () => {
    test('đơn PLACED quá 5 phút tự hủy (SYSTEM, TIMEOUT), hoàn suất; đơn mới / đã nhận giữ nguyên (BR-36)', async () => {
        const old = await placeOrder(customer, shop, { qty: 2 });
        const oldAccepted = await placeOrder(customer, shop);
        const fresh = await placeOrder(customer, shop);
        const sixMinutesAgo = new Date(Date.now() - 6 * 60 * 1000);
        await Order.updateMany({ _id: { $in: [old.id, oldAccepted.id] } }, { placedAt: sixMinutesAgo });
        await owner.post(`${M}/${oldAccepted.id}/accept`).expect(200);
        expect(await soldToday()).toBe(4);

        expect(await cancelExpiredOrders({ olderThanMinutes: 5 })).toBe(1);

        const cancelled = await Order.findById(old.id);
        expect(cancelled).toMatchObject({ status: 'CANCELLED', cancelReason: { code: 'TIMEOUT' } });
        expect(cancelled.statusHistory.at(-1)).toMatchObject({ from: 'PLACED', to: 'CANCELLED', actorType: 'SYSTEM' });
        expect((await Order.findById(oldAccepted.id)).status).toBe('PREPARING');
        expect((await Order.findById(fresh.id)).status).toBe('PLACED');
        expect(await soldToday()).toBe(2);

        // Chạy lại không hủy thêm
        expect(await cancelExpiredOrders({ olderThanMinutes: 5 })).toBe(0);
    });

    test('reset số suất lúc 00:00 (BR-23)', async () => {
        await placeOrder(customer, shop, { qty: 3 });
        expect(await resetDailyStock()).toBe(1);
        expect(await MenuItem.findById(shop.rice._id)).toMatchObject({ soldToday: 0, soldCount: 3 });
    });
});
