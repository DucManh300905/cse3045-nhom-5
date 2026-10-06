const Restaurant = require('../../src/modules/restaurant/restaurant.model');
const MenuItem = require('../../src/modules/menu/menuItem.model');
const Order = require('../../src/modules/order/order.model');
const { setupDatabase } = require('../helpers/db');
const { createUserAndLogin } = require('../helpers/auth');
const { newKey, as, createShop, teaLine, delivery } = require('../helpers/orders');

setupDatabase();

let customer;
let shop;

beforeEach(async () => {
    customer = as((await createUserAndLogin()).token);
    shop = await createShop();
});

describe('POST /orders/preview', () => {
    test('server tự tính giá biến thể + topping, miễn phí giao, bỏ qua giá client gửi', async () => {
        const res = await customer.post('/api/orders/preview', {
            restaurantId: shop.restaurant.id,
            items: [
                { ...teaLine(shop.tea, { toppings: ['Trân châu', 'Pudding'], qty: 2 }), unitPrice: 1 },
                { menuItemId: shop.rice.id, qty: 1 }
            ]
        });

        expect(res.status).toBe(200);
        // L 32k + 5k + 7k = 44k × 2 = 88k; cơm 35k
        expect(res.body.data.items[0]).toMatchObject({ unitPrice: 44000, lineTotal: 88000, variant: { name: 'L' } });
        expect(res.body.data).toMatchObject({ subtotal: 123000, deliveryFee: 0, discount: 0, total: 123000 });
        expect(await Order.countDocuments()).toBe(0);
        expect((await MenuItem.findById(shop.rice._id)).soldToday).toBe(0);
    });

    test('tự lấy (PICKUP) không tính phí giao; không gửi size thì lấy size mặc định', async () => {
        const res = await customer.post('/api/orders/preview', {
            restaurantId: shop.restaurant.id,
            fulfillmentType: 'PICKUP',
            items: [{ menuItemId: shop.tea.id, optionIds: [shop.tea.optionGroups[0].options[0].id], qty: 1 }]
        });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ subtotal: 25000, deliveryFee: 0, total: 25000 });
    });
});

