const request = require('supertest');
const app = require('../../src/app');
const AuditLog = require('../../src/modules/audit/auditLog.model');
const { setupDatabase } = require('../helpers/db');
const { createUserAndLogin, createAdminAndLogin } = require('../helpers/auth');

setupDatabase();

const MERCHANT = '/api/merchant/restaurant';
const ADMIN = '/api/admin/restaurants';

const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
);

const fullWeek = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, open: '00:00', close: '23:59' }));

const as = (token) => ({
    get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    post: (url, body = {}) => request(app).post(url).set('Authorization', `Bearer ${token}`).send(body),
    put: (url, body = {}) => request(app).put(url).set('Authorization', `Bearer ${token}`).send(body),
    patch: (url, body = {}) => request(app).patch(url).set('Authorization', `Bearer ${token}`).send(body)
});

// Chủ quán tạo quán + đủ hồ sơ; submit = true thì nộp luôn
const createOwnerWithRestaurant = async ({ name = 'Cơm Gà Hòa Lạc', submit = true } = {}) => {
    const { token } = await createUserAndLogin({ role: 'RESTAURANT_OWNER' });
    const owner = as(token);

    const created = await owner.post(MERCHANT, { name, address: 'Thạch Thất', phone: '0912345678' }).expect(201);
    await owner.put(`${MERCHANT}/opening-hours`, { openingHours: fullWeek }).expect(200);

    for (const type of ['BUSINESS_LICENSE', 'ID_CARD']) {
        await request(app)
            .post(`${MERCHANT}/documents`)
            .set('Authorization', `Bearer ${token}`)
            .field('type', type)
            .attach('file', PNG, { filename: `${type}.png`, contentType: 'image/png' })
            .expect(200);
    }

    if (submit) {
        await owner.post(`${MERCHANT}/submit`).expect(200);
    }

    return { owner, restaurantId: created.body.data.id };
};

let admin;
let adminToken;

beforeEach(async () => {
    adminToken = (await createAdminAndLogin()).token;
    admin = as(adminToken);
});

describe('Phân quyền /api/admin', () => {
    test('chủ quán và khách không gọi được', async () => {
        const { owner } = await createOwnerWithRestaurant();
        const customer = as((await createUserAndLogin()).token);

        expect((await owner.get(ADMIN)).status).toBe(403);
        expect((await customer.get(ADMIN)).status).toBe(403);
        expect((await request(app).get(ADMIN)).status).toBe(401);
    });
});

describe('Luồng duyệt quán đầy đủ (BR-11, BR-13)', () => {
    test('nộp hồ sơ -> admin duyệt -> chủ quán bật nhận đơn', async () => {
        const { owner, restaurantId } = await createOwnerWithRestaurant();

        // Trước khi duyệt: không bật nhận đơn được
        expect((await owner.patch(`${MERCHANT}/accepting-orders`, { isAcceptingOrders: true })).status).toBe(422);

        const approved = await admin.post(`${ADMIN}/${restaurantId}/approve`);
        expect(approved.status).toBe(200);
        expect(approved.body.data).toMatchObject({ status: 'APPROVED' });
        expect(approved.body.data.approvedAt).toBeDefined();

        const on = await owner.patch(`${MERCHANT}/accepting-orders`, { isAcceptingOrders: true });
        expect(on.status).toBe(200);
        expect(on.body.data.canAcceptOrders).toBe(true);
    });

    test('từ chối kèm lý do -> chủ quán sửa và nộp lại -> duyệt', async () => {
        const { owner, restaurantId } = await createOwnerWithRestaurant();

        const rejected = await admin.post(`${ADMIN}/${restaurantId}/reject`, { reason: 'Ảnh GPKD bị mờ' });
        expect(rejected.status).toBe(200);
        expect(rejected.body.data).toMatchObject({ status: 'REJECTED', rejectReason: 'Ảnh GPKD bị mờ' });

        // Chủ quán thấy lý do, upload lại giấy tờ và nộp lại
        expect((await owner.get(MERCHANT)).body.data.rejectReason).toBe('Ảnh GPKD bị mờ');
        await owner.post(`${MERCHANT}/submit`).expect(200);

        const approved = await admin.post(`${ADMIN}/${restaurantId}/approve`);
        expect(approved.status).toBe(200);
        expect(approved.body.data.rejectReason).toBeUndefined();
    });

    test('400 khi từ chối không có lý do', async () => {
        const { restaurantId } = await createOwnerWithRestaurant();

        const res = await admin.post(`${ADMIN}/${restaurantId}/reject`, { reason: '   ' });

        expect(res.status).toBe(400);
    });

    test('409 khi duyệt quán chưa nộp hoặc đã duyệt', async () => {
        const { restaurantId } = await createOwnerWithRestaurant({ submit: false });
        expect((await admin.post(`${ADMIN}/${restaurantId}/approve`)).body.code).toBe('INVALID_STATUS_TRANSITION');

        const other = await createOwnerWithRestaurant({ name: 'Quán B' });
        await admin.post(`${ADMIN}/${other.restaurantId}/approve`).expect(200);
        expect((await admin.post(`${ADMIN}/${other.restaurantId}/approve`)).status).toBe(409);
    });

    test('hai admin duyệt cùng lúc: chỉ một người thành công', async () => {
        const { restaurantId } = await createOwnerWithRestaurant();
        const admin2 = as((await createAdminAndLogin()).token);

        const results = await Promise.all([
            admin.post(`${ADMIN}/${restaurantId}/approve`),
            admin2.post(`${ADMIN}/${restaurantId}/reject`, { reason: 'Thiếu' })
        ]);

        expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    });

    test('404 khi quán không tồn tại hoặc id sai', async () => {
        expect((await admin.post(`${ADMIN}/64b000000000000000000000/approve`)).status).toBe(404);
        expect((await admin.get(`${ADMIN}/abc`)).status).toBe(400);
    });
});

