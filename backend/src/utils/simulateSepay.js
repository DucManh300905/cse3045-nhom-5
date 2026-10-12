/**
 * Giả lập SePay gọi webhook (chạy trên máy, chưa cần tài khoản SePay / domain công khai).
 *
 *   npm run sepay:simulate -- <nội dung CK> <số tiền>
 *   vd: npm run sepay:simulate -- MAK2610110001 70000
 *       npm run sepay:simulate -- NAP2610110001 50000
 *
 * Đọc PORT, SEPAY_WEBHOOK_API_KEY, PAYMENT_ACCOUNT_NO từ backend/.env; server phải đang chạy (npm run dev).
 * Mỗi lần chạy là một giao dịch mới (id ngẫu nhiên).
 */
require('dotenv').config({ quiet: true });

const [content, amountArg] = process.argv.slice(2);
const amount = Number(amountArg);

if (!content || !Number.isInteger(amount) || amount <= 0) {
    console.error('Cách dùng: npm run sepay:simulate -- <nội dung chuyển khoản> <số tiền>');
    process.exit(1);
}
if (!process.env.SEPAY_WEBHOOK_API_KEY) {
    console.error('Chưa đặt SEPAY_WEBHOOK_API_KEY trong backend/.env');
    process.exit(1);
}

const id = Date.now();
const url = `http://localhost:${process.env.PORT || 8080}/api/payments/sepay/webhook`;

fetch(url, {
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
})
    .then(async (res) => {
        console.log(`${res.status} ${await res.text()}`);
        process.exit(res.ok ? 0 : 1);
    })
    .catch((error) => {
        console.error(`Không gọi được ${url}: ${error.message}`);
        process.exit(1);
    });
