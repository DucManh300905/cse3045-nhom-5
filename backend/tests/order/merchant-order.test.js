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
    test('giao tận nơi: PLACED → ACCEPTED → PREPARING → READY → DELIVERING → COMPLETED (đã thu tiền)', async () => {
        const order = await placeOrder(customer, shop);

        const accepted = await owner.post(`${M}/${order.id}/accept`);
        expect(accepted.status).toBe(200);
        expect(accepted.body.data).toMatchObject({ status: 'ACCEPTED', nextStatus: 'PREPARING', customer: { fullName: expect.any(String) } });
        // avgPrepMinutes mặc định 15 phút
        const eta = new Date(accepted.body.data.estimatedReadyAt) - new Date(accepted.body.data.acceptedAt);
        expect(Math.round(eta / 60000)).toBe(15);

        for (const [to, next] of [['PREPARING', 'READY'], ['READY', 'DELIVERING'], ['DELIVERING', 'COMPLETED'], ['COMPLETED', null]]) {
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
            'PREPARING>READY:OWNER',
            'READY>DELIVERING:OWNER',
            'DELIVERING>COMPLETED:OWNER'
        ]);
    });

    test('tự đến lấy: READY → COMPLETED, không có bước DELIVERING', async () => {
        const order = await placeOrder(customer, shop, { fulfillmentType: 'PICKUP' });
        await owner.post(`${M}/${order.id}/accept`).expect(200);
        await owner.post(`${M}/${order.id}/status`, { to: 'PREPARING' }).expect(200);
        const ready = await owner.post(`${M}/${order.id}/status`, { to: 'READY' });
        expect(ready.body.data.nextStatus).toBe('COMPLETED');

        expect((await owner.post(`${M}/${order.id}/status`, { to: 'DELIVERING' })).status).toBe(409);
        expect((await owner.post(`${M}/${order.id}/status`, { to: 'COMPLETED' })).body.data.status).toBe('COMPLETED');
    });

    test.each([
        ['PLACED', 'PREPARING', 'phải nhận đơn trước'],
        ['ACCEPTED', 'READY', 'không được bỏ bước'],
        ['PREPARING', 'COMPLETED', 'không được bỏ bước'],
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
        expect(final.statusHistory).toHaveLength(2);
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

    test('quán hủy chỉ được với đơn đã nhận (ACCEPTED), hoàn suất', async () => {
        const order = await placeOrder(customer, shop, { qty: 2 });

        expect((await owner.post(`${M}/${order.id}/cancel`, { reasonCode: 'OVERLOADED' })).status).toBe(409);

        await owner.post(`${M}/${order.id}/accept`).expect(200);
        const res = await owner.post(`${M}/${order.id}/cancel`, { reasonCode: 'OVERLOADED' });
        expect(res.body.data.status).toBe('CANCELLED');
        expect(await soldToday()).toBe(0);

        await Order.updateOne({ _id: order.id }, { status: 'PREPARING' });
        expect((await owner.post(`${M}/${order.id}/cancel`, { reasonCode: 'OTHER' })).status).toBe(409);
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

        const active = await owner.get(`${M}?status=PLACED,ACCEPTED`);
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
        expect((await Order.findById(oldAccepted.id)).status).toBe('ACCEPTED');
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
