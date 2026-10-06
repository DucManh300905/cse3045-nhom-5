const request = require('supertest');
const app = require('../../src/app');
const Restaurant = require('../../src/modules/restaurant/restaurant.model');
const { setupDatabase } = require('../helpers/db');
const { createUserAndLogin } = require('../helpers/auth');

setupDatabase();

const BASE = '/api/merchant/restaurant';

const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
);

const sampleRestaurant = (overrides = {}) => ({
    name: 'Cơm Gà Hòa Lạc',
    address: 'Thôn 3, Thạch Hòa, Thạch Thất',
    phone: '+84 912 345 678',
    ...overrides
});

const fullWeek = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, open: '00:00', close: '23:59' }));

let token;

const auth = (req) => req.set('Authorization', `Bearer ${token}`);
const api = {
    create: (body) => auth(request(app).post(BASE)).send(body),
    get: () => auth(request(app).get(BASE)),
    update: (body) => auth(request(app).put(BASE)).send(body),
    hours: (openingHours) => auth(request(app).put(`${BASE}/opening-hours`)).send({ openingHours }),
    image: (kind, file = PNG, contentType = 'image/png') =>
        auth(request(app).post(`${BASE}/images/${kind}`)).attach('image', file, { filename: 'a.png', contentType }),
    document: (type, file = PNG) =>
        auth(request(app).post(`${BASE}/documents`))
            .field('type', type)
            .attach('file', file, { filename: 'giay-to.png', contentType: 'image/png' }),
    submit: () => auth(request(app).post(`${BASE}/submit`)),
    accepting: (isAcceptingOrders) =>
        auth(request(app).patch(`${BASE}/accepting-orders`)).send({ isAcceptingOrders })
};

// Quán đủ điều kiện nộp hồ sơ
const createCompleteRestaurant = async () => {
    await api.create(sampleRestaurant()).expect(201);
    await api.hours(fullWeek).expect(200);
    await api.document('BUSINESS_LICENSE').expect(200);
    await api.document('ID_CARD').expect(200);
};

beforeEach(async () => {
    ({ token } = await createUserAndLogin({ role: 'RESTAURANT_OWNER' }));
});

