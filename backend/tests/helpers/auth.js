const request = require('supertest');
const app = require('../../src/app');

let counter = 0;

// Tạo user qua API thật rồi đăng nhập, trả về { token, user }
const createUserAndLogin = async (overrides = {}) => {
    counter += 1;
    const body = {
        fullName: `User ${counter}`,
        email: `user${counter}@test.com`,
        password: '123456',
        role: 'CUSTOMER',
        ...overrides
    };

    await request(app).post('/api/auth/register').send(body).expect(201);

    const res = await request(app)
        .post('/api/auth/login')
        .send({ identifier: body.email || body.phone, password: body.password })
        .expect(200);

    return res.body.data;
};

// ADMIN không tự đăng ký được (BR-03) -> tạo thẳng trong DB như script seed:admin
const createAdminAndLogin = async () => {
    const bcrypt = require('bcryptjs');
    const User = require('../../src/modules/user/user.model');

    counter += 1;
    const email = `admin${counter}@test.com`;

    await User.create({
        email,
        password: await bcrypt.hash('123456', 4),
        fullName: `Admin ${counter}`,
        role: 'ADMIN'
    });

    const res = await request(app)
        .post('/api/auth/login')
        .send({ identifier: email, password: '123456' })
        .expect(200);

    return res.body.data;
};

module.exports = {
    createUserAndLogin,
    createAdminAndLogin
};
