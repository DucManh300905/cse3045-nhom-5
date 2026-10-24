const request = require('supertest');
const app = require('../src/app');

describe('App', () => {
    test('GET /api/health trả về 200', async () => {
        const res = await request(app).get('/api/health');

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
    });

    test('route không tồn tại trả 404 NOT_FOUND', async () => {
        const res = await request(app).get('/api/khong-co');

        expect(res.status).toBe(404);
        expect(res.body).toMatchObject({ success: false, code: 'NOT_FOUND' });
    });

    test('body JSON hỏng trả 400 VALIDATION_ERROR', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .set('Content-Type', 'application/json')
            .send('{bad');

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
    });
});
