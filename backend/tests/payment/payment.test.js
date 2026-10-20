const request = require('supertest');
const app = require('../../src/app');
const Order = require('../../src/modules/order/order.model');
const MenuItem = require('../../src/modules/menu/menuItem.model');
const Wallet = require('../../src/modules/wallet/wallet.model');
const Payment = require('../../src/modules/payment/payment.model');
const Refund = require('../../src/modules/payment/refund.model');
const Notification = require('../../src/modules/notification/notification.model');
const AuditLog = require('../../src/modules/audit/auditLog.model');
const { expireUnpaidOrders, cancelExpiredOrders } = require('../../src/modules/order/order.service');
const { extractCode } = require('../../src/modules/payment/payment.service');
const { setupDatabase } = require('../helpers/db');
const { createUserAndLogin, createAdminAndLogin } = require('../helpers/auth');
const { as, createShop, newKey } = require('../helpers/orders');

setupDatabase();

const KEY = 'test-sepay-key-0123456789';
const ENV = {
    PAYMENT_BANK_ID: 'MB',
    PAYMENT_ACCOUNT_NO: '0123456789',
    PAYMENT_ACCOUNT_NAME: 'MAK FOOD',
    SEPAY_WEBHOOK_API_KEY: KEY
};
const M = '/api/merchant/orders';
const MIN = 60 * 1000;

beforeAll(() => Object.assign(process.env, ENV));
afterAll(() => Object.keys(ENV).forEach((k) => delete process.env[k]));

let shop;
let owner;
let customer;
let customerId;
let admin;

beforeEach(async () => {
    shop = await createShop();
    owner = as(shop.ownerToken);
    const login = await createUserAndLogin();
    customer = as(login.token);
    customerId = login.user.id;
    admin = as((await createAdminAndLogin()).token);
});

// Đơn trả trước: 2 cơm gà = 70.000, tự đến lấy
const placePrepaid = async (qty = 2) => {
    const res = await customer.post(
        '/api/orders',
        { restaurantId: shop.restaurant.id, items: [{ menuItemId: shop.rice.id, qty }], fulfillmentType: 'PICKUP', paymentMethod: 'BANK_TRANSFER' },
        newKey()
    );
    expect(res.status).toBe(201);
    return res.body.data;
};

let txSeq = 1000;
const webhook = (content, amount, { id = (txSeq += 1), auth = `Apikey ${KEY}`, ...extra } = {}) =>
    request(app)
        .post('/api/payments/sepay/webhook')
        .set('Authorization', auth)
        .send({
            id,
            gateway: 'MBBank',
            transactionDate: '2026-10-11 10:00:00',
            accountNumber: ENV.PAYMENT_ACCOUNT_NO,
            code: null,
            content,
            transferType: 'in',
            transferAmount: amount,
            referenceCode: `FT${id}`,
            ...extra
        });

const balanceOf = async (key) => (await Wallet.findOne({ key }))?.balance ?? 0;
const totalBalance = async () => (await Wallet.find()).reduce((s, w) => s + w.balance, 0);
const advance = async (orderId) => {
    await owner.post(`${M}/${orderId}/accept`).expect(200);
    for (const to of ['READY', 'COMPLETED']) {
        await owner.post(`${M}/${orderId}/status`, { to }).expect(200);
    }
};

describe('Bật / tắt chuyển khoản', () => {
    it('chỉ bật khi có tài khoản nhận + khóa webhook; tắt thì đặt đơn chuyển khoản -> 422', async () => {
        expect((await request(app).get('/api/payments/methods')).body.data).toMatchObject({ COD: true, BANK_TRANSFER: true, paymentTimeoutMinutes: 15 });

        delete process.env.SEPAY_WEBHOOK_API_KEY;
        try {
            expect((await request(app).get('/api/payments/methods')).body.data.BANK_TRANSFER).toBe(false);
            const res = await customer.post(
                '/api/orders',
                { restaurantId: shop.restaurant.id, items: [{ menuItemId: shop.rice.id, qty: 1 }], fulfillmentType: 'PICKUP', paymentMethod: 'BANK_TRANSFER' },
                newKey()
            );
            expect(res.status).toBe(422);
            expect(res.body.code).toBe('PAYMENT_METHOD_UNAVAILABLE');
        } finally {
            process.env.SEPAY_WEBHOOK_API_KEY = KEY;
        }
    });
});

