// Tiện ích tọa độ. Quy ước trong code: { lat, lng }; trong MongoDB: GeoJSON Point coordinates = [lng, lat]

const EARTH_RADIUS_KM = 6371;
const toRad = (deg) => (deg * Math.PI) / 180;

/** Khoảng cách đường thẳng (đường chim bay) giữa 2 điểm, km — công thức Haversine */
const haversineKm = (a, b) => {
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
};

const toPoint = ({ lat, lng }) => ({ type: 'Point', coordinates: [Number(lng), Number(lat)] });

/** GeoJSON Point -> { lat, lng } (null nếu thiếu) */
const fromPoint = (point) =>
    point?.coordinates?.length === 2 ? { lat: point.coordinates[1], lng: point.coordinates[0] } : null;

const isLatLng = (p) =>
    p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lng)) &&
    Math.abs(Number(p.lat)) <= 90 && Math.abs(Number(p.lng)) <= 180;

const round1 = (n) => Math.round(n * 10) / 10;

module.exports = {
    haversineKm,
    toPoint,
    fromPoint,
    isLatLng,
    round1
};
