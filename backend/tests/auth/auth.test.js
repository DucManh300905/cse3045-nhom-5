const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/modules/user/user.model');
const { setupDatabase } = require('../helpers/db');

setupDatabase();

const { issueVerificationToken } = require('../../src/modules/auth/otp.service');

// Email hợp lệ thì kèm sẵn vé OTP (đăng ký bằng email bắt buộc xác thực — xem otp.test.js)
const register = (body) =>
    request(app)
        .post('/api/auth/register')
        .send(typeof body.email === 'string' ? { verificationToken: issueVerificationToken(body.email.trim().toLowerCase()), ...body } : body);
const login = (body) => request(app).post('/api/auth/login').send(body);

const validUser = {
    fullName: 'Nguyễn Văn A',
    email: 'a@gmail.com',
    password: 'Test@1234'
};

describe('POST /api/auth/register', () => {
    test('đăng ký bằng email, mặc định role CUSTOMER', async () => {
        const res = await register(validUser);

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({
            email: 'a@gmail.com',
            fullName: 'Nguyễn Văn A',
            role: 'CUSTOMER',
            status: 'ACTIVE'
        });
        expect(res.body.data.id).toBeDefined();
        expect(res.body.data.password).toBeUndefined();
    });

    test('đăng ký bằng SĐT, chuẩn hóa +84 thành 0 (BR-02)', async () => {
        const res = await register({ fullName: 'B', phone: '+84 912.345.678', password: 'Test@1234' });

        expect(res.status).toBe(201);
        expect(res.body.data.phone).toBe('0912345678');
    });

    test('đăng ký RESTAURANT_OWNER được phép', async () => {
        const res = await register({ ...validUser, role: 'RESTAURANT_OWNER' });

        expect(res.status).toBe(201);
        expect(res.body.data.role).toBe('RESTAURANT_OWNER');
    });

    test('không cho tự đăng ký ADMIN (BR-03)', async () => {
        const res = await register({ ...validUser, role: 'ADMIN' });

        expect(res.status).toBe(400);
        expect(await User.countDocuments()).toBe(0);
    });

    test.each([
        ['thiếu cả email và SĐT', { fullName: 'A', password: 'Test@1234' }],
        ['thiếu fullName', { email: 'a@gmail.com', password: 'Test@1234' }],
        ['email sai định dạng', { ...validUser, email: 'abc' }],
        ['SĐT sai định dạng', { fullName: 'A', phone: '12345', password: 'Test@1234' }],
        ['mật khẩu < 8 ký tự', { ...validUser, password: 'Abc@123' }],
        ['mật khẩu quá phổ biến', { ...validUser, password: '12345678' }]
    ])('400 khi %s (BR-01)', async (_, body) => {
        const res = await register(body);

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
    });

    test('409 khi email đã tồn tại (không phân biệt hoa thường)', async () => {
        await register(validUser).expect(201);

        const res = await register({ ...validUser, email: 'A@Gmail.com' });

        expect(res.status).toBe(409);
        expect(res.body.message).toBe('Email already exists');
    });

    test('409 khi SĐT đã tồn tại', async () => {
        await register({ fullName: 'A', phone: '0912345678', password: 'Test@1234' }).expect(201);

        const res = await register({ fullName: 'B', phone: '0912345678', password: 'Test@1234' });

        expect(res.status).toBe(409);
        expect(res.body.message).toBe('Phone already exists');
    });
});

describe('POST /api/auth/login', () => {
    beforeEach(async () => {
        await register({ ...validUser, phone: '0912345678' }).expect(201);
    });

    test('đăng nhập bằng email trả về token', async () => {
        const res = await login({ identifier: 'a@gmail.com', password: 'Test@1234' });

        expect(res.status).toBe(200);
        expect(res.body.data.token).toEqual(expect.any(String));
        expect(res.body.data.user.email).toBe('a@gmail.com');
    });

    test('đăng nhập bằng SĐT', async () => {
        const res = await login({ identifier: '0912 345 678', password: 'Test@1234' });

        expect(res.status).toBe(200);
    });

    test('vẫn nhận field email cũ để tương thích', async () => {
        const res = await login({ email: 'a@gmail.com', password: 'Test@1234' });

        expect(res.status).toBe(200);
    });

    test('401 khi sai mật khẩu', async () => {
        const res = await login({ identifier: 'a@gmail.com', password: 'sai-mat-khau' });

        expect(res.status).toBe(401);
    });

    test('401 khi tài khoản không tồn tại', async () => {
        const res = await login({ identifier: 'x@gmail.com', password: 'Test@1234' });

        expect(res.status).toBe(401);
    });

    test('403 khi tài khoản bị khóa (BR-04)', async () => {
        await User.updateOne({ email: 'a@gmail.com' }, { status: 'BLOCKED' });

        const res = await login({ identifier: 'a@gmail.com', password: 'Test@1234' });

        expect(res.status).toBe(403);
    });
});
