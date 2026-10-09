const request = require('supertest');
const app = require('../../src/app');
const Restaurant = require('../../src/modules/restaurant/restaurant.model');
const MenuCategory = require('../../src/modules/menu/menuCategory.model');
const MenuItem = require('../../src/modules/menu/menuItem.model');
const { seedDemo, DISHES } = require('../../src/utils/seedDemo');
const { setupDatabase } = require('../helpers/db');
const { createUserAndLogin } = require('../helpers/auth');

setupDatabase();

const get = (url) => request(app).get(url);

const allDay = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, open: '00:00', close: '23:59' }));

// Thêm 1 quán chưa duyệt (DRAFT) có món, để kiểm tra khách không thấy
const createDraftRestaurantWithItem = async () => {
    const { token } = await createUserAndLogin({ role: 'RESTAURANT_OWNER' });
    const auth = (req) => req.set('Authorization', `Bearer ${token}`);

    const restaurant = (
        await auth(request(app).post('/api/merchant/restaurant')).send({ name: 'Quán Nháp', address: 'X', phone: '0912345678' })
    ).body.data;
    const category = (await auth(request(app).post('/api/merchant/categories')).send({ name: 'Món' })).body.data;
    await auth(request(app).post('/api/merchant/menu-items'))
        .send({ category: category.id, name: 'Món bí mật', basePrice: 1000 })
        .expect(201);

    return restaurant;
};

beforeEach(async () => {
    await seedDemo({ password: 'Test@1234' });
});

describe('seed:demo', () => {
    test('tạo 3 quán đã duyệt và 16 món; chạy lại không bị trùng', async () => {
        await seedDemo({ password: 'Test@1234' });

        expect(await Restaurant.countDocuments({ status: 'APPROVED' })).toBe(3);
        expect(await MenuItem.countDocuments()).toBe(DISHES.length);
        expect(await MenuCategory.countDocuments()).toBe(6);
    });

    test('tài khoản demo đăng nhập được', async () => {
        await request(app)
            .post('/api/auth/login')
            .send({ identifier: 'owner.quana@mak.com', password: 'Test@1234' })
            .expect(200);
    });
});

describe('GET /api/restaurants', () => {
    test('chỉ quán đã duyệt, không lộ field nội bộ', async () => {
        await createDraftRestaurantWithItem();

        const res = await get('/api/restaurants?sort=name');

        expect(res.status).toBe(200);
        expect(res.body.data.total).toBe(3);
        expect(res.body.data.items.map((r) => r.name)).toEqual(['Quán A', 'Quán B', 'Quán C']);

        const quanA = res.body.data.items[0];
        expect(quanA).toMatchObject({ slug: 'quan-a', minOrderAmount: 20000 });
        expect(quanA).not.toHaveProperty('deliveryFee');
        ['owner', 'documents', 'commissionRate', 'status', 'nameNoAccent', 'approvedBy', 'rejectReason'].forEach(
            (field) => expect(quanA).not.toHaveProperty(field)
        );
    });

    test('tìm không dấu, lọc loại ẩm thực', async () => {
        expect((await get('/api/restaurants?q=quan b')).body.data.items.map((r) => r.name)).toEqual(['Quán B']);
        expect((await get('/api/restaurants?q=Quán C')).body.data.items.map((r) => r.name)).toEqual(['Quán C']);
        expect((await get('/api/restaurants?cuisine=DO_UONG&sort=name')).body.data.items.map((r) => r.name)).toEqual([
            'Quán B',
            'Quán C'
        ]);
    });

    test('isOpen=true: chỉ quán đang bật nhận đơn và trong giờ mở cửa', async () => {
        await Restaurant.updateOne({ slug: 'quan-a' }, { openingHours: allDay });
        await Restaurant.updateOne({ slug: 'quan-b' }, { openingHours: allDay, isAcceptingOrders: false });
        await Restaurant.updateOne({ slug: 'quan-c' }, { openingHours: [] });

        const res = await get('/api/restaurants?isOpen=true');

        expect(res.body.data.items.map((r) => r.name)).toEqual(['Quán A']);
        expect(res.body.data.items[0]).toMatchObject({ isOpenNow: true, canAcceptOrders: true });
    });

    test('400 khi sort / isOpen sai', async () => {
        expect((await get('/api/restaurants?sort=distance')).status).toBe(400);
        expect((await get('/api/restaurants?isOpen=yes')).status).toBe(400);
    });
});

