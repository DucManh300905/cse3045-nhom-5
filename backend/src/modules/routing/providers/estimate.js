const { haversineKm, round1 } = require('../../../utils/geo');

/**
 * Ước lượng khi chưa có / lỗi API định tuyến (BR-82):
 * đường chim bay × 1,3 (đường thật ở khu dân cư thường dài hơn 1,2–1,4 lần), xe máy ~20 km/h.
 */
const ROAD_FACTOR = 1.3;
const SPEED_KMH = 20;

const getRoute = async (from, to) => {
    const distanceKm = round1(haversineKm(from, to) * ROAD_FACTOR);
    return {
        distanceKm,
        durationMinutes: Math.max(1, Math.ceil((distanceKm / SPEED_KMH) * 60)),
        polyline: null,
        source: 'ESTIMATE',
        provider: 'estimate'
    };
};

const getMatrix = async (origins, destination) => Promise.all(origins.map((o) => getRoute(o, destination)));

module.exports = {
    name: 'estimate',
    getMatrix,
    ROAD_FACTOR,
    SPEED_KMH,
    getRoute
};
