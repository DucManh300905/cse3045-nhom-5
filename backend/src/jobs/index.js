const cron = require('node-cron');

const { cancelExpiredOrders, resetDailyStock } = require('../modules/order/order.service');
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
        // 00:00 giờ VN: reset số suất đã bán trong ngày (BR-23)
        cron.schedule('0 0 * * *', run('dailyStockReset', resetDailyStock), {
            name: 'dailyStockReset',
            timezone: TIME_ZONE
        })
    ];

    console.log(`Jobs started: orderTimeout (${ORDER_TIMEOUT_MINUTES}'), dailyStockReset (00:00 ${TIME_ZONE})`);
    return tasks;
};

module.exports = {
    startJobs
};