describe('POST /merchant/restaurant', () => {
    test('tạo quán ở trạng thái DRAFT, có slug, SĐT chuẩn hóa', async () => {
        const res = await api.create(sampleRestaurant({ minOrderAmount: 20000, lat: 21.01, lng: 105.52 }));

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({
            name: 'Cơm Gà Hòa Lạc',
            slug: 'com-ga-hoa-lac',
            phone: '0912345678',
            status: 'DRAFT',
            minOrderAmount: 20000,
            isAcceptingOrders: false,
            isOpenNow: false,
            location: { type: 'Point', coordinates: [105.52, 21.01] }
        });
    });

    test('mỗi chủ chỉ có 1 quán (BR-10)', async () => {
        await api.create(sampleRestaurant()).expect(201);

        const res = await api.create(sampleRestaurant({ name: 'Quán thứ hai' }));

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('RESTAURANT_ALREADY_EXISTS');
    });

    test('trùng tên quán thì slug có hậu tố', async () => {
        await api.create(sampleRestaurant()).expect(201);
        ({ token } = await createUserAndLogin({ role: 'RESTAURANT_OWNER' }));

        const res = await api.create(sampleRestaurant());

        expect(res.body.data.slug).toMatch(/^com-ga-hoa-lac-[a-z0-9]+$/);
    });

    test.each([
        ['thiếu tên', { name: undefined }],
        ['SĐT sai', { phone: '123' }],
        ['đơn tối thiểu là số lẻ (BR-21)', { minOrderAmount: 10000.5 }],
        ['đơn tối thiểu âm', { minOrderAmount: -1 }],
        ['chỉ có lat không có lng', { lat: 21 }]
    ])('400 khi %s', async (_, overrides) => {
        const res = await api.create(sampleRestaurant(overrides));

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    test('không cho tự đặt status / commissionRate', async () => {
        const res = await api.create(sampleRestaurant({ status: 'APPROVED', commissionRate: 0 }));

        expect(res.body.data.status).toBe('DRAFT');
        expect(res.body.data.commissionRate).toBe(0.1);
    });

    test('khách hàng không tạo được quán', async () => {
        ({ token } = await createUserAndLogin());

        expect((await api.create(sampleRestaurant())).status).toBe(403);
    });
});

describe('GET / PUT /merchant/restaurant', () => {
    test('404 khi chưa có quán', async () => {
        expect((await api.get()).status).toBe(404);
    });

    test('chỉ thấy quán của chính mình', async () => {
        await api.create(sampleRestaurant()).expect(201);
        ({ token } = await createUserAndLogin({ role: 'RESTAURANT_OWNER' }));

        expect((await api.get()).status).toBe(404);
    });

    test('sửa thông tin quán, bỏ qua field không được phép', async () => {
        await api.create(sampleRestaurant()).expect(201);

        const res = await api.update({ description: 'Ngon', minOrderAmount: 30000, status: 'APPROVED' });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ description: 'Ngon', minOrderAmount: 30000, status: 'DRAFT' });
        // slug không đổi theo tên
        const renamed = await api.update({ name: 'Tên mới' });
        expect(renamed.body.data.slug).toBe('com-ga-hoa-lac');
    });

    test('409 khi sửa hồ sơ lúc đang chờ duyệt', async () => {
        await createCompleteRestaurant();
        await api.submit().expect(200);

        const res = await api.update({ name: 'Đổi tên' });

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('RESTAURANT_UNDER_REVIEW');
    });

    test('403 khi quán bị khóa', async () => {
        await api.create(sampleRestaurant()).expect(201);
        await Restaurant.updateOne({}, { status: 'BLOCKED' });

        const res = await api.update({ name: 'Đổi tên' });

        expect(res.status).toBe(403);
        expect(res.body.code).toBe('RESTAURANT_BLOCKED');
    });
});

describe('PUT /merchant/restaurant/opening-hours', () => {
    beforeEach(async () => {
        await api.create(sampleRestaurant()).expect(201);
    });

    test('ghi đè giờ mở cửa, được sắp xếp theo ngày', async () => {
        const res = await api.hours([
            { dayOfWeek: 2, open: '17:00', close: '21:00' },
            { dayOfWeek: 1, open: '07:00', close: '10:30' },
            { dayOfWeek: 2, open: '07:00', close: '10:30' }
        ]);

        expect(res.status).toBe(200);
        expect(res.body.data.openingHours).toEqual([
            { dayOfWeek: 1, open: '07:00', close: '10:30' },
            { dayOfWeek: 2, open: '07:00', close: '10:30' },
            { dayOfWeek: 2, open: '17:00', close: '21:00' }
        ]);
    });

    test.each([
        ['giờ đóng trước giờ mở', [{ dayOfWeek: 1, open: '10:00', close: '09:00' }]],
        ['sai định dạng giờ', [{ dayOfWeek: 1, open: '7h', close: '09:00' }]],
        ['dayOfWeek ngoài 0-6', [{ dayOfWeek: 7, open: '07:00', close: '09:00' }]],
        [
            'hai khung giờ chồng nhau',
            [
                { dayOfWeek: 1, open: '07:00', close: '11:00' },
                { dayOfWeek: 1, open: '10:00', close: '13:00' }
            ]
        ]
    ])('400 khi %s', async (_, hours) => {
        const res = await api.hours(hours);

        expect(res.status).toBe(400);
    });
});

