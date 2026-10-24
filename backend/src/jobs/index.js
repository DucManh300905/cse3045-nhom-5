const cron = require('node-cron');

const { cancelExpiredOrders, expireUnpaidOrders, resetDailyStock } = require('../modules/order/order.service');
const { syncAllWalletLocks } = require('../modules/wallet/wallet.service');
const { dispatchTick } = require('../modules/shipper/dispatch.service');
const { shiftTick } = require('../modules/shift/shift.service');
const { TIME_ZONE } = require('../utils/openingHours');

// Job chạy trong cùng process với server (docs/database.md mục 6.5). Không chạy khi test.
const ORDER_TIMEOUT_MINUTES = Number(process.env.ORDER_TIMEOUT_MINUTES) || 5;

const run = (name, fn) => async () => {
    try {
        const count = await fn();
        if (count > 0) {
            console.log(`[job] ${name}: ${count}`);
        }
    } catch (error) {
        console.error(`[job] ${name} failed:`, error);
    }
};

const startJobs = () => {
    const tasks = [
        // Mỗi phút: đơn PLACED quá hạn không được quán phản hồi -> hủy, hoàn suất (BR-36)
        cron.schedule(
            '* * * * *',
            run('orderTimeout', () => cancelExpiredOrders({ olderThanMinutes: ORDER_TIMEOUT_MINUTES })),
            { name: 'orderTimeout', noOverlap: true }
        ),
        // Mỗi phút: đơn trả trước quá hạn thanh toán -> hủy, hoàn suất (W2)
        cron.schedule('* * * * *', run('paymentTimeout', () => expireUnpaidOrders()), { name: 'paymentTimeout', noOverlap: true }),
        // Mỗi 10 giây: lời mời tài xế hết 30 giây -> mời người kế tiếp; hết 3 phút -> báo quán; mất vị trí -> báo admin
        cron.schedule('*/10 * * * * *', run('dispatch', () => dispatchTick()), { name: 'dispatch', noOverlap: true }),
        // Mỗi phút: lịch ca tài xế (14h hỏi quán, 18h chốt + gửi ca, 21h báo cáo, chốt / nhắc / vắng ca) + giảm bậc phạt
        cron.schedule('* * * * *', run('shift', () => shiftTick()), { name: 'shift', noOverlap: true }),
        // Mỗi giờ (phút 5): khóa nhận đơn quán có ví âm quá hạn / quá hạn mức, mở quán đã hết nợ (API-11)
        cron.schedule('5 * * * *', run('walletLock', syncAllWalletLocks), { name: 'walletLock', noOverlap: true }),
        // 00:00 giờ VN: reset số suất đã bán trong ngày (BR-23)
        cron.schedule('0 0 * * *', run('dailyStockReset', resetDailyStock), {
            name: 'dailyStockReset',
            timezone: TIME_ZONE
        })
    ];

    console.log(`Jobs started: orderTimeout (${ORDER_TIMEOUT_MINUTES}'), paymentTimeout, dispatch (10s), shift (1'), walletLock (hằng giờ), dailyStockReset (00:00 ${TIME_ZONE})`);
    return tasks;
};

module.exports = {
    startJobs
};
