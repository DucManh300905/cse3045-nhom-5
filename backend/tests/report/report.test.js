const request = require('supertest');
const app = require('../../src/app');
const Order = require('../../src/modules/order/order.model');
const Restaurant = require('../../src/modules/restaurant/restaurant.model');
const AuditLog = require('../../src/modules/audit/auditLog.model');
const { setupDatabase } = require('../helpers/db');
const { createUserAndLogin, createAdminAndLogin } = require('../helpers/auth');
const { as, createShop } = require('../helpers/orders');

setupDatabase();

let seq = 0;

// Đơn tạo thẳng trong DB với giờ đặt (giờ VN) + trạng thái + tiền cố định để so số chính xác
const makeOrder = (shop, customerId, { at, status = 'COMPLETED', items = [{ item: shop.rice, qty: 1, price: 35000 }] }) => {
    const lines = items.map(({ item, qty, price }) => ({ menuItem: item._id, name: item.name, unitPrice: price, qty, lineTotal: price * qty }));
    const subtotal = lines.reduce((s, l) => s + l.lineTotal, 0);
    seq += 1;
    return Order.create({
        code: `T-${seq}`,
        customer: customerId,
        restaurant: shop.restaurant._id,
        restaurantSnapshot: { name: shop.restaurant.name, slug: shop.restaurant.slug },
        items: lines,
        subtotal,
        deliveryFee: 0,
        total: subtotal,
        commissionRate: 0.1,
        commissionAmount: Math.round(subtotal * 0.1),
        status,
        placedAt: new Date(`${at}+07:00`)
    });
};

let shop;
let other;
let owner;
let customerId;

beforeEach(async () => {
    shop = await createShop();
    other = await createShop({ name: 'Quán Khác' });
    owner = as(shop.ownerToken);
    customerId = (await createUserAndLogin()).user.id;

    await makeOrder(shop, customerId, { at: '2026-10-01T10:00:00', items: [{ item: shop.rice, qty: 1, price: 35000 }, { item: shop.tea, qty: 2, price: 7500 }] }); // 50.000
    await makeOrder(shop, customerId, { at: '2026-10-02T12:00:00', items: [{ item: shop.rice, qty: 2, price: 15000 }] }); // 30.000
    await makeOrder(shop, customerId, { at: '2026-10-03T09:00:00', status: 'CANCELLED' });
    await makeOrder(shop, customerId, { at: '2026-10-03T09:30:00', status: 'REJECTED' });
    await makeOrder(shop, customerId, { at: '2026-10-04T11:00:00', status: 'PREPARING' });
    // Ranh giới ngày giờ VN: 23:30 ngày 7 tính, 00:10 ngày 8 không tính
    await makeOrder(shop, customerId, { at: '2026-10-07T23:30:00', items: [{ item: shop.tea, qty: 1, price: 20000 }] }); // 20.000
    await makeOrder(shop, customerId, { at: '2026-10-08T00:10:00', items: [{ item: shop.rice, qty: 9, price: 35000 }] });
    // Quán khác: không được tính vào số của quán này
    await makeOrder(other, customerId, { at: '2026-10-02T10:00:00', items: [{ item: other.rice, qty: 10, price: 35000 }] }); // 350.000
});

const RANGE = 'from=2026-10-01&to=2026-10-07';

