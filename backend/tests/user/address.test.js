const request = require('supertest');
const app = require('../../src/app');
const { setupDatabase } = require('../helpers/db');
const { createUserAndLogin } = require('../helpers/auth');

setupDatabase();

const BASE = '/api/users/me/addresses';

const sampleAddress = (overrides = {}) => ({
    receiverName: 'Nguyễn Văn A',
    phone: '0912 345 678',
    addressLine: 'KTX ĐH Việt Nhật, Hòa Lạc',
    ...overrides
});

let token;

const api = {
    list: () => request(app).get(BASE).set('Authorization', `Bearer ${token}`),
    create: (body) => request(app).post(BASE).set('Authorization', `Bearer ${token}`).send(body),
    update: (id, body) => request(app).put(`${BASE}/${id}`).set('Authorization', `Bearer ${token}`).send(body),
    remove: (id) => request(app).delete(`${BASE}/${id}`).set('Authorization', `Bearer ${token}`)
};

beforeEach(async () => {
    ({ token } = await createUserAndLogin());
});

describe('Sổ địa chỉ /api/users/me/addresses', () => {
    test('địa chỉ đầu tiên tự thành mặc định, SĐT được chuẩn hóa', async () => {
        const res = await api.create(sampleAddress({ lat: 21.0, lng: 105.5 }));

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({
            phone: '0912345678',
            isDefault: true,
            location: { type: 'Point', coordinates: [105.5, 21.0] }
        });
        expect(res.body.data.id).toBeDefined();
    });

    test('thêm địa chỉ isDefault=true thì bỏ mặc định của địa chỉ cũ', async () => {
        await api.create(sampleAddress());
        await api.create(sampleAddress({ addressLine: 'Thạch Thất', isDefault: true }));

        const { body } = await api.list();

        expect(body.data).toHaveLength(2);
        expect(body.data.filter((a) => a.isDefault)).toHaveLength(1);
        expect(body.data.find((a) => a.isDefault).addressLine).toBe('Thạch Thất');
    });

    test('tối đa 5 địa chỉ', async () => {
        for (let i = 0; i < 5; i += 1) {
            await api.create(sampleAddress({ addressLine: `Địa chỉ ${i}` })).expect(201);
        }

        const res = await api.create(sampleAddress());

        expect(res.status).toBe(422);
        expect(res.body.code).toBe('ADDRESS_LIMIT');
    });

    test('sửa địa chỉ và đặt làm mặc định', async () => {
        await api.create(sampleAddress());
        const second = (await api.create(sampleAddress({ addressLine: 'B' }))).body.data;

        const res = await api.update(second.id, { addressLine: 'B mới', isDefault: true });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ addressLine: 'B mới', isDefault: true });
        const { body } = await api.list();
        expect(body.data.filter((a) => a.isDefault)).toHaveLength(1);
    });

    test('xóa địa chỉ mặc định thì địa chỉ còn lại thành mặc định', async () => {
        const first = (await api.create(sampleAddress())).body.data;
        await api.create(sampleAddress({ addressLine: 'B' }));

        const res = await api.remove(first.id);

        expect(res.status).toBe(200);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.data[0]).toMatchObject({ addressLine: 'B', isDefault: true });
    });

    test.each([
        ['thiếu receiverName', { receiverName: undefined }],
        ['thiếu addressLine', { addressLine: '  ' }],
        ['SĐT sai', { phone: '123' }],
        ['lat sai', { lat: 200, lng: 105 }]
    ])('400 khi %s', async (_, overrides) => {
        const res = await api.create(sampleAddress(overrides));

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    test('404 khi địa chỉ không tồn tại hoặc id sai định dạng', async () => {
        expect((await api.update('64b000000000000000000000', { label: 'x' })).status).toBe(404);
        expect((await api.remove('abc')).status).toBe(400);
    });

    test('không xem được địa chỉ của người khác', async () => {
        const mine = (await api.create(sampleAddress())).body.data;
        ({ token } = await createUserAndLogin());

        expect((await api.update(mine.id, { label: 'hack' })).status).toBe(404);
        expect((await api.list()).body.data).toHaveLength(0);
    });

    test('chủ quán không dùng được sổ địa chỉ', async () => {
        ({ token } = await createUserAndLogin({ role: 'RESTAURANT_OWNER' }));

        expect((await api.list()).status).toBe(403);
    });
});
