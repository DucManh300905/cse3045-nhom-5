const request = require('supertest');
const app = require('../../src/app');
const mailer = require('../../src/config/mailer');
const Otp = require('../../src/modules/auth/otp.model');
const User = require('../../src/modules/user/user.model');
const { setupDatabase } = require('../helpers/db');
const { createUserAndLogin } = require('../helpers/auth');

setupDatabase();

const forgot = (email) => request(app).post('/api/auth/password/forgot').send({ email });
const reset = (body) => request(app).post('/api/auth/password/reset').send(body);
const login = (identifier, password) => request(app).post('/api/auth/login').send({ identifier, password });

// Mã 6 số trong email đặt lại mật khẩu mới nhất gửi tới địa chỉ này
const resetCode = (email) => {
    const mail = [...mailer.outbox].reverse().find((m) => m.to === email && /mã đặt lại mật khẩu/.test(m.subject));
    return mail?.subject.match(/^(\d{6}) /)?.[1];
};

let account;

beforeEach(async () => {
    mailer.outbox.length = 0;
    account = await createUserAndLogin({ email: 'quen@gmail.com', password: 'MatKhauCu@1' });
});

describe('Quên mật khẩu', () => {
    test('gửi mã -> nhập mã + mật khẩu mới -> đăng nhập bằng mật khẩu mới; mật khẩu cũ và phiên cũ hết hiệu lực', async () => {
        const sent = await forgot(' Quen@Gmail.com ');
        expect(sent.status).toBe(200);
        const code = resetCode('quen@gmail.com');
        expect(code).toMatch(/^\d{6}$/);

        const res = await reset({ email: 'quen@gmail.com', code, newPassword: 'MatKhauMoi@2' });
        expect(res.status).toBe(200);

        expect((await login('quen@gmail.com', 'MatKhauMoi@2')).status).toBe(200);
        expect((await login('quen@gmail.com', 'MatKhauCu@1')).status).toBe(401);

        // Token cấp trước khi đặt lại (10 giây trước) không dùng được nữa
        const jwt = require('jsonwebtoken');
        const oldToken = jwt.sign(
            { ...jwt.decode(account.token), iat: Math.floor(Date.now() / 1000) - 10 },
            process.env.JWT_SECRET
        );
        const me = await request(app).get('/api/users/me').set('Authorization', `Bearer ${oldToken}`);
        expect(me.status).toBe(401);

        // Có email báo đã đổi mật khẩu
        expect(mailer.outbox.some((m) => m.to === 'quen@gmail.com' && /vừa được đổi/.test(m.subject))).toBe(true);
        expect(await User.findOne({ email: 'quen@gmail.com' }).lean()).toMatchObject({ emailVerified: true });
    });

    test('email chưa đăng ký: vẫn trả 200 giống hệt nhưng không gửi gì (không lộ email nào có tài khoản)', async () => {
        const known = await forgot('quen@gmail.com');
        const unknown = await forgot('khong-co@gmail.com');

        expect(unknown.status).toBe(known.status);
        expect(unknown.body).toEqual(known.body);
        expect(mailer.outbox.filter((m) => m.to === 'khong-co@gmail.com')).toHaveLength(0);
    });

    test('tài khoản bị khóa không nhận được mã', async () => {
        await User.updateOne({ email: 'quen@gmail.com' }, { status: 'BLOCKED' });
        expect((await forgot('quen@gmail.com')).status).toBe(200);
        expect(resetCode('quen@gmail.com')).toBeUndefined();
    });

    test('sai mã -> 400 OTP_INVALID, mật khẩu không đổi; mã chỉ dùng 1 lần', async () => {
        await forgot('quen@gmail.com');
        const code = resetCode('quen@gmail.com');
        const wrong = code === '000000' ? '111111' : '000000';

        const bad = await reset({ email: 'quen@gmail.com', code: wrong, newPassword: 'MatKhauMoi@2' });
        expect(bad.status).toBe(400);
        expect(bad.body).toMatchObject({ code: 'OTP_INVALID', errors: [{ attemptsLeft: 4 }] });
        expect((await login('quen@gmail.com', 'MatKhauCu@1')).status).toBe(200);

        await reset({ email: 'quen@gmail.com', code, newPassword: 'MatKhauMoi@2' }).expect(200);
        const again = await reset({ email: 'quen@gmail.com', code, newPassword: 'MatKhauKhac@3' });
        expect(again.body.code).toBe('OTP_EXPIRED');
    });

    test('mật khẩu mới yếu -> 400 và KHÔNG làm mất lượt nhập mã', async () => {
        await forgot('quen@gmail.com');
        const code = resetCode('quen@gmail.com');

        expect((await reset({ email: 'quen@gmail.com', code, newPassword: '12345678' })).status).toBe(400);
        expect((await reset({ email: 'quen@gmail.com', code, newPassword: 'ngan' })).status).toBe(400);
        expect((await Otp.findOne({ target: 'quen@gmail.com', purpose: 'RESET_PASSWORD' })).attempts).toBe(0);

        expect((await reset({ email: 'quen@gmail.com', code, newPassword: 'MatKhauMoi@2' })).status).toBe(200);
    });

    test('mã đăng ký không dùng được để đặt lại mật khẩu', async () => {
        await request(app).post('/api/auth/otp/send').send({ email: 'moi@gmail.com' }).expect(200);
        await User.create({ email: 'moi@gmail.com', password: 'x'.repeat(60), fullName: 'Mới' });
        const registerCode = [...mailer.outbox].reverse().find((m) => m.to === 'moi@gmail.com').subject.slice(0, 6);

        const res = await reset({ email: 'moi@gmail.com', code: registerCode, newPassword: 'MatKhauMoi@2' });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('OTP_EXPIRED');
    });

    test('gửi lại trong 60 giây -> 429 OTP_TOO_SOON', async () => {
        await forgot('quen@gmail.com').expect(200);
        const res = await forgot('quen@gmail.com');
        expect(res.status).toBe(429);
        expect(res.body.code).toBe('OTP_TOO_SOON');
    });
});
