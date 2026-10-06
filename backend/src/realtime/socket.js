const { Server } = require('socket.io');

const { verifyToken } = require('../middlewares/auth.middleware');
const Restaurant = require('../modules/restaurant/restaurant.model');

// Realtime (docs/API.md mục 3): client KHÔNG emit thay đổi dữ liệu — mọi thay đổi đi qua REST,
// socket chỉ đẩy thông báo. Chưa khởi tạo (vd khi chạy test với supertest) thì các hàm emit không làm gì.
let io = null;

const rooms = {
    user: (id) => `user:${id}`,
    restaurant: (id) => `restaurant:${id}`,
    admin: 'admin'
};

const initSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173' }
    });

    // Xác thực bằng cùng logic với REST: io(url, { auth: { token } })
    io.use(async (socket, next) => {
        try {
            socket.data.user = await verifyToken(socket.handshake.auth?.token);
            next();
        } catch (error) {
            const err = new Error(error.message || 'Unauthorized');
            err.data = { code: error.code || 'UNAUTHORIZED' };
            next(err);
        }
    });

    io.on('connection', async (socket) => {
        const { userId, role } = socket.data.user;
        socket.join(rooms.user(userId));

        if (role === 'ADMIN') {
            socket.join(rooms.admin);
        }

        // Chủ quán: vào phòng của quán mình (tạo quán sau khi kết nối thì kết nối lại là được)
        if (role === 'RESTAURANT_OWNER') {
            const restaurant = await Restaurant.findOne({ owner: userId }).select('_id').lean();
            if (restaurant) {
                socket.join(rooms.restaurant(restaurant._id));
            }
        }

        socket.emit('ready', { rooms: [...socket.rooms].filter((r) => r !== socket.id) });
    });

    return io;
};

const emit = (room, event, payload) => {
    if (io) {
        io.to(room).emit(event, payload);
    }
};

// Đơn mới -> trang quán kêu chuông
const emitOrderNew = (order) =>
    emit(rooms.restaurant(order.restaurant), 'order:new', {
        orderId: String(order._id),
        code: order.code,
        total: order.total,
        itemsCount: order.items.reduce((s, l) => s + l.qty, 0),
        fulfillmentType: order.fulfillmentType,
        placedAt: order.placedAt
    });

// Mọi lần đổi trạng thái (kể cả SYSTEM hủy do quá giờ) -> khách + quán
const emitOrderStatusChanged = (order) => {
    const last = order.statusHistory[order.statusHistory.length - 1];
    const payload = {
        orderId: String(order._id),
        code: order.code,
        from: last?.from,
        to: order.status,
        actorType: last?.actorType,
        reason: last?.reason,
        at: last?.at
    };

    emit(rooms.user(order.customer), 'order:status_changed', payload);
    emit(rooms.restaurant(order.restaurant), 'order:status_changed', payload);
};

// Admin duyệt / từ chối / khóa quán -> chủ quán
const emitRestaurantStatusChanged = (restaurant) => {
    const ownerId = restaurant.owner?._id ?? restaurant.owner;
    emit(rooms.user(ownerId), 'restaurant:status_changed', {
        restaurantId: String(restaurant._id),
        status: restaurant.status,
        rejectReason: restaurant.rejectReason
    });
};

const closeSocket = async () => {
    if (io) {
        await io.close();
        io = null;
    }
};

module.exports = {
    initSocket,
    closeSocket,
    emitOrderNew,
    emitOrderStatusChanged,
    emitRestaurantStatusChanged
};
