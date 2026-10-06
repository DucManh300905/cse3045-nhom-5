// Dữ liệu demo: 3 quán đã duyệt + 16 món (chép từ frontend/src/data/menu.ts)
// Chạy: npm run seed:demo — chạy lại nhiều lần được: menu của các quán demo được tạo lại từ đầu.
// Tài khoản: owner.quana@mak.com / owner.quanb@mak.com / owner.quanc@mak.com / khach@mak.com
// Mật khẩu: DEMO_PASSWORD trong .env (mặc định Demo@123)
const bcrypt = require('bcryptjs');

const User = require('../modules/user/user.model');
const Restaurant = require('../modules/restaurant/restaurant.model');
const MenuCategory = require('../modules/menu/menuCategory.model');
const MenuItem = require('../modules/menu/menuItem.model');

const img = (id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=640&q=75`;

const SHOPS = [
    { key: 'a', name: 'Quán A', phone: '0911000001', closesAt: '17:59', cuisineTypes: ['COM', 'BANH_MI'] },
    { key: 'b', name: 'Quán B', phone: '0911000002', closesAt: '20:00', cuisineTypes: ['BUN_PHO', 'DO_UONG'] },
    { key: 'c', name: 'Quán C', phone: '0911000003', closesAt: '21:00', cuisineTypes: ['AN_VAT', 'DO_UONG'] }
];

// stock -> dailyLimit, popularity -> soldCount
const DISHES = [
    { name: 'Bánh mì thịt nướng', description: 'Bánh mì + thịt nướng + rau + đồ chua', price: 20000, type: 'FOOD', shop: 'a', stock: 10, prepMinutes: 10, image: img('photo-1600454309261-3dc9b7597637'), popularity: 98 },
    { name: 'Phở bò tái', description: 'Bánh phở + bò tái + hành lá + nước dùng hầm xương', price: 35000, type: 'FOOD', shop: 'b', stock: 20, prepMinutes: 15, image: img('photo-1582878826629-29b7ad1cdc43'), popularity: 96 },
    { name: 'Cơm rang hải sản', description: 'Cơm rang + tôm + mực + trứng + rau thơm', price: 32000, type: 'FOOD', shop: 'a', stock: 30, prepMinutes: 15, image: img('photo-1512058564366-18510be2db19'), popularity: 90 },
    { name: 'Gà rán giòn (2 miếng)', description: 'Đùi gà tẩm bột chiên giòn + tương ớt', price: 39000, type: 'FOOD', shop: 'c', stock: 15, prepMinutes: 15, image: img('photo-1626082927389-6cd097cdc6ec'), popularity: 94 },
    { name: 'Mì tôm trứng lòng đào', description: 'Mì + tôm + trứng lòng đào + đậu Hà Lan', price: 30000, type: 'FOOD', shop: 'b', stock: 25, prepMinutes: 12, image: img('photo-1569718212165-3a8278d5f624'), popularity: 88 },
    { name: 'Mì xào bò', description: 'Mì trứng xào + thịt bò + rau cải', price: 30000, type: 'FOOD', shop: 'b', stock: 0, prepMinutes: 12, image: img('photo-1585032226651-759b368d7246'), popularity: 80 },
    { name: 'Cơm gà rau củ', description: 'Cơm + ức gà áp chảo + đậu que + rau củ', price: 35000, type: 'FOOD', shop: 'a', stock: 12, prepMinutes: 15, image: img('photo-1547592180-85f173990554'), popularity: 84 },
    { name: 'Há cảo hấp (6 viên)', description: 'Há cảo nhân tôm thịt + nước chấm', price: 25000, type: 'FOOD', shop: 'c', stock: 18, prepMinutes: 10, image: img('photo-1563245372-f21724e3856d'), popularity: 82 },
    { name: 'Burger bò phô mai', description: 'Bánh burger + bò nướng + phô mai + rau', price: 45000, type: 'FOOD', shop: 'c', stock: 10, prepMinutes: 12, image: img('photo-1568901346375-23c9450c58cd'), popularity: 86 },
    { name: 'Khoai tây chiên', description: 'Khoai tây chiên giòn + sốt phô mai', price: 20000, type: 'FOOD', shop: 'c', stock: 40, prepMinutes: 8, image: img('photo-1573080496219-bb080dd4f877'), popularity: 85 },
    { name: 'Salad rau củ', description: 'Rau xanh + bơ + đậu gà + cà chua bi', price: 35000, type: 'FOOD', shop: 'a', stock: 8, prepMinutes: 8, image: img('photo-1512621776951-a57141f2eefd'), popularity: 70 },
    { name: 'Trà chanh', description: 'Trà xanh + chanh tươi + đá', price: 15000, type: 'DRINK', shop: 'a', stock: 50, prepMinutes: 5, image: img('photo-1556679343-c7306c1976bc'), popularity: 97 },
    { name: 'Cà phê sữa đá', description: 'Cà phê phin + sữa đặc + đá', price: 20000, type: 'DRINK', shop: 'b', stock: 40, prepMinutes: 5, image: img('photo-1461023058943-07fcbe16d735'), popularity: 95 },
    { name: 'Trà sữa trân châu', description: 'Trà đen + sữa + trân châu đường đen', price: 25000, type: 'DRINK', shop: 'c', stock: 30, prepMinutes: 5, image: img('photo-1558857563-b371033873b8'), popularity: 99 },
    { name: 'Soda chanh bạc hà', description: 'Soda + chanh + lá bạc hà + đá', price: 22000, type: 'DRINK', shop: 'c', stock: 20, prepMinutes: 5, image: img('photo-1551024709-8f23befc6f87'), popularity: 78 },
    { name: 'Sinh tố xoài', description: 'Xoài chín + sữa chua + đá xay', price: 25000, type: 'DRINK', shop: 'b', stock: 15, prepMinutes: 5, image: img('photo-1525385133512-2f3bdd039054'), popularity: 83 }
];

// Trà sữa có size + topping để demo biến thể / tùy chọn
const EXTRAS = {
    'Trà sữa trân châu': {
        variants: [
            { name: 'M', price: 25000, isDefault: true },
            { name: 'L', price: 32000 }
        ],
        optionGroups: [
            { name: 'Mức đường', minSelect: 1, maxSelect: 1, options: [{ name: '50%', price: 0 }, { name: '100%', price: 0 }] },
            { name: 'Topping', minSelect: 0, maxSelect: 2, options: [{ name: 'Trân châu', price: 5000 }, { name: 'Pudding', price: 7000 }] }
        ]
    }
};

const CATEGORY_NAMES = { FOOD: 'Món ăn', DRINK: 'Đồ uống' };

const upsertUser = async ({ email, fullName, phone, role }, passwordHash) => {
    const existing = await User.findOne({ email });

    if (existing) {
        return existing;
    }

    return User.create({ email, fullName, phone, role, password: passwordHash });
};

const seedDemo = async ({ password = process.env.DEMO_PASSWORD || 'Demo@123', log = () => {} } = {}) => {
    const passwordHash = await bcrypt.hash(password, 10);

    await upsertUser(
        { email: 'khach@mak.com', fullName: 'Khách Demo', phone: '0988000000', role: 'CUSTOMER' },
        passwordHash
    );

    const restaurants = [];

    for (const shop of SHOPS) {
        const owner = await upsertUser(
            { email: `owner.quan${shop.key}@mak.com`, fullName: `Chủ ${shop.name}`, phone: shop.phone, role: 'RESTAURANT_OWNER' },
            passwordHash
        );

        let restaurant = await Restaurant.findOne({ owner: owner._id });

        if (!restaurant) {
            restaurant = new Restaurant({ owner: owner._id, slug: `quan-${shop.key}` });
        }

        Object.assign(restaurant, {
            name: shop.name,
            description: `${shop.name} — quán ăn demo khu vực Hòa Lạc`,
            address: 'Khu Công nghệ cao Hòa Lạc, Thạch Thất, Hà Nội',
            phone: shop.phone,
            cuisineTypes: shop.cuisineTypes,
            status: 'APPROVED',
            approvedAt: restaurant.approvedAt || new Date(),
            submittedAt: restaurant.submittedAt || new Date(),
            isAcceptingOrders: true,
            openingHours: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, open: '06:00', close: shop.closesAt })),
            minOrderAmount: 20000
        });
        await restaurant.save();

        // Tạo lại menu demo từ đầu (chỉ dùng cho dữ liệu demo)
        await MenuItem.deleteMany({ restaurant: restaurant._id });
        await MenuCategory.deleteMany({ restaurant: restaurant._id });

        const dishes = DISHES.filter((d) => d.shop === shop.key);
        const types = [...new Set(dishes.map((d) => d.type))];
        const categories = await MenuCategory.create(
            types.map((type, sortOrder) => ({ restaurant: restaurant._id, name: CATEGORY_NAMES[type], sortOrder }))
        );
        const categoryByType = new Map(types.map((type, i) => [type, categories[i]._id]));

        await MenuItem.create(
            dishes.map((d, sortOrder) => ({
                restaurant: restaurant._id,
                category: categoryByType.get(d.type),
                name: d.name,
                description: d.description,
                imageUrl: d.image,
                type: d.type,
                basePrice: d.price,
                dailyLimit: d.stock,
                prepMinutes: d.prepMinutes,
                soldCount: d.popularity,
                sortOrder,
                ...EXTRAS[d.name]
            }))
        );

        restaurants.push(restaurant);
        log(`${shop.name}: ${dishes.length} món`);
    }

    return { restaurants };
};

if (require.main === module) {
    require('dotenv').config();
    require('../config/mongoose');
    const connectDatabase = require('../config/database');
    const mongoose = require('mongoose');

    (async () => {
        if (process.env.NODE_ENV === 'production') {
            console.error('Refusing to seed demo data in production');
            process.exit(1);
        }

        await connectDatabase();
        await seedDemo({ log: console.log });
        console.log('Demo data seeded. Password:', process.env.DEMO_PASSWORD ? '(DEMO_PASSWORD)' : 'Demo@123');
        await mongoose.disconnect();
    })().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}

module.exports = {
    seedDemo,
    DISHES,
    SHOPS
};
