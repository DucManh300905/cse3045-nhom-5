const mongoose = require('mongoose');

const Notification = require('./notification.model');
const Restaurant = require('../restaurant/restaurant.model');
const User = require('../user/user.model');
const { emitNotification } = require('../../realtime/socket');
const { sendMail } = require('../../config/mailer');
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
    PAYMENT_TIMEOUT: 'Quá hạn thanh toán',
    DELIVERY_FAILED: 'Giao hàng không thành công'
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
    const platform = order.deliveryMode === 'PLATFORM' && !pickup;
    const driver = order.delivery?.shipperSnapshot?.fullName;
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
            // Nhận đơn = bắt đầu làm luôn (19/10/2026)
            return {
                title: `${shop} đã nhận đơn ${order.code}`,
                body: order.estimatedReadyAt ? `Đang chuẩn bị · dự kiến xong lúc ${clock(order.estimatedReadyAt)}` : 'Đang chuẩn bị'
            };
        case 'READY':
            if (platform) {
                return { title: `Món của đơn ${order.code} đã xong`, body: driver ? `Tài xế ${driver} đang tới quán lấy món` : 'MAK đang tìm tài xế giao cho bạn' };
            }
            return {
                title: pickup ? `Món của đơn ${order.code} đã xong` : `Đơn ${order.code} đã xong, quán sắp giao`,
                body: pickup ? `Mời bạn đến ${shop} lấy món` : shop
            };
        case 'DELIVERING':
            if (platform && driver) {
                return { title: `Tài xế ${driver} đang giao đơn ${order.code}`, body: 'Mở "Đơn của tôi" để xem tài xế trên bản đồ' };
            }
            return { title: `Đơn ${order.code} đang được giao đến bạn`, body: prepaid ? 'Đơn đã thanh toán trước' : `Chuẩn bị ${money(order.total)} tiền mặt` };
        case 'COMPLETED':
            if (platform) {
                return { title: `Đơn ${order.code} đã được giao`, body: 'Tài xế đã chụp ảnh xác nhận giao hàng. Bấm để xem và đánh giá', link: '/orders' };
            }
            // Mời đánh giá quán (API-8): bấm vào mở thẳng phần đánh giá
            return {
                title: pickup ? `Đơn ${order.code} đã hoàn thành` : `Đơn ${order.code} đã được giao`,
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

    // Tài xế lấy hàng / giao xong -> chủ quán biết
    if (last?.actorType === 'SHIPPER' && ['DELIVERING', 'COMPLETED'].includes(order.status)) {
        const driver = order.delivery?.shipperSnapshot?.fullName ?? 'Tài xế';
        list.push({
            user: await ownerOf(order.restaurant),
            type: 'ORDER_STATUS',
            title: order.status === 'DELIVERING' ? `${driver} đã lấy đơn ${order.code}` : `${driver} đã giao xong đơn ${order.code}`,
            body: order.status === 'COMPLETED' ? 'Tiền hàng đã cộng vào ví quán' : undefined,
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
            data: { restaurantId: restaurant._id, link: '/admin/wallets?tab=payouts' }
        }))
    )
);

