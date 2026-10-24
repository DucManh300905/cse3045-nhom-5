// Migration 003 (tài xế MAK, 21/10/2026):
//  - payouts: xóa index cũ `restaurant_1` (unique, không có $exists) — nó coi mọi lệnh rút của tài xế
//    (không có restaurant) là trùng nhau -> chỉ một tài xế có lệnh chờ tại một thời điểm.
//    Thay bằng `one_pending_per_restaurant` + `one_pending_per_shipper` (payout.model.js).
//  - Tạo index mới: shippers (2dsphere vị trí), dispatchoffers, orders.delivery.*
//  - Quán cũ chưa có deliveryMode -> SELF (quán tự giao như trước)
// Chạy: npm run migrate:003 (thêm `-- --dry-run` để chỉ xem). Chạy lại nhiều lần an toàn.
require('dotenv').config({ quiet: true });
require('../../config/mongoose');

const mongoose = require('mongoose');
const Payout = require('../../modules/wallet/payout.model');
const Restaurant = require('../../modules/restaurant/restaurant.model');
const Order = require('../../modules/order/order.model');
const Shipper = require('../../modules/shipper/shipper.model');
const DispatchOffer = require('../../modules/shipper/dispatchOffer.model');
const WalletEntry = require('../../modules/wallet/walletEntry.model');

const dryRun = process.argv.includes('--dry-run');

(async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`Database: ${mongoose.connection.name}${dryRun ? ' (dry run — không ghi gì)' : ''}`);

    const indexes = await Payout.collection.indexes().catch(() => []);
    const legacy = indexes.find((i) => i.name === 'restaurant_1');
    console.log(legacy ? 'payouts: có index cũ restaurant_1 -> sẽ xóa' : 'payouts: không còn index cũ restaurant_1');

    const missingMode = await Restaurant.countDocuments({ deliveryMode: { $exists: false } });
    console.log(`Quán chưa có deliveryMode: ${missingMode}`);

    if (!dryRun) {
        if (legacy) {
            await Payout.collection.dropIndex('restaurant_1');
        }
        for (const model of [Payout, Shipper, DispatchOffer, Order, WalletEntry]) {
            await model.createIndexes();
        }
        await Restaurant.updateMany({ deliveryMode: { $exists: false } }, { $set: { deliveryMode: 'SELF' } });
        console.log('Đã cập nhật index + deliveryMode');
    }

    await mongoose.disconnect();
})().catch(async (error) => {
    console.error(error);
    await mongoose.disconnect();
    process.exit(1);
});
