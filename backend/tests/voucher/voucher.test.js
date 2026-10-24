const Voucher = require('../../src/modules/voucher/voucher.model');
const Wallet = require('../../src/modules/wallet/wallet.model');
const AuditLog = require('../../src/modules/audit/auditLog.model');
const { setupDatabase } = require('../helpers/db');
const { createUserAndLogin, createAdminAndLogin } = require('../helpers/auth');
const { as, createShop, newKey } = require('../helpers/orders');

setupDatabase();

const DAY = 24 * 60 * 60 * 1000;
const M = '/api/merchant/orders';

let shop;
let other;
let owner;
let customer;
let admin;

beforeEach(async () => {
    shop = await createShop();
    other = await createShop({ name: 'Quán Khác' });
    owner = as(shop.ownerToken);
    customer = as((await createUserAndLogin()).token);
    admin = as((await createAdminAndLogin()).token);
});

const period = (from = -DAY, to = 7 * DAY) => ({
    startAt: new Date(Date.now() + from).toISOString(),
    endAt: new Date(Date.now() + to).toISOString()
});

// Voucher MAK: giảm 10%, tối đa 15.000, đơn từ 50.000
const platformVoucher = (extra = {}) =>
    admin.post('/api/admin/vouchers', { code: 'MAK10', type: 'PERCENT', value: 10, maxDiscount: 15000, minOrderAmount: 50000, ...period(), ...extra });

// Voucher quán: giảm 10.000
const shopVoucher = (theOwner = owner, extra = {}) =>
    theOwner.post('/api/merchant/vouchers', { code: 'QUAN10K', type: 'FIXED', value: 10000, ...period(), ...extra });

const body = (theShop, { qty = 6, voucherCodes = [] } = {}) => ({
    restaurantId: theShop.restaurant.id,
    items: [{ menuItemId: theShop.rice.id, qty }],
    fulfillmentType: 'PICKUP',
    voucherCodes
});
const place = (who, theShop, opts) => who.post('/api/orders', body(theShop, opts), newKey());
const preview = (who, theShop, opts) => who.post('/api/orders/preview', body(theShop, opts));

const expectVoucherError = (res, code, reason) => {
    expect(res.status).toBe(422);
    expect(res.body.code).toBe(code);
    if (reason) expect(res.body.errors[0].reason).toBe(reason);
};

describe('Quản lý voucher', () => {
    it('admin tạo voucher MAK; mã trùng -> 409; % thiếu giảm tối đa / hết hạn trước bắt đầu -> 400; có audit', async () => {
        const res = await platformVoucher().expect(201);
        expect(res.body.data).toMatchObject({ code: 'MAK10', fundedBy: 'PLATFORM', usedCount: 0, perUserLimit: 1, status: 'ACTIVE' });
        expect(await AuditLog.countDocuments({ action: 'VOUCHER_CREATE' })).toBe(1);

        expect((await platformVoucher()).body.code).toBe('DUPLICATE');
        expect((await platformVoucher({ code: 'NOMAX', maxDiscount: null })).status).toBe(400);
        expect((await platformVoucher({ code: 'BADDATE', ...period(DAY, -DAY) })).status).toBe(400);
        expect((await platformVoucher({ code: 'ab' })).status).toBe(400);
    });

    it('chủ quán tạo voucher riêng; quán khác không thấy / không sửa được; admin thấy mọi voucher', async () => {
        const created = (await shopVoucher().expect(201)).body.data;
        expect(created).toMatchObject({ fundedBy: 'RESTAURANT', restaurant: shop.restaurant.id });

        const otherOwner = as(other.ownerToken);
        expect((await otherOwner.get('/api/merchant/vouchers')).body.data.total).toBe(0);
        expect((await otherOwner.patch(`/api/merchant/vouchers/${created.id}`, { isActive: false })).status).toBe(404);

        await platformVoucher().expect(201);
        expect((await admin.get('/api/admin/vouchers')).body.data.total).toBe(2);
        expect((await admin.get('/api/admin/vouchers?fundedBy=RESTAURANT')).body.data.items[0].restaurant.name).toBe('Quán Test');
    });

    it('phân quyền: khách không vào trang quản lý; chủ quán không vào API admin', async () => {
        expect((await customer.get('/api/merchant/vouchers')).status).toBe(403);
        expect((await owner.post('/api/admin/vouchers', {})).status).toBe(403);
    });
});

