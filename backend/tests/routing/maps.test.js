const request = require('supertest');
const app = require('../../src/app');
const Order = require('../../src/modules/order/order.model');
const Restaurant = require('../../src/modules/restaurant/restaurant.model');
const User = require('../../src/modules/user/user.model');
const RouteCache = require('../../src/modules/routing/routeCache.model');
const { haversineKm } = require('../../src/utils/geo');
const { setupDatabase } = require('../helpers/db');
const { createUserAndLogin } = require('../helpers/auth');
const { as, createShop, newKey, allDay } = require('../helpers/orders');

setupDatabase();

// Quán (helpers): 21.0136, 105.5254 · bán kính 5 km
const NEAR = { lat: 21.006, lng: 105.52 }; // ~1 km đường thẳng
const FAR = { lat: 21.1, lng: 105.52 }; // ~9,6 km đường thẳng

let shop;
let customer;

beforeEach(async () => {
    shop = await createShop();
    customer = as((await createUserAndLogin()).token);
});

afterEach(() => {
    jest.restoreAllMocks();
    delete process.env.GOONG_API_KEY;
});

const items = (s = shop) => [{ menuItemId: s.rice.id, qty: 1 }];
const deliveryAt = (p) => ({ receiverName: 'Khách', phone: '0987654321', addressLine: 'KTX', ...p });
const preview = (body) => customer.post('/api/orders/preview', { restaurantId: shop.restaurant.id, items: items(), ...body });
const place = (body) => customer.post('/api/orders', { restaurantId: shop.restaurant.id, items: items(), ...body }, newKey());

// Giả lập Goong Direction trả 2,4 km / 9 phút
const mockGoong = (payload = { routes: [{ legs: [{ distance: { value: 2400 }, duration: { value: 540 } }], overview_polyline: { points: 'abc' } }] }) => {
    process.env.GOONG_API_KEY = 'test-goong-key';
    return jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => payload });
};

describe('Khoảng cách ước lượng (chưa có khóa Goong)', () => {
    it('Haversine: 0,01 độ vĩ ≈ 1,11 km', () => {
        expect(haversineKm({ lat: 21, lng: 105 }, { lat: 21.01, lng: 105 })).toBeCloseTo(1.112, 2);
    });

    it('xem trước giao tận nơi có vị trí: quãng đường ước lượng (× 1,3) + thời gian dự kiến làm tròn 5 phút', async () => {
        const res = await preview({ fulfillmentType: 'DELIVERY', delivery: NEAR }).expect(200);
        const straight = haversineKm({ lat: 21.0136, lng: 105.5254 }, NEAR);
        expect(res.body.data.route).toMatchObject({ source: 'ESTIMATE', provider: 'estimate' });
        expect(res.body.data.route.distanceKm).toBeCloseTo(straight * 1.3, 1);
        expect(res.body.data.estimatedDeliveryMinutes % 5).toBe(0);
    });

    it('xem trước chưa ghim vị trí: vẫn tính tiền, route = null', async () => {
        const res = await preview({ fulfillmentType: 'DELIVERY' }).expect(200);
        expect(res.body.data.route).toBeNull();
    });
});

describe('Bắt buộc vị trí + bán kính giao (BR-81, BR-83)', () => {
    it('giao tận nơi không ghim vị trí -> 422 LOCATION_REQUIRED; tự đến lấy thì không cần', async () => {
        const res = await place({ fulfillmentType: 'DELIVERY', delivery: deliveryAt({}) });
        expect(res.status).toBe(422);
        expect(res.body.code).toBe('LOCATION_REQUIRED');
        await place({ fulfillmentType: 'PICKUP' }).expect(201);
    });

    it('ngoài bán kính giao -> 422 OUT_OF_DELIVERY_RANGE kèm quãng đường; cùng chỗ đó chọn tự lấy vẫn đặt được', async () => {
        const res = await place({ fulfillmentType: 'DELIVERY', delivery: deliveryAt(FAR) });
        expect(res.status).toBe(422);
        expect(res.body.code).toBe('OUT_OF_DELIVERY_RANGE');
        expect(res.body.errors[0]).toMatchObject({ maxKm: 5 });
        expect(res.body.errors[0].distanceKm).toBeGreaterThan(5);

        await place({ fulfillmentType: 'PICKUP', delivery: deliveryAt(FAR) }).expect(201);
    });

    it('trong bán kính: đơn lưu vị trí nơi nhận + tuyến đường + thời gian dự kiến', async () => {
        const res = await place({ fulfillmentType: 'DELIVERY', delivery: deliveryAt(NEAR) }).expect(201);
        const order = await Order.findById(res.body.data.id);
        expect(order.delivery.location.coordinates).toEqual([NEAR.lng, NEAR.lat]);
        expect(order.route).toMatchObject({ source: 'ESTIMATE' });
        expect(order.estimatedDeliveryMinutes).toBeGreaterThanOrEqual(15);
    });

    it('địa chỉ trong sổ chưa ghim: thiếu vị trí -> 422; gửi kèm vị trí -> đặt được và lưu luôn vào sổ', async () => {
        const address = (await customer.post('/api/users/me/addresses', { receiverName: 'B', phone: '0911222333', addressLine: 'Phòng 305' })).body.data;

        expect((await place({ fulfillmentType: 'DELIVERY', addressId: address.id })).body.code).toBe('LOCATION_REQUIRED');

        await place({ fulfillmentType: 'DELIVERY', addressId: address.id, delivery: NEAR }).expect(201);
        const user = await User.findOne({ 'addresses._id': address.id });
        expect(user.addresses.id(address.id).location.coordinates).toEqual([NEAR.lng, NEAR.lat]);
    });

    it('quán cũ chưa có vị trí: không kiểm tra bán kính (BR-80), vẫn nhận đơn', async () => {
        await Restaurant.updateOne({ _id: shop.restaurant.id }, { $unset: { location: 1 } });
        const res = await place({ fulfillmentType: 'DELIVERY', delivery: deliveryAt(FAR) }).expect(201);
        expect(res.body.data.route).toBeUndefined();
    });

    it('nộp hồ sơ quán khi chưa có vị trí -> 422 PROFILE_INCOMPLETE (location)', async () => {
        const { user, token } = await createUserAndLogin({ role: 'RESTAURANT_OWNER' });
        const doc = (type) => ({ type, fileKey: `documents/${type}.png`, originalName: `${type}.png`, mimeType: 'image/png' });
        await Restaurant.create({ owner: user.id, name: 'Quán Mới', address: 'Hòa Lạc', phone: '0912345678', openingHours: allDay, documents: [doc('BUSINESS_LICENSE'), doc('ID_CARD')] });

        const res = await as(token).post('/api/merchant/restaurant/submit');
        expect(res.status).toBe(422);
        expect(res.body.errors.map((e) => e.field)).toContain('location');
    });
});

