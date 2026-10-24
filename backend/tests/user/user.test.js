const request = require('supertest');
const app = require('../../src/app');
const { setupDatabase } = require('../helpers/db');
const { createUserAndLogin } = require('../helpers/auth');

setupDatabase();

describe('GET /api/users/me', () => {
    test('401 khi không có token', async () => {
        const res = await request(app).get('/api/users/me');

        expect(res.status).toBe(401);
    });

    test('401 khi token sai', async () => {
        const res = await request(app)
            .get('/api/users/me')
            .set('Authorization', 'Bearer token-sai');

        expect(res.status).toBe(401);
    });

    test('trả về hồ sơ với id (không có _id, password, __v)', async () => {
        const { token, user } = await createUserAndLogin();

        const res = await request(app)
            .get('/api/users/me')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.data.id).toBe(user.id);
        expect(res.body.data).not.toHaveProperty('_id');
        expect(res.body.data).not.toHaveProperty('password');
        expect(res.body.data).not.toHaveProperty('__v');
    });
});

describe('PUT /api/users/me', () => {
    test('cập nhật fullName', async () => {
        const { token } = await createUserAndLogin();

        const res = await request(app)
            .put('/api/users/me')
            .set('Authorization', `Bearer ${token}`)
            .send({ fullName: 'Tên mới' });

        expect(res.status).toBe(200);
        expect(res.body.data.fullName).toBe('Tên mới');
    });

    test('chuẩn hóa SĐT khi sửa hồ sơ (BR-02)', async () => {
        const { token } = await createUserAndLogin();

        const res = await request(app)
            .put('/api/users/me')
            .set('Authorization', `Bearer ${token}`)
            .send({ phone: '+84 987.654.321' });

        expect(res.status).toBe(200);
        expect(res.body.data.phone).toBe('0987654321');
    });

    test('400 khi SĐT sai định dạng hoặc fullName rỗng', async () => {
        const { token } = await createUserAndLogin();
        const put = (body) =>
            request(app).put('/api/users/me').set('Authorization', `Bearer ${token}`).send(body);

        expect((await put({ phone: '12345' })).status).toBe(400);
        expect((await put({ fullName: '   ' })).status).toBe(400);
    });

    test('400 khi xóa SĐT của tài khoản không có email', async () => {
        const { token } = await createUserAndLogin({ email: undefined, phone: '0922222222' });

        const res = await request(app)
            .put('/api/users/me')
            .set('Authorization', `Bearer ${token}`)
            .send({ phone: '' });

        expect(res.status).toBe(400);
    });

    test('409 khi đổi sang SĐT của người khác', async () => {
        await createUserAndLogin({ phone: '0911111111' });
        const { token } = await createUserAndLogin();

        const res = await request(app)
            .put('/api/users/me')
            .set('Authorization', `Bearer ${token}`)
            .send({ phone: '0911111111' });

        expect(res.status).toBe(409);
    });
});
