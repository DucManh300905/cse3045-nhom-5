const request = require('supertest');
const app = require('../../src/app');
const Order = require('../../src/modules/order/order.model');
const Shipper = require('../../src/modules/shipper/shipper.model');
const DispatchOffer = require('../../src/modules/shipper/dispatchOffer.model');
const Wallet = require('../../src/modules/wallet/wallet.model');
const Refund = require('../../src/modules/payment/refund.model');
const Notification = require('../../src/modules/notification/notification.model');
const { dispatchTick } = require('../../src/modules/shipper/dispatch.service');
const { shipperFeeFor } = require('../../src/modules/wallet/wallet.service');
const { toPoint } = require('../../src/utils/geo');
const { setupDatabase } = require('../helpers/db');
const { createUserAndLogin, createAdminAndLogin } = require('../helpers/auth');
const { as, createShop, newKey, delivery } = require('../helpers/orders');

setupDatabase();

// Tài xế MAK chỉ nhận đơn trả trước -> bật chuyển khoản (SePay) cho cả file
const KEY = 'test-sepay-key-0123456789';
const ENV = {
    PAYMENT_BANK_ID: 'MB',
    PAYMENT_ACCOUNT_NO: '0123456789',
    PAYMENT_ACCOUNT_NAME: 'MAK FOOD',
    SEPAY_WEBHOOK_API_KEY: KEY,
    PAYOUT_MIN_AMOUNT: '5000'
};
beforeAll(() => Object.assign(process.env, ENV));
afterAll(() => Object.keys(ENV).forEach((k) => delete process.env[k]));

const M = '/api/merchant/orders';
const S = '/api/shipper';
const SHOP = { lat: 21.0136, lng: 105.5254 };
// PNG hợp lệ tối thiểu (server chỉ kiểm tra chữ ký đầu file)
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);

let shop;
let owner;
let customer;
let customerId;
let admin;

beforeEach(async () => {
    shop = await createShop({ deliveryMode: 'PLATFORM' });
    owner = as(shop.ownerToken);
    const login = await createUserAndLogin();
    customer = as(login.token);
    customerId = login.user.id;
    admin = as((await createAdminAndLogin()).token);
});

let phoneSeq = 10000000;
// Tài xế đã duyệt, đang trực tuyến tại vị trí cho trước (mặc định đứng ngay quán)
const makeShipper = async ({ at = SHOP, online = true, status = 'APPROVED' } = {}) => {
    const { token, user } = await createUserAndLogin({ role: 'SHIPPER' });
    const shipper = await Shipper.create({
        user: user.id,
        fullName: user.fullName,
        phone: `09${(phoneSeq += 1)}`,
        vehicleType: 'MOTORBIKE',
        licensePlate: '29A-12345',
        status,
        isOnline: online,
        location: toPoint(at),
        locationAt: new Date()
    });
    return { api: as(token), token, shipper, userId: user.id };
};

let txSeq = 5000;
const pay = (order) =>
    request(app)
        .post('/api/payments/sepay/webhook')
        .set('Authorization', `Apikey ${KEY}`)
        .send({
            id: (txSeq += 1),
            gateway: 'MBBank',
            transactionDate: '2026-10-21 10:00:00',
            accountNumber: ENV.PAYMENT_ACCOUNT_NO,
            content: `CK ${order.paymentCode}`,
            transferType: 'in',
            transferAmount: order.total,
            referenceCode: `FT${txSeq}`
        })
        .expect(200);

// Đơn giao tận nơi trả trước 2 cơm gà = 70.000, đã thanh toán (PLACED)
const placePaidOrder = async (to = delivery) => {
    const res = await customer.post(
        '/api/orders',
        { restaurantId: shop.restaurant.id, items: [{ menuItemId: shop.rice.id, qty: 2 }], fulfillmentType: 'DELIVERY', paymentMethod: 'BANK_TRANSFER', delivery: to },
        newKey()
    );
    expect(res.status).toBe(201);
    await pay(res.body.data);
    const order = await Order.findById(res.body.data.id);
    expect(order.status).toBe('PLACED');
    return order;
};

// Quán nhận đơn -> bắt đầu tìm tài xế
const placeAndAccept = async (to) => {
    const order = await placePaidOrder(to);
    await owner.post(`${M}/${order.id}/accept`).expect(200);
    return Order.findById(order.id);
};