const payoutProcessed = safely(async (payout) => {
    const paid = payout.status === 'PAID';
    // Lệnh rút của tài xế: báo tài khoản tài xế, mở trang Thu nhập
    const shipper = payout.shipper ? await mongoose.model('Shipper').findById(payout.shipper).select('user').lean() : null;
    const restaurant = shipper ? null : await Restaurant.findById(payout.restaurant).select('owner').lean();
    return notify([
        {
            user: shipper?.user ?? restaurant?.owner,
            type: paid ? 'PAYOUT_PAID' : 'PAYOUT_REJECTED',
            title: paid ? `MAK đã chuyển ${money(payout.amount)} cho ${shipper ? 'bạn' : 'quán'}` : `Yêu cầu rút ${money(payout.amount)} bị từ chối`,
            body: paid ? (payout.bankRef ? `Mã giao dịch ${payout.bankRef}` : undefined) : `${payout.rejectReason} — tiền đã trả lại ví`,
            data: shipper ? { shipperId: payout.shipper, link: '/shipper/earnings' } : walletData(payout.restaurant)
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

// ======================= Tài xế MAK =======================

const shipperData = (shipper, link) => ({ shipperId: shipper._id, link });
const driverText = (order) => {
    const s = order.delivery?.shipperSnapshot ?? {};
    return [s.fullName, s.licensePlate, s.phone].filter(Boolean).join(' · ');
};

// Tài xế nộp hồ sơ -> mọi admin
const shipperSubmitted = safely(async (shipper) =>
    notify(
        (await admins()).map((user) => ({
            user,
            type: 'SHIPPER_SUBMITTED',
            title: `Hồ sơ tài xế mới cần duyệt: ${shipper.fullName}`,
            body: [shipper.phone, shipper.licensePlate].filter(Boolean).join(' · ') || undefined,
            data: shipperData(shipper, `/admin/shippers/${shipper._id}`)
        }))
    )
);

const SHIPPER_MESSAGES = {
    APPROVED: () => ({ type: 'SHIPPER_APPROVED', title: 'Hồ sơ tài xế đã được duyệt', body: 'Bật "Trực tuyến" để bắt đầu nhận đơn' }),
    REJECTED: (s) => ({ type: 'SHIPPER_REJECTED', title: 'Hồ sơ tài xế bị từ chối', body: s.rejectReason }),
    BLOCKED: (s, note) => ({ type: 'SHIPPER_BLOCKED', title: 'Tài khoản tài xế đã bị khóa', body: note }),
    UNBLOCKED: () => ({ type: 'SHIPPER_UNBLOCKED', title: 'Tài khoản tài xế đã được mở khóa', body: 'Bạn có thể bật "Trực tuyến" lại' })
};

/** Admin duyệt / từ chối / khóa / mở khóa -> tài xế. kind = APPROVED | REJECTED | BLOCKED | UNBLOCKED */
const shipperStatusChanged = safely(async (shipper, kind, note) => {
    const message = SHIPPER_MESSAGES[kind]?.(shipper, note);
    return message ? notify([{ user: shipper.user?._id ?? shipper.user, ...message, data: shipperData(shipper, '/shipper/profile') }]) : [];
});

// Đã có tài xế nhận đơn -> khách + chủ quán (admin gán tay: báo thêm tài xế)
const deliveryAssigned = safely(async (order, { byAdmin = false } = {}) => {
    const data = { orderId: order._id, restaurantId: order.restaurant, code: order.code };
    return notify([
        ...(byAdmin
            ? [
                  {
                      user: order.delivery?.shipperUser,
                      type: 'DELIVERY_ASSIGNED',
                      title: `MAK đã giao đơn ${order.code} cho bạn`,
                      body: `Tới ${order.restaurantSnapshot?.name ?? 'quán'} lấy món · ${order.restaurantSnapshot?.address ?? ''}`.trim(),
                      data: { ...data, link: '/shipper' }
                  }
              ]
            : []),
        {
            user: order.customer,
            type: 'DELIVERY_ASSIGNED',
            title: `Đã có tài xế nhận đơn ${order.code}`,
            body: driverText(order),
            data: { ...data, link: '/orders' }
        },
        {
            user: await ownerOf(order.restaurant),
            type: 'DELIVERY_ASSIGNED',
            title: `Tài xế đang tới lấy đơn ${order.code}`,
            body: driverText(order),
            data: { ...data, link: '/owner/orders' }
        }
    ]);
});

// Không tìm được tài xế -> chủ quán chọn tự giao / tìm lại / hủy (Q7)
const deliveryNoShipper = safely(async (order) =>
    notify([
        {
            user: await ownerOf(order.restaurant),
            type: 'DELIVERY_NO_SHIPPER',
            title: `Chưa tìm được tài xế cho đơn ${order.code}`,
            body: 'Chọn "Tự giao đơn này", "Tìm lại tài xế" hoặc hủy đơn (khách được hoàn tiền tự động)',
            data: { orderId: order._id, restaurantId: order.restaurant, code: order.code, link: '/owner/orders' }
        }
    ])
);

// Đơn tài xế đang nhận bị hủy / chuyển cho người khác -> tài xế
const deliveryCancelled = safely(async (order, shipperUser, { compensation = 0, reason } = {}) =>
    notify([
        {
            user: shipperUser,
            type: 'DELIVERY_CANCELLED',
            title: `Đơn ${order.code} không còn giao cho bạn`,
            body: [reason, compensation ? `MAK bù ${money(compensation)} vào thu nhập` : null].filter(Boolean).join(' · ') || undefined,
            data: { orderId: order._id, code: order.code, link: '/shipper' }
        }
    ])
);

// Tài xế báo giao thất bại -> admin xử lý, báo khách + quán
const deliveryFailed = safely(async (order) => {
    const data = { orderId: order._id, restaurantId: order.restaurant, code: order.code };
    return notify([
        ...(await admins()).map((user) => ({
            user,
            type: 'DELIVERY_FAILED',
            title: `Giao thất bại đơn ${order.code}`,
            body: order.delivery?.failReason,
            data: { ...data, link: '/admin/dispatch' }
        })),
        {
            user: order.customer,
            type: 'DELIVERY_FAILED',
            title: `Tài xế chưa giao được đơn ${order.code}`,
            body: `${order.delivery?.failReason ?? ''} — MAK sẽ liên hệ bạn để xử lý`.trim(),
            data: { ...data, link: '/orders' }
        },
        {
            user: await ownerOf(order.restaurant),
            type: 'DELIVERY_FAILED',
            title: `Tài xế chưa giao được đơn ${order.code}`,
            body: order.delivery?.failReason,
            data: { ...data, link: '/owner/orders' }
        }
    ]);
});

// Tài xế mất tín hiệu khi đang giao -> admin
const deliveryStale = safely(async (order, minutes) =>
    notify(
        (await admins()).map((user) => ({
            user,
            type: 'DELIVERY_STALE',
            title: `Mất vị trí tài xế đơn ${order.code}`,
            body: `${driverText(order)} — không cập nhật vị trí hơn ${minutes} phút`,
            data: { orderId: order._id, code: order.code, link: '/admin/dispatch' }
        }))
    )
);

// Tiền công vừa cộng vào ví tài xế
const shipperEarning = safely(async (order, shipperUser, amount) =>
    notify([
        {
            user: shipperUser,
            type: 'SHIPPER_EARNING',
            title: `+${money(amount)} tiền công đơn ${order.code}`,
            body: 'Đã cộng vào thu nhập, rút về tài khoản ở trang Thu nhập',
            data: { orderId: order._id, code: order.code, link: '/shipper/earnings' }
        }
    ])
);

// ======================= Gửi kèm email (lịch ca tài xế) =======================

const clientUrl = () => process.env.CLIENT_URL || 'http://localhost:5173';

// Chỉ gửi tới email đã xác thực; lỗi gửi chỉ ghi log
const emailUsers = async (docs) => {
    const users = await User.find({ _id: { $in: docs.map((d) => d.user) }, emailVerified: true }).select('email').lean();
    const byId = new Map(users.filter((u) => u.email).map((u) => [String(u._id), u.email]));
    for (const doc of docs) {
        const to = byId.get(String(doc.user));
        if (!to) continue;
        await sendMail({
            to,
            subject: `[MAK Food] ${doc.title}`,
            text: [doc.body, doc.data?.link && `Mở MAK Food: ${clientUrl()}${doc.data.link}`].filter(Boolean).join('\n\n')
        }).catch((error) => console.error('[notification] email failed:', error.message));
    }
};

/**
 * Thông báo tuỳ ý (dùng cho lịch ca / xử phạt): list = [{ user, type, title, body?, data? }].
 * email: true -> gửi thêm email (các mốc lịch ca phải tới được người dùng kể cả khi không mở web).
 */
const send = safely(async (list, { email = false } = {}) => {
    const docs = await notify(list);
    if (email && docs.length) {
        await emailUsers(docs);
    }
    return docs;
});

/** Id tài khoản của mọi admin đang hoạt động */
const adminIds = () => admins();

module.exports = {
    send,
    adminIds,
    shipperSubmitted,
    shipperStatusChanged,
    deliveryAssigned,
    deliveryNoShipper,
    deliveryCancelled,
    deliveryFailed,
    deliveryStale,
    shipperEarning,
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