describe('Áp voucher khi đặt đơn', () => {
    it('voucher quán trừ trước, voucher MAK trừ tiếp (giới hạn 15.000); hoa hồng trên phần quán thực bán', async () => {
        await shopVoucher().expect(201);
        await platformVoucher().expect(201);

        // 6 × 35.000 = 210.000 → quán −10.000 → MAK 10% của 200.000 = 20.000 nhưng tối đa 15.000
        const p = (await preview(customer, shop, { voucherCodes: ['quan10k', 'MAK10'] }).expect(200)).body.data;
        expect(p).toMatchObject({ subtotal: 210000, restaurantDiscount: 10000, platformDiscount: 15000, discount: 25000, total: 185000 });
        expect(p.vouchers.map((v) => v.code)).toEqual(['QUAN10K', 'MAK10']);
        expect((await Voucher.findOne({ code: 'MAK10' })).usedCount).toBe(0); // xem trước không giữ lượt

        const order = (await place(customer, shop, { voucherCodes: ['QUAN10K', 'MAK10'] }).expect(201)).body.data;
        expect(order).toMatchObject({ total: 185000, discount: 25000, restaurantDiscount: 10000, platformDiscount: 15000 });
        expect(order.vouchers).toHaveLength(2);
        expect((await Voucher.find()).map((v) => v.usedCount)).toEqual([1, 1]);

        // Chủ quán thấy hoa hồng = 10% × (210.000 − 10.000)
        const merchantView = (await owner.get(`${M}/${order.id}`)).body.data;
        expect(merchantView.commissionAmount).toBe(20000);
    });

    it('lỗi rõ lý do: mã không có, chưa đạt đơn tối thiểu, sai quán, hết hạn, đang tắt, 2 voucher cùng loại', async () => {
        await platformVoucher().expect(201);
        await shopVoucher().expect(201);
        await platformVoucher({ code: 'MAKOLD', ...period(-7 * DAY, -DAY) }).expect(201);
        await platformVoucher({ code: 'MAKOFF', isActive: false }).expect(201);

        expectVoucherError(await preview(customer, shop, { voucherCodes: ['KHONGCO'] }), 'VOUCHER_INVALID', 'NOT_FOUND');
        expectVoucherError(await preview(customer, shop, { qty: 1, voucherCodes: ['MAK10'] }), 'VOUCHER_INVALID', 'BELOW_MIN_ORDER');
        expectVoucherError(await preview(customer, other, { voucherCodes: ['QUAN10K'] }), 'VOUCHER_INVALID', 'WRONG_RESTAURANT');
        expectVoucherError(await preview(customer, shop, { voucherCodes: ['MAKOLD'] }), 'VOUCHER_INVALID', 'EXPIRED');
        expectVoucherError(await preview(customer, shop, { voucherCodes: ['MAKOFF'] }), 'VOUCHER_INVALID', 'INACTIVE');
        expectVoucherError(await preview(customer, shop, { voucherCodes: ['MAK10', 'MAKOLD'] }), 'VOUCHER_STACK_LIMIT');
        expect((await preview(customer, shop, { voucherCodes: ['A', 'B', 'C'] })).status).toBe(400);
    });

    it('voucher chỉ áp cho chuyển khoản: tiền mặt -> WRONG_PAYMENT_METHOD; danh sách cho khách có paymentMethods', async () => {
        const created = (await platformVoucher({ code: 'CKONLY', paymentMethods: ['BANK_TRANSFER'] }).expect(201)).body.data;
        expect(created.paymentMethods).toEqual(['BANK_TRANSFER']);
        expect((await platformVoucher({ code: 'RONG', paymentMethods: [] })).status).toBe(400);
        expect((await platformVoucher({ code: 'SAIPT', paymentMethods: ['MOMO'] })).status).toBe(400);

        const cod = await customer.post('/api/orders/preview', { ...body(shop, { voucherCodes: ['CKONLY'] }), paymentMethod: 'COD' });
        expectVoucherError(cod, 'VOUCHER_INVALID', 'WRONG_PAYMENT_METHOD');
        expect(cod.body.errors[0].paymentMethods).toEqual(['BANK_TRANSFER']);
        expectVoucherError(await place(customer, shop, { voucherCodes: ['CKONLY'] }), 'VOUCHER_INVALID', 'WRONG_PAYMENT_METHOD');

        const bank = await customer.post('/api/orders/preview', { ...body(shop, { voucherCodes: ['CKONLY'] }), paymentMethod: 'BANK_TRANSFER' });
        expect(bank.status).toBe(200);
        expect(bank.body.data.platformDiscount).toBe(15000);

        // Mặc định: cả hai phương thức
        const shopV = (await shopVoucher().expect(201)).body.data;
        expect(shopV.paymentMethods).toEqual(['COD', 'BANK_TRANSFER']);
        const list = (await customer.get(`/api/vouchers/available?restaurantId=${shop.restaurant.id}`)).body.data;
        expect(list.find((v) => v.code === 'CKONLY').paymentMethods).toEqual(['BANK_TRANSFER']);
    });

    it('voucher MAK giới hạn quán: dùng ở quán khác -> WRONG_RESTAURANT', async () => {
        await platformVoucher({ code: 'CHIQUANB', restaurants: [other.restaurant.id] }).expect(201);
        expectVoucherError(await preview(customer, shop, { voucherCodes: ['CHIQUANB'] }), 'VOUCHER_INVALID', 'WRONG_RESTAURANT');
        expect((await preview(customer, other, { voucherCodes: ['CHIQUANB'] })).status).toBe(200);
    });

    it('mỗi khách 1 lượt: dùng lần 2 -> VOUCHER_USER_LIMIT; hủy đơn -> trả lượt, dùng lại được', async () => {
        await platformVoucher().expect(201);
        const first = (await place(customer, shop, { qty: 2, voucherCodes: ['MAK10'] }).expect(201)).body.data;

        expectVoucherError(await place(customer, shop, { qty: 2, voucherCodes: ['MAK10'] }), 'VOUCHER_USER_LIMIT');

        await customer.post(`/api/orders/${first.id}/cancel`, {}).expect(200);
        expect((await Voucher.findOne({ code: 'MAK10' })).usedCount).toBe(0);
        await place(customer, shop, { qty: 2, voucherCodes: ['MAK10'] }).expect(201);
    });

    it('5 khách tranh lượt cuối cùng: 1 thành công, 4 nhận VOUCHER_EXHAUSTED', async () => {
        await platformVoucher({ code: 'CONMOT', usageLimit: 1 }).expect(201);
        await MenuItemLimit(shop, 50);
        const customers = await Promise.all(Array.from({ length: 5 }, async () => as((await createUserAndLogin()).token)));

        const results = await Promise.all(customers.map((c) => place(c, shop, { voucherCodes: ['CONMOT'] })));
        expect(results.filter((r) => r.status === 201)).toHaveLength(1);
        expect(results.filter((r) => r.body.code === 'VOUCHER_EXHAUSTED')).toHaveLength(4);
        expect((await Voucher.findOne({ code: 'CONMOT' })).usedCount).toBe(1);
    });

    it('gửi lại cùng Idempotency-Key không trừ thêm lượt', async () => {
        await platformVoucher({ code: 'MAK2LAN', perUserLimit: 2 }).expect(201);
        const key = newKey();
        await customer.post('/api/orders', body(shop, { voucherCodes: ['MAK2LAN'] }), key).expect(201);
        await customer.post('/api/orders', body(shop, { voucherCodes: ['MAK2LAN'] }), key).expect(200);
        expect((await Voucher.findOne({ code: 'MAK2LAN' })).usedCount).toBe(1);
    });
});