const openOffer = (orderId) => DispatchOffer.findOne({ order: orderId, status: 'OFFERED' });
const balanceOf = async (key) => (await Wallet.findOne({ key }))?.balance ?? 0;
const totalBalance = async () => (await Wallet.find()).reduce((s, w) => s + w.balance, 0);

// Nhận đơn -> tới quán -> quán báo xong -> lấy hàng (đơn DELIVERING)
const runToPickup = async (driver, orderId) => {
    const offer = await openOffer(orderId);
    await driver.api.post(`${S}/offers/${offer.id}/accept`).expect(200);
    await driver.api.post(`${S}/orders/${orderId}/arrived`).expect(200);
    await owner.post(`${M}/${orderId}/status`, { to: 'READY' }).expect(200);
    await driver.api.post(`${S}/orders/${orderId}/picked-up`).expect(200);
};

// supertest + header: as() không hỗ trợ multipart -> tự gắn token
const multipart = (token) => ({
    post: (url) => request(app).post(url).set('Authorization', `Bearer ${token}`)
});

describe('Hồ sơ tài xế', () => {
    it('đăng ký SHIPPER, tạo hồ sơ, thiếu giấy tờ thì không nộp được, admin duyệt rồi mới trực tuyến được', async () => {
        const { token } = await createUserAndLogin({ role: 'SHIPPER' });
        const driver = as(token);

        await driver.post(`${S}/online`).expect(404);
        const created = await driver.post(`${S}/profile`, { fullName: 'Tài Xế A', phone: '0911222333', vehicleType: 'MOTORBIKE', licensePlate: '29a-123.45' });
        expect(created.status).toBe(201);
        expect(created.body.data.licensePlate).toBe('29A-123.45');
        // Đăng ký bằng email đã xác thực OTP -> mọi phản hồi hồ sơ đều báo đã xác thực (không hiện lại ô xác thực email)
        expect(created.body.data.emailVerified).toBe(true);

        const incomplete = await driver.post(`${S}/profile/submit`);
        expect(incomplete.status).toBe(422);
        expect(incomplete.body.code).toBe('PROFILE_INCOMPLETE');

        for (const type of ['ID_CARD', 'DRIVER_LICENSE', 'VEHICLE_REGISTRATION']) {
            const doc = await multipart(token).post(`${S}/profile/documents`).field('type', type).attach('file', PNG, { filename: `${type}.png`, contentType: 'image/png' }).expect(200);
            expect(doc.body.data.emailVerified).toBe(true);
        }
        const submitted = await driver.post(`${S}/profile/submit`);
        expect(submitted.status).toBe(200);
        expect(submitted.body.data.status).toBe('SUBMITTED');
        // Đã nộp thì khóa sửa
        await driver.put(`${S}/profile`, { licensePlate: '30A-99999' }).expect(409);
        await driver.post(`${S}/online`).expect(403);

        const list = await admin.get('/api/admin/shippers?status=SUBMITTED').expect(200);
        expect(list.body.data.items).toHaveLength(1);
        const id = list.body.data.items[0].id;
        const detail = await admin.get(`/api/admin/shippers/${id}`).expect(200);
        expect(detail.body.data.documents).toHaveLength(3);
        await admin.get(detail.body.data.documents[0].url).expect(200);

        await admin.post(`/api/admin/shippers/${id}/approve`).expect(200);
        const online = await driver.post(`${S}/online`, { lat: SHOP.lat, lng: SHOP.lng });
        expect(online.status).toBe(200);
        expect(online.body.data.isOnline).toBe(true);
        expect(await Notification.exists({ type: 'SHIPPER_APPROVED' })).toBeTruthy();
    });

    it('khách / chủ quán không gọi được API tài xế', async () => {
        await customer.get(`${S}/state`).expect(403);
        await owner.get(`${S}/state`).expect(403);
    });
});

