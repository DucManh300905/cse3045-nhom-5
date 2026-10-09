const Notification = require('./notification.model');
const Restaurant = require('../restaurant/restaurant.model');
const User = require('../user/user.model');
const { emitNotification } = require('../../realtime/socket');
const { TIME_ZONE } = require('../../utils/openingHours');

// Tạo thông báo (lưu DB + đẩy realtime). Gọi SAU khi thao tác chính đã ghi xong;
// lỗi ở đây chỉ ghi log, không làm hỏng đơn / thao tác duyệt quán.

const vnd = new Intl.NumberFormat('vi-VN');
const money = (n) => `${vnd.format(n)} đ`;
const clock = (date) =>
    new Intl.DateTimeFormat('vi-VN', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(date);

const REASON_LABEL = {
    OUT_OF_STOCK: 'Hết món',
    OVERLOADED: 'Quán đang quá tải',
    CLOSED: 'Quán sắp đóng cửa',
    OTHER: 'Lý do khác',
    CUSTOMER_CHANGED_MIND: 'Khách đổi ý',
    TIMEOUT: 'Quán không phản hồi kịp'
};

// "Hết món: Hết gà"; hệ thống tự hủy đã có ghi chú đầy đủ ("Quán không phản hồi sau 5 phút") nên dùng luôn
const reasonText = (cancelReason) =>
    cancelReason?.code === 'TIMEOUT' && cancelReason.note
        ? cancelReason.note
        : [REASON_LABEL[cancelReason?.code], cancelReason?.note].filter(Boolean).join(': ') || undefined;

/** Tạo nhiều thông báo cùng lúc rồi đẩy tới từng người */
const notify = async (list) => {
    const docs = await Notification.insertMany(list.filter((n) => n.user));
    docs.forEach((doc) => emitNotification(doc.user, doc.toJSON()));
    return docs;
};

// Không để lỗi thông báo lan ra ngoài
const safely =
    (fn) =>
    (...args) =>
        fn(...args).catch((error) => {
            console.error('[notification] failed:', error.message);
            return [];
        });

const ownerOf = async (restaurantId) => (await Restaurant.findById(restaurantId).select('owner').lean())?.owner;

// ======================= Đơn hàng =======================

// Đơn mới -> chủ quán
const orderPlaced = safely(async (order) => {
    const itemsCount = order.items.reduce((s, l) => s + l.qty, 0);
    return notify([
        {
            user: await ownerOf(order.restaurant),
            type: 'ORDER_NEW',
            title: `Đơn mới ${order.code}`,
            body: `${itemsCount} món · ${money(order.total)} · ${order.fulfillmentType === 'PICKUP' ? 'Khách tự đến lấy' : 'Giao tận nơi'}`,
            data: { orderId: order._id, restaurantId: order.restaurant, code: order.code, link: '/owner/orders' }
        }
    ]);
});

// Nội dung báo khách theo trạng thái mới (quán / hệ thống đổi)
const customerMessage = (order) => {
    const shop = order.restaurantSnapshot?.name ?? 'Quán';
    const pickup = order.fulfillmentType === 'PICKUP';

    switch (order.status) {
        case 'ACCEPTED':
            return {
                title: `${shop} đã nhận đơn ${order.code}`,
                body: order.estimatedReadyAt ? `Dự kiến món xong lúc ${clock(order.estimatedReadyAt)}` : undefined
            };
        case 'PREPARING':
            return { title: `Đơn ${order.code} đang được chuẩn bị`, body: shop };
        case 'READY':
            return {
                title: pickup ? `Món của đơn ${order.code} đã xong` : `Đơn ${order.code} đã xong, quán sắp giao`,
                body: pickup ? `Mời bạn đến ${shop} lấy món` : shop
            };
        case 'DELIVERING':
            return { title: `Đơn ${order.code} đang được giao đến bạn`, body: `Chuẩn bị ${money(order.total)} tiền mặt` };
        case 'COMPLETED':
            // Mời đánh giá quán (API-8): bấm vào mở thẳng phần đánh giá
            return {
                title: `Đơn ${order.code} đã hoàn thành`,
                body: `Cảm ơn bạn đã đặt món tại ${shop}. Bấm để đánh giá quán`,
                link: order.restaurantSnapshot?.slug ? `/restaurants/${order.restaurantSnapshot.slug}#reviews` : '/orders'
            };
        case 'REJECTED':
            return { title: `${shop} đã từ chối đơn ${order.code}`, body: reasonText(order.cancelReason) };
        case 'CANCELLED':
            return { title: `Đơn ${order.code} đã bị hủy`, body: reasonText(order.cancelReason) };
        default:
            return null;
    }
};

/**
 * Đơn đổi trạng thái: báo cho bên KHÔNG thực hiện thao tác.
 * Quán / hệ thống đổi -> báo khách; khách hủy hoặc hệ thống tự hủy -> báo thêm chủ quán.
 */
const orderStatusChanged = safely(async (order) => {
    const last = order.statusHistory[order.statusHistory.length - 1];
    const list = [];
    const data = { orderId: order._id, restaurantId: order.restaurant, code: order.code };

    if (last?.actorType !== 'CUSTOMER') {
        const message = customerMessage(order);
        if (message) {
            const { link = '/orders', ...text } = message;
            list.push({ user: order.customer, type: 'ORDER_STATUS', ...text, data: { ...data, link } });
        }
    }

    if (order.status === 'CANCELLED' && ['CUSTOMER', 'SYSTEM'].includes(last?.actorType)) {
        list.push({
            user: await ownerOf(order.restaurant),
            type: 'ORDER_STATUS',
            title: last.actorType === 'CUSTOMER' ? `Khách đã hủy đơn ${order.code}` : `Đơn ${order.code} đã tự hủy`,
            body: last.actorType === 'SYSTEM' ? 'Quá thời gian chờ mà quán chưa nhận đơn' : order.cancelReason?.note,
            data: { ...data, link: '/owner/orders' }
        });
    }

    return list.length ? notify(list) : [];
});

// ======================= Hồ sơ quán =======================

// Chủ quán nộp hồ sơ -> mọi admin đang hoạt động
const restaurantSubmitted = safely(async (restaurant) => {
    const admins = await User.find({ role: 'ADMIN', status: 'ACTIVE' }).select('_id').lean();
    return notify(
        admins.map((a) => ({
            user: a._id,
            type: 'RESTAURANT_SUBMITTED',
            title: `Hồ sơ mới cần duyệt: ${restaurant.name}`,
            body: restaurant.address,
            data: { restaurantId: restaurant._id, link: `/admin/restaurants/${restaurant._id}` }
        }))
    );
});

const RESTAURANT_MESSAGES = {
    APPROVED: (r) => ({
        type: 'RESTAURANT_APPROVED',
        title: `Quán ${r.name} đã được duyệt`,
        body: 'Bật "Đang nhận đơn" ở trang Hồ sơ quán để bắt đầu bán'
    }),
    REJECTED: (r) => ({ type: 'RESTAURANT_REJECTED', title: `Hồ sơ quán ${r.name} bị từ chối`, body: r.rejectReason }),
    BLOCKED: (r, note) => ({ type: 'RESTAURANT_BLOCKED', title: `Quán ${r.name} đã bị khóa`, body: note }),
    // BLOCKED -> APPROVED qua "mở khóa"
    UNBLOCKED: (r) => ({
        type: 'RESTAURANT_UNBLOCKED',
        title: `Quán ${r.name} đã được mở khóa`,
        body: 'Bật lại "Đang nhận đơn" để tiếp tục bán'
    })
};

/** Admin duyệt / từ chối / khóa / mở khóa -> chủ quán. `kind` = APPROVED | REJECTED | BLOCKED | UNBLOCKED */
const restaurantStatusChanged = safely(async (restaurant, kind, note) => {
    const message = RESTAURANT_MESSAGES[kind]?.(restaurant, note);
    if (!message) {
        return [];
    }

    return notify([
        {
            user: restaurant.owner?._id ?? restaurant.owner,
            ...message,
            data: { restaurantId: restaurant._id, link: '/owner' }
        }
    ]);
});

// ======================= Đánh giá =======================

// Khách viết / sửa đánh giá -> chủ quán
const reviewPosted = safely(async (review, created) =>
    notify([
        {
            user: await ownerOf(review.restaurant),
            type: 'REVIEW_NEW',
            title: `${created ? 'Đánh giá mới' : 'Khách vừa sửa đánh giá'}: ${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)}`,
            body: review.comment ? review.comment.slice(0, 120) : 'Không kèm nhận xét',
            data: { restaurantId: review.restaurant, link: '/owner/reviews' }
        }
    ])
);

module.exports = {
    reviewPosted,
    orderPlaced,
    orderStatusChanged,
    restaurantSubmitted,
    restaurantStatusChanged
};