describe('Đặt đơn trả trước', () => {
    it('đơn chờ thanh toán: có mã CK + QR + hạn 15 phút, giữ suất, quán chưa thấy và chưa được báo', async () => {
        const order = await placePrepaid();
        expect(order).toMatchObject({ status: 'PENDING_PAYMENT', paymentMethod: 'BANK_TRANSFER', paymentStatus: 'UNPAID', placedAt: null });
        expect(order.paymentCode).toBe(order.code.replace('-', ''));
        expect(new Date(order.paymentDeadline) - new Date(order.createdAt)).toBeGreaterThanOrEqual(15 * MIN - 1000);

        const info = (await customer.get(`/api/orders/${order.id}/payment`).expect(200)).body.data;
        expect(info).toMatchObject({ amount: 70000, paymentCode: order.paymentCode, bank: { bankId: 'MB', accountNo: '0123456789' } });
        expect(info.qrUrl).toBe(`https://img.vietqr.io/image/MB-0123456789-compact2.png?amount=70000&addInfo=${order.paymentCode}&accountName=MAK+FOOD`);

        expect((await MenuItem.findById(shop.rice.id)).soldToday).toBe(2);
        expect((await owner.get(M)).body.data.total).toBe(0);
        expect((await owner.get(`${M}/${order.id}`)).status).toBe(404);
        expect(await Notification.countDocuments({ type: 'ORDER_NEW' })).toBe(0);
    });

    it('đơn COD không có trang thanh toán', async () => {
        const res = await customer.post('/api/orders', { restaurantId: shop.restaurant.id, items: [{ menuItemId: shop.rice.id, qty: 1 }], fulfillmentType: 'PICKUP' }, newKey());
        expect((await customer.get(`/api/orders/${res.body.data.id}/payment`)).status).toBe(404);
    });

    it('khách hủy khi đang chờ thanh toán: hoàn suất, không có lệnh hoàn tiền, quán không bị báo', async () => {
        const order = await placePrepaid();
        const res = await customer.post(`/api/orders/${order.id}/cancel`, {}).expect(200);
        expect(res.body.data.status).toBe('CANCELLED');
        expect((await MenuItem.findById(shop.rice.id)).soldToday).toBe(0);
        expect(await Refund.countDocuments()).toBe(0);
        expect(await Notification.countDocuments({ type: 'ORDER_STATUS' })).toBe(0);
    });

    it('quá hạn thanh toán -> job hủy (PAYMENT_TIMEOUT), hoàn suất', async () => {
        const order = await placePrepaid();
        expect(await expireUnpaidOrders({ now: new Date(Date.now() + 14 * MIN) })).toBe(0);
        expect(await expireUnpaidOrders({ now: new Date(Date.now() + 16 * MIN) })).toBe(1);

        const saved = await Order.findById(order.id);
        expect(saved).toMatchObject({ status: 'CANCELLED', cancelReason: { code: 'PAYMENT_TIMEOUT' } });
        expect((await MenuItem.findById(shop.rice.id)).soldToday).toBe(0);
        const note = await Notification.findOne({ user: customerId, type: 'ORDER_STATUS' });
        expect(note.body).toContain('Quá hạn');
    });
});

