const request = require('supertest');
const app = require('../../src/app');
const Order = require('../../src/modules/order/order.model');
const Restaurant = require('../../src/modules/restaurant/restaurant.model');
const AuditLog = require('../../src/modules/audit/auditLog.model');
const Notification = require('../../src/modules/notification/notification.model');
const { setupDatabase } = require('../helpers/db');
const { createUserAndLogin, createAdminAndLogin } = require('../helpers/auth');
const { as, createShop, placeOrder } = require('../helpers/orders');

setupDatabase();

// Khách mới, đã có 1 đơn HOÀN THÀNH ở quán -> được đánh giá
const customerWithCompletedOrder = async (shop) => {
    const { token, user } = await createUserAndLogin({ fullName: 'Nguyễn Văn An' });
    const customer = as(token);
    const order = await placeOrder(customer, shop);
    await Order.updateOne({ _id: order.id }, { status: 'COMPLETED' });
    return { customer, token, user, order };
};

const put = (token, idOrSlug, body) =>
    request(app).put(`/api/restaurants/${idOrSlug}/reviews/me`).set('Authorization', `Bearer ${token}`).send(body);

const ratingOf = async (shop) => Restaurant.findById(shop.restaurant._id).select('ratingAvg ratingCount ratingScore').lean();

let shop;

beforeEach(async () => {
    shop = await createShop();
});

describe('Khách viết đánh giá', () => {
    test('chưa có đơn hoàn thành -> 403 REVIEW_NOT_ALLOWED; canReview = false', async () => {
        const { token } = await createUserAndLogin();
        await placeOrder(as(token), shop); // đơn còn PLACED

        const me = await as(token).get(`/api/restaurants/${shop.restaurant.slug}/reviews/me`);
        expect(me.body.data).toEqual({ canReview: false, review: null });

        const res = await put(token, shop.restaurant.slug, { rating: 5 });
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('REVIEW_NOT_ALLOWED');
    });

    test('mỗi khách 1 đánh giá / quán: lần 2 là SỬA (200), không tạo thêm; điểm quán tính lại', async () => {
        const { token } = await customerWithCompletedOrder(shop);

        const created = await put(token, shop.restaurant.id, { rating: 4, comment: 'Cơm ngon, giao hơi chậm' });
        expect(created.status).toBe(201);
        expect(created.body.data).toMatchObject({ rating: 4, comment: 'Cơm ngon, giao hơi chậm', author: 'An N.' });
        expect(await ratingOf(shop)).toMatchObject({ ratingAvg: 4, ratingCount: 1, ratingScore: 3.5833 });

        const updated = await put(token, shop.restaurant.slug, { rating: 2, comment: 'Lần này nguội' });
        expect(updated.status).toBe(200);
        expect(await ratingOf(shop)).toMatchObject({ ratingAvg: 2, ratingCount: 1 });

        const me = await as(token).get(`/api/restaurants/${shop.restaurant.slug}/reviews/me`);
        expect(me.body.data).toMatchObject({ canReview: true, review: { rating: 2, comment: 'Lần này nguội' } });
    });

    test.each([
        ['0 sao', { rating: 0 }],
        ['6 sao', { rating: 6 }],
        ['số lẻ', { rating: 4.5 }],
        ['thiếu rating', { comment: 'x' }],
        ['nhận xét quá 1000 ký tự', { rating: 5, comment: 'x'.repeat(1001) }]
    ])('400 khi %s', async (_, body) => {
        const { token } = await customerWithCompletedOrder(shop);
        expect((await put(token, shop.restaurant.slug, body)).status).toBe(400);
    });

    test('xóa đánh giá của mình -> điểm quán về mặc định', async () => {
        const { token } = await customerWithCompletedOrder(shop);
        await put(token, shop.restaurant.slug, { rating: 5 }).expect(201);

        await request(app).delete(`/api/restaurants/${shop.restaurant.slug}/reviews/me`).set('Authorization', `Bearer ${token}`).expect(200);
        expect(await ratingOf(shop)).toMatchObject({ ratingAvg: 0, ratingCount: 0, ratingScore: 3.5 });
    });

    test('chủ quán không viết đánh giá được (403)', async () => {
        expect((await put(shop.ownerToken, shop.restaurant.slug, { rating: 5 })).status).toBe(403);
    });
});

describe('Xem đánh giá công khai', () => {
    test('ai cũng xem được: tên rút gọn, không lộ id khách; kèm phân bố số sao; lọc theo số sao', async () => {
        const a = await customerWithCompletedOrder(shop);
        const b = await customerWithCompletedOrder(shop);
        await put(a.token, shop.restaurant.slug, { rating: 5, comment: 'Tuyệt' }).expect(201);
        await put(b.token, shop.restaurant.slug, { rating: 3 }).expect(201);

        const res = await request(app).get(`/api/restaurants/${shop.restaurant.slug}/reviews`);
        expect(res.status).toBe(200);
        expect(res.body.data.total).toBe(2);
        expect(res.body.data.summary).toEqual({ ratingAvg: 4, ratingCount: 2, distribution: { 1: 0, 2: 0, 3: 1, 4: 0, 5: 1 } });
        res.body.data.items.forEach((r) => {
            expect(r.author).toBe('An N.');
            expect(r).not.toHaveProperty('customer');
        });

        const fiveStars = await request(app).get(`/api/restaurants/${shop.restaurant.slug}/reviews?rating=5`);
        expect(fiveStars.body.data.items.map((r) => r.comment)).toEqual(['Tuyệt']);
    });
});

