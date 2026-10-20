const Order = require('../../src/modules/order/order.model');
const Restaurant = require('../../src/modules/restaurant/restaurant.model');
const Wallet = require('../../src/modules/wallet/wallet.model');
const WalletEntry = require('../../src/modules/wallet/walletEntry.model');
const Notification = require('../../src/modules/notification/notification.model');
const AuditLog = require('../../src/modules/audit/auditLog.model');
const walletService = require('../../src/modules/wallet/wallet.service');
const { setupDatabase } = require('../helpers/db');
const { createUserAndLogin, createAdminAndLogin } = require('../helpers/auth');
const { as, createShop, placeOrder } = require('../helpers/orders');

setupDatabase();

const M = '/api/merchant/orders';
const W = '/api/merchant/wallet';
const DAY = 24 * 60 * 60 * 1000;

let shop;
let owner;
let customer;
let admin;

beforeEach(async () => {
    shop = await createShop();
    owner = as(shop.ownerToken);
    customer = as((await createUserAndLogin()).token);
    admin = as((await createAdminAndLogin()).token);
});

// Đơn tự đến lấy đi hết luồng tới COMPLETED (cơm gà 35.000 x qty)
const completeOrder = async (theShop = shop, { qty = 1 } = {}) => {
    const theOwner = as(theShop.ownerToken);
    const order = await placeOrder(customer, theShop, { qty, fulfillmentType: 'PICKUP' });
    await theOwner.post(`${M}/${order.id}/accept`).expect(200);
    for (const to of ['READY', 'COMPLETED']) {
        await theOwner.post(`${M}/${order.id}/status`, { to }).expect(200);
    }
    return order;
};

const balanceOf = async (key) => (await Wallet.findOne({ key }))?.balance ?? 0;
const shopBalance = (theShop = shop) => balanceOf(`restaurant:${theShop.restaurant.id}`);
const totalBalance = async () => (await Wallet.find()).reduce((s, w) => s + w.balance, 0);

// Quán có tiền dương trong ví: nạp + admin xác nhận
const fund = async (amount) => {
    const topup = await owner.post(`${W}/topups`, { amount }).expect(201);
    await admin.post(`/api/admin/topups/${topup.body.data.id}/confirm`).expect(200);
    return topup.body.data;
};

describe('Đơn COD hoàn thành -> trừ hoa hồng', () => {
    it('ví quán −hoa hồng, ví nền tảng +hoa hồng, tổng sổ = 0, báo ví âm kèm hạn nạp', async () => {
        const order = await completeOrder(shop, { qty: 2 }); // 70.000, hoa hồng 10% = 7.000

        expect(await shopBalance()).toBe(-7000);
        expect(await balanceOf('PLATFORM')).toBe(7000);
        expect(await totalBalance()).toBe(0);

        const entries = await WalletEntry.find({ order: order.id });
        expect(entries).toHaveLength(2);
        expect(entries.find((e) => e.walletType === 'RESTAURANT')).toMatchObject({ kind: 'ORDER_SETTLE', amount: -7000, balanceAfter: -7000 });

        const res = await owner.get(W).expect(200);
        expect(res.body.data).toMatchObject({ balance: -7000, available: 0, locked: false, creditLimit: 100000, graceDays: 3 });
        const deadline = new Date(res.body.data.lockDeadline) - new Date(res.body.data.negativeSince);
        expect(deadline).toBe(3 * DAY);

        const note = await Notification.findOne({ type: 'WALLET_NEGATIVE' });
        expect(note.title).toContain('7.000');

        const list = await owner.get(`${W}/entries`).expect(200);
        expect(list.body.data.total).toBe(1);
        expect(list.body.data.items[0].note).toContain(order.code);
    });

    it('đơn chưa hoàn thành / bị hủy không ghi sổ', async () => {
        const order = await placeOrder(customer, shop, { fulfillmentType: 'PICKUP' });
        await owner.post(`${M}/${order.id}/accept`).expect(200); // nhận = đang làm
        const cancelled = await placeOrder(customer, shop, { fulfillmentType: 'PICKUP' });
        await customer.post(`/api/orders/${cancelled.id}/cancel`, {}).expect(200);

        expect(await WalletEntry.countDocuments()).toBe(0);
    });

    it('ghi sổ một lần cho mỗi đơn (gọi lại settleOrder không trừ thêm)', async () => {
        const { id } = await completeOrder();
        const order = await Order.findById(id);
        const mongoose = require('mongoose');
        await mongoose.connection.transaction((session) => walletService.settleOrder(order, session));

        expect(await shopBalance()).toBe(-3500);
        expect(await WalletEntry.countDocuments({ order: id })).toBe(2);
    });

    it('voucher do MAK chịu: quán được bù phần giảm giá, hoa hồng tính trên giá gốc', async () => {
        const order = await placeOrder(customer, shop, { qty: 2, fulfillmentType: 'PICKUP' }); // 70.000
        await Order.updateOne({ _id: order.id }, { $set: { discount: 20000, platformDiscount: 20000, total: 50000 } });
        await owner.post(`${M}/${order.id}/accept`).expect(200);
        for (const to of ['READY', 'COMPLETED']) {
            await owner.post(`${M}/${order.id}/status`, { to }).expect(200);
        }

        // Quán thu 50.000 tiền mặt, phải nhận 70.000 − 7.000 = 63.000 -> MAK nợ quán 13.000
        expect(await shopBalance()).toBe(13000);
        expect(await balanceOf('PLATFORM')).toBe(-13000);
        expect(await Notification.countDocuments({ type: 'WALLET_NEGATIVE' })).toBe(0);
    });
});

