const mongoose = require('mongoose');

const connectDatabase = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);

        console.log('MongoDB connected successfully');
    } catch (error) {
        console.error('MongoDB connection failed:', error.message);
        process.exit(1);
    }

    // Cập nhật index theo schema hiện tại (vd: email/phone unique + sparse),
    // tránh index cũ trong database chặn đăng ký bằng số điện thoại.
    // Lỗi ở bước này không làm dừng server, chỉ in cảnh báo.
    try {
        await mongoose.syncIndexes();
    } catch (error) {
        console.warn('Sync indexes failed:', error.message);
    }

    // Index không tạo được (vd: dữ liệu cũ trùng số điện thoại) thì báo để xử lý
    const indexes = await mongoose.connection.collection('users').indexes().catch(() => []);
    if (!indexes.some((index) => index.key.phone)) {
        console.warn('Warning: unique index on users.phone is missing (duplicate phones in existing data?)');
    }
};

module.exports = connectDatabase;