describe('Đặt đơn ở quán dùng tài xế MAK', () => {
    it('chỉ nhận chuyển khoản trước cho giao tận nơi; tự đến lấy vẫn trả tiền mặt được', async () => {
        const cod = await customer.post(
            '/api/orders',
            { restaurantId: shop.restaurant.id, items: [{ menuItemId: shop.rice.id, qty: 1 }], fulfillmentType: 'DELIVERY', delivery },
            newKey()
        );
        expect(cod.status).toBe(422);
        expect(cod.body.code).toBe('PREPAID_REQUIRED');

        const preview = await customer.post('/api/orders/preview', {
            restaurantId: shop.restaurant.id,
            items: [{ menuItemId: shop.rice.id, qty: 1 }],
            fulfillmentType: 'DELIVERY',
            delivery: { lat: delivery.lat, lng: delivery.lng }
        });
        expect(preview.body.data.prepaidRequired).toBe(true);

        await customer
            .post('/api/orders', { restaurantId: shop.restaurant.id, items: [{ menuItemId: shop.rice.id, qty: 1 }], fulfillmentType: 'PICKUP' }, newKey())
            .expect(201);

        const publicShop = await request(app).get(`/api/restaurants/${shop.restaurant.slug}`).expect(200);
        expect(publicShop.body.data.deliveryMode).toBe('PLATFORM');
    });

    it('tiền công: 10.000 đ cho 2 km đầu + 3.000 đ / km tiếp theo', async () => {
        expect(shipperFeeFor(1.2)).toBe(10000);
        expect(shipperFeeFor(2)).toBe(10000);
        expect(shipperFeeFor(3)).toBe(13000);
        expect(shipperFeeFor(3.2)).toBe(16000);
        const order = await placePaidOrder();
        expect(order.deliveryMode).toBe('PLATFORM');
        expect(order.shipperFee).toBe(shipperFeeFor(order.route.distanceKm));
        // Khách không thấy tiền công tài xế
        const mine = await customer.get(`/api/orders/${order.id}`).expect(200);
        expect(mine.body.data.shipperFee).toBeUndefined();
    });

    it('chủ quán đổi hình thức giao bằng nút (cần MAK đã bật chuyển khoản)', async () => {
        const res = await owner.patch('/api/merchant/restaurant/delivery-mode', { deliveryMode: 'SELF' });
        expect(res.status).toBe(200);
        expect(res.body.data.deliveryMode).toBe('SELF');

        delete process.env.SEPAY_WEBHOOK_API_KEY;
        const blocked = await owner.patch('/api/merchant/restaurant/delivery-mode', { deliveryMode: 'PLATFORM' });
        process.env.SEPAY_WEBHOOK_API_KEY = KEY;
        expect(blocked.status).toBe(422);
    });
});