describe('Khóa / mở nhận đơn theo ví', () => {
    it('âm vượt 100.000đ -> khóa ngay: khách không đặt được, chủ không bật lại được', async () => {
        const big = await createShop({ name: 'Quán Lớn', commissionRate: 0.5 });
        await completeOrder(big, { qty: 6 }); // 210.000 -> hoa hồng 105.000

        const restaurant = await Restaurant.findById(big.restaurant.id);
        expect(restaurant).toMatchObject({ walletLockReason: 'OVER_LIMIT' });
        expect(restaurant.walletLockedAt).toBeInstanceOf(Date);
        expect(await Notification.countDocuments({ type: 'WALLET_LOCKED' })).toBe(1);

        const pub = await customer.get(`/api/restaurants/${big.restaurant.slug}`).expect(200);
        expect(pub.body.data.canAcceptOrders).toBe(false);
        const open = await customer.get('/api/restaurants?isOpen=true').expect(200);
        expect(open.body.data.items.map((r) => r.id)).not.toContain(big.restaurant.id);

        const res = await customer.post('/api/orders', { restaurantId: big.restaurant.id, items: [{ menuItemId: big.rice.id, qty: 1 }], fulfillmentType: 'PICKUP' }, 'k-locked');
        expect(res.status).toBe(422);
        expect(res.body.code).toBe('RESTAURANT_CLOSED');

        const toggle = await as(big.ownerToken).patch('/api/merchant/restaurant/accepting-orders', { isAcceptingOrders: true });
        expect(toggle.status).toBe(409);
        expect(toggle.body.code).toBe('WALLET_LOCKED');
    });

    it('âm trong hạn mức: chưa khóa; quá 3 ngày vẫn âm -> job khóa (OVERDUE)', async () => {
        await completeOrder();
        const wallet = await Wallet.findOne({ key: `restaurant:${shop.restaurant.id}` });
        const start = wallet.negativeSince.getTime();

        expect(await walletService.syncAllWalletLocks(new Date(start + 3 * DAY - 60000))).toBe(0);
        expect((await Restaurant.findById(shop.restaurant.id)).walletLockedAt).toBeNull();

        expect(await walletService.syncAllWalletLocks(new Date(start + 3 * DAY + 60000))).toBe(1);
        expect((await Restaurant.findById(shop.restaurant.id)).walletLockReason).toBe('OVERDUE');
    });

    it('nạp đủ (số dư >= 0) -> tự mở lại, quán nhận đơn ngay không cần bật lại', async () => {
        await completeOrder();
        const start = (await Wallet.findOne({ key: `restaurant:${shop.restaurant.id}` })).negativeSince.getTime();
        await walletService.syncAllWalletLocks(new Date(start + 4 * DAY));

        // Nạp thiếu: vẫn khóa
        const partial = await owner.post(`${W}/topups`, { amount: 10000 }).expect(201);
        await admin.post(`/api/admin/topups/${partial.body.data.id}/confirm`, { receivedAmount: 2000 }).expect(200);
        expect((await owner.get(W)).body.data).toMatchObject({ balance: -1500, locked: true });

        await fund(10000);
        const after = (await owner.get(W)).body.data;
        expect(after).toMatchObject({ balance: 8500, locked: false, negativeSince: null, lockDeadline: null });
        expect(await Notification.countDocuments({ type: 'WALLET_UNLOCKED' })).toBe(1);

        await placeOrder(customer, shop, { fulfillmentType: 'PICKUP' });
    });
});