describe('POST /orders', () => {
    test('đặt đơn: 201, mã đơn theo ngày, snapshot, trừ suất, không lộ hoa hồng', async () => {
        const res = await customer.post(
            '/api/orders',
            { restaurantId: shop.restaurant.id, items: [{ menuItemId: shop.rice.id, qty: 2, note: 'ít cơm' }], delivery },
            newKey()
        );

        expect(res.status).toBe(201);
        expect(res.body.data.code).toMatch(/^MAK\d{6}-0001$/);
        expect(res.body.data).toMatchObject({
            status: 'PLACED',
            paymentStatus: 'UNPAID',
            subtotal: 70000,
            deliveryFee: 0,
            total: 70000,
            restaurantSnapshot: { name: 'Quán Test' },
            delivery: { receiverName: 'Khách A', addressLine: 'KTX ĐH Việt Nhật' },
            items: [{ name: 'Cơm gà', unitPrice: 35000, qty: 2, note: 'ít cơm' }]
        });
        expect(res.body.data.statusHistory).toEqual([expect.objectContaining({ to: 'PLACED', actorType: 'CUSTOMER' })]);
        expect(res.body.data.commissionAmount).toBeUndefined();

        const saved = await Order.findById(res.body.data.id);
        expect(saved.commissionAmount).toBe(7000);
        expect(await MenuItem.findById(shop.rice._id)).toMatchObject({ soldToday: 2, soldCount: 2 });

        const second = await customer.post(
            '/api/orders',
            { restaurantId: shop.restaurant.id, items: [{ menuItemId: shop.rice.id, qty: 1 }], delivery },
            newKey()
        );
        expect(second.body.data.code).toMatch(/-0002$/);
    });

    test('giao đến địa chỉ trong sổ (addressId); địa chỉ không tồn tại -> 404; thiếu địa chỉ -> 400', async () => {
        const address = (
            await customer.post('/api/users/me/addresses', { receiverName: 'B', phone: '0911222333', addressLine: 'Phòng 305' })
        ).body.data;
        const body = { restaurantId: shop.restaurant.id, items: [{ menuItemId: shop.rice.id, qty: 1 }] };

        const ok = await customer.post('/api/orders', { ...body, addressId: address.id, delivery: { note: 'gọi trước' } }, newKey());
        expect(ok.status).toBe(201);
        expect(ok.body.data.delivery).toMatchObject({ receiverName: 'B', addressLine: 'Phòng 305', note: 'gọi trước' });

        expect((await customer.post('/api/orders', { ...body, addressId: '64b000000000000000000000' }, newKey())).status).toBe(404);
        expect((await customer.post('/api/orders', body, newKey())).body.code).toBe('VALIDATION_ERROR');
    });

    test('Idempotency-Key: gửi lại cùng key trả đúng đơn cũ (200), không trừ suất lần 2; thiếu key -> 400', async () => {
        const body = { restaurantId: shop.restaurant.id, items: [{ menuItemId: shop.rice.id, qty: 1 }], delivery };
        const key = newKey();

        const first = await customer.post('/api/orders', body, key);
        const again = await customer.post('/api/orders', body, key);

        expect(first.status).toBe(201);
        expect(again.status).toBe(200);
        expect(again.body.data.id).toBe(first.body.data.id);
        expect(await Order.countDocuments()).toBe(1);
        expect((await MenuItem.findById(shop.rice._id)).soldToday).toBe(1);

        const missing = await customer.post('/api/orders', body);
        expect(missing.status).toBe(400);
        expect(missing.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
    });

    test('cùng key gửi song song chỉ tạo 1 đơn', async () => {
        const body = { restaurantId: shop.restaurant.id, items: [{ menuItemId: shop.rice.id, qty: 1 }], delivery };
        const key = newKey();

        const results = await Promise.all([1, 2, 3].map(() => customer.post('/api/orders', body, key)));

        expect(results.every((r) => [200, 201].includes(r.status))).toBe(true);
        expect(new Set(results.map((r) => r.body.data.id)).size).toBe(1);
        expect(await Order.countDocuments()).toBe(1);
    });

    test('5 khách tranh suất cuối cùng: 1 thành công, 4 nhận 409 ITEM_OUT_OF_STOCK (BR-34)', async () => {
        await MenuItem.updateOne({ _id: shop.rice._id }, { dailyLimit: 1 });
        const customers = await Promise.all([1, 2, 3, 4, 5].map(async () => as((await createUserAndLogin()).token)));
        const body = { restaurantId: shop.restaurant.id, items: [{ menuItemId: shop.rice.id, qty: 1 }], delivery };

        const results = await Promise.all(customers.map((c) => c.post('/api/orders', body, newKey())));

        expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409, 409]);
        results.filter((r) => r.status === 409).forEach((r) => expect(r.body.code).toBe('ITEM_OUT_OF_STOCK'));
        expect((await MenuItem.findById(shop.rice._id)).soldToday).toBe(1);
        expect(await Order.countDocuments()).toBe(1);
    });

    test('vượt số suất còn lại (tính tổng nhiều dòng cùng món) -> 409', async () => {
        await MenuItem.updateOne({ _id: shop.tea._id }, { dailyLimit: 2 });
        const res = await customer.post(
            '/api/orders',
            { restaurantId: shop.restaurant.id, items: [teaLine(shop.tea, { qty: 2 }), teaLine(shop.tea, { size: 'M' })], delivery },
            newKey()
        );

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('ITEM_OUT_OF_STOCK');
    });

    test('lỗi nghiệp vụ: đơn tối thiểu, quán đóng, tùy chọn sai, món quán khác, món tạm hết', async () => {
        const order = (items, extra = {}) =>
            customer.post('/api/orders', { restaurantId: shop.restaurant.id, items, delivery, ...extra }, newKey());

        // Trà M 25k + đường = 25k ≥ 20k nhưng thử món 15k
        const cheap = await MenuItem.create({ restaurant: shop.restaurant._id, category: shop.category._id, name: 'Trà đá', basePrice: 5000 });
        expect((await order([{ menuItemId: cheap.id, qty: 1 }])).body.code).toBe('BELOW_MIN_ORDER');

        // Thiếu nhóm bắt buộc "Đường"
        expect((await order([{ menuItemId: shop.tea.id, qty: 1 }])).body.code).toBe('INVALID_OPTIONS');
        // Quá 2 topping
        expect((await order([teaLine(shop.tea, { toppings: ['Trân châu', 'Pudding', 'Thạch'] })])).body.code).toBe('INVALID_OPTIONS');
        // Biến thể không thuộc món
        expect((await order([{ menuItemId: shop.rice.id, variantId: shop.tea.variants[0].id, qty: 1 }])).body.code).toBe('INVALID_OPTIONS');

        const other = await createShop({ name: 'Quán Khác' });
        expect((await order([{ menuItemId: other.rice.id, qty: 1 }])).body.code).toBe('MULTIPLE_RESTAURANTS');

        await MenuItem.updateOne({ _id: shop.rice._id }, { isAvailable: false });
        const unavailable = await order([{ menuItemId: shop.rice.id, qty: 1 }]);
        expect(unavailable.status).toBe(409);
        expect(unavailable.body.errors[0].menuItemId).toBe(shop.rice.id);

        await Restaurant.updateOne({ _id: shop.restaurant._id }, { isAcceptingOrders: false });
        expect((await order([teaLine(shop.tea)])).body.code).toBe('RESTAURANT_CLOSED');

        expect(await Order.countDocuments()).toBe(0);
    });

    test('quán chưa duyệt -> 404; chủ quán không đặt được -> 403', async () => {
        const draft = await createShop({ name: 'Quán Nháp', status: 'DRAFT' });
        const res = await customer.post(
            '/api/orders',
            { restaurantId: draft.restaurant.id, items: [{ menuItemId: draft.rice.id, qty: 1 }], delivery },
            newKey()
        );
        expect(res.status).toBe(404);

        const owner = as((await createUserAndLogin({ role: 'RESTAURANT_OWNER' })).token);
        expect((await owner.post('/api/orders/preview', { restaurantId: shop.restaurant.id, items: [] })).status).toBe(403);
    });
});

