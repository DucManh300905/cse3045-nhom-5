const os = require('os');
const mongoose = require('mongoose');

// Mỗi Jest worker dùng database riêng để các file test chạy song song không đụng nhau
const connect = async () => {
    await mongoose.connect(process.env.MONGO_TEST_URI, {
        dbName: `test_${process.env.JEST_WORKER_ID || 1}`,
        // Driver mongodb 7 nạp `os` bằng import() động, Jest không hỗ trợ
        // -> handshake thiếu metadata "driver". Truyền sẵn `os` để tránh lỗi.
        runtimeAdapters: { os }
    });
    // Tạo unique index (email, phone...) giống môi trường thật
    await mongoose.syncIndexes();
};

const clear = async () => {
    const collections = await mongoose.connection.db.collections();
    await Promise.all(collections.map((c) => c.deleteMany({})));
};

const close = async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
};

// Dùng trong file test: setupDatabase() ở đầu file
const setupDatabase = () => {
    beforeAll(connect);
    afterEach(clear);
    afterAll(close);
};

module.exports = {
    setupDatabase
};