describe('Khóa / mở khóa quán', () => {
    test('khóa quán đã duyệt: tắt nhận đơn, chủ quán không sửa được', async () => {
        const { owner, restaurantId } = await createOwnerWithRestaurant();
        await admin.post(`${ADMIN}/${restaurantId}/approve`).expect(200);
        await owner.patch(`${MERCHANT}/accepting-orders`, { isAcceptingOrders: true }).expect(200);

        const blocked = await admin.post(`${ADMIN}/${restaurantId}/block`, { reason: 'Nhiều khiếu nại' });
        expect(blocked.status).toBe(200);
        expect(blocked.body.data).toMatchObject({ status: 'BLOCKED', isAcceptingOrders: false });
        expect((await owner.put(MERCHANT, { name: 'X' })).body.code).toBe('RESTAURANT_BLOCKED');

        const unblocked = await admin.post(`${ADMIN}/${restaurantId}/unblock`);
        expect(unblocked.body.data).toMatchObject({ status: 'APPROVED', isAcceptingOrders: false });
    });

    test('khóa / mở khóa không gửi body (reason không bắt buộc) vẫn chạy', async () => {
        const { restaurantId } = await createOwnerWithRestaurant();
        await admin.post(`${ADMIN}/${restaurantId}/approve`).expect(200);
        const bare = (action) =>
            request(app).post(`${ADMIN}/${restaurantId}/${action}`).set('Authorization', `Bearer ${adminToken}`);

        expect((await bare('block')).body.data.status).toBe('BLOCKED');
        expect((await bare('unblock')).body.data.status).toBe('APPROVED');
    });

    test('409 khi khóa quán chưa duyệt', async () => {
        const { restaurantId } = await createOwnerWithRestaurant();

        expect((await admin.post(`${ADMIN}/${restaurantId}/block`)).status).toBe(409);
    });
});

