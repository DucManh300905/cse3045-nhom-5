const request = require('supertest');
const app = require('../../src/app');
const Restaurant = require('../../src/modules/restaurant/restaurant.model');
const MenuCategory = require('../../src/modules/menu/menuCategory.model');
const MenuItem = require('../../src/modules/menu/menuItem.model');
const { createUserAndLogin } = require('./auth');

// Dữ liệu dùng chung cho test đơn hàng (khách đặt, quán xử lý)

const allDay = Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, open: '00:00', close: '23:59' }));

let keySeq = 0;
const newKey = () => `key-${Date.now()}-${(keySeq += 1)}`;

const as = (token) => ({
    get: (url) => request(app).get(url).set('Authorization', `Bearer ${token}`),
    patch: (url, body = {}) => request(app).patch(url).set('Authorization', `Bearer ${token}`).send(body),
    post: (url, body = {}, key) => {
        const req = request(app).post(url).set('Authorization', `Bearer ${token}`);
        return (key ? req.set('Idempotency-Key', key) : req).send(body);
    }
});

let shopSeq = 0;

// Quán đã duyệt, đang nhận đơn: đơn tối thiểu 20k (không có phí giao)
const createShop = async ({ name = 'Quán Test', ...overrides } = {}) => {
    const { user, token: ownerToken } = await createUserAndLogin({ role: 'RESTAURANT_OWNER' });
    const restaurant = await Restaurant.create({
        owner: user.id,
        name,
        // Slug không dấu, không trùng (dùng được trực tiếp trong URL)
        slug: `shop-${Date.now()}-${(shopSeq += 1)}`,
        address: 'Hòa Lạc',
        phone: '0912345678',
        status: 'APPROVED',
        isAcceptingOrders: true,
        openingHours: allDay,
        minOrderAmount: 20000,
        commissionRate: 0.1,
        ...overrides
    });
    const category = await MenuCategory.create({ restaurant: restaurant._id, name: 'Món' });

    const rice = await MenuItem.create({
        restaurant: restaurant._id,
        category: category._id,
        name: 'Cơm gà',
        basePrice: 35000,
        dailyLimit: 10
    });
    const tea = await MenuItem.create({
        restaurant: restaurant._id,
        category: category._id,
        name: 'Trà sữa',
        type: 'DRINK',
        variants: [
            { name: 'M', price: 25000, isDefault: true },
            { name: 'L', price: 32000 }
        ],
        optionGroups: [
            { name: 'Đường', minSelect: 1, maxSelect: 1, options: [{ name: '50%', price: 0 }, { name: '100%', price: 0 }] },
            {
                name: 'Topping',
                minSelect: 0,
                maxSelect: 2,
                options: [
                    { name: 'Trân châu', price: 5000 },
                    { name: 'Pudding', price: 7000 },
                    { name: 'Thạch', price: 4000 }
                ]
            }
        ]
    });

    return { restaurant, category, rice, tea, ownerToken };
};

const teaLine = (tea, { size = 'L', toppings = ['Trân châu'], sugar = '50%', qty = 1 } = {}) => ({
    menuItemId: tea.id,
    variantId: tea.variants.find((v) => v.name === size).id,
    optionIds: [
        tea.optionGroups[0].options.find((o) => o.name === sugar).id,
        ...toppings.map((t) => tea.optionGroups[1].options.find((o) => o.name === t).id)
    ],
    qty
});

const delivery = { receiverName: 'Khách A', phone: '0987654321', addressLine: 'KTX ĐH Việt Nhật' };

// Đặt nhanh 1 đơn cơm gà (mặc định giao tận nơi)
const placeOrder = async (customer, shop, { qty = 1, fulfillmentType = 'DELIVERY' } = {}) => {
    const res = await customer.post(
        '/api/orders',
        {
            restaurantId: shop.restaurant.id,
            items: [{ menuItemId: shop.rice.id, qty: Math.max(qty, 1) }],
            fulfillmentType,
            ...(fulfillmentType === 'DELIVERY' && { delivery })
        },
        newKey()
    );
    expect(res.status).toBe(201);
    return res.body.data;
};

module.exports = {
    allDay,
    newKey,
    as,
    createShop,
    teaLine,
    delivery,
    placeOrder
};