describe('Tiền: ví đối soát + báo cáo', () => {
    it('đơn COD có voucher quán + MAK hoàn thành: MAK bù đúng phần mình, tổng sổ = 0, doanh thu quán gồm phần MAK bù', async () => {
        await shopVoucher().expect(201);
        await platformVoucher().expect(201);
        const order = (await place(customer, shop, { voucherCodes: ['QUAN10K', 'MAK10'] }).expect(201)).body.data;

        await owner.post(`${M}/${order.id}/accept`).expect(200);
        for (const to of ['READY', 'COMPLETED']) {
            await owner.post(`${M}/${order.id}/status`, { to }).expect(200);
        }

        // Quán thu 185.000 tiền mặt; phải nhận 210.000 − 10.000 (voucher quán) − 20.000 (hoa hồng) = 180.000
        // -> ví quán: +15.000 (MAK bù) − 20.000 (hoa hồng) = −5.000
        const balance = async (key) => (await Wallet.findOne({ key }))?.balance ?? 0;
        expect(await balance(`restaurant:${shop.restaurant.id}`)).toBe(-5000);
        expect(await balance('PLATFORM')).toBe(5000);

        const summary = (await owner.get('/api/merchant/reports/summary')).body.data;
        expect(summary).toMatchObject({ grossRevenue: 200000, commission: 20000, netRevenue: 180000 });
    });
});