describe('Webhook SePay', () => {
    it('sai / thiếu API key -> 401, không ghi gì', async () => {
        const order = await placePrepaid();
        expect((await webhook(order.paymentCode, 70000, { auth: '' })).status).toBe(401);
        expect((await webhook(order.paymentCode, 70000, { auth: 'Apikey wrong' })).status).toBe(401);
        expect((await webhook(order.paymentCode, 70000, { auth: KEY })).status).toBe(401);
        expect(await Payment.countDocuments()).toBe(0);
    });

    it('nhận đủ tiền -> đơn tới quán (PLACED, PAID), chuông + thông báo; gửi lại cùng giao dịch không xử lý lần 2', async () => {
        const order = await placePrepaid();
        const res = await webhook(`CK ${order.paymentCode} FT123`, 70000, { id: 555 });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, status: 'MATCHED_ORDER' });

        const saved = await Order.findById(order.id);
        expect(saved).toMatchObject({ status: 'PLACED', paymentStatus: 'PAID', paidAmount: 70000 });
        expect(saved.placedAt).toBeInstanceOf(Date);
        expect(saved.statusHistory.at(-1)).toMatchObject({ from: 'PENDING_PAYMENT', to: 'PLACED', actorType: 'SYSTEM', reason: 'PAYMENT_RECEIVED' });

        expect((await owner.get(M)).body.data.items[0].id).toBe(order.id);
        expect(await Notification.countDocuments({ type: 'ORDER_NEW' })).toBe(1);
        const note = await Notification.findOne({ user: customerId, type: 'ORDER_STATUS' });
        expect(note.title).toBe(`Đã nhận thanh toán đơn ${order.code}`);

        expect(await balanceOf('ESCROW')).toBe(70000);
        expect(await balanceOf('EXTERNAL')).toBe(-70000);

        const again = await webhook(order.paymentCode, 70000, { id: 555 });
        expect(again.body.status).toBe('DUPLICATE_WEBHOOK');
        expect(await balanceOf('ESCROW')).toBe(70000);
        expect(await Payment.countDocuments()).toBe(1);
    });

    it('đơn hoàn thành: tiền giữ chuyển cho quán (trừ hoa hồng) + nền tảng; ví quán dương, không bị báo âm', async () => {
        const order = await placePrepaid();
        await webhook(order.paymentCode, 70000);
        await advance(order.id);

        expect(await balanceOf('ESCROW')).toBe(0);
        expect(await balanceOf(`restaurant:${shop.restaurant.id}`)).toBe(63000);
        expect(await balanceOf('PLATFORM')).toBe(7000);
        expect(await totalBalance()).toBe(0);
        expect(await Notification.countDocuments({ type: 'WALLET_NEGATIVE' })).toBe(0);
        expect((await Order.findById(order.id)).paymentStatus).toBe('PAID');

        const wallet = (await owner.get('/api/merchant/wallet')).body.data;
        expect(wallet.available).toBe(63000);
    });

    it('chuyển thừa -> xác nhận đơn + lệnh hoàn phần thừa', async () => {
        const order = await placePrepaid();
        expect((await webhook(order.paymentCode, 80000)).body.status).toBe('MATCHED_ORDER');
        expect((await Order.findById(order.id)).status).toBe('PLACED');
        expect(await Refund.findOne()).toMatchObject({ reason: 'OVERPAID', amount: 10000, status: 'PENDING' });
        expect(await balanceOf('REFUND_HOLD')).toBe(10000);
        expect(await Notification.countDocuments({ type: 'REFUND_REQUESTED' })).toBe(1);
    });

    it('chuyển thiếu -> đơn vẫn chờ, hoàn khoản thiếu, báo khách; chuyển lại đủ -> xác nhận', async () => {
        const order = await placePrepaid();
        expect((await webhook(order.paymentCode, 50000)).body.status).toBe('UNDERPAID');
        expect((await Order.findById(order.id)).status).toBe('PENDING_PAYMENT');
        expect(await Refund.findOne()).toMatchObject({ reason: 'UNDERPAID', amount: 50000 });
        expect((await Notification.findOne({ type: 'PAYMENT_ISSUE' })).title).toContain('chuyển thiếu');

        expect((await webhook(order.paymentCode, 70000)).body.status).toBe('MATCHED_ORDER');
        expect(await totalBalance()).toBe(0);
    });

    it('chuyển sau khi đơn hết hạn -> LATE, hoàn toàn bộ; chuyển trùng cho đơn đã trả -> DUPLICATE', async () => {
        const late = await placePrepaid(1);
        await expireUnpaidOrders({ now: new Date(Date.now() + 16 * MIN) });
        expect((await webhook(late.paymentCode, 35000)).body.status).toBe('LATE');
        expect((await Order.findById(late.id)).status).toBe('CANCELLED');

        const paid = await placePrepaid(1);
        await webhook(paid.paymentCode, 35000);
        expect((await webhook(paid.paymentCode, 35000)).body.status).toBe('DUPLICATE');

        expect((await Refund.find().sort({ createdAt: 1 })).map((r) => r.reason)).toEqual(['LATE_PAYMENT', 'DUPLICATE']);
        expect(await balanceOf('REFUND_HOLD')).toBe(70000);
    });

    it('nạp ví quán bằng mã NAP -> tự xác nhận, cộng ví', async () => {
        const topup = (await owner.post('/api/merchant/wallet/topups', { amount: 50000 }).expect(201)).body.data;
        expect((await webhook(`NAP TIEN ${topup.code}`, 50000)).body.status).toBe('MATCHED_TOPUP');

        const wallet = (await owner.get('/api/merchant/wallet')).body.data;
        expect(wallet).toMatchObject({ balance: 50000, pendingTopup: null });
        expect(await Payment.findOne()).toMatchObject({ status: 'MATCHED_TOPUP' });
        expect(await Notification.countDocuments({ type: 'TOPUP_CONFIRMED' })).toBe(1);

        // Mã nạp đã dùng -> không khớp, admin xử lý
        expect((await webhook(topup.code, 50000)).body.status).toBe('UNMATCHED');
    });

    it('không nhận ra mã / tiền ra / tài khoản khác', async () => {
        expect((await webhook('chuyen tien an trua', 20000)).body.status).toBe('UNMATCHED');
        expect((await webhook('MAK2601010001', 20000)).body.status).toBe('UNMATCHED');
        expect((await webhook('rut tien', 20000, { transferType: 'out' })).body.status).toBe('IGNORED');
        expect((await webhook('MAK2601010001', 20000, { accountNumber: '999' })).body.status).toBe('IGNORED');
        expect(await Notification.countDocuments({ type: 'PAYMENT_UNMATCHED' })).toBe(2);
        expect(await totalBalance()).toBe(0);
    });

    it('nhận ra mã dù ngân hàng chèn chữ, viết thường, có dấu gạch', () => {
        expect(extractCode(null, 'IBFT mak2610110001 nguyen van a')).toBe('MAK2610110001');
        expect(extractCode(null, 'MAK261011-0001')).toBe('MAK2610110001');
        expect(extractCode('NAP2610110002', 'abc')).toBe('NAP2610110002');
        expect(extractCode(null, 'MAK26101')).toBeNull();
    });
});