describe('GET /api/restaurants/:idOrSlug và /menu', () => {
    test('xem quán bằng slug hoặc id', async () => {
        const bySlug = await get('/api/restaurants/quan-a');
        expect(bySlug.status).toBe(200);

        const byId = await get(`/api/restaurants/${bySlug.body.data.id}`);
        expect(byId.body.data.name).toBe('Quán A');
    });

    test('404 với quán chưa duyệt hoặc không tồn tại', async () => {
        const draft = await createDraftRestaurantWithItem();

        expect((await get(`/api/restaurants/${draft.id}`)).status).toBe(404);
        expect((await get(`/api/restaurants/${draft.id}/menu`)).status).toBe(404);
        expect((await get('/api/restaurants/khong-co')).status).toBe(404);
    });

    test('menu theo danh mục; món hết hàng vẫn hiện với isOrderable=false', async () => {
        const res = await get('/api/restaurants/quan-b/menu');

        expect(res.status).toBe(200);
        expect(res.body.data.restaurant.name).toBe('Quán B');
        expect(res.body.data.categories.map((c) => c.name)).toEqual(['Món ăn', 'Đồ uống']);

        const items = res.body.data.categories.flatMap((c) => c.items);
        expect(items).toHaveLength(DISHES.filter((d) => d.shop === 'b').length);

        const soldOut = items.find((i) => i.name === 'Mì xào bò');
        expect(soldOut).toMatchObject({ remainingToday: 0, isOrderable: false });
        // Không lộ số liệu nội bộ
        expect(soldOut).not.toHaveProperty('soldToday');
        expect(soldOut).not.toHaveProperty('dailyLimit');
        expect(soldOut).not.toHaveProperty('isDeleted');
    });

    test('danh mục bị ẩn và món đã xóa không hiện', async () => {
        await MenuCategory.updateOne({ name: 'Đồ uống', restaurant: (await Restaurant.findOne({ slug: 'quan-b' }))._id }, { isActive: false });
        await MenuItem.updateOne({ name: 'Phở bò tái' }, { isDeleted: true });

        const res = await get('/api/restaurants/quan-b/menu');

        expect(res.body.data.categories.map((c) => c.name)).toEqual(['Món ăn']);
        expect(res.body.data.categories[0].items.map((i) => i.name)).not.toContain('Phở bò tái');
    });
});

describe('GET /api/menu-items', () => {
    test('mặc định sắp theo bán chạy, kèm thông tin quán', async () => {
        const res = await get('/api/menu-items?limit=3');

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ total: DISHES.length, limit: 3 });
        expect(res.body.data.items.map((i) => i.name)).toEqual(['Trà sữa trân châu', 'Bánh mì thịt nướng', 'Trà chanh']);
        expect(res.body.data.items[0].restaurant).toMatchObject({ name: 'Quán C', slug: 'quan-c' });
        expect(res.body.data.items[0].restaurant).not.toHaveProperty('openingHours');
    });

    test('tìm không dấu, lọc loại, lọc quán, sắp theo giá', async () => {
        expect((await get('/api/menu-items?q=com ga')).body.data.items.map((i) => i.name)).toEqual(['Cơm gà rau củ']);

        const drinks = (await get('/api/menu-items?type=DRINK&sort=price&limit=100')).body.data.items;
        expect(drinks.every((i) => i.type === 'DRINK')).toBe(true);
        expect(drinks.map((i) => i.basePrice)).toEqual([...drinks.map((i) => i.basePrice)].sort((a, b) => a - b));

        const quanA = (await get('/api/restaurants/quan-a')).body.data.id;
        const items = (await get(`/api/menu-items?restaurant=${quanA}&limit=100`)).body.data.items;
        expect(items).toHaveLength(DISHES.filter((d) => d.shop === 'a').length);
        expect(items.every((i) => i.restaurant.name === 'Quán A')).toBe(true);
    });

    test('inStock=true bỏ món hết suất và món tắt bán', async () => {
        await MenuItem.updateOne({ name: 'Trà chanh' }, { isAvailable: false });

        const names = (await get('/api/menu-items?inStock=true&limit=100')).body.data.items.map((i) => i.name);

        expect(names).not.toContain('Mì xào bò'); // dailyLimit 0
        expect(names).not.toContain('Trà chanh'); // tắt bán
        expect(names).toHaveLength(DISHES.length - 2);
    });

    test('không hiện món của quán chưa duyệt / bị khóa / danh mục ẩn', async () => {
        await createDraftRestaurantWithItem();
        await Restaurant.updateOne({ slug: 'quan-c' }, { status: 'BLOCKED' });

        const names = (await get('/api/menu-items?limit=100')).body.data.items.map((i) => i.name);

        expect(names).not.toContain('Món bí mật');
        expect(names).not.toContain('Trà sữa trân châu');
        expect(names).toHaveLength(DISHES.filter((d) => d.shop !== 'c').length);
    });

    test('chi tiết món có biến thể và topping', async () => {
        const id = (await get('/api/menu-items?q=tra sua')).body.data.items[0].id;

        const res = await get(`/api/menu-items/${id}`);

        expect(res.status).toBe(200);
        expect(res.body.data.variants.map((v) => v.name)).toEqual(['M', 'L']);
        expect(res.body.data.optionGroups.map((g) => g.name)).toEqual(['Mức đường', 'Topping']);
        expect(res.body.data.restaurant.name).toBe('Quán C');
    });

    test('404 chi tiết món của quán bị khóa; 400 khi tham số sai', async () => {
        const id = (await get('/api/menu-items?q=tra sua')).body.data.items[0].id;
        await Restaurant.updateOne({ slug: 'quan-c' }, { status: 'BLOCKED' });

        expect((await get(`/api/menu-items/${id}`)).status).toBe(404);
        expect((await get('/api/menu-items/abc')).status).toBe(400);
        expect((await get('/api/menu-items?type=SNACK')).status).toBe(400);
        expect((await get('/api/menu-items?restaurant=abc')).status).toBe(400);
    });
});
