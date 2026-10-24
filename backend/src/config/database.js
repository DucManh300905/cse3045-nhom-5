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

    // Đặt đơn dùng transaction (BR-34) -> MongoDB phải chạy dạng replica set (Atlas có sẵn).
    // MongoDB cài trên máy mặc định là standalone: báo ngay thay vì để khách gặp lỗi 500 khi đặt món.
    const hello = await mongoose.connection.db.admin().command({ hello: 1 }).catch(() => ({}));
    if (!hello.setName && hello.msg !== 'isdbgrid') {
        console.warn(
            'Warning: MongoDB is standalone (not a replica set) -> placing orders will FAIL (transactions unsupported).\n' +
                '         Fix: add "replication: replSetName: rs0" to mongod.cfg, restart MongoDB, then run: npm run db:init-replset'
        );
    }

    // Index không tạo được (vd: dữ liệu cũ trùng số điện thoại) thì báo để xử lý
    const indexes = await mongoose.connection.collection('users').indexes().catch(() => []);
    if (!indexes.some((index) => index.key.phone)) {
        console.warn('Warning: unique index on users.phone is missing (duplicate phones in existing data?)');
    }
};

module.exports = connectDatabase;
