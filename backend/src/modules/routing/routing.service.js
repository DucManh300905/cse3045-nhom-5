const RouteCache = require('./routeCache.model');
const goong = require('./providers/goong');
const estimate = require('./providers/estimate');

/**
 * Dịch vụ định tuyến dùng chung (bản đồ, kiểm tra bán kính giao, sau này: shipper).
 * Thứ tự: bộ nhớ đệm -> Goong (đường đi thật) -> lỗi / chưa có khóa thì ước lượng (đường chim bay × 1,3).
 * Kết quả luôn có `source`: ROUTING (đường thật) | ESTIMATE (ước lượng) — BR-82.
 *
 * ROUTING_PROVIDER: goong | estimate (mặc định: goong nếu có GOONG_API_KEY, ngược lại estimate)
 */
const providerName = () => process.env.ROUTING_PROVIDER || (goong.isConfigured() ? 'goong' : 'estimate');

const useGoong = () => providerName() === 'goong' && goong.isConfigured();

const round4 = (n) => Number(n).toFixed(4);
const cacheKey = (from, to) =>
    `goong|${process.env.GOONG_VEHICLE || 'bike'}|${round4(from.lat)},${round4(from.lng)}|${round4(to.lat)},${round4(to.lng)}`;

/**
 * @param from { lat, lng } (quán)
 * @param to   { lat, lng } (nơi nhận)
 * @returns { distanceKm, durationMinutes, polyline, source, provider }
 */
const getRoute = async (from, to) => {
    if (!useGoong()) {
        return estimate.getRoute(from, to);
    }

    const key = cacheKey(from, to);
    const cached = await RouteCache.findOne({ key }).lean();
    if (cached) {
        return {
            distanceKm: cached.distanceKm,
            durationMinutes: cached.durationMinutes,
            polyline: cached.polyline ?? null,
            source: 'ROUTING',
            provider: cached.provider
        };
    }

    try {
        const route = await goong.getRoute(from, to);
        await RouteCache.updateOne(
            { key },
            { $setOnInsert: { key, distanceKm: route.distanceKm, durationMinutes: route.durationMinutes, polyline: route.polyline, provider: route.provider } },
            { upsert: true }
        ).catch(() => {});
        return route;
    } catch (error) {
        // Không để lỗi dịch vụ ngoài chặn đặt đơn
        console.warn('[routing] Goong failed, using estimate:', error.message);
        return estimate.getRoute(from, to);
    }
};

/**
 * Quãng đường thật từ nhiều điểm (tài xế) tới một điểm (quán) — 1 lần gọi Goong cho cả danh sách.
 * Lỗi / chưa có khóa / Goong không có đường cho một điểm -> ước lượng cho điểm đó.
 * @returns [{ distanceKm, durationMinutes, source, provider }] cùng thứ tự origins
 */
const getMatrix = async (origins, destination) => {
    if (origins.length === 0) {
        return [];
    }
    const fallback = await estimate.getMatrix(origins, destination);
    if (!useGoong()) {
        return fallback;
    }
    try {
        const rows = await goong.getMatrix(origins, destination);
        return rows.map((row, i) => row ?? fallback[i]);
    } catch (error) {
        console.warn('[routing] Goong matrix failed, using estimate:', error.message);
        return fallback;
    }
};

/** Ô tìm địa chỉ trên bản đồ chỉ bật khi có khóa Goong */
const searchAvailable = () => goong.isConfigured();

module.exports = {
    providerName,
    getRoute,
    getMatrix,
    searchAvailable,
    autocomplete: goong.autocomplete,
    placeDetail: goong.placeDetail,
    reverseGeocode: goong.reverseGeocode
};
