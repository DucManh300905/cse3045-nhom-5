// Migration 002 (API-8): quán tạo trước khi có đánh giá chưa có `ratingScore` -> xếp cuối khi sắp theo điểm.
// Tính lại điểm mọi quán từ các đánh giá đang có (chưa có đánh giá -> 3.5, giữa bảng).
// Chạy: npm run migrate:002 (thêm `-- --dry-run` để chỉ xem). Chạy lại nhiều lần an toàn.
require('dotenv').config({ quiet: true });
require('../../config/mongoose');

const mongoose = require('mongoose');
const Restaurant = require('../../modules/restaurant/restaurant.model');
const { recomputeRating } = require('../../modules/review/review.service');

const dryRun = process.argv.includes('--dry-run');

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`Database: ${mongoose.connection.name}${dryRun ? ' (dry run — không ghi gì)' : ''}`);

    const missing = await Restaurant.countDocuments({ ratingScore: { $exists: false } });
    const all = await Restaurant.find().select('_id');
    console.log(`Quán thiếu ratingScore: ${missing} / ${all.length}`);

    if (!dryRun) {
        for (const { _id } of all) {
            await recomputeRating(_id);
        }
        console.log(`Đã tính lại điểm cho ${all.length} quán`);
    }

    await mongoose.disconnect();
})().catch(async (error) => {
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
});