describe('Đường đi thật qua Goong (giả lập)', () => {
    it('gọi Direction bằng xe máy, lưu bộ nhớ đệm: lần 2 không gọi lại', async () => {
        const fetchMock = mockGoong();

        const first = (await preview({ fulfillmentType: 'DELIVERY', delivery: NEAR }).expect(200)).body.data;
        expect(first.route).toMatchObject({ distanceKm: 2.4, durationMinutes: 9, source: 'ROUTING', provider: 'goong' });
        // 15' chuẩn bị + 9' đi -> làm tròn 25'
        expect(first.estimatedDeliveryMinutes).toBe(25);

        const url = new URL(String(fetchMock.mock.calls[0][0]));
        expect(url.pathname).toBe('/Direction');
        expect(url.searchParams.get('vehicle')).toBe('bike');
        expect(url.searchParams.get('api_key')).toBe('test-goong-key');

        await preview({ fulfillmentType: 'DELIVERY', delivery: NEAR }).expect(200);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(await RouteCache.countDocuments()).toBe(1);
    });

    it('Goong lỗi -> dùng ước lượng, vẫn đặt được đơn', async () => {
        process.env.GOONG_API_KEY = 'test-goong-key';
        jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
        jest.spyOn(console, 'warn').mockImplementation(() => {});

        const res = await place({ fulfillmentType: 'DELIVERY', delivery: deliveryAt(NEAR) }).expect(201);
        expect(res.body.data.route.source).toBe('ESTIMATE');
    });

    it('quãng đường thật vượt bán kính dù đường thẳng gần -> chặn', async () => {
        mockGoong({ routes: [{ legs: [{ distance: { value: 7800 }, duration: { value: 1500 } }] }] });
        const res = await place({ fulfillmentType: 'DELIVERY', delivery: deliveryAt(NEAR) });
        expect(res.body.code).toBe('OUT_OF_DELIVERY_RANGE');
        expect(res.body.errors[0].distanceKm).toBe(7.8);
    });
});

describe('Tra địa chỉ bằng chữ (/api/geo)', () => {
    it('chưa có khóa: status tắt tìm kiếm, gọi tìm -> 503', async () => {
        expect((await request(app).get('/api/geo/status')).body.data).toEqual({ search: false, routing: 'estimate' });
        const res = await customer.get('/api/geo/autocomplete?input=dai hoc');
        expect(res.status).toBe(503);
        expect(res.body.code).toBe('GEO_UNAVAILABLE');
    });

    it('có khóa: trả gợi ý + tọa độ; chưa đăng nhập -> 401', async () => {
        mockGoong({ status: 'OK', predictions: [{ place_id: 'p1', description: 'ĐH Việt Nhật, Hòa Lạc', structured_formatting: { main_text: 'ĐH Việt Nhật' } }] });
        expect((await request(app).get('/api/geo/autocomplete?input=dai hoc')).status).toBe(401);

        const res = await customer.get('/api/geo/autocomplete?input=dai hoc&lat=21.01&lng=105.52').expect(200);
        expect(res.body.data[0]).toMatchObject({ placeId: 'p1', description: 'ĐH Việt Nhật, Hòa Lạc', mainText: 'ĐH Việt Nhật' });
        expect((await request(app).get('/api/geo/status')).body.data.search).toBe(true);
    });
});

describe('Khoảng cách trên danh sách quán', () => {
    it('gửi lat/lng người xem -> distanceKm; không gửi -> không có', async () => {
        const withPos = (await request(app).get(`/api/restaurants?lat=${NEAR.lat}&lng=${NEAR.lng}`).expect(200)).body.data.items[0];
        expect(withPos.distanceKm).toBeGreaterThan(0);
        const without = (await request(app).get('/api/restaurants').expect(200)).body.data.items[0];
        expect(without.distanceKm).toBeUndefined();
    });
});
