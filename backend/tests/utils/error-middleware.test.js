const express = require('express');
const request = require('supertest');
const { errorHandler } = require('../../src/middlewares/error.middleware');

// Lỗi xung đột ghi của MongoDB (transaction đã tự chạy lại mà vẫn xung đột) -> 409 SYSTEM_BUSY, không phải 500
const appThrowing = (error) => {
    const app = express();
    app.get('/x', (req, res, next) => next(error));
    app.use(errorHandler);
    return app;
};

describe('Xung đột ghi khi nhiều thao tác đồng thời', () => {
    it('WriteConflict (code 112) -> 409 SYSTEM_BUSY', async () => {
        const err = Object.assign(new Error('Write conflict'), { code: 112, codeName: 'WriteConflict' });
        const res = await request(appThrowing(err)).get('/x');
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('SYSTEM_BUSY');
    });

    it('lỗi có nhãn TransientTransactionError -> 409 SYSTEM_BUSY', async () => {
        const err = Object.assign(new Error('Transient'), { errorLabelSet: new Set(['TransientTransactionError']) });
        const res = await request(appThrowing(err)).get('/x');
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('SYSTEM_BUSY');
    });

    it('lỗi khác vẫn là 500', async () => {
        const res = await request(appThrowing(new Error('boom'))).get('/x');
        expect(res.status).toBe(500);
    });
});