describe('Chủ quán trả lời', () => {
    test('nhận thông báo REVIEW_NEW; trả lời hiện công khai; quán khác không trả lời được', async () => {
        const { token } = await customerWithCompletedOrder(shop);
        const review = (await put(token, shop.restaurant.slug, { rating: 4, comment: 'Ngon' })).body.data;

        const bell = await Notification.findOne({ user: shop.restaurant.owner, type: 'REVIEW_NEW' }).lean();
        expect(bell).toMatchObject({ title: 'Đánh giá mới: ★★★★☆', body: 'Ngon', data: { link: '/owner/reviews' } });

        const owner = as(shop.ownerToken);
        const list = await owner.get('/api/merchant/reviews?replied=false');
        expect(list.body.data.items.map((r) => r.id)).toEqual([review.id]);

        const reply = await request(app)
            .put(`/api/merchant/reviews/${review.id}/reply`)
            .set('Authorization', `Bearer ${shop.ownerToken}`)
            .send({ content: 'Cảm ơn bạn!' });
        expect(reply.status).toBe(200);
        expect((await owner.get('/api/merchant/reviews?replied=false')).body.data.total).toBe(0);

        const publicList = await request(app).get(`/api/restaurants/${shop.restaurant.slug}/reviews`);
        expect(publicList.body.data.items[0].reply).toMatchObject({ content: 'Cảm ơn bạn!' });

        const other = await createShop({ name: 'Quán Khác' });
        const stolen = await request(app)
            .put(`/api/merchant/reviews/${review.id}/reply`)
            .set('Authorization', `Bearer ${other.ownerToken}`)
            .send({ content: 'Hack' });
        expect(stolen.status).toBe(404);
    });
});

describe('Admin ẩn đánh giá vi phạm', () => {
    test('ẩn -> không hiện công khai, không tính điểm, ghi audit; hiện lại -> tính lại', async () => {
        const admin = as((await createAdminAndLogin()).token);
        const a = await customerWithCompletedOrder(shop);
        const b = await customerWithCompletedOrder(shop);
        await put(a.token, shop.restaurant.slug, { rating: 5 }).expect(201);
        const spam = (await put(b.token, shop.restaurant.slug, { rating: 1, comment: 'Nội dung vi phạm' })).body.data;
        expect(await ratingOf(shop)).toMatchObject({ ratingAvg: 3, ratingCount: 2 });

        const hide = await admin.patch(`/api/admin/reviews/${spam.id}/hide`, { hidden: true, reason: 'Ngôn từ xúc phạm' });
        expect(hide.body.data).toMatchObject({ isHidden: true, hiddenReason: 'Ngôn từ xúc phạm' });
        expect(await ratingOf(shop)).toMatchObject({ ratingAvg: 5, ratingCount: 1 });
        expect((await request(app).get(`/api/restaurants/${shop.restaurant.slug}/reviews`)).body.data.total).toBe(1);
        expect(await AuditLog.countDocuments({ action: 'REVIEW_HIDE', targetId: spam.id })).toBe(1);

        const hiddenList = await admin.get('/api/admin/reviews?hidden=true');
        expect(hiddenList.body.data.items[0]).toMatchObject({ id: spam.id, restaurant: { name: 'Quán Test' } });

        await admin.patch(`/api/admin/reviews/${spam.id}/hide`, { hidden: false });
        expect(await ratingOf(shop)).toMatchObject({ ratingAvg: 3, ratingCount: 2 });
    });
});

describe('Xếp hạng và bộ lọc', () => {
    test('điểm có trọng số: 6 lượt 4★ đứng trên 1 lượt 5★; quán chưa có đánh giá ở 3.5; lọc minRating', async () => {
        const single = await createShop({ name: 'Quán Một Lượt' });
        const popular = await createShop({ name: 'Quán Đông Khách' });

        const one = await customerWithCompletedOrder(single);
        await put(one.token, single.restaurant.slug, { rating: 5 }).expect(201);
        for (let i = 0; i < 6; i += 1) {
            const c = await customerWithCompletedOrder(popular);
            await put(c.token, popular.restaurant.slug, { rating: 4 }).expect(201);
        }

        const ranked = await request(app).get('/api/restaurants?sort=rating');
        expect(ranked.body.data.items.map((r) => r.name)).toEqual(['Quán Đông Khách', 'Quán Một Lượt', 'Quán Test']);

        const top = await request(app).get('/api/restaurants?minRating=4.5');
        expect(top.body.data.items.map((r) => r.name)).toEqual(['Quán Một Lượt']);

        const items = await request(app).get('/api/menu-items?minRating=4.5&limit=50');
        expect(new Set(items.body.data.items.map((i) => i.restaurant.name))).toEqual(new Set(['Quán Một Lượt']));
    });

    test('đơn hoàn thành -> thông báo khách mời đánh giá, mở thẳng phần đánh giá của quán', async () => {
        const { token, user } = await createUserAndLogin();
        const order = await placeOrder(as(token), shop, { fulfillmentType: 'PICKUP' });
        const owner = as(shop.ownerToken);
        await owner.post(`/api/merchant/orders/${order.id}/accept`).expect(200);
        for (const to of ['PREPARING', 'READY', 'COMPLETED']) {
            await owner.post(`/api/merchant/orders/${order.id}/status`, { to }).expect(200);
        }

        const done = await Notification.findOne({ user: user.id, title: `Đơn ${order.code} đã hoàn thành` }).lean();
        expect(done.data.link).toBe(`/restaurants/${shop.restaurant.slug}#reviews`);
    });
});