describe('Nạp tiền', () => {
    it('tạo lệnh: mã NAP + QR VietQR khi đã cấu hình tài khoản MAK; lệnh mới hủy lệnh cũ', async () => {
        Object.assign(process.env, { PAYMENT_BANK_ID: 'MB', PAYMENT_ACCOUNT_NO: '0123456789', PAYMENT_ACCOUNT_NAME: 'MAK FOOD' });
        try {
            const first = await owner.post(`${W}/topups`, { amount: 50000 }).expect(201);
            expect(first.body.data).toMatchObject({ status: 'PENDING', amount: 50000, transferContent: expect.stringMatching(/^NAP\d{10}$/) });
            expect(first.body.data.qrUrl).toBe(
                `https://img.vietqr.io/image/MB-0123456789-compact2.png?amount=50000&addInfo=${first.body.data.code}&accountName=MAK+FOOD`
            );

            const second = await owner.post(`${W}/topups`, { amount: 60000 }).expect(201);
            const wallet = (await owner.get(W)).body.data;
            expect(wallet.pendingTopup.id).toBe(second.body.data.id);
            expect(wallet.platformBank).toMatchObject({ bankId: 'MB', accountNo: '0123456789' });

            const list = (await owner.get(`${W}/topups`)).body.data.items;
            expect(list.map((t) => t.status)).toEqual(['PENDING', 'CANCELLED']);
            expect(await Notification.countDocuments({ type: 'TOPUP_REQUESTED' })).toBe(2);
        } finally {
            ['PAYMENT_BANK_ID', 'PAYMENT_ACCOUNT_NO', 'PAYMENT_ACCOUNT_NAME'].forEach((k) => delete process.env[k]);
        }
    });

    it('chưa cấu hình tài khoản MAK -> không có QR; dưới mức tối thiểu -> 400', async () => {
        const res = await owner.post(`${W}/topups`, { amount: 20000 }).expect(201);
        expect(res.body.data.qrUrl).toBeNull();
        expect((await owner.post(`${W}/topups`, { amount: 5000 })).status).toBe(400);
        expect((await owner.post(`${W}/topups`, { amount: 1.5 })).status).toBe(400);
    });

    it('admin xác nhận: cộng ví + audit; xác nhận lại -> 409; từ chối lệnh khác', async () => {
        const topup = await fund(30000);
        expect(await shopBalance()).toBe(30000);
        expect(await balanceOf('EXTERNAL')).toBe(-30000);
        expect(await totalBalance()).toBe(0);
        expect(await AuditLog.countDocuments({ action: 'TOPUP_CONFIRM' })).toBe(1);
        expect(await Notification.countDocuments({ type: 'TOPUP_CONFIRMED' })).toBe(1);

        expect((await admin.post(`/api/admin/topups/${topup.id}/confirm`)).status).toBe(409);

        const other = await owner.post(`${W}/topups`, { amount: 20000 }).expect(201);
        expect((await admin.post(`/api/admin/topups/${other.body.data.id}/reject`)).status).toBe(400);
        const rejected = await admin.post(`/api/admin/topups/${other.body.data.id}/reject`, { reason: 'Không thấy giao dịch' }).expect(200);
        expect(rejected.body.data.status).toBe('REJECTED');
        expect(await shopBalance()).toBe(30000);
    });

    it('chủ quán hủy lệnh của mình; lệnh của quán khác -> 404', async () => {
        const topup = await owner.post(`${W}/topups`, { amount: 20000 }).expect(201);
        const other = await createShop({ name: 'Quán B' });
        expect((await as(other.ownerToken).post(`${W}/topups/${topup.body.data.id}/cancel`)).status).toBe(404);
        expect((await owner.post(`${W}/topups/${topup.body.data.id}/cancel`)).body.data.status).toBe('CANCELLED');
        expect((await owner.post(`${W}/topups/${topup.body.data.id}/cancel`)).status).toBe(409);
    });
});