describe('Upload ảnh và giấy tờ', () => {
    beforeEach(async () => {
        await api.create(sampleRestaurant()).expect(201);
    });

    test('upload logo, ảnh truy cập được qua /uploads', async () => {
        const res = await api.image('logo');

        expect(res.status).toBe(200);
        expect(res.body.data.logoUrl).toMatch(/^\/uploads\/restaurants\/.+\.png$/);
        await request(app).get(res.body.data.logoUrl).expect(200);
    });

    test('400 khi sai loại file, thiếu file hoặc kind sai', async () => {
        expect((await api.image('logo', Buffer.from('hello'), 'text/plain')).status).toBe(400);
        expect((await auth(request(app).post(`${BASE}/images/logo`))).status).toBe(400);
        expect((await api.image('banner')).status).toBe(400);
    });

    test('upload giấy tờ: không trả đường dẫn file, cùng loại thì thay thế', async () => {
        await api.document('ID_CARD').expect(200);
        const res = await api.document('ID_CARD');

        expect(res.status).toBe(200);
        expect(res.body.data.documents).toHaveLength(1);
        expect(res.body.data.documents[0]).toMatchObject({ type: 'ID_CARD', originalName: 'giay-to.png' });
        expect(res.body.data.documents[0].fileKey).toBeUndefined();
        expect(JSON.stringify(res.body)).not.toMatch(/documents\//);
    });

    test('400 khi loại giấy tờ không hợp lệ', async () => {
        const res = await api.document('PASSPORT');

        expect(res.status).toBe(400);
    });
});

describe('POST /merchant/restaurant/submit (BR-11)', () => {
    test('422 khi thiếu giờ mở cửa và giấy tờ', async () => {
        await api.create(sampleRestaurant()).expect(201);

        const res = await api.submit();

        expect(res.status).toBe(422);
        expect(res.body.code).toBe('PROFILE_INCOMPLETE');
        expect(res.body.errors.map((e) => e.msg)).toEqual(
            expect.arrayContaining([
                'Opening hours are required',
                'Document BUSINESS_LICENSE is required',
                'Document ID_CARD is required'
            ])
        );
    });

    test('nộp hồ sơ đủ -> SUBMITTED; nộp lại -> 409; giấy tờ bị khóa', async () => {
        await createCompleteRestaurant();

        const res = await api.submit();
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('SUBMITTED');
        expect(res.body.data.submittedAt).toBeDefined();

        expect((await api.submit()).status).toBe(409);
        expect((await api.document('ID_CARD')).body.code).toBe('RESTAURANT_DOCUMENTS_LOCKED');
    });

    test('quán bị từ chối được sửa và nộp lại, xóa lý do từ chối', async () => {
        await createCompleteRestaurant();
        await Restaurant.updateOne({}, { status: 'REJECTED', rejectReason: 'Ảnh mờ' });

        await api.update({ name: 'Tên đã sửa' }).expect(200);
        const res = await api.submit();

        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('SUBMITTED');
        expect(res.body.data.rejectReason).toBeUndefined();
    });
});

describe('PATCH /merchant/restaurant/accepting-orders (BR-13)', () => {
    test('422 khi quán chưa được duyệt', async () => {
        await api.create(sampleRestaurant()).expect(201);

        const res = await api.accepting(true);

        expect(res.status).toBe(422);
        expect(res.body.code).toBe('RESTAURANT_NOT_APPROVED');
    });

    test('quán đã duyệt bật/tắt nhận đơn', async () => {
        await createCompleteRestaurant();
        await Restaurant.updateOne({}, { status: 'APPROVED' });

        const on = await api.accepting(true);
        expect(on.status).toBe(200);
        expect(on.body.data).toMatchObject({ isAcceptingOrders: true, isOpenNow: true, canAcceptOrders: true });

        const off = await api.accepting(false);
        expect(off.body.data).toMatchObject({ isAcceptingOrders: false, canAcceptOrders: false });
    });

    test('400 khi giá trị không phải boolean', async () => {
        await api.create(sampleRestaurant()).expect(201);
        await Restaurant.updateOne({}, { status: 'APPROVED' });

        expect((await api.accepting('có')).status).toBe(400);
    });
});
