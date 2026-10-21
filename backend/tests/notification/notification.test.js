const Notification = require('../../src/modules/notification/notification.model');
const Order = require('../../src/modules/order/order.model');
const Restaurant = require('../../src/modules/restaurant/restaurant.model');
const { cancelExpiredOrders } = require('../../src/modules/order/order.service');
const { setupDatabase } = require('../helpers/db');
const { createUserAndLogin, createAdminAndLogin } = require('../helpers/auth');
const { allDay, as, createShop, placeOrder } = require('../helpers/orders');

setupDatabase();

const M = '/api/merchant/orders';

// Thông báo của 1 người, cũ nhất trước
const inbox = async (userId) => Notification.find({ user: userId }).sort({ createdAt: 1, _id: 1 }).lean();

let customer;
let customerId;
let shop;
let owner;
let ownerId;

beforeEach(async () => {
    const c = await createUserAndLogin();
    customer = as(c.token);
    customerId = c.user.id;
    shop = await createShop();
    owner = as(shop.ownerToken);
    ownerId = String(shop.restaurant.owner);
});

describe('Thông báo đơn hàng', () => {
    test('đơn mới -> chủ quán; mỗi bước quán làm -> khách; khách không nhận thông báo cho thao tác của chính mình', async () => {
        const order = await placeOrder(customer, shop, { qty: 2 });

        const [newOrder] = await inbox(ownerId);
        expect(newOrder).toMatchObject({ type: 'ORDER_NEW', title: `Đơn mới ${order.code}`, isRead: false });
        expect(newOrder.body).toContain('2 món');
        expect(newOrder.data).toMatchObject({ code: order.code, link: '/owner/orders' });
        expect(await inbox(customerId)).toHaveLength(0);

        await owner.post(`${M}/${order.id}/accept`).expect(200);
        for (const to of ['DELIVERING', 'COMPLETED']) {
            await owner.post(`${M}/${order.id}/status`, { to }).expect(200);
        }

        // Luồng rút gọn: nhận đơn (= đang làm) -> đi giao -> đã giao, mỗi bước 1 thông báo
        const titles = (await inbox(customerId)).map((n) => n.title);
        expect(titles).toEqual([
            `Quán Test đã nhận đơn ${order.code}`,
            `Đơn ${order.code} đang được giao đến bạn`,
            `Đơn ${order.code} đã được giao`
        ]);
        expect((await inbox(customerId))[0].body).toMatch(/^Đang chuẩn bị · dự kiến xong lúc \d{2}:\d{2}$/);
        // Chủ quán chỉ có thông báo đơn mới, không nhận lại thao tác của chính mình
        // (ngoài thông báo ví âm do đơn COD hoàn thành trừ hoa hồng — tests/wallet)
        expect((await inbox(ownerId)).filter((n) => n.type.startsWith('ORDER_'))).toHaveLength(1);
    });

    test('quán từ chối -> khách thấy lý do; khách hủy -> chủ quán được báo', async () => {
        const rejected = await placeOrder(customer, shop);
        await owner.post(`${M}/${rejected.id}/reject`, { reasonCode: 'OUT_OF_STOCK', note: 'Hết gà' }).expect(200);
        expect((await inbox(customerId)).at(-1)).toMatchObject({
            type: 'ORDER_STATUS',
            title: `Quán Test đã từ chối đơn ${rejected.code}`,
            body: 'Hết món: Hết gà'
        });

        const cancelled = await placeOrder(customer, shop);
        await customer.post(`/api/orders/${cancelled.id}/cancel`, { note: 'Đặt nhầm' }).expect(200);
        expect((await inbox(ownerId)).at(-1)).toMatchObject({ title: `Khách đã hủy đơn ${cancelled.code}`, body: 'Đặt nhầm' });
        // Khách tự hủy thì không tự báo cho chính mình
        expect((await inbox(customerId)).map((n) => n.data.code)).not.toContain(cancelled.code);
    });

    test('hệ thống tự hủy đơn quá giờ -> báo cả khách và chủ quán', async () => {
        const order = await placeOrder(customer, shop);
        await Order.updateOne({ _id: order.id }, { placedAt: new Date(Date.now() - 6 * 60 * 1000) });

        await cancelExpiredOrders({ olderThanMinutes: 5 });

        expect((await inbox(customerId)).at(-1)).toMatchObject({ title: `Đơn ${order.code} đã bị hủy`, body: 'Quán không phản hồi sau 5 phút' });
        expect((await inbox(ownerId)).at(-1)).toMatchObject({ title: `Đơn ${order.code} đã tự hủy` });
    });
});

