const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/modules/user/user.model');
const { setupDatabase } = require('../helpers/db');
const { createUserAndLogin } = require('../helpers/auth');

setupDatabase();

const me = (token) => request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);

const changePassword = (token, body) =>
    request(app)
        .put('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send(body);

describe('authenticate', () => {
    test('token của tài khoản bị khóa bị từ chối ngay (BR-04)', async () => {
        const { token, user } = await createUserAndLogin();
        await User.updateOne({ _id: user.id }, { status: 'BLOCKED' });

        const res = await me(token);

        expect(res.status).toBe(403);
        expect(res.body.code).toBe('ACCOUNT_BLOCKED');
    });

    test('token của user đã bị xóa trả 401', async () => {
        const { token, user } = await createUserAndLogin();
        await User.deleteOne({ _id: user.id });

        const res = await me(token);

        expect(res.status).toBe(401);
    });

    test('role lấy từ DB, không tin role trong token', async () => {
        const { token, user } = await createUserAndLogin();
        await User.updateOne({ _id: user.id }, { role: 'RESTAURANT_OWNER' });

        // CUSTOMER-only route: giờ user đã là owner trong DB nên bị chặn
        const res = await request(app)
            .get('/api/users/me/addresses')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(403);
    });
});

describe('PUT /api/auth/change-password', () => {
    test('đổi mật khẩu thành công, trả token mới dùng được', async () => {
        const { token, user } = await createUserAndLogin();

        const res = await changePassword(token, { currentPassword: 'Test@1234', newPassword: 'Abcd@5678' });

        expect(res.status).toBe(200);
        expect((await me(res.body.data.token)).status).toBe(200);

        // Đăng nhập bằng mật khẩu mới
        await request(app)
            .post('/api/auth/login')
            .send({ identifier: user.email, password: 'Abcd@5678' })
            .expect(200);
    });

    test('token cũ hết hiệu lực sau khi đổi mật khẩu', async () => {
        const { token } = await createUserAndLogin();
        // Giả lập token được cấp từ 10 giây trước
        const issuedLongAgo = require('jsonwebtoken').sign(
            { ...require('jsonwebtoken').decode(token), iat: Math.floor(Date.now() / 1000) - 10 },
            process.env.JWT_SECRET
        );

        await changePassword(token, { currentPassword: 'Test@1234', newPassword: 'Abcd@5678' }).expect(200);

        const res = await me(issuedLongAgo);

        expect(res.status).toBe(401);
        expect(res.body.code).toBe('TOKEN_EXPIRED');
    });

    test('sai mật khẩu hiện tại trả 400 (không phải 401)', async () => {
        const { token } = await createUserAndLogin();

        const res = await changePassword(token, { currentPassword: 'sai', newPassword: 'Abcd@5678' });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_PASSWORD');
    });

    test.each([
        ['< 8 ký tự', 'Abc@123'],
        ['quá phổ biến', 'password123']
    ])('mật khẩu mới %s trả 400', async (_, newPassword) => {
        const { token } = await createUserAndLogin();

        const res = await changePassword(token, { currentPassword: 'Test@1234', newPassword });

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    test('mật khẩu mới trùng mật khẩu cũ trả 400', async () => {
        const { token } = await createUserAndLogin();

        const res = await changePassword(token, { currentPassword: 'Test@1234', newPassword: 'Test@1234' });

        expect(res.status).toBe(400);
    });

    test('401 khi chưa đăng nhập', async () => {
        const res = await request(app)
            .put('/api/auth/change-password')
            .send({ currentPassword: 'Test@1234', newPassword: 'Abcd@5678' });

        expect(res.status).toBe(401);
    });
});
