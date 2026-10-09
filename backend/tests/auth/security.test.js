const request = require('supertest');
const app = require('../../src/app');
const { setupDatabase } = require('../helpers/db');
const { createUserAndLogin } = require('../helpers/auth');

setupDatabase();

const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
);

describe('Header bảo mật (helmet)', () => {
    test('có nosniff, chống nhúng iframe; không lộ X-Powered-By', async () => {
        const res = await request(app).get('/api/health');

        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
        expect(res.headers['x-powered-by']).toBeUndefined();
    });
});

describe('Giới hạn body', () => {
    test('body JSON > 100kb -> 413', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .set('Content-Type', 'application/json')
            .send(JSON.stringify({ fullName: 'x'.repeat(200 * 1024) }));

        expect(res.status).toBe(413);
    });
});

describe('Kiểm tra nội dung file upload', () => {
    test('file HTML khai là image/png bị từ chối; PNG thật được nhận', async () => {
        const { token } = await createUserAndLogin({ role: 'RESTAURANT_OWNER' });
        const auth = (req) => req.set('Authorization', `Bearer ${token}`);
        await auth(request(app).post('/api/merchant/restaurant'))
            .send({ name: 'Quán Upload', address: 'Hòa Lạc', phone: '0912345678' })
            .expect(201);
        const upload = (buffer) =>
            auth(request(app).post('/api/merchant/restaurant/images/logo')).attach('image', buffer, {
                filename: 'logo.png',
                contentType: 'image/png'
            });

        const fake = await upload(Buffer.from('<html><script>alert(1)</script></html>'));
        expect(fake.status).toBe(400);
        expect(fake.body.code).toBe('INVALID_FILE_TYPE');

        const real = await upload(PNG);
        expect(real.status).toBe(200);
        expect(real.body.data.logoUrl).toMatch(/\.png$/);
    });
});
