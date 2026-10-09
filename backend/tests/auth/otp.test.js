const request = require('supertest');
const app = require('../../src/app');
const mailer = require('../../src/config/mailer');
const Otp = require('../../src/modules/auth/otp.model');
const User = require('../../src/modules/user/user.model');
const { setupDatabase } = require('../helpers/db');

setupDatabase();

const send = (email) => request(app).post('/api/auth/otp/send').send({ email });
const verify = (email, code) => request(app).post('/api/auth/otp/verify').send({ email, code });
const register = (body) => request(app).post('/api/auth/register').send(body);

// Mã 6 số trong email mới nhất gửi tới địa chỉ này
const lastCode = (email) => {
    const mail = [...mailer.outbox].reverse().find((m) => m.to === email);
    return mail?.subject.match(/^(\d{6}) /)?.[1];
};

// Giả lập đã qua 61 giây kể từ lần gửi trước
const skipCooldown = (email) => Otp.updateOne({ target: email }, { $set: { lastSentAt: new Date(Date.now() - 61 * 1000) } });

const user = { fullName: 'Nguyễn Văn A', password: 'Test@1234' };

beforeEach(() => {
    mailer.outbox.length = 0;
});

describe('Đăng ký bằng email có OTP', () => {
    test('gửi mã 6 số -> nhập đúng -> nhận vé -> đăng ký thành công, emailVerified = true', async () => {
        const sent = await send(' A@Gmail.com ');
        expect(sent.status).toBe(200);
        expect(sent.body.data).toEqual({ expiresInSeconds: 300, resendInSeconds: 60 });

        const code = lastCode('a@gmail.com');
        expect(code).toMatch(/^\d{6}$/);
        expect(mailer.outbox.at(-1).html).toContain(code);

        // DB chỉ lưu bản băm, không lưu mã gốc
        const stored = await Otp.findOne({ target: 'a@gmail.com' }).lean();
        expect(JSON.stringify(stored)).not.toContain(code);

        const verified = await verify('a@gmail.com', code);
        expect(verified.status).toBe(200);

        const res = await register({ ...user, email: 'a@gmail.com', verificationToken: verified.body.data.verificationToken });
        expect(res.status).toBe(201);
        expect(await User.findOne({ email: 'a@gmail.com' }).lean()).toMatchObject({ emailVerified: true });
    });

    test('đăng ký email thiếu vé / vé của email khác / vé giả -> 400 OTP_REQUIRED', async () => {
        await send('b@gmail.com');
        const token = (await verify('b@gmail.com', lastCode('b@gmail.com'))).body.data.verificationToken;

        for (const verificationToken of [undefined, token, 'abc.def.ghi']) {
            const res = await register({ ...user, email: 'c@gmail.com', verificationToken });
            expect(res.status).toBe(400);
            expect(res.body.code).toBe('OTP_REQUIRED');
        }
        expect(await User.countDocuments()).toBe(0);
    });

    test('đăng ký bằng số điện thoại vẫn không cần OTP', async () => {
        expect((await register({ ...user, phone: '0912345678' })).status).toBe(201);
    });
});

describe('Nhập mã', () => {
    test('sai mã -> 400 OTP_INVALID kèm số lần còn lại; sai 5 lần -> khóa mã kể cả nhập đúng', async () => {
        await send('d@gmail.com');
        const code = lastCode('d@gmail.com');
        const wrong = code === '000000' ? '111111' : '000000';

        const first = await verify('d@gmail.com', wrong);
        expect(first.status).toBe(400);
        expect(first.body).toMatchObject({ code: 'OTP_INVALID', errors: [{ attemptsLeft: 4 }] });

        for (let i = 0; i < 4; i += 1) {
            await verify('d@gmail.com', wrong);
        }

        const locked = await verify('d@gmail.com', code);
        expect(locked.status).toBe(429);
        expect(locked.body.code).toBe('OTP_TOO_MANY_ATTEMPTS');
    });

    test('mã hết hạn sau 5 phút; mã đã dùng không dùng lại được', async () => {
        await send('e@gmail.com');
        const code = lastCode('e@gmail.com');
        await Otp.updateOne({ target: 'e@gmail.com' }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
        expect((await verify('e@gmail.com', code)).body.code).toBe('OTP_EXPIRED');

        await skipCooldown('e@gmail.com');
        await send('e@gmail.com');
        const fresh = lastCode('e@gmail.com');
        expect((await verify('e@gmail.com', fresh)).status).toBe(200);
        expect((await verify('e@gmail.com', fresh)).body.code).toBe('OTP_EXPIRED');
    });

    test('mã sai định dạng / email sai -> 400', async () => {
        expect((await verify('f@gmail.com', '12345')).status).toBe(400);
        expect((await verify('f@gmail.com', 'abcdef')).status).toBe(400);
        expect((await send('khong-phai-email')).status).toBe(400);
    });
});

describe('Gửi mã', () => {
    test('gửi lại trong 60 giây -> 429 OTP_TOO_SOON; sau đó mã mới thay mã cũ', async () => {
        await send('g@gmail.com');
        const old = lastCode('g@gmail.com');

        const tooSoon = await send('g@gmail.com');
        expect(tooSoon.status).toBe(429);
        expect(tooSoon.body.code).toBe('OTP_TOO_SOON');
        expect(tooSoon.body.errors[0].retryAfter).toBeGreaterThan(50);

        await skipCooldown('g@gmail.com');
        await send('g@gmail.com').expect(200);
        const fresh = lastCode('g@gmail.com');
        if (fresh !== old) {
            expect((await verify('g@gmail.com', old)).body.code).toBe('OTP_INVALID');
        }
        expect((await verify('g@gmail.com', fresh)).status).toBe(200);
    });

    test('tối đa 5 mã / giờ cho mỗi email -> lần 6: 429 OTP_LIMIT', async () => {
        for (let i = 0; i < 5; i += 1) {
            await send('h@gmail.com').expect(200);
            await skipCooldown('h@gmail.com');
        }

        const res = await send('h@gmail.com');
        expect(res.status).toBe(429);
        expect(res.body.code).toBe('OTP_LIMIT');
    });

    test('email đã có tài khoản -> 409, không gửi mã', async () => {
        await User.create({ email: 'i@gmail.com', password: 'x'.repeat(60), fullName: 'I' });

        const res = await send('i@gmail.com');
        expect(res.status).toBe(409);
        expect(mailer.outbox).toHaveLength(0);
    });

    test('gửi mail lỗi -> 502 MAIL_FAILED và được xin mã lại ngay', async () => {
        const spy = jest.spyOn(mailer, 'sendMail').mockRejectedValueOnce(new Error('SMTP down'));
        const errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});

        const res = await send('j@gmail.com');
        expect(res.status).toBe(502);
        expect(res.body.code).toBe('MAIL_FAILED');

        spy.mockRestore();
        errorLog.mockRestore();
        expect((await send('j@gmail.com')).status).toBe(200);
    });
});