describe('Báo cáo chủ quán', () => {
    test('summary: chỉ đơn của quán mình, doanh thu chỉ tính đơn hoàn thành, đúng ranh giới ngày VN', async () => {
        const res = await owner.get(`/api/merchant/reports/summary?${RANGE}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({
            range: { from: '2026-10-01', to: '2026-10-07', days: 7 },
            totalOrders: 6,
            completedOrders: 3,
            cancelledOrders: 2,
            activeOrders: 1,
            itemsSold: 6,
            grossRevenue: 100000,
            commission: 10000,
            netRevenue: 90000,
            avgOrderValue: 33333,
            cancelRate: 0.4,
            commissionRate: 0.1
        });
    });

    test('revenue theo ngày: đủ 7 ngày, ngày không có đơn = 0', async () => {
        const res = await owner.get(`/api/merchant/reports/revenue?${RANGE}`);
        const series = res.body.data.series;

        expect(series.map((p) => p.period)).toEqual([
            '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07'
        ]);
        expect(series.map((p) => p.grossRevenue)).toEqual([50000, 30000, 0, 0, 0, 0, 20000]);
        expect(series[2]).toMatchObject({ orders: 2, completedOrders: 0 });
        expect(series[0]).toMatchObject({ commission: 5000, netRevenue: 45000 });
    });

    test('revenue theo tuần (bắt đầu thứ Hai) và theo tháng', async () => {
        const week = await owner.get(`/api/merchant/reports/revenue?${RANGE}&groupBy=week`);
        // 01/10/2026 là thứ Năm -> tuần bắt đầu 28/09
        expect(week.body.data.series.map((p) => [p.period, p.grossRevenue])).toEqual([
            ['2026-09-28', 80000],
            ['2026-10-05', 20000]
        ]);

        const month = await owner.get('/api/merchant/reports/revenue?from=2026-09-15&to=2026-10-31&groupBy=month');
        expect(month.body.data.series.map((p) => [p.period, p.grossRevenue])).toEqual([
            ['2026-09-01', 0],
            ['2026-10-01', 100000 + 35000 * 9]
        ]);
    });

    test('top món: theo số phần của đơn hoàn thành', async () => {
        const res = await owner.get(`/api/merchant/reports/top-items?${RANGE}`);

        expect(res.body.data.items).toEqual([
            // Cùng 3 phần -> doanh thu cao hơn đứng trước
            expect.objectContaining({ name: 'Cơm gà', qty: 3, revenue: 65000, orders: 2 }),
            expect.objectContaining({ name: 'Trà sữa', qty: 3, revenue: 35000, orders: 2 })
        ]);
    });

    test('khoảng ngày sai -> 400; mặc định 30 ngày; khách gọi -> 403', async () => {
        expect((await owner.get('/api/merchant/reports/summary?from=2026-10-07&to=2026-10-01')).status).toBe(400);
        expect((await owner.get('/api/merchant/reports/summary?from=2025-01-01&to=2026-10-07')).status).toBe(400);
        expect((await owner.get('/api/merchant/reports/summary?from=07/10/2026')).status).toBe(400);
        expect((await owner.get('/api/merchant/reports/revenue?groupBy=year')).status).toBe(400);

        expect((await owner.get('/api/merchant/reports/summary')).body.data.range.days).toBe(30);

        const customer = as((await createUserAndLogin()).token);
        expect((await customer.get('/api/merchant/reports/summary')).status).toBe(403);
    });
});

describe('Admin: thống kê, người dùng, đơn hàng', () => {
    let admin;

    beforeEach(async () => {
        admin = as((await createAdminAndLogin()).token);
    });

    test('summary toàn hệ thống: GMV, hoa hồng, quán theo trạng thái, top quán', async () => {
        const res = await admin.get(`/api/admin/reports/summary?${RANGE}`);

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({
            gmv: 450000,
            platformRevenue: 45000,
            orders: { totalOrders: 7, completedOrders: 4 },
            restaurants: { byStatus: { APPROVED: 2 }, total: 2 },
            users: { byRole: { CUSTOMER: 1, RESTAURANT_OWNER: 2, ADMIN: 1 }, blocked: 0 }
        });
        expect(res.body.data.topRestaurants.map((r) => [r.name, r.grossRevenue])).toEqual([
            ['Quán Khác', 350000],
            ['Quán Test', 100000]
        ]);
        expect(res.body.data.series).toHaveLength(7);
    });

    test('khóa khách: đăng nhập và token cũ bị chặn ngay; ghi audit; mở lại thì vào được', async () => {
        const { token, user } = await createUserAndLogin({ email: 'khoa@gmail.com' });

        const list = await admin.get('/api/admin/users?role=CUSTOMER&q=khoa');
        expect(list.body.data.items.map((u) => u.email)).toEqual(['khoa@gmail.com']);

        const blocked = await admin.post(`/api/admin/users/${user.id}/block`, { reason: 'Đặt đơn ảo' });
        expect(blocked.body.data).toMatchObject({ status: 'BLOCKED' });
        expect((await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`)).body.code).toBe('ACCOUNT_BLOCKED');
        expect((await request(app).post('/api/auth/login').send({ identifier: 'khoa@gmail.com', password: 'Test@1234' })).status).toBe(403);
        expect(await AuditLog.countDocuments({ action: 'USER_BLOCK', targetId: user.id, note: 'Đặt đơn ảo' })).toBe(1);

        expect((await admin.post(`/api/admin/users/${user.id}/block`)).status).toBe(409);

        await admin.post(`/api/admin/users/${user.id}/unblock`).expect(200);
        expect((await request(app).post('/api/auth/login').send({ identifier: 'khoa@gmail.com', password: 'Test@1234' })).status).toBe(200);
    });

    test('khóa chủ quán -> quán tắt nhận đơn; không khóa được admin', async () => {
        const ownerId = String(shop.restaurant.owner);
        const users = await admin.get('/api/admin/users?role=RESTAURANT_OWNER');
        expect(users.body.data.items.find((u) => u.id === ownerId).restaurant).toMatchObject({ name: 'Quán Test' });

        await admin.post(`/api/admin/users/${ownerId}/block`).expect(200);
        expect((await Restaurant.findById(shop.restaurant._id)).isAcceptingOrders).toBe(false);

        const another = await createAdminAndLogin();
        const res = await admin.post(`/api/admin/users/${another.user.id}/block`);
        expect(res.status).toBe(403);
    });

    test('xem mọi đơn (chỉ đọc): lọc trạng thái / quán / mã, kèm thông tin khách', async () => {
        const all = await admin.get('/api/admin/orders?limit=50');
        expect(all.body.data.total).toBe(8);
        expect(all.body.data.items[0].customer).toHaveProperty('fullName');

        const cancelled = await admin.get('/api/admin/orders?status=CANCELLED,REJECTED');
        expect(cancelled.body.data.total).toBe(2);

        const ofOther = await admin.get(`/api/admin/orders?restaurant=${other.restaurant.id}`);
        expect(ofOther.body.data.total).toBe(1);

        const ranged = await admin.get(`/api/admin/orders?${RANGE}`);
        expect(ranged.body.data.total).toBe(7);

        const one = all.body.data.items[0];
        expect((await admin.get(`/api/admin/orders/${one.id}`)).body.data.code).toBe(one.code);
        expect((await admin.get(`/api/admin/orders?q=${encodeURIComponent(one.code)}`)).body.data.items[0].id).toBe(one.id);

        expect((await owner.get('/api/admin/orders')).status).toBe(403);
    });
});
