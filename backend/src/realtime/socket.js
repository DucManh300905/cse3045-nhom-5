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
    // Đơn trả trước chưa thanh toán (placedAt null) chưa tới quán
    if (order.placedAt) {
        emit(rooms.restaurant(order.restaurant), 'order:status_changed', payload);
    }
    // Tài xế đang nhận đơn này (vd quán hủy, khách / hệ thống đổi trạng thái)
    if (order.delivery?.shipperUser) {
        emit(rooms.user(order.delivery.shipperUser), 'order:status_changed', payload);
    }
};

// ======================= Tài xế MAK =======================

// Lời mời nhận đơn -> đúng một tài xế (đếm ngược 30 giây trên máy tài xế)
const emitDispatchOffer = (shipperUserId, payload) => emit(rooms.user(shipperUserId), 'dispatch:offer', payload);

// Lời mời / đơn bị thu hồi (hết giờ, đơn bị hủy, admin gán người khác...) -> tài xế
const emitDispatchCancelled = (shipperUserId, payload) => emit(rooms.user(shipperUserId), 'dispatch:cancelled', payload);

/**
 * Bước giao đổi (tìm tài xế, đã có tài xế, tới quán, lấy hàng, giao xong / thất bại)
 * -> khách, quán, tài xế đang nhận, admin (bảng điều phối)
 */
const emitDeliveryChanged = (order) => {
    const payload = {
        orderId: String(order._id),
        code: order.code,
        status: order.status,
        deliveryStatus: order.delivery?.status ?? null,
        shipper: order.delivery?.shipperSnapshot?.fullName ? order.delivery.shipperSnapshot : null
    };
    emit(rooms.user(order.customer), 'delivery:changed', payload);
    emit(rooms.restaurant(order.restaurant), 'delivery:changed', payload);
    if (order.delivery?.shipperUser) {
        emit(rooms.user(order.delivery.shipperUser), 'delivery:changed', payload);
    }
    emit(rooms.admin, 'delivery:changed', payload);
};

// Vị trí tài xế của đơn đang giao -> chỉ khách + quán của đúng đơn đó (BR-97)
const emitShipperLocation = (order, payload) => {
    const data = { orderId: String(order._id), ...payload };
    emit(rooms.user(order.customer), 'shipper:location', data);
    emit(rooms.restaurant(order.restaurant), 'shipper:location', data);
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

// Thông báo vừa lưu -> chuông của người nhận (mọi tab đang mở)
const emitNotification = (userId, notification) => emit(rooms.user(userId), 'notification:new', notification);

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
    emitDispatchOffer,
    emitDispatchCancelled,
    emitDeliveryChanged,
    emitShipperLocation,
    emitRestaurantStatusChanged,
    emitNotification
};