describe('Rút tiền', () => {
    const bank = { bankName: 'MB Bank', accountNumber: '0987654321', accountName: 'nguyen van a' };

    it('cần tài khoản ngân hàng, đủ số dư, tối thiểu 50.000đ, mỗi lúc một yêu cầu', async () => {
        await fund(200000);
        expect((await owner.post(`${W}/payouts`, { amount: 60000 })).body.code).toBe('BANK_ACCOUNT_REQUIRED');

        expect((await owner.put(`${W}/bank-account`, { ...bank, accountNumber: '12ab' })).status).toBe(400);
        const saved = await owner.put(`${W}/bank-account`, bank).expect(200);
        expect(saved.body.data.accountName).toBe('NGUYEN VAN A');

        expect((await owner.post(`${W}/payouts`, { amount: 40000 })).status).toBe(400);
        expect((await owner.post(`${W}/payouts`, { amount: 300000 })).body.code).toBe('INSUFFICIENT_BALANCE');

        const payout = await owner.post(`${W}/payouts`, { amount: 150000 }).expect(201);
        expect(payout.body.data).toMatchObject({ status: 'REQUESTED', bankAccount: { accountNumber: '0987654321' } });
        expect(await shopBalance()).toBe(50000);
        expect(await balanceOf('PAYOUT_HOLD')).toBe(150000);
        expect((await owner.post(`${W}/payouts`, { amount: 50000 })).body.code).toBe('PAYOUT_PENDING');
        expect(await Notification.countDocuments({ type: 'PAYOUT_REQUESTED' })).toBe(1);
    });

    it('admin đã chuyển khoản -> PAID; từ chối -> tiền trả lại ví', async () => {
        await fund(200000);
        await owner.put(`${W}/bank-account`, bank).expect(200);

        const first = await owner.post(`${W}/payouts`, { amount: 100000 }).expect(201);
        const paid = await admin.post(`/api/admin/payouts/${first.body.data.id}/paid`, { bankRef: 'FT2610' }).expect(200);
        expect(paid.body.data).toMatchObject({ status: 'PAID', bankRef: 'FT2610' });
        expect(await balanceOf('PAYOUT_HOLD')).toBe(0);
        expect(await balanceOf('EXTERNAL')).toBe(-100000); // MAK còn giữ 100.000 tiền thật
        expect((await admin.post(`/api/admin/payouts/${first.body.data.id}/paid`)).status).toBe(409);

        const second = await owner.post(`${W}/payouts`, { amount: 60000 }).expect(201);
        await admin.post(`/api/admin/payouts/${second.body.data.id}/reject`, { reason: 'Sai tên chủ TK' }).expect(200);
        expect(await shopBalance()).toBe(100000);
        expect(await totalBalance()).toBe(0);
        expect(await Notification.countDocuments({ type: { $in: ['PAYOUT_PAID', 'PAYOUT_REJECTED'] } })).toBe(2);
        expect(await AuditLog.countDocuments({ action: { $in: ['PAYOUT_PAID', 'PAYOUT_REJECT'] } })).toBe(2);

        const history = (await owner.get(`${W}/payouts`)).body.data.items.map((p) => p.status);
        expect(history).toEqual(['REJECTED', 'PAID']);
    });

    it('quán bị admin khóa không rút được', async () => {
        await fund(100000);
        await owner.put(`${W}/bank-account`, bank).expect(200);
        await Restaurant.updateOne({ _id: shop.restaurant.id }, { $set: { status: 'BLOCKED' } });
        expect((await owner.post(`${W}/payouts`, { amount: 50000 })).status).toBe(403);
    });
});

