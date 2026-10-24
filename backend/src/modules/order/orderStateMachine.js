// Vòng đời đơn (BR-35) — quán tự giao, không có tài xế nền tảng (quyết định 06/10/2026).
// Rút gọn 19/10/2026: nhận đơn = bắt đầu làm luôn; đơn giao tận nơi bỏ bước "món đã xong".
//
// Giao tận nơi:  PLACED ──[Nhận đơn]──▶ (ACCEPTED) ──▶ PREPARING ──[Đi giao]──▶ DELIVERING ──[Đã giao]──▶ COMPLETED
// Tự đến lấy:    PLACED ──[Nhận đơn]──▶ (ACCEPTED) ──▶ PREPARING ──[Món đã xong]──▶ READY ──[Khách đã lấy]──▶ COMPLETED
//   (ACCEPTED chỉ ghi vào lịch sử: nhận đơn chuyển thẳng sang PREPARING trong cùng một thao tác)
//
//   PLACED ──▶ REJECTED   (quán từ chối, bắt buộc lý do)
//   PLACED ──▶ CANCELLED  (khách hủy / quá 5 phút không phản hồi)
//   ACCEPTED │ PREPARING │ READY ──▶ CANCELLED (quán hủy, bắt buộc lý do) — đã đi giao thì không hủy được
//
// Đơn cũ (trước 19/10) đang ở ACCEPTED / READY của đơn giao tận nơi vẫn đi tiếp được, không bị kẹt.
//
// Tài xế MAK giao (deliveryMode = PLATFORM, 21/10/2026) — quán chỉ làm món, tài xế lấy và giao:
//   PLACED ──[Nhận đơn]──▶ PREPARING (đồng thời tìm tài xế) ──[Món đã xong]──▶ READY
//          ──[Tài xế lấy hàng]──▶ DELIVERING ──[Tài xế chụp ảnh giao]──▶ COMPLETED
//   (tài xế lấy được cả khi quán quên bấm "Món đã xong": PREPARING ──▶ DELIVERING)
//   Bước của tài xế nằm ở delivery.status (shipper/delivery.service.js), quán / khách không bấm thay được.
// Mọi chuyển khác -> 409 INVALID_STATUS_TRANSITION.

const OWNER_REJECT_REASONS = ['OUT_OF_STOCK', 'OVERLOADED', 'CLOSED', 'OTHER'];

// Chủ quán đi tiếp theo luồng chuẩn qua POST /merchant/orders/:id/status { to }
const OWNER_FORWARD = {
    ACCEPTED: ['PREPARING'], // đơn cũ
    PREPARING: ['DELIVERING', 'READY'],
    READY: ['DELIVERING', 'COMPLETED'], // READY -> DELIVERING: đơn giao tận nơi cũ
    DELIVERING: ['COMPLETED']
};

// Quán hủy được (kèm lý do) khi chưa đi giao
const OWNER_CANCELLABLE = ['ACCEPTED', 'PREPARING', 'READY'];

// Trạng thái kết thúc: không đổi được nữa
const FINAL_STATUSES = ['REJECTED', 'CANCELLED', 'COMPLETED'];

const isDelivery = (order) => order.fulfillmentType === 'DELIVERY';
const isPlatform = (order) => isDelivery(order) && order.deliveryMode === 'PLATFORM';

/**
 * Chủ quán có được chuyển đơn từ trạng thái hiện tại sang `to` không.
 * PREPARING: giao tận nơi -> DELIVERING, tự lấy -> READY. READY: giao tận nơi -> DELIVERING, tự lấy -> COMPLETED.
 */
const canOwnerAdvance = (order, to) => {
    if (!(OWNER_FORWARD[order.status] || []).includes(to)) {
        return false;
    }

    // Tài xế MAK: quán chỉ được báo "Món đã xong"
    if (isPlatform(order)) {
        return order.status === 'PREPARING' && to === 'READY';
    }

    if (order.status === 'PREPARING') {
        return isDelivery(order) ? to === 'DELIVERING' : to === 'READY';
    }
    if (order.status === 'READY') {
        return isDelivery(order) ? to === 'DELIVERING' : to === 'COMPLETED';
    }

    return true;
};

/** Bước tiếp theo gợi ý cho màn hình quán (null nếu không còn bước nào) */
const nextOwnerStatus = (order) => {
    if (isPlatform(order)) {
        return order.status === 'PREPARING' ? 'READY' : null;
    }
    switch (order.status) {
        case 'ACCEPTED':
            return 'PREPARING';
        case 'PREPARING':
            return isDelivery(order) ? 'DELIVERING' : 'READY';
        case 'READY':
            return isDelivery(order) ? 'DELIVERING' : 'COMPLETED';
        case 'DELIVERING':
            return 'COMPLETED';
        default:
            return null;
    }
};

module.exports = {
    OWNER_REJECT_REASONS,
    OWNER_FORWARD,
    OWNER_CANCELLABLE,
    FINAL_STATUSES,
    canOwnerAdvance,
    nextOwnerStatus
};