describe('GET /orders, GET /orders/:id', () => {
    test('chỉ thấy đơn của mình, mới nhất trước, lọc theo trạng thái', async () => {
        const body = { restaurantId: shop.restaurant.id, items: [{ menuItemId: shop.rice.id, qty: 1 }], delivery };
        const first = (await customer.post('/api/orders', body, newKey())).body.data;
        const second = (await customer.post('/api/orders', body, newKey())).body.data;
        await customer.post(`/api/orders/${first.id}/cancel`);

        const stranger = as((await createUserAndLogin()).token);
        await stranger.post('/api/orders', body, newKey());

        const list = await customer.get('/api/orders');
        expect(list.body.data.total).toBe(2);
        expect(list.body.data.items.map((o) => o.id)).toEqual([second.id, first.id]);

        const placed = await customer.get('/api/orders?status=PLACED');
        expect(placed.body.data.items.map((o) => o.id)).toEqual([second.id]);

        expect((await customer.get(`/api/orders/${first.id}`)).body.data.status).toBe('CANCELLED');
        expect((await stranger.get(`/api/orders/${first.id}`)).status).toBe(404);
        expect((await customer.get('/api/orders?status=WRONG')).status).toBe(400);
    });
});

describe('POST /orders/:id/cancel', () => {
    test('khách hủy khi còn PLACED: hoàn suất, ghi lịch sử; hủy lần 2 -> 409', async () => {
        const order = (
            await customer.post(
                '/api/orders',
                { restaurantId: shop.restaurant.id, items: [{ menuItemId: shop.rice.id, qty: 3 }], delivery },
                newKey()
            )
        ).body.data;
        expect((await MenuItem.findById(shop.rice._id)).soldToday).toBe(3);

        const res = await customer.post(`/api/orders/${order.id}/cancel`, { note: 'Đặt nhầm' });
        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ status: 'CANCELLED', cancelReason: { code: 'CUSTOMER_CHANGED_MIND', note: 'Đặt nhầm' } });
        expect(res.body.data.statusHistory.at(-1)).toMatchObject({ from: 'PLACED', to: 'CANCELLED', actorType: 'CUSTOMER' });
        expect(await MenuItem.findById(shop.rice._id)).toMatchObject({ soldToday: 0, soldCount: 0 });

        const again = await customer.post(`/api/orders/${order.id}/cancel`);
        expect(again.status).toBe(409);
        expect(again.body.code).toBe('INVALID_STATUS_TRANSITION');
    });

    test('không hủy được khi quán đã nhận; không hủy được đơn của người khác', async () => {
        const order = (
            await customer.post(
                '/api/orders',
                { restaurantId: shop.restaurant.id, items: [{ menuItemId: shop.rice.id, qty: 1 }], delivery },
                newKey()
            )
        ).body.data;

        const stranger = as((await createUserAndLogin()).token);
        expect((await stranger.post(`/api/orders/${order.id}/cancel`)).status).toBe(404);

        await Order.updateOne({ _id: order.id }, { status: 'ACCEPTED' });
        expect((await customer.post(`/api/orders/${order.id}/cancel`)).status).toBe(409);
        expect((await MenuItem.findById(shop.rice._id)).soldToday).toBe(1);
    });
});