describe('Điều phối', () => {
    it('quán nhận đơn -> mời tài xế gần nhất; người khác không nhận thay được; nhận rồi thì đơn ASSIGNED', async () => {
        const near = await makeShipper({ at: SHOP });
        const far = await makeShipper({ at: { lat: 21.025, lng: 105.5254 } });

        const order = await placeAndAccept();
        expect(order.status).toBe('PREPARING');
        expect(order.delivery.status).toBe('SEARCHING');

        const offer = await openOffer(order.id);
        expect(String(offer.shipper)).toBe(near.shipper.id);

        // Tài xế xa không có lời mời này
        await far.api.post(`${S}/offers/${offer.id}/accept`).expect(409);
        const state = await near.api.get(`${S}/state`).expect(200);
        expect(state.body.data.offer.orderId).toBe(order.id);
        // Lời mời chưa lộ thông tin khách
        expect(JSON.stringify(state.body.data.offer)).not.toContain(delivery.phone);

        const accepted = await near.api.post(`${S}/offers/${offer.id}/accept`);
        expect(accepted.status).toBe(200);
        expect(accepted.body.data.dropoff.phone).toBe(delivery.phone);
        await near.api.post(`${S}/offers/${offer.id}/accept`).expect(409);

        const fresh = await Order.findById(order.id);
        expect(fresh.delivery.status).toBe('ASSIGNED');
        expect(String(fresh.delivery.shipper)).toBe(near.shipper.id);
        expect((await Shipper.findById(near.shipper.id)).activeOrder.toString()).toBe(order.id);
        expect(await Notification.exists({ user: customerId, type: 'DELIVERY_ASSIGNED' })).toBeTruthy();

        // Khách thấy tài xế + vị trí
        const tracking = await customer.get(`/api/orders/${order.id}/tracking`).expect(200);
        expect(tracking.body.data.shipper.licensePlate).toBe('29A-12345');
        expect(tracking.body.data.location.lat).toBeCloseTo(SHOP.lat);
    });

    it('30 giây không trả lời -> mời người kế tiếp; từ chối hết, quá 3 phút -> NO_SHIPPER, quán tự giao', async () => {
        const near = await makeShipper({ at: SHOP });
        const far = await makeShipper({ at: { lat: 21.02, lng: 105.5254 } });
        const order = await placeAndAccept();

        await dispatchTick({ now: new Date(Date.now() + 31 * 1000) });
        const first = await DispatchOffer.findOne({ order: order.id, shipper: near.shipper.id });
        expect(first.status).toBe('EXPIRED');
        const second = await openOffer(order.id);
        expect(String(second.shipper)).toBe(far.shipper.id);

        await far.api.post(`${S}/offers/${second.id}/decline`).expect(200);
        // Không còn ai -> vẫn tìm; hết 3 phút -> báo quán
        expect((await Order.findById(order.id)).delivery.status).toBe('SEARCHING');
        await dispatchTick({ now: new Date(Date.now() + 4 * 60 * 1000) });
        expect((await Order.findById(order.id)).delivery.status).toBe('NO_SHIPPER');
        expect(await Notification.exists({ type: 'DELIVERY_NO_SHIPPER' })).toBeTruthy();

        const self = await owner.post(`${M}/${order.id}/self-deliver`);
        expect(self.status).toBe(200);
        expect(self.body.data.deliveryMode).toBe('SELF');
        expect(self.body.data.nextStatus).toBe('DELIVERING');
        await owner.post(`${M}/${order.id}/status`, { to: 'DELIVERING' }).expect(200);
        await owner.post(`${M}/${order.id}/status`, { to: 'COMPLETED' }).expect(200);
        // Quán tự giao: không trả tiền công tài xế
        expect(await balanceOf('PLATFORM')).toBe(7000);
    });

    it('chưa có tài xế nào trực tuyến -> chờ, có người lên mạng thì job mời', async () => {
        const order = await placeAndAccept();
        expect(await openOffer(order.id)).toBeNull();
        const driver = await makeShipper();
        await dispatchTick();
        expect(String((await openOffer(order.id)).shipper)).toBe(driver.shipper.id);
    });

    it('tài xế offline / bị khóa / vị trí cũ / đang bận / ngoài 5 km không được mời', async () => {
        await makeShipper({ online: false });
        await makeShipper({ status: 'BLOCKED' });
        await makeShipper({ at: { lat: 21.1, lng: 105.5254 } });
        const stale = await makeShipper();
        await Shipper.updateOne({ _id: stale.shipper._id }, { $set: { locationAt: new Date(Date.now() - 10 * 60 * 1000) } });
        const busy = await makeShipper();
        await Shipper.updateOne({ _id: busy.shipper._id }, { $set: { activeOrder: busy.shipper._id } });

        const order = await placeAndAccept();
        expect(await openOffer(order.id)).toBeNull();
    });

    it('admin gán tay cho đơn NO_SHIPPER', async () => {
        const order = await placeAndAccept();
        await dispatchTick({ now: new Date(Date.now() + 4 * 60 * 1000) });
        const driver = await makeShipper({ online: false });

        const board = await admin.get('/api/admin/dispatch').expect(200);
        expect(board.body.data.map((o) => o.id)).toContain(order.id);

        const res = await admin.post(`/api/admin/orders/${order.id}/assign`, { shipperId: driver.shipper.id });
        expect(res.status).toBe(200);
        expect(res.body.data.delivery.status).toBe('ASSIGNED');
        const state = await driver.api.get(`${S}/state`).expect(200);
        expect(state.body.data.activeOrder.id).toBe(order.id);
    });
});