describe('Admin: tổng quan, danh sách ví, điều chỉnh', () => {
    it('tổng quan đối soát cân bằng; lọc ví âm / bị khóa / theo tên', async () => {
        const big = await createShop({ name: 'Bún Chả Lớn', commissionRate: 0.5 });
        await completeOrder(big, { qty: 6 }); // −105.000, khóa
        await completeOrder(); // −3.500
        await fund(53500); // shop: +50.000

        const overview = (await admin.get('/api/admin/wallets/overview').expect(200)).body.data;
        expect(overview).toMatchObject({
            platformRevenue: 108500,
            cashHeld: 53500,
            owedToRestaurants: 50000,
            owedByRestaurants: 105000,
            negativeRestaurants: 1,
            lockedRestaurants: 1,
            balanced: true
        });

        const negative = (await admin.get('/api/admin/wallets?status=negative')).body.data;
        expect(negative.items).toHaveLength(1);
        expect(negative.items[0]).toMatchObject({ balance: -105000, restaurant: { name: 'Bún Chả Lớn', walletLockReason: 'OVER_LIMIT' } });
        expect(negative.items[0].lockDeadline).toBeTruthy();

        expect((await admin.get('/api/admin/wallets?status=locked')).body.data.total).toBe(1);
        expect((await admin.get('/api/admin/wallets?q=bun cha')).body.data.total).toBe(1);
        expect((await admin.get('/api/admin/wallets')).body.data.items.map((w) => w.balance)).toEqual([-105000, 50000]);

        const entries = (await admin.get(`/api/admin/wallets/${big.restaurant.id}/entries`)).body.data;
        expect(entries.items[0]).toMatchObject({ kind: 'ORDER_SETTLE', amount: -105000 });
    });

    it('điều chỉnh tay: bắt buộc lý do, ghi audit, có thể mở khóa quán', async () => {
        const big = await createShop({ name: 'Quán Nợ', commissionRate: 0.5 });
        await completeOrder(big, { qty: 6 });

        const url = `/api/admin/wallets/${big.restaurant.id}/adjustments`;
        expect((await admin.post(url, { amount: 105000 })).status).toBe(400);
        expect((await admin.post(url, { amount: 0, reason: 'x' })).status).toBe(400);

        const res = await admin.post(url, { amount: 105000, reason: 'Miễn hoa hồng tuần khai trương' }).expect(200);
        expect(res.body.data.balance).toBe(0);
        expect((await Restaurant.findById(big.restaurant.id)).walletLockedAt).toBeNull();
        expect(await AuditLog.countDocuments({ action: 'WALLET_ADJUST' })).toBe(1);
        expect(await totalBalance()).toBe(0);
    });

    it('phân quyền: khách không vào ví quán, chủ quán không vào API admin; sổ cái không sửa được', async () => {
        expect((await customer.get(W)).status).toBe(403);
        expect((await owner.get('/api/admin/wallets/overview')).status).toBe(403);
        expect((await owner.get('/api/admin/topups')).status).toBe(403);

        await completeOrder();
        await expect(WalletEntry.updateOne({}, { $set: { amount: 0 } })).rejects.toThrow('append-only');
    });
});
