// Tạo tài khoản ADMIN từ ADMIN_EMAIL / ADMIN_PASSWORD trong .env: npm run seed:admin
// Đổi mật khẩu admin đã có:               npm run seed:admin -- --reset-password
// Không có giá trị mặc định: mật khẩu mặc định nằm trong code thì ai đọc repo cũng biết.
require('dotenv').config({ quiet: true });

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const connectDatabase = require('../config/database');
const User = require('../modules/user/user.model');
const { passwordError } = require('./passwordPolicy');

const ADMIN_MIN_LENGTH = 12;
const resetPassword = process.argv.includes('--reset-password');

const fail = (message) => {
    console.error(message);
    process.exit(1);
};

(async () => {
    const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || '';

    if (!email || !password) {
        fail('Missing ADMIN_EMAIL or ADMIN_PASSWORD in .env');
    }

    // Admin chặt hơn người dùng thường: tối thiểu 12 ký tự + không nằm trong danh sách phổ biến
    const invalid =
        password.length < ADMIN_MIN_LENGTH
            ? `Admin password must be at least ${ADMIN_MIN_LENGTH} characters`
            : /change-me/i.test(password)
              ? 'still the placeholder from .env.example'
              : passwordError(password);
    if (invalid) {
        fail(`ADMIN_PASSWORD rejected: ${invalid}`);
    }

    await connectDatabase();
    const exists = await User.findOne({ email });

    if (exists && exists.role !== 'ADMIN') {
        // Email là duy nhất: đã thuộc tài khoản khách / chủ quán thì không dùng làm admin được
        fail(`Email ${email} is already used by a ${exists.role} account — set another ADMIN_EMAIL in .env`);
    }

    if (exists && !resetPassword) {
        console.log(`Admin already exists: ${email} (đổi mật khẩu: npm run seed:admin -- --reset-password)`);
    } else if (exists) {
        exists.password = await bcrypt.hash(password, 10);
        // Token đã cấp trước đó hết hiệu lực ngay
        exists.passwordChangedAt = new Date();
        await exists.save();
        console.log(`Admin password reset: ${email}`);
    } else {
        await User.create({ email, password: await bcrypt.hash(password, 10), fullName: 'System Admin', role: 'ADMIN' });
        console.log(`Admin created: ${email}`);
    }

    await mongoose.disconnect();
})().catch((error) => fail(error.message));