describe('Giao hàng', () => {
    it('trọn luồng: lấy hàng -> chụp ảnh giao -> hoàn thành, ghi sổ tiền công, ảnh xem được bởi đúng người', async () => {
        const driver = await makeShipper();
        const order = await placeAndAccept();

        // Quán không tự chuyển sang đang giao được
        await owner.post(`${M}/${order.id}/status`, { to: 'DELIVERING' }).expect(409);
        await runToPickup(driver, order.id);
        expect((await Order.findById(order.id)).status).toBe('DELIVERING');

        // Thiếu ảnh -> 400
        await driver.api.post(`${S}/orders/${order.id}/delivered`).expect(400);
        const res = await multipart(driver.token).post(`${S}/orders/${order.id}/delivered`).attach('photo', PNG, {
            filename: 'proof.png',
            contentType: 'image/png'
        });
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('COMPLETED');
        expect(res.body.data.delivery.proof.url).toBe(`/delivery/orders/${order.id}/proof`);

        const done = await Order.findById(order.id);
        expect(done.delivery.status).toBe('DELIVERED');
        // 70.000 trả trước: quán 63.000, hoa hồng 7.000 − tiền công 10.000 -> nền tảng −3.000
        expect(await balanceOf(`restaurant:${shop.restaurant.id}`)).toBe(63000);
        expect(await balanceOf(`shipper:${driver.shipper.id}`)).toBe(done.shipperFee);
        expect(await balanceOf('PLATFORM')).toBe(7000 - done.shipperFee);
        expect(await balanceOf('ESCROW')).toBe(0);
        expect(await totalBalance()).toBe(0);

        const freed = await Shipper.findById(driver.shipper.id);
        expect(freed.activeOrder).toBeNull();
        expect(freed.completedCount).toBe(1);

        // Ảnh: khách, quán, tài xế, admin xem được; khách khác thì không
        const proof = `/api/delivery/orders/${order.id}/proof`;
        await customer.get(proof).expect(200);
        await owner.get(proof).expect(200);
        await driver.api.get(proof).expect(200);
        await admin.get(proof).expect(200);
        const stranger = as((await createUserAndLogin()).token);
        await stranger.get(proof).expect(404);

        // Khách thấy ảnh trong đơn, đánh giá tài xế 1 lần
        const mine = await customer.get(`/api/orders/${order.id}`).expect(200);
        expect(mine.body.data.delivery.proof.url).toBeDefined();
        expect(JSON.stringify(mine.body.data)).not.toContain('delivery-proofs/');
        await customer.post(`/api/orders/${order.id}/shipper-rating`, { stars: 4, comment: 'Nhanh' }).expect(200);
        await customer.post(`/api/orders/${order.id}/shipper-rating`, { stars: 5 }).expect(409);
        expect((await Shipper.findById(driver.shipper.id)).ratingAvg).toBe(4);

        // Đã giao xong: không còn chia sẻ vị trí
        const tracking = await customer.get(`/api/orders/${order.id}/tracking`).expect(200);
        expect(tracking.body.data.location).toBeNull();
    });

    it('tài xế lấy hàng được cả khi quán quên bấm "Món đã xong"', async () => {
        const driver = await makeShipper();
        const order = await placeAndAccept();
        const offer = await openOffer(order.id);
        await driver.api.post(`${S}/offers/${offer.id}/accept`).expect(200);
        await driver.api.post(`${S}/orders/${order.id}/picked-up`).expect(200);
        expect((await Order.findById(order.id)).status).toBe('DELIVERING');
    });

    it('quán hủy khi tài xế đang tới -> tài xế được bù 5.000 đ, khách được hoàn tiền', async () => {
        const driver = await makeShipper();
        const order = await placeAndAccept();
        const offer = await openOffer(order.id);
        await driver.api.post(`${S}/offers/${offer.id}/accept`).expect(200);

        await owner.post(`${M}/${order.id}/cancel`, { reasonCode: 'OUT_OF_STOCK' }).expect(200);
        expect(await balanceOf(`shipper:${driver.shipper.id}`)).toBe(5000);
        expect((await Shipper.findById(driver.shipper.id)).activeOrder).toBeNull();
        expect(await Refund.exists({ order: order.id })).toBeTruthy();
        expect(await Notification.exists({ user: driver.userId, type: 'DELIVERY_CANCELLED' })).toBeTruthy();
        expect(await totalBalance()).toBe(0);
    });

    it('quán hủy khi đang mời -> thu hồi lời mời, không bù tiền', async () => {
        await makeShipper();
        const order = await placeAndAccept();
        await owner.post(`${M}/${order.id}/cancel`, { reasonCode: 'OVERLOADED' }).expect(200);
        expect(await DispatchOffer.countDocuments({ order: order.id, status: 'CANCELLED' })).toBe(1);
        expect(await balanceOf('PLATFORM')).toBe(0);
    });

    it('tài xế trả đơn đã nhận -> tìm người khác; trả đủ số lần liên tiếp thì bị khóa nhận đơn 1 ngày', async () => {
        process.env.SHIPPER_MAX_CONSECUTIVE_WITHDRAWALS = '1';
        try {
            const first = await makeShipper();
            const order = await placeAndAccept();
            const offer = await openOffer(order.id);
            await first.api.post(`${S}/offers/${offer.id}/accept`).expect(200);
            const second = await makeShipper();

            const res = await first.api.post(`${S}/orders/${order.id}/withdraw`, { reason: 'Xe hỏng' });
            expect(res.status).toBe(200);
            expect(res.body.data.blocked).toBe(true);

            const again = await openOffer(order.id);
            expect(String(again.shipper)).toBe(second.shipper.id);
            const blocked = await Shipper.findById(first.shipper.id);
            expect(blocked.isOnline).toBe(false);
            expect(blocked.activeOrder).toBeNull();
            await first.api.post(`${S}/online`).expect(409);
        } finally {
            delete process.env.SHIPPER_MAX_CONSECUTIVE_WITHDRAWALS;
        }
    });

    it('giao thất bại (ảnh + lý do) -> admin hủy + hoàn tiền khách, tài xế vẫn nhận tiền công', async () => {
        const driver = await makeShipper();
        const order = await placeAndAccept();
        await runToPickup(driver, order.id);

        const { token } = driver;
        await multipart(token).post(`${S}/orders/${order.id}/failed`).attach('photo', PNG, { filename: 'p.png', contentType: 'image/png' }).expect(400);
        await multipart(token)
            .post(`${S}/orders/${order.id}/failed`)
            .field('reason', 'Khách không nghe máy sau 10 phút')
            .attach('photo', PNG, { filename: 'p.png', contentType: 'image/png' })
            .expect(200);
        expect((await Order.findById(order.id)).delivery.status).toBe('FAILED');
        expect((await Shipper.findById(driver.shipper.id)).activeOrder).toBeNull();

        const res = await admin.post(`/api/admin/orders/${order.id}/delivery/resolve`, { action: 'CANCEL', note: 'Khách vắng nhà' });
        expect(res.status).toBe(200);
        expect(res.body.data.status).toBe('CANCELLED');
        expect(await Refund.exists({ order: order.id })).toBeTruthy();
        expect(await balanceOf(`shipper:${driver.shipper.id}`)).toBeGreaterThan(0);
        expect(await totalBalance()).toBe(0);
    });

    it('vị trí: bỏ qua điểm nhảy vô lý; đang giao thì đẩy cho khách', async () => {
        const driver = await makeShipper();
        await Shipper.updateOne({ _id: driver.shipper._id }, { $set: { locationAt: new Date(Date.now() - 10 * 1000) } });
        const jump = await driver.api.post(`${S}/location`, { lat: 21.2, lng: 105.8 }).expect(200);
        expect(jump.body.data).toEqual({ accepted: false, reason: 'IMPLAUSIBLE_SPEED' });

        const order = await placeAndAccept();
        const offer = await openOffer(order.id);
        await driver.api.post(`${S}/offers/${offer.id}/accept`).expect(200);
        const moved = await driver.api.post(`${S}/location`, { lat: SHOP.lat + 0.0005, lng: SHOP.lng }).expect(200);
        expect(moved.body.data.accepted).toBe(true);
        expect(moved.body.data.eta.target).toBe('STORE');
        await driver.api.post(`${S}/offline`).expect(409);
    });
});

