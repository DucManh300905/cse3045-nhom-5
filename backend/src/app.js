// Phải nạp trước các route (route require model) để plugin toJSON áp dụng cho mọi schema
require('./config/mongoose');

const express = require('express');
const cors = require('cors');

const { notFound, errorHandler } = require('./middlewares/error.middleware');
const authRoutes = require('./modules/auth/auth.routes');
const userRoutes = require('./modules/user/user.routes');
const merchantRestaurantRoutes = require('./modules/restaurant/restaurant.merchant.routes');
const adminRoutes = require('./modules/admin/admin.routes');
const { categoryRouter, menuItemRouter } = require('./modules/menu/menu.merchant.routes');
const publicRoutes = require('./modules/public.routes');
const orderRoutes = require('./modules/order/order.routes');
const merchantOrderRoutes = require('./modules/order/order.merchant.routes');
const { PUBLIC_DIR, PUBLIC_URL_PREFIX } = require('./config/storage');

const app = express();

app.use(
    cors({
        origin: process.env.CLIENT_URL || 'http://localhost:5173'
    })
);
app.use(express.json());

// Ảnh quán/món (giấy tờ pháp lý nằm ở thư mục private, không public)
app.use(PUBLIC_URL_PREFIX, express.static(PUBLIC_DIR));

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Food Ordering Backend is running'
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
// Khách xem quán và món (không cần đăng nhập)
app.use('/api/restaurants', publicRoutes.restaurantRouter);
app.use('/api/menu-items', publicRoutes.menuItemRouter);
// Chủ quán quản lý quán của mình (trước đây là /api/restaurants/my-restaurant)
// Đơn của khách
app.use('/api/orders', orderRoutes);
app.use('/api/merchant/restaurant', merchantRestaurantRoutes);
app.use('/api/merchant/categories', categoryRouter);
app.use('/api/merchant/menu-items', menuItemRouter);
app.use('/api/merchant/orders', merchantOrderRoutes);
app.use('/api/admin', adminRoutes);

// 404 cho route không tồn tại
app.use(notFound);

// Xử lý lỗi chung (phải đặt cuối cùng)
app.use(errorHandler);

module.exports = app;