describe('Thông báo hồ sơ quán', () => {
    test('nộp hồ sơ -> mọi admin; duyệt / từ chối / khóa / mở khóa -> chủ quán', async () => {
        const admin = await createAdminAndLogin();
        const adminApi = as(admin.token);
        const { user: draftOwner, token } = await createUserAndLogin({ role: 'RESTAURANT_OWNER' });
        const doc = (type) => ({ type, fileKey: `documents/${type}.png`, originalName: `${type}.png`, mimeType: 'image/png' });
        const restaurant = await Restaurant.create({
            owner: draftOwner.id,
            name: 'Quán Chờ Duyệt',
            address: 'Hòa Lạc',
            phone: '0912345678',
            openingHours: allDay,
            location: { type: 'Point', coordinates: [105.5254, 21.0136] },
            documents: [doc('BUSINESS_LICENSE'), doc('ID_CARD')]
        });

        await as(token).post('/api/merchant/restaurant/submit').expect(200);
        expect((await inbox(admin.user.id)).at(-1)).toMatchObject({
            type: 'RESTAURANT_SUBMITTED',
            title: 'Hồ sơ mới cần duyệt: Quán Chờ Duyệt',
            data: { link: `/admin/restaurants/${restaurant.id}` }
        });

        const A = `/api/admin/restaurants/${restaurant.id}`;
        await adminApi.post(`${A}/reject`, { reason: 'Ảnh GPKD mờ' }).expect(200);
        await as(token).post('/api/merchant/restaurant/submit').expect(200);
        await adminApi.post(`${A}/approve`).expect(200);
        await adminApi.post(`${A}/block`, { reason: 'Nhiều khiếu nại' }).expect(200);
        await adminApi.post(`${A}/unblock`).expect(200);

        expect((await inbox(draftOwner.id)).map((n) => [n.type, n.body])).toEqual([
            ['RESTAURANT_REJECTED', 'Ảnh GPKD mờ'],
            ['RESTAURANT_APPROVED', 'Bật "Đang nhận đơn" ở trang Hồ sơ quán để bắt đầu bán'],
            ['RESTAURANT_BLOCKED', 'Nhiều khiếu nại'],
            ['RESTAURANT_UNBLOCKED', 'Bật lại "Đang nhận đơn" để tiếp tục bán']
        ]);
    });
});

describe('API /notifications', () => {
    test('danh sách mới nhất trước + số chưa đọc; lọc chưa đọc; đánh dấu đã đọc 1 / tất cả', async () => {
        await placeOrder(customer, shop);
        await placeOrder(customer, shop);
        const third = await placeOrder(customer, shop);

        const list = await owner.get('/api/notifications');
        expect(list.status).toBe(200);
        expect(list.body.data).toMatchObject({ total: 3, unreadCount: 3 });
        expect(list.body.data.items[0].data.code).toBe(third.code);

        const read = await as(shop.ownerToken).patch(`/api/notifications/${list.body.data.items[0].id}/read`);
        expect(read.body.data.isRead).toBe(true);

        const unread = await owner.get('/api/notifications?unread=true');
        expect(unread.body.data).toMatchObject({ total: 2, unreadCount: 2 });

        const all = await as(shop.ownerToken).patch('/api/notifications/read-all');
        expect(all.body.data.modifiedCount).toBe(2);
        expect((await owner.get('/api/notifications')).body.data.unreadCount).toBe(0);
    });

    test('không đọc / đánh dấu được thông báo của người khác; chưa đăng nhập -> 401', async () => {
        await placeOrder(customer, shop);
        const [ownerNotification] = await inbox(ownerId);

        expect((await customer.get('/api/notifications')).body.data.total).toBe(0);
        expect((await as((await createUserAndLogin()).token).patch(`/api/notifications/${ownerNotification._id}/read`)).status).toBe(404);
        expect((await Notification.findById(ownerNotification._id)).isRead).toBe(false);

        const request = require('supertest');
        const app = require('../../src/app');
        expect((await request(app).get('/api/notifications')).status).toBe(401);
    });
});

describe('Số thông báo chưa đọc theo loại (số đỏ trên menu)', () => {
    it('đếm theo loại, đánh dấu đã đọc theo loại, không đụng thông báo người khác', async () => {
        const me = await createUserAndLogin();
        const other = await createUserAndLogin();
        await Notification.insertMany([
            { user: me.user.id, type: 'ORDER_STATUS', title: 'a' },
            { user: me.user.id, type: 'ORDER_STATUS', title: 'b' },
            { user: me.user.id, type: 'REFUND_DONE', title: 'c' },
            { user: me.user.id, type: 'REFUND_DONE', title: 'd', isRead: true },
            { user: other.user.id, type: 'ORDER_STATUS', title: 'e' }
        ]);
        const api = as;

        const counts = await api(me.token).get('/api/notifications/unread-counts').expect(200);
        expect(counts.body.data).toEqual({ total: 3, byType: { ORDER_STATUS: 2, REFUND_DONE: 1 } });

        await api(me.token).patch('/api/notifications/read-types', { types: ['ORDER_STATUS'] }).expect(200);
        await api(me.token).patch('/api/notifications/read-types', { types: ['KHONG_CO'] }).expect(400);
        const after = await api(me.token).get('/api/notifications/unread-counts').expect(200);
        expect(after.body.data).toEqual({ total: 1, byType: { REFUND_DONE: 1 } });
        const theirs = await api(other.token).get('/api/notifications/unread-counts').expect(200);
        expect(theirs.body.data.byType.ORDER_STATUS).toBe(1);
    });
});
