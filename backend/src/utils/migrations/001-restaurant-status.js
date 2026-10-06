// Migration M1 + M2 (docs/database.md mục 6). Chạy: npm run migrate:001
// - Đổi restaurants.status PENDING -> SUBMITTED (enum mới: DRAFT/SUBMITTED/APPROVED/REJECTED/BLOCKED)
// - Bổ sung nameNoAccent cho quán tạo trước khi có tìm kiếm không dấu
// - Kiểm tra một chủ có nhiều quán trước khi tạo unique index owner (BR-10)
// Chạy nhiều lần vẫn an toàn. Thêm `-- --dry-run` để chỉ xem sẽ đổi gì, không ghi gì vào DB.
require('dotenv').config();

const mongoose = require('mongoose');
const { removeAccents } = require('../text');

const dryRun = process.argv.includes('--dry-run');

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const restaurants = mongoose.connection.collection('restaurants');
    console.log(`Database: ${mongoose.connection.name}${dryRun ? ' (dry run — không ghi gì)' : ''}`);

    // M1: PENDING -> SUBMITTED
    const pendingFilter = { status: 'PENDING' };
    if (dryRun) {
        console.log(`PENDING -> SUBMITTED: ${await restaurants.countDocuments(pendingFilter)} restaurant(s) sẽ được đổi`);
    } else {
        const { modifiedCount } = await restaurants.updateMany(pendingFilter, {
            $set: { status: 'SUBMITTED', submittedAt: new Date() }
        });
        console.log(`PENDING -> SUBMITTED: ${modifiedCount} restaurant(s)`);
    }

    // Bổ sung nameNoAccent (model chỉ tự sinh khi lưu lại tên)
    const missingName = await restaurants
        .find({ nameNoAccent: { $exists: false }, name: { $type: 'string' } }, { projection: { name: 1 } })
        .toArray();
    if (!dryRun && missingName.length > 0) {
        await restaurants.bulkWrite(
            missingName.map((r) => ({
                updateOne: {
                    filter: { _id: r._id },
                    update: { $set: { nameNoAccent: removeAccents(r.name).toLowerCase() } }
                }
            }))
        );
    }
    console.log(`nameNoAccent: ${missingName.length} restaurant(s) ${dryRun ? 'sẽ được bổ sung' : 'đã bổ sung'}`);

    // M2: một chủ chỉ một quán
    const duplicates = await restaurants
        .aggregate([
            { $group: { _id: '$owner', count: { $sum: 1 }, ids: { $push: '$_id' } } },
            { $match: { count: { $gt: 1 } } }
        ])
        .toArray();

    if (duplicates.length > 0) {
        console.error('Owners with more than one restaurant (fix manually before creating unique index):');
        duplicates.forEach((d) => console.error(`  owner ${d._id}: ${d.ids.join(', ')}`));
        await mongoose.disconnect();
        process.exit(1);
    }

    if (dryRun) {
        console.log('Không có chủ nào nhiều quán — có thể tạo unique index owner');
    } else {
        // Nạp model để syncIndexes tạo unique index owner, slug...
        require('../../config/mongoose');
        const Restaurant = require('../../modules/restaurant/restaurant.model');
        await Restaurant.syncIndexes();
        console.log('Restaurant indexes synced');
    }

    await mongoose.disconnect();
})().catch(async (error) => {
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
});
