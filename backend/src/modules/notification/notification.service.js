const mongoose = require('mongoose');

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
    TIMEOUT: 'Quán không phản hồi kịp',
    PAYMENT_TIMEOUT: 'Quá hạn thanh toán'
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
            body: `${itemsCount} món · ${money(order.total)} · ${order.fulfillmentType === 'PICKUP' ? 'Khách tự đến lấy' : 'Giao tận nơi'}${order.paymentMethod === 'BANK_TRANSFER' ? ' · Đã thanh toán' : ''}`,
            data: { orderId: order._id, restaurantId: order.restaurant, code: order.code, link: '/owner/orders' }
        }
    ]);
});

// Nội dung báo khách theo trạng thái mới (quán / hệ thống đổi)
const customerMessage = (order) => {
    const shop = order.restaurantSnapshot?.name ?? 'Quán';
    const pickup = order.fulfillmentType === 'PICKUP';

    const prepaid = order.paymentMethod === 'BANK_TRANSFER';
    const refundNote = order.paymentStatus === 'REFUND_PENDING' ? 'MAK sẽ hoàn tiền chuyển khoản cho bạn' : undefined;

    switch (order.status) {
        case 'PLACED':
            // Webhook SePay vừa xác nhận tiền
            return prepaid ? { title: `Đã nhận thanh toán đơn ${order.code}`, body: `${money(order.paidAmount ?? order.total)} · đang chờ ${shop} nhận đơn` } : null;
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
            return { title: `Đơn ${order.code} đang được giao đến bạn`, body: prepaid ? 'Đơn đã thanh toán trước' : `Chuẩn bị ${money(order.total)} tiền mặt` };
        case 'COMPLETED':
            // Mời đánh giá quán (API-8): bấm vào mở thẳng phần đánh giá
            return {
                title: `Đơn ${order.code} đã hoàn thành`,
                body: `Cảm ơn bạn đã đặt món tại ${shop}. Bấm để đánh giá quán`,
                link: order.restaurantSnapshot?.slug ? `/restaurants/${order.restaurantSnapshot.slug}#reviews` : '/orders'
            };
        case 'REJECTED':
            return { title: `${shop} đã từ chối đơn ${order.code}`, body: [reasonText(order.cancelReason), refundNote].filter(Boolean).join(' · ') || undefined };
        case 'CANCELLED':
            return { title: `Đơn ${order.code} đã bị hủy`, body: [reasonText(order.cancelReason), refundNote].filter(Boolean).join(' · ') || undefined };
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

    // Đơn trả trước chưa thanh toán (placedAt null) chưa tới quán -> không báo chủ quán
    if (order.status === 'CANCELLED' && order.placedAt && ['CUSTOMER', 'SYSTEM'].includes(last?.actorType)) {
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

// ======================= Ví đối soát (API-11) =======================

const admins = async () => (await User.find({ role: 'ADMIN', status: 'ACTIVE' }).select('_id').lean()).map((a) => a._id);
const ownerId = (restaurant) => restaurant.owner?._id ?? restaurant.owner;
const day = (date) => new Intl.DateTimeFormat('vi-VN', { timeZone: TIME_ZONE, dateStyle: 'short', timeStyle: 'short' }).format(date);
const walletData = (restaurantId, link = '/owner/wallet') => ({ restaurantId, link });

// Ví quán vừa âm (đơn COD hoàn thành trừ hoa hồng) -> nhắc nạp trước hạn
const walletNegative = safely(async (restaurant, { balance, deadline }) =>
    notify([
        {
            user: ownerId(restaurant),
            type: 'WALLET_NEGATIVE',
            title: `Ví quán đang âm ${money(-balance)}`,
            body: deadline ? `Nạp tiền trước ${day(deadline)} để quán không bị tạm ngưng nhận đơn` : undefined,
            data: walletData(restaurant._id)
        }
    ])
);

const LOCK_REASON = {
    OVER_LIMIT: 'Ví âm vượt hạn mức cho phép',
    OVERDUE: 'Ví âm quá thời hạn cho phép'
};

const walletLocked = safely(async (restaurant, { reason, balance }) =>
    notify([
        {
            user: ownerId(restaurant),
            type: 'WALLET_LOCKED',
            title: `Quán ${restaurant.name} tạm ngưng nhận đơn`,
            body: `${LOCK_REASON[reason] ?? 'Ví âm'} (${money(balance)}). Nạp tiền để mở lại tự động`,
            data: walletData(restaurant._id)
        }
    ])
);

const walletUnlocked = safely(async (restaurant) =>
    notify([
        {
            user: ownerId(restaurant),
            type: 'WALLET_UNLOCKED',
            title: `Quán ${restaurant.name} đã được mở lại`,
            body: 'Ví đã hết âm, quán nhận đơn trở lại',
            data: walletData(restaurant._id)
        }
    ])
);

// Quán tạo lệnh nạp -> admin đối chiếu sao kê
const topupRequested = safely(async (topup, restaurant) =>
    notify(
        (await admins()).map((user) => ({
            user,
            type: 'TOPUP_REQUESTED',
            title: `${restaurant.name} tạo lệnh nạp ${money(topup.amount)}`,
            body: `Nội dung chuyển khoản: ${topup.code}`,
            data: walletData(restaurant._id, '/admin/wallets?tab=topups')
        }))
    )
);

const topupProcessed = safely(async (topup) => {
    const restaurant = await Restaurant.findById(topup.restaurant).select('owner').lean();
    const confirmed = topup.status === 'CONFIRMED';
    return notify([
        {
            user: restaurant?.owner,
            type: confirmed ? 'TOPUP_CONFIRMED' : 'TOPUP_REJECTED',
            title: confirmed
                ? `Đã nhận ${money(topup.receivedAmount)} nạp vào ví`
                : `Lệnh nạp ${topup.code} bị từ chối`,
            body: confirmed ? `Mã ${topup.code}` : topup.rejectReason,
            data: walletData(topup.restaurant)
        }
    ]);
});

const payoutRequested = safely(async (payout, restaurant) =>
    notify(
        (await admins()).map((user) => ({
            user,
            type: 'PAYOUT_REQUESTED',
            title: `${restaurant.name} yêu cầu rút ${money(payout.amount)}`,
            body: `${payout.bankAccount.bankName} · ${payout.bankAccount.accountNumber} · ${payout.bankAccount.accountName}`,
            data: walletData(restaurant._id, '/admin/wallets?tab=payouts')
        }))
    )
);

const payoutProcessed = safely(async (payout) => {
    const restaurant = await Restaurant.findById(payout.restaurant).select('owner').lean();
    const paid = payout.status === 'PAID';
    return notify([
        {
            user: restaurant?.owner,
            type: paid ? 'PAYOUT_PAID' : 'PAYOUT_REJECTED',
            title: paid ? `MAK đã chuyển ${money(payout.amount)} cho quán` : `Yêu cầu rút ${money(payout.amount)} bị từ chối`,
            body: paid ? (payout.bankRef ? `Mã giao dịch ${payout.bankRef}` : undefined) : `${payout.rejectReason} — tiền đã trả lại ví`,
            data: walletData(payout.restaurant)
        }
    ]);
});

// ======================= Trả trước (W2) =======================

const REFUND_REASON_LABEL = {
    ORDER_CANCELLED: 'đơn đã thanh toán bị hủy',
    LATE_PAYMENT: 'chuyển khoản sau khi đơn đã hết hạn / bị hủy',
    UNDERPAID: 'chuyển thiếu',
    OVERPAID: 'chuyển thừa',
    DUPLICATE: 'chuyển trùng cho đơn đã thanh toán',
    UNMATCHED: 'giao dịch không khớp'
};

// Tiền về nhưng không xác nhận được đơn (thiếu / muộn / trùng) -> khách
const paymentProblem = safely(async (order, refund) => {
    const title = {
        UNDERPAID: `Đơn ${order.code}: bạn chuyển thiếu tiền`,
        LATE_PAYMENT: `Đơn ${order.code} đã hết hạn thanh toán`,
        DUPLICATE: `Đơn ${order.code} đã được thanh toán trước đó`
    }[refund.reason];
    const body =
        refund.reason === 'UNDERPAID'
            ? `Đã nhận ${money(refund.amount)}, cần ${money(order.total)}. Khoản này sẽ được hoàn lại — vui lòng chuyển lại đủ số tiền`
            : `MAK sẽ hoàn lại ${money(refund.amount)} cho bạn`;
    return notify([{ user: order.customer, type: 'PAYMENT_ISSUE', title, body, data: { orderId: order._id, code: order.code, link: '/orders' } }]);
});

// Có lệnh hoàn tiền mới -> admin
const refundCreated = safely(async (refund, order) =>
    notify(
        (await admins()).map((user) => ({
            user,
            type: 'REFUND_REQUESTED',
            title: `Cần hoàn ${money(refund.amount)}${order ? ` — đơn ${order.code}` : ''}`,
            body: `Lý do: ${REFUND_REASON_LABEL[refund.reason] ?? refund.reason}`,
            data: { orderId: order?._id, code: order?.code, link: '/admin/wallets?tab=refunds' }
        }))
    )
);

const refundDone = safely(async (refund) => {
    if (!refund.customer) {
        return [];
    }
    const order = refund.order ? await mongoose.model('Order').findById(refund.order).select('code').lean() : null;
    return notify([
        {
            user: refund.customer,
            type: 'REFUND_DONE',
            title: `MAK đã hoàn ${money(refund.amount)} cho bạn`,
            body: [order && `Đơn ${order.code}`, refund.bankRef && `Mã giao dịch ${refund.bankRef}`].filter(Boolean).join(' · ') || undefined,
            data: { orderId: refund.order, code: order?.code, link: '/orders' }
        }
    ]);
});

// Giao dịch không nhận ra mã -> admin đối soát
const paymentUnmatched = safely(async (payment, reason) =>
    notify(
        (await admins()).map((user) => ({
            user,
            type: 'PAYMENT_UNMATCHED',
            title: `Giao dịch ${money(payment.amount)} chưa khớp đơn`,
            body: `${reason}. Nội dung: ${(payment.content || '').slice(0, 100)}`,
            data: { link: '/admin/wallets?tab=payments' }
        }))
    )
);

module.exports = {
    paymentProblem,
    refundCreated,
    refundDone,
    paymentUnmatched,
    walletNegative,
    walletLocked,
    walletUnlocked,
    topupRequested,
    topupProcessed,
    payoutRequested,
    payoutProcessed,
    reviewPosted,
    orderPlaced,
    orderStatusChanged,
    restaurantSubmitted,
    restaurantStatusChanged
};
