const { fromPoint } = require('../../utils/geo');

/** Link xem ảnh chân dung tài xế (API có kiểm quyền) */
const portraitUrl = (shipperId) => `/delivery/shippers/${shipperId}/portrait`;

// Hồ sơ tài xế cho chính tài xế và admin. documentUrl: link xem giấy tờ (chỉ admin)
const toShipperResponse = (shipper, { documentUrl } = {}) => {
    const data = shipper.toJSON();
    delete data.ratingSum;
    data.documents = shipper.documents.map((d) => ({
        type: d.type,
        originalName: d.originalName,
        mimeType: d.mimeType,
        uploadedAt: d.uploadedAt,
        ...(documentUrl && { url: documentUrl(shipper, d) })
    }));
    data.location = fromPoint(shipper.location);
    data.portrait = shipper.portrait?.fileKey ? { uploadedAt: shipper.portrait.uploadedAt, url: portraitUrl(shipper._id) } : null;
    return data;
};

/**
 * Ảnh xác nhận giao: không lộ đường dẫn file, thay bằng link API có kiểm tra quyền.
 * Dùng cho mọi chỗ trả đơn ra ngoài (khách, quán, tài xế, admin).
 */
const withProofUrl = (data) => {
    const proof = data.delivery?.proof;
    if (proof?.fileKey) {
        data.delivery.proof = { kind: proof.kind, takenAt: proof.takenAt, url: `/delivery/orders/${data.id ?? data._id}/proof` };
    } else if (data.delivery) {
        delete data.delivery.proof;
    }
    // Ảnh chân dung tài xế của đơn (khách / quán thấy trong khung theo dõi)
    if (data.delivery?.shipper) {
        data.delivery.shipperPortraitUrl = portraitUrl(data.delivery.shipper);
    }
    return data;
};

/**
 * Đơn trong app tài xế: đủ để đi lấy và giao (quán, khách, món), không có hoa hồng / voucher.
 * Trước khi tài xế nhận đơn, tên + SĐT khách không gửi đi (xem dispatch.offerPayload).
 */
const toShipperOrder = (order, restaurant) => {
    const data = withProofUrl(order.toJSON());
    return {
        id: data.id,
        code: data.code,
        status: data.status,
        paymentMethod: data.paymentMethod,
        paymentStatus: data.paymentStatus,
        total: data.total,
        shipperFee: data.shipperFee,
        route: data.route ? { distanceKm: data.route.distanceKm, durationMinutes: data.route.durationMinutes, polyline: data.route.polyline } : null,
        items: data.items.map((l) => ({
            name: l.name,
            qty: l.qty,
            variant: l.variant?.name,
            options: l.options.map((o) => o.name),
            note: l.note
        })),
        store: {
            name: data.restaurantSnapshot?.name,
            phone: data.restaurantSnapshot?.phone,
            address: data.restaurantSnapshot?.address,
            location: fromPoint(restaurant?.location)
        },
        dropoff: {
            receiverName: data.delivery?.receiverName,
            phone: data.delivery?.phone,
            addressLine: data.delivery?.addressLine,
            note: data.delivery?.note,
            location: fromPoint(order.delivery?.location)
        },
        delivery: {
            status: data.delivery?.status ?? null,
            assignedAt: data.delivery?.assignedAt,
            arrivedAt: data.delivery?.arrivedAt,
            pickedUpAt: data.delivery?.pickedUpAt,
            deliveredAt: data.delivery?.deliveredAt,
            failedAt: data.delivery?.failedAt,
            failReason: data.delivery?.failReason,
            eta: data.delivery?.eta ?? null,
            proof: data.delivery?.proof ?? null,
            rating: data.delivery?.rating ?? null
        },
        placedAt: data.placedAt,
        completedAt: data.completedAt,
        createdAt: data.createdAt
    };
};

module.exports = {
    portraitUrl,
    toShipperResponse,
    withProofUrl,
    toShipperOrder
};