describe('GET /admin/restaurants', () => {
    test('mặc định chỉ hồ sơ SUBMITTED, nộp trước đứng trước, kèm thông tin chủ quán', async () => {
        await createOwnerWithRestaurant({ name: 'Quán A' });
        await createOwnerWithRestaurant({ name: 'Quán Nháp', submit: false });
        await createOwnerWithRestaurant({ name: 'Quán B' });

        const res = await admin.get(ADMIN);

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ page: 1, limit: 20, total: 2 });
        expect(res.body.data.items.map((r) => r.name)).toEqual(['Quán A', 'Quán B']);
        expect(res.body.data.items[0].owner).toMatchObject({ fullName: expect.any(String) });
        expect(res.body.data.items[0].owner.password).toBeUndefined();
    });

    test('lọc status=ALL, tìm theo q, phân trang', async () => {
        await createOwnerWithRestaurant({ name: 'Bún Chả' });
        await createOwnerWithRestaurant({ name: 'Phở Bò', submit: false });

        expect((await admin.get(`${ADMIN}?status=ALL`)).body.data.total).toBe(2);
        expect((await admin.get(`${ADMIN}?status=DRAFT`)).body.data.items[0].name).toBe('Phở Bò');
        expect((await admin.get(`${ADMIN}?status=ALL&q=bún`)).body.data.items.map((r) => r.name)).toEqual(['Bún Chả']);
        // Ký tự đặc biệt của regex không làm lỗi server
        expect((await admin.get(`${ADMIN}?status=ALL&q=(`)).status).toBe(200);

        const page2 = await admin.get(`${ADMIN}?status=ALL&limit=1&page=2`);
        expect(page2.body.data).toMatchObject({ page: 2, limit: 1, total: 2 });
        expect(page2.body.data.items).toHaveLength(1);
    });

    test('400 khi status hoặc limit sai', async () => {
        expect((await admin.get(`${ADMIN}?status=PENDING`)).status).toBe(400);
        expect((await admin.get(`${ADMIN}?limit=1000`)).status).toBe(400);
    });
});

describe('Giấy tờ pháp lý', () => {
    test('admin xem được file; chủ quán và người ngoài thì không', async () => {
        const { owner, restaurantId } = await createOwnerWithRestaurant();

        const detail = await admin.get(`${ADMIN}/${restaurantId}`);
        const doc = detail.body.data.documents.find((d) => d.type === 'ID_CARD');
        expect(doc.url).toBe(`/api/admin/restaurants/${restaurantId}/documents/ID_CARD`);

        const file = await admin.get(doc.url);
        expect(file.status).toBe(200);
        expect(file.headers['content-type']).toMatch(/image\/png/);
        expect(file.headers['cache-control']).toMatch(/no-store/);

        expect((await owner.get(doc.url)).status).toBe(403);
        expect((await request(app).get(doc.url)).status).toBe(401);
    });

    test('404 khi chưa có loại giấy tờ đó', async () => {
        const { restaurantId } = await createOwnerWithRestaurant();

        expect((await admin.get(`${ADMIN}/${restaurantId}/documents/FOOD_SAFETY`)).status).toBe(404);
    });
});

describe('Hoa hồng và audit log', () => {
    test('đổi commissionRate, chủ quán không tự đổi được', async () => {
        const { owner, restaurantId } = await createOwnerWithRestaurant();

        const res = await admin.patch(`${ADMIN}/${restaurantId}/commission`, { commissionRate: 0.15 });
        expect(res.status).toBe(200);
        expect(res.body.data.commissionRate).toBe(0.15);

        expect((await admin.patch(`${ADMIN}/${restaurantId}/commission`, { commissionRate: 1.5 })).status).toBe(400);

        expect((await owner.get(MERCHANT)).body.data.commissionRate).toBe(0.15);
    });

    test('mọi thao tác admin đều được ghi audit log', async () => {
        const { restaurantId } = await createOwnerWithRestaurant();

        await admin.post(`${ADMIN}/${restaurantId}/reject`, { reason: 'Thiếu' }).expect(200);
        await admin.patch(`${ADMIN}/${restaurantId}/commission`, { commissionRate: 0.2 }).expect(200);

        const res = await admin.get(`/api/admin/audit-logs?targetId=${restaurantId}`);

        expect(res.status).toBe(200);
        expect(res.body.data.items.map((l) => l.action)).toEqual([
            'RESTAURANT_COMMISSION_CHANGE',
            'RESTAURANT_REJECT'
        ]);
        expect(res.body.data.items[1]).toMatchObject({
            actorRole: 'ADMIN',
            before: { status: 'SUBMITTED' },
            after: { status: 'REJECTED' },
            note: 'Thiếu'
        });
        expect(res.body.data.items[1].actor.fullName).toMatch(/^Admin/);
    });

    test('audit log không sửa/xóa được', async () => {
        const { restaurantId } = await createOwnerWithRestaurant();
        await admin.post(`${ADMIN}/${restaurantId}/approve`).expect(200);

        await expect(AuditLog.deleteMany({})).rejects.toThrow('append-only');
        await expect(AuditLog.updateOne({}, { note: 'x' })).rejects.toThrow('append-only');
    });
});
