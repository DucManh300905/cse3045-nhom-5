/**
 * Giả lập SePay gọi webhook (demo / chạy trên máy, chưa cần tài khoản SePay / domain công khai).
 *
 *   npm run sepay:pay                       -> trả đủ tiền cho đơn chờ thanh toán MỚI NHẤT (tự lấy mã + số tiền)
 *   npm run sepay:simulate -- <nội dung CK> <số tiền>
 *   vd: npm run sepay:simulate -- MAK2610110001 70000
 *       npm run sepay:simulate -- NAP2610110001 50000
 *
 * Đọc PORT, MONGODB_URI, SEPAY_WEBHOOK_API_KEY, PAYMENT_ACCOUNT_NO từ backend/.env; server phải đang chạy.
 * Mỗi lần chạy là một giao dịch mới (id ngẫu nhiên).
 */
require('dotenv').config({ quiet: true });

const vnd = new Intl.NumberFormat('vi-VN');

// Đơn trả trước đang chờ tiền về, mới nhất -> { content, amount }
const latestPendingOrder = async () => {
    const mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGODB_URI);
    try {
        const order = await mongoose.connection.db
            .collection('orders')
            .findOne({ status: 'PENDING_PAYMENT' }, { sort: { createdAt: -1 }, projection: { code: 1, paymentCode: 1, total: 1 } });
        if (!order) {
            throw new Error('Không có đơn nào đang chờ thanh toán (đặt đơn chọn "Chuyển khoản VietQR" trước)');
        }
        console.log(`Đơn ${order.code}: trả ${vnd.format(order.total)} đ, nội dung ${order.paymentCode}`);
        return { content: order.paymentCode, amount: order.total };
    } finally {
        await mongoose.disconnect();
    }
};

const main = async () => {
    if (!process.env.SEPAY_WEBHOOK_API_KEY) {
        throw new Error('Chưa đặt SEPAY_WEBHOOK_API_KEY trong backend/.env');
    }

    const [contentArg, amountArg] = process.argv.slice(2);
    let content = contentArg;
    let amount = Number(amountArg);

    if (!contentArg) {
        ({ content, amount } = await latestPendingOrder());
    } else if (!Number.isInteger(amount) || amount <= 0) {
        throw new Error('Cách dùng: npm run sepay:pay  hoặc  npm run sepay:simulate -- <nội dung chuyển khoản> <số tiền>');
    }

    const id = Date.now();
    const url = `http://localhost:${process.env.PORT || 8080}/api/payments/sepay/webhook`;

    let res;
    try {
        res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Apikey ${process.env.SEPAY_WEBHOOK_API_KEY}` },
            body: JSON.stringify({
                id,
                gateway: 'SIMULATOR',
                transactionDate: new Date().toISOString().replace('T', ' ').slice(0, 19),
                accountNumber: process.env.PAYMENT_ACCOUNT_NO,
                code: null,
                content: `${content} chuyen tien`,
                transferType: 'in',
                transferAmount: amount,
                referenceCode: `SIM${id}`,
                description: ''
            })
        });
    } catch (error) {
        throw new Error(`Không gọi được ${url} (backend đã chạy chưa?): ${error.message}`);
    }

    console.log(`${res.status} ${await res.text()}`);
    if (!res.ok) {
        process.exitCode = 1;
    }
};

// Đặt exitCode thay vì process.exit(): thoát ngay khi fetch chưa đóng kết nối làm Node trên Windows báo
// "Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)"
main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
