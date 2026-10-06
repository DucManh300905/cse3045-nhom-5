const request = require('supertest');
const app = require('../../src/app');
const AuditLog = require('../../src/modules/audit/auditLog.model');
const MenuItem = require('../../src/modules/menu/menuItem.model');
const Restaurant = require('../../src/modules/restaurant/restaurant.model');
const { setupDatabase } = require('../helpers/db');
const { createUserAndLogin } = require('../helpers/auth');

setupDatabase();

const CATEGORIES = '/api/merchant/categories';
const ITEMS = '/api/merchant/menu-items';

const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64'
);

const as = (token) => {
    const send = (method) => (url, body) => request(app)[method](url).set('Authorization', `Bearer ${token}`).send(body);
    return { get: send('get'), post: send('post'), put: send('put'), patch: send('patch'), delete: send('delete'), token };
};

// Chủ quán có sẵn quán (DRAFT)
const createOwner = async (name = 'Quán A') => {
    const owner = as((await createUserAndLogin({ role: 'RESTAURANT_OWNER' })).token);
    await owner.post('/api/merchant/restaurant', { name, address: 'Hòa Lạc', phone: '0912345678' }).expect(201);
    return owner;
};

const milkTea = (category, overrides = {}) => ({
    category,
    name: 'Trà sữa trân châu',
    type: 'DRINK',
    variants: [
        { name: 'M', price: 25000 },
        { name: 'L', price: 32000, isDefault: true }
    ],
    optionGroups: [
        {
            name: 'Mức đường',
            minSelect: 1,
            maxSelect: 1,
            options: [
                { name: '50%', price: 0 },
                { name: '100%', price: 0 }
            ]
        },
        {
            name: 'Topping',
            minSelect: 0,
            maxSelect: 2,
            options: [
                { name: 'Trân châu', price: 5000 },
                { name: 'Thạch', price: 5000 },
                { name: 'Pudding', price: 7000 }
            ]
        }
    ],
    ...overrides
});

let owner;
let categoryId;

beforeEach(async () => {
    owner = await createOwner();
    categoryId = (await owner.post(CATEGORIES, { name: 'Đồ uống' }).expect(201)).body.data.id;
});

describe('Danh mục /api/merchant/categories', () => {
    test('tạo danh mục: thêm vào cuối, đếm số món', async () => {
        const second = await owner.post(CATEGORIES, { name: 'Cơm' });
        expect(second.status).toBe(201);
        expect(second.body.data.sortOrder).toBe(1);

        await owner.post(ITEMS, { category: categoryId, name: 'Trà chanh', basePrice: 15000 }).expect(201);

        const list = await owner.get(CATEGORIES);
        expect(list.body.data.map((c) => [c.name, c.itemCount])).toEqual([
            ['Đồ uống', 1],
            ['Cơm', 0]
        ]);
    });

    test('409 khi trùng tên trong cùng quán (không phân biệt hoa thường)', async () => {
        const res = await owner.post(CATEGORIES, { name: 'ĐỒ UỐNG' });

        expect(res.status).toBe(409);
        expect(res.body.code).toBe('DUPLICATE');
    });

    test('quán khác được dùng trùng tên danh mục', async () => {
        const other = await createOwner('Quán B');

        expect((await other.post(CATEGORIES, { name: 'Đồ uống' })).status).toBe(201);
    });

    test('đổi tên, ẩn danh mục', async () => {
        const res = await owner.put(`${CATEGORIES}/${categoryId}`, { name: 'Nước', isActive: false });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ name: 'Nước', isActive: false });
    });

    test('sắp xếp lại thứ tự', async () => {
        const rice = (await owner.post(CATEGORIES, { name: 'Cơm' })).body.data.id;

        const res = await owner.patch(`${CATEGORIES}/reorder`, { ids: [rice, categoryId] });

        expect(res.status).toBe(200);
        expect(res.body.data.map((c) => c.name)).toEqual(['Cơm', 'Đồ uống']);
    });

    test('400 khi reorder thiếu hoặc lặp danh mục', async () => {
        await owner.post(CATEGORIES, { name: 'Cơm' });

        expect((await owner.patch(`${CATEGORIES}/reorder`, { ids: [categoryId] })).status).toBe(400);
        expect((await owner.patch(`${CATEGORIES}/reorder`, { ids: [categoryId, categoryId] })).status).toBe(400);
    });

    test('409 khi xóa danh mục còn món; xóa được khi món đã bị xóa', async () => {
        const item = (await owner.post(ITEMS, { category: categoryId, name: 'Trà chanh', basePrice: 15000 })).body.data;

        expect((await owner.delete(`${CATEGORIES}/${categoryId}`)).body.code).toBe('CATEGORY_NOT_EMPTY');

        await owner.delete(`${ITEMS}/${item.id}`).expect(200);
        expect((await owner.delete(`${CATEGORIES}/${categoryId}`)).status).toBe(200);
    });
});

