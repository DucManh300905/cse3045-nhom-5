// Chạy một lần: npm run seed:admin
require('dotenv').config();

const bcrypt = require('bcryptjs');
const connectDatabase = require('../config/database');
const User = require('../modules/user/user.model');

(async () => {
    await connectDatabase();

    const email = (process.env.ADMIN_EMAIL || 'admin@cravora.com').toLowerCase();
    const exists = await User.findOne({ email });

    if (exists) {
        console.log('Admin already exists:', email);
        process.exit(0);
    }

    await User.create({
        email,
        password: await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@123', 10),
        fullName: 'System Admin',
        role: 'ADMIN'
    });

    console.log('Admin created:', email);
    process.exit(0);
})();