describe('Thu nhập tài xế', () => {
    it('rút tiền công về ngân hàng, admin chuyển khoản; quán và tài xế cùng có lệnh chờ được', async () => {
        const driver = await makeShipper();
        const order = await placeAndAccept();
        await runToPickup(driver, order.id);
        await multipart(driver.token).post(`${S}/orders/${order.id}/delivered`).attach('photo', PNG, { filename: 'p.png', contentType: 'image/png' }).expect(200);

        await driver.api.post(`${S}/wallet/payouts`, { amount: 5000 }).expect(422);
        await driver.api.put(`${S}/bank-account`, { bankName: 'MB', accountNumber: '0123456789', accountName: 'tai xe a' }).expect(200);
        const payout = await driver.api.post(`${S}/wallet/payouts`, { amount: 5000 });
        expect(payout.status).toBe(201);
        await driver.api.post(`${S}/wallet/payouts`, { amount: 1000 }).expect(400);

        // Quán cũng rút được cùng lúc (index mỗi bên một lệnh chờ)
        await owner.put('/api/merchant/wallet/bank-account', { bankName: 'VCB', accountNumber: '9876543210', accountName: 'QUAN A' }).expect(200);
        await owner.post('/api/merchant/wallet/payouts', { amount: 50000 }).expect(201);

        const wallet = await driver.api.get(`${S}/wallet`).expect(200);
        expect(wallet.body.data.pendingPayout.amount).toBe(5000);
        const entries = await driver.api.get(`${S}/wallet/entries`).expect(200);
        expect(entries.body.data.items.map((e) => e.kind)).toEqual(expect.arrayContaining(['SHIPPER_FEE', 'PAYOUT_REQUEST']));

        await admin.post(`/api/admin/payouts/${payout.body.data.id}/paid`, { bankRef: 'FT1' }).expect(200);
        expect(await Notification.exists({ user: driver.userId, type: 'PAYOUT_PAID' })).toBeTruthy();
        expect(await totalBalance()).toBe(0);
    });
});
