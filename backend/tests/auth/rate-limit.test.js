// File riêng: rate limit đếm theo IP (127.0.0.1) và sống suốt file, sẽ chặn cả các test khác.
// Đặt TRƯỚC khi nạp app: giới hạn nhỏ để thử được trong vài request.
process.env.AUTH_RATE_LIMIT = '3';

const request = require('supertest');
const app = require('../../src/app');
const { setupDatabase } = require('../helpers/db');
const { createUserAndLogin } = require('../helpers/auth');

setupDatabase();

describe('Rate limit đăng nhập (P0)', () => {
    test('sai mật khẩu quá giới hạn -> 429 RATE_LIMITED, kể cả khi sau đó nhập đúng', async () => {
        const { user } = await createUserAndLogin();
        const login = (password) => request(app).post('/api/auth/login').send({ identifier: user.email, password });

        for (let i = 0; i < 3; i += 1) {
            expect((await login('sai-mat-khau')).status).toBe(401);
        }

        const blocked = await login('sai-mat-khau');
        expect(blocked.status).toBe(429);
        expect(blocked.body.code).toBe('RATE_LIMITED');
        expect((await login('Test@1234')).status).toBe(429);
    });
});
