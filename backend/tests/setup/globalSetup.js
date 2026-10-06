const { MongoMemoryReplSet } = require('mongodb-memory-server');

// Chạy 1 lần trước toàn bộ test: dựng MongoDB trong RAM dạng replica set
// (cần replica set để test được transaction đặt đơn — docs/database.md mục 1).
module.exports = async () => {
    const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });

    globalThis.__MONGO_REPLSET__ = replSet;
    process.env.MONGO_TEST_URI = replSet.getUri();
};
