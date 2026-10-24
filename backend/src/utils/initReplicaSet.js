// Khởi tạo replica set 1 node cho MongoDB cài trên máy (đặt đơn cần transaction — BR-34).
// Chạy SAU KHI đã thêm vào mongod.cfg:
//   replication:
//     replSetName: rs0
// và khởi động lại dịch vụ MongoDB. Chạy: npm run db:init-replset (chạy lại nhiều lần an toàn).
require('dotenv').config({ quiet: true });

// Driver đi kèm mongoose (không cần cài thêm)
const { MongoClient } = require('mongoose').mongo;

(async () => {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('Missing MONGODB_URI in .env');
        process.exit(1);
    }

    // directConnection: node chưa khởi tạo replica set thì driver không tự nhận diện được
    const client = new MongoClient(uri, { directConnection: true });
    await client.connect();
    const admin = client.db('admin');

    const hello = await admin.command({ hello: 1 });
    if (hello.setName) {
        console.log(`Already a replica set: ${hello.setName} — nothing to do`);
        await client.close();
        return;
    }

    try {
        const { port } = new URL(uri.replace(/^mongodb(\+srv)?:/, 'http:'));
        const host = `127.0.0.1:${port || 27017}`;
        await admin.command({ replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host }] } });
        console.log(`Replica set rs0 initiated (${host}). Đợi vài giây để node thành PRIMARY rồi chạy lại backend.`);
    } catch (error) {
        if (/replication enabled|no replset config|not running with --replSet/i.test(error.message)) {
            console.error(
                'MongoDB chưa bật replication. Thêm vào mongod.cfg:\n  replication:\n    replSetName: rs0\n' +
                    'rồi khởi động lại dịch vụ MongoDB (PowerShell Admin: Restart-Service MongoDB) và chạy lại lệnh này.'
            );
        } else {
            console.error(error.message);
        }
        process.exitCode = 1;
    } finally {
        await client.close();
    }
})();
