// Vòng đời đơn (BR-35) — quán tự giao, không có tài xế nền tảng (quyết định 06/10/2026).
//
// PLACED ──▶ ACCEPTED ──▶ PREPARING ──▶ READY ──▶ DELIVERING ──▶ COMPLETED   (giao tận nơi)
//   │           │                         └──────▶ COMPLETED                  (khách tự đến lấy)
//   ├──▶ REJECTED   (quán từ chối, bắt buộc lý do)
//   └──▶ CANCELLED  (khách hủy / quá 5 phút không phản hồi)
//              ACCEPTED ──▶ CANCELLED (quán hủy, bắt buộc lý do)
//
// Mọi chuyển khác -> 409 INVALID_STATUS_TRANSITION.

const OWNER_REJECT_REASONS = ['OUT_OF_STOCK', 'OVERLOADED', 'CLOSED', 'OTHER'];

// Chủ quán đi tiếp theo luồng chuẩn qua POST /merchant/orders/:id/status { to }
const OWNER_FORWARD = {
    ACCEPTED: ['PREPARING'],
    PREPARING: ['READY'],
    READY: ['DELIVERING', 'COMPLETED'],
    DELIVERING: ['COMPLETED']
};

// Trạng thái kết thúc: không đổi được nữa
const FINAL_STATUSES = ['REJECTED', 'CANCELLED', 'COMPLETED'];

/**
 * Chủ quán có được chuyển đơn từ `from` sang `to` qua luồng chuẩn không.
 * READY -> DELIVERING chỉ cho đơn giao tận nơi; READY -> COMPLETED chỉ cho đơn tự lấy.
 */
const canOwnerAdvance = (order, to) => {
    if (!(OWNER_FORWARD[order.status] || []).includes(to)) {
        return false;
    }

    if (order.status === 'READY') {
        return order.fulfillmentType === 'DELIVERY' ? to === 'DELIVERING' : to === 'COMPLETED';
    }

    return true;
};

/** Bước tiếp theo gợi ý cho màn hình quán (null nếu không còn bước nào) */
const nextOwnerStatus = (order) => {
    if (order.status === 'READY') {
        return order.fulfillmentType === 'DELIVERY' ? 'DELIVERING' : 'COMPLETED';
    }

    return (OWNER_FORWARD[order.status] || [])[0] || null;
};

module.exports = {
    OWNER_REJECT_REASONS,
    OWNER_FORWARD,
    FINAL_STATUSES,
    canOwnerAdvance,
    nextOwnerStatus
};