describe('Tạo món /api/merchant/menu-items', () => {
    test('món có biến thể + topping: basePrice theo biến thể mặc định', async () => {
        const res = await owner.post(ITEMS, milkTea(categoryId, { dailyLimit: 50 }));

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({
            name: 'Trà sữa trân châu',
            type: 'DRINK',
            basePrice: 32000,
            dailyLimit: 50,
            remainingToday: 50,
            isOrderable: true
        });
        expect(res.body.data.variants.map((v) => [v.name, v.isDefault])).toEqual([
            ['M', false],
            ['L', true]
        ]);
        expect(res.body.data.variants[0].id).toBeDefined();
        expect(res.body.data.optionGroups[1].options).toHaveLength(3);
        expect(res.body.data).not.toHaveProperty('nameNoAccent');
        expect(res.body.data).not.toHaveProperty('isDeleted');
    });

    test('400 khi món không có biến thể mà thiếu basePrice', async () => {
        const res = await owner.post(ITEMS, { category: categoryId, name: 'Trà chanh' });

        expect(res.status).toBe(400);
        expect(res.body.message).toBe('basePrice is required when there are no variants');
    });

    test.each([
        ['giá lẻ (BR-21)', { basePrice: 15000.5 }],
        ['giá âm', { basePrice: -1 }],
        ['type sai', { basePrice: 1000, type: 'SNACK' }],
        ['thiếu tên', { basePrice: 1000, name: '' }],
        ['dailyLimit âm', { basePrice: 1000, dailyLimit: -5 }]
    ])('400 khi %s', async (_, overrides) => {
        const res = await owner.post(ITEMS, { category: categoryId, name: 'Món', ...overrides });

        expect(res.status).toBe(400);
    });

    test.each([
        ['minSelect > maxSelect', { minSelect: 2, maxSelect: 1 }],
        ['maxSelect > số lựa chọn', { minSelect: 0, maxSelect: 5 }]
    ])('400 khi nhóm topping có %s (BR-22)', async (_, limits) => {
        const res = await owner.post(
            ITEMS,
            milkTea(categoryId, {
                optionGroups: [{ name: 'Topping', ...limits, options: [{ name: 'A', price: 0 }, { name: 'B', price: 0 }] }]
            })
        );

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    test('422 khi danh mục thuộc quán khác (BR-20)', async () => {
        const other = await createOwner('Quán B');
        const otherCategory = (await other.post(CATEGORIES, { name: 'Cơm' })).body.data.id;

        const res = await owner.post(ITEMS, { category: otherCategory, name: 'Món', basePrice: 1000 });

        expect(res.status).toBe(422);
        expect(res.body.code).toBe('INVALID_CATEGORY');
    });
});

describe('Sửa / xem / xóa món', () => {
    let item;

    beforeEach(async () => {
        item = (await owner.post(ITEMS, milkTea(categoryId))).body.data;
    });

    test('giữ nguyên id biến thể/topping khi gửi kèm id', async () => {
        const [m, l] = item.variants;
        const topping = item.optionGroups[1];

        const res = await owner.put(`${ITEMS}/${item.id}`, {
            variants: [
                { id: m.id, name: 'M', price: 26000 },
                { id: l.id, name: 'L', price: 33000, isDefault: true },
                { name: 'XL', price: 38000 }
            ],
            optionGroups: [{ ...topping, options: topping.options.slice(0, 2) }]
        });

        expect(res.status).toBe(200);
        expect(res.body.data.variants.map((v) => v.id).slice(0, 2)).toEqual([m.id, l.id]);
        expect(res.body.data.basePrice).toBe(33000);
        expect(res.body.data.optionGroups[0].id).toBe(topping.id);
        expect(res.body.data.optionGroups[0].options.map((o) => o.id)).toEqual(
            topping.options.slice(0, 2).map((o) => o.id)
        );
    });

    test('đổi giá thì ghi audit log MENU_PRICE_CHANGE, đổi tên thì không', async () => {
        await owner.put(`${ITEMS}/${item.id}`, { name: 'Trà sữa' }).expect(200);
        expect(await AuditLog.countDocuments({ action: 'MENU_PRICE_CHANGE' })).toBe(0);

        await owner
            .put(`${ITEMS}/${item.id}`, { variants: [{ name: 'M', price: 30000 }] })
            .expect(200);

        const log = await AuditLog.findOne({ action: 'MENU_PRICE_CHANGE' });
        expect(log).toMatchObject({ actorRole: 'RESTAURANT_OWNER' });
        expect(log.before.basePrice).toBe(32000);
        expect(log.after.basePrice).toBe(30000);
    });

    test('chuyển danh mục: xuống cuối danh mục mới', async () => {
        const rice = (await owner.post(CATEGORIES, { name: 'Cơm' })).body.data.id;
        await owner.post(ITEMS, { category: rice, name: 'Cơm gà', basePrice: 35000 }).expect(201);

        const res = await owner.put(`${ITEMS}/${item.id}`, { category: rice });

        expect(res.body.data).toMatchObject({ category: rice, sortOrder: 1 });
    });

    test('bật/tắt hết món và giới hạn suất', async () => {
        const off = await owner.patch(`${ITEMS}/${item.id}/availability`, { isAvailable: false });
        expect(off.body.data).toMatchObject({ isAvailable: false, isOrderable: false });

        await owner.patch(`${ITEMS}/${item.id}/availability`, { isAvailable: true, dailyLimit: 5 }).expect(200);
        await MenuItem.updateOne({ _id: item.id }, { soldToday: 5 });
        const soldOut = await owner.get(`${ITEMS}/${item.id}`);
        expect(soldOut.body.data).toMatchObject({ remainingToday: 0, isOrderable: false });

        const unlimited = await owner.patch(`${ITEMS}/${item.id}/availability`, { dailyLimit: null });
        expect(unlimited.body.data).toMatchObject({ dailyLimit: null, remainingToday: null, isOrderable: true });
    });

    test('upload ảnh món', async () => {
        const res = await request(app)
            .post(`${ITEMS}/${item.id}/image`)
            .set('Authorization', `Bearer ${owner.token}`)
            .attach('image', PNG, { filename: 'tra-sua.png', contentType: 'image/png' });

        expect(res.status).toBe(200);
        expect(res.body.data.imageUrl).toMatch(/^\/uploads\/menu-items\/.+\.png$/);
        await request(app).get(res.body.data.imageUrl).expect(200);
    });

    test('xóa mềm: không còn trong danh sách nhưng vẫn còn trong DB (BR-24)', async () => {
        await owner.delete(`${ITEMS}/${item.id}`).expect(200);

        expect((await owner.get(ITEMS)).body.data).toHaveLength(0);
        expect((await owner.get(`${ITEMS}/${item.id}`)).status).toBe(404);
        expect(await MenuItem.findById(item.id)).toMatchObject({ isDeleted: true });
    });

    test('danh sách: lọc theo danh mục, tìm không dấu, sắp theo thứ tự danh mục', async () => {
        const rice = (await owner.post(CATEGORIES, { name: 'Cơm' })).body.data.id;
        await owner.post(ITEMS, { category: rice, name: 'Cơm gà xối mỡ', basePrice: 35000 }).expect(201);
        await owner.patch(`${CATEGORIES}/reorder`, { ids: [rice, categoryId] }).expect(200);

        expect((await owner.get(ITEMS)).body.data.map((i) => i.name)).toEqual(['Cơm gà xối mỡ', 'Trà sữa trân châu']);
        expect((await owner.get(`${ITEMS}?q=com ga`)).body.data.map((i) => i.name)).toEqual(['Cơm gà xối mỡ']);
        expect((await owner.get(`${ITEMS}?category=${categoryId}`)).body.data).toHaveLength(1);
    });
});

describe('Phân quyền menu', () => {
    test('chủ quán khác không xem/sửa/xóa được món và danh mục', async () => {
        const item = (await owner.post(ITEMS, milkTea(categoryId))).body.data;
        const other = await createOwner('Quán B');

        expect((await other.get(`${ITEMS}/${item.id}`)).status).toBe(404);
        expect((await other.put(`${ITEMS}/${item.id}`, { name: 'hack' })).status).toBe(404);
        expect((await other.patch(`${ITEMS}/${item.id}/availability`, { isAvailable: false })).status).toBe(404);
        expect((await other.delete(`${ITEMS}/${item.id}`)).status).toBe(404);
        expect((await other.put(`${CATEGORIES}/${categoryId}`, { name: 'hack' })).status).toBe(404);
        expect((await other.delete(`${CATEGORIES}/${categoryId}`)).status).toBe(404);
        expect((await other.get(ITEMS)).body.data).toHaveLength(0);
    });

    test('khách hàng không gọi được; chủ quán chưa tạo quán nhận 404', async () => {
        const customer = as((await createUserAndLogin()).token);
        const newOwner = as((await createUserAndLogin({ role: 'RESTAURANT_OWNER' })).token);

        expect((await customer.get(CATEGORIES)).status).toBe(403);
        expect((await newOwner.get(CATEGORIES)).status).toBe(404);
    });

    test('quán bị khóa: xem được nhưng không sửa được menu', async () => {
        await Restaurant.updateMany({}, { status: 'BLOCKED' });

        expect((await owner.get(CATEGORIES)).status).toBe(200);
        expect((await owner.post(CATEGORIES, { name: 'Mới' })).body.code).toBe('RESTAURANT_BLOCKED');
        expect((await owner.post(ITEMS, milkTea(categoryId))).body.code).toBe('RESTAURANT_BLOCKED');
    });
});
