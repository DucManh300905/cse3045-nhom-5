const express = require('express');
const cors = require('cors');

const authRoutes = require('./modules/auth/auth.routes');
const userRoutes = require('./modules/user/user.routes');
const restaurantRoutes = require('./modules/restaurant/restaurant.routes');

const app = express();

app.use(
    cors({
        origin: process.env.CLIENT_URL || 'http://localhost:5173'
    })
);
app.use(express.json());

app.get('/api/health', (req, res) => {
    res.json({
        success: true,
        message: 'Food Ordering Backend is running'
    });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/restaurants', restaurantRoutes);

// 404 cho route không tồn tại
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: 'Route not found'
    });
});

// Xử lý lỗi chung (phải đặt cuối cùng)
app.use((err, req, res, next) => {
    console.error(err);
    res.status(err.status || 500).json({
        success: false,
        message: err.status ? err.message : 'Internal server error'
    });
});

module.exports = app;