describe('Voucher khách dùng được + quy tắc sửa / xóa', () => {
    it('chỉ liệt kê voucher còn dùng được cho đúng quán và đúng khách', async () => {
        await platformVoucher().expect(201);
        await shopVoucher().expect(201);
        await shopVoucher(as(other.ownerToken), { code: 'QUANKHAC' }).expect(201);
        await platformVoucher({ code: 'MAKOLD', ...period(-7 * DAY, -DAY) }).expect(201);

        const list = (await customer.get(`/api/vouchers/available?restaurantId=${shop.restaurant.id}`).expect(200)).body.data;
        expect(list.map((v) => v.code).sort()).toEqual(['MAK10', 'QUAN10K']);

        await place(customer, shop, { voucherCodes: ['MAK10'] }).expect(201);
        const after = (await customer.get(`/api/vouchers/available?restaurantId=${shop.restaurant.id}`)).body.data;
        expect(after.map((v) => v.code)).toEqual(['QUAN10K']);
    });

    it('đã có người dùng: không đổi mức giảm / không xóa được; vẫn gia hạn, tắt được', async () => {
        const created = (await shopVoucher().expect(201)).body.data;
        const unused = (await shopVoucher(owner, { code: 'XOADUOC' }).expect(201)).body.data;
        await place(customer, shop, { voucherCodes: ['QUAN10K'] }).expect(201);

        const url = `/api/merchant/vouchers/${created.id}`;
        expect((await owner.patch(url, { value: 50000 })).body.code).toBe('VOUCHER_IN_USE');
        expect((await owner.delete(url)).body.code).toBe('VOUCHER_IN_USE');
        const extended = await owner.patch(url, { endAt: new Date(Date.now() + 30 * DAY).toISOString(), isActive: false }).expect(200);
        expect(extended.body.data.status).toBe('INACTIVE');

        await owner.delete(`/api/merchant/vouchers/${unused.id}`).expect(200);

        const usage = (await owner.get(`${url}/usage`).expect(200)).body.data;
        expect(usage.summary).toEqual({ uses: 1, totalDiscount: 10000 });
        expect(usage.items[0].order.code).toMatch(/^MAK/);
    });
});

// Nâng giới hạn suất của món để nhiều khách cùng đặt
async function MenuItemLimit(theShop, limit) {
    const MenuItem = require('../../src/modules/menu/menuItem.model');
    await MenuItem.updateOne({ _id: theShop.rice.id }, { $set: { dailyLimit: limit } });
}