describe('Hoàn tiền', () => {
    it('quán từ chối đơn đã trả -> chờ hoàn; admin chuyển trả -> REFUNDED, sổ cân bằng', async () => {
        const order = await placePrepaid();
        await webhook(order.paymentCode, 70000);
        await owner.post(`${M}/${order.id}/reject`, { reasonCode: 'OUT_OF_STOCK' }).expect(200);

        expect(await Order.findById(order.id)).toMatchObject({ status: 'REJECTED', paymentStatus: 'REFUND_PENDING' });
        expect(await balanceOf('ESCROW')).toBe(0);
        expect(await balanceOf('REFUND_HOLD')).toBe(70000);
        const msg = await Notification.findOne({ user: customerId, title: /từ chối/ });
        expect(msg.body).toContain('hoàn tiền');

        const list = (await admin.get('/api/admin/refunds?status=PENDING').expect(200)).body.data;
        expect(list.items[0]).toMatchObject({ amount: 70000, reason: 'ORDER_CANCELLED', order: { code: order.code }, customer: { id: customerId } });

        const done = await admin.post(`/api/admin/refunds/${list.items[0].id}/done`, { bankRef: 'FT999' }).expect(200);
        expect(done.body.data).toMatchObject({ status: 'DONE', bankRef: 'FT999' });
        expect((await Order.findById(order.id)).paymentStatus).toBe('REFUNDED');
        expect(await balanceOf('REFUND_HOLD')).toBe(0);
        expect(await balanceOf('EXTERNAL')).toBe(0);
        expect(await totalBalance()).toBe(0);
        expect(await AuditLog.countDocuments({ action: 'REFUND_DONE' })).toBe(1);
        expect(await Notification.countDocuments({ user: customerId, type: 'REFUND_DONE' })).toBe(1);

        expect((await admin.post(`/api/admin/refunds/${list.items[0].id}/done`)).status).toBe(409);
    });

    it('quán không nhận kịp / khách hủy đơn đã trả -> cũng tạo lệnh hoàn', async () => {
        const a = await placePrepaid(1);
        await webhook(a.paymentCode, 35000);
        await cancelExpiredOrders({ olderThanMinutes: 5, now: new Date(Date.now() + 6 * MIN) });
        expect((await Order.findById(a.id)).paymentStatus).toBe('REFUND_PENDING');

        const b = await placePrepaid(1);
        await webhook(b.paymentCode, 35000);
        await customer.post(`/api/orders/${b.id}/cancel`, {}).expect(200);
        expect((await Order.findById(b.id)).paymentStatus).toBe('REFUND_PENDING');

        expect(await Refund.countDocuments({ reason: 'ORDER_CANCELLED' })).toBe(2);
    });

    it('giao dịch không khớp: admin hoàn hoặc bỏ qua (kèm ghi chú, audit)', async () => {
        await webhook('khach ghi sai noi dung', 40000);
        await webhook('tien ca nhan', 100000);
        const unmatched = (await admin.get('/api/admin/payments?status=UNMATCHED')).body.data.items;
        expect(unmatched).toHaveLength(2);
        const byAmount = (n) => unmatched.find((p) => p.amount === n).id;

        expect((await admin.post(`/api/admin/payments/${byAmount(40000)}/resolve`, { action: 'refund' })).status).toBe(400);
        const res = await admin.post(`/api/admin/payments/${byAmount(40000)}/resolve`, { action: 'refund', note: 'Khách gọi báo ghi sai mã đơn' }).expect(200);
        expect(res.body.data.refund).toMatchObject({ reason: 'UNMATCHED', amount: 40000 });
        await admin.post(`/api/admin/payments/${byAmount(100000)}/resolve`, { action: 'ignore', note: 'Tiền cá nhân' }).expect(200);
        expect((await admin.post(`/api/admin/payments/${byAmount(100000)}/resolve`, { action: 'ignore', note: 'x' })).status).toBe(409);

        expect(await balanceOf('REFUND_HOLD')).toBe(40000);
        expect(await AuditLog.countDocuments({ action: { $in: ['PAYMENT_REFUND', 'PAYMENT_IGNORE'] } })).toBe(2);

        const overview = (await admin.get('/api/admin/wallets/overview')).body.data;
        expect(overview).toMatchObject({ refundHold: 40000, escrow: 0, pendingRefunds: { count: 1, amount: 40000 }, unmatchedPayments: 0, balanced: true });
    });

    it('chủ quán / khách không gọi được API hoàn tiền của admin', async () => {
        expect((await owner.get('/api/admin/refunds')).status).toBe(403);
        expect((await customer.get('/api/admin/payments')).status).toBe(403);
    });
});
