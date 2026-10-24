const { round1 } = require('../../../utils/geo');

/**
 * Goong REST API (https://docs.goong.io/rest/) — request / response cùng định dạng Google Maps.
 * Chỉ backend gọi; khóa GOONG_API_KEY nằm trong backend/.env (không gửi ra trình duyệt).
 * GOONG_VEHICLE: loại phương tiện cho Direction (mặc định "bike" = xe máy — kiểm tra lại trong tài liệu Goong).
 */
const baseUrl = () => process.env.GOONG_API_URL || 'https://rsapi.goong.io';
const apiKey = () => process.env.GOONG_API_KEY || '';
const timeoutMs = () => Number(process.env.ROUTING_TIMEOUT_MS) || 3000;

const isConfigured = () => Boolean(apiKey());

/** GET tới Goong, quá thời gian thì hủy; lỗi HTTP / trạng thái lỗi -> ném Error */
const goongGet = async (path, params) => {
    const url = new URL(path, baseUrl());
    Object.entries({ ...params, api_key: apiKey() }).forEach(([k, v]) => v !== undefined && url.searchParams.set(k, String(v)));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs());
    try {
        const res = await fetch(url, { signal: controller.signal });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || (data.status && !['OK', 'ZERO_RESULTS'].includes(data.status))) {
            // Không đưa URL (có khóa) vào thông báo lỗi
            throw new Error(`Goong ${path} failed: HTTP ${res.status} ${data.status ?? ''} ${data.error_message ?? ''}`.trim());
        }
        return data;
    } finally {
        clearTimeout(timer);
    }
};

const latlng = (p) => `${p.lat},${p.lng}`;

/** Đường đi thật quán -> khách */
const getRoute = async (from, to) => {
    const data = await goongGet('/Direction', {
        origin: latlng(from),
        destination: latlng(to),
        vehicle: process.env.GOONG_VEHICLE || 'bike'
    });
    const route = data.routes?.[0];
    const leg = route?.legs?.[0];
    if (!leg?.distance || !leg?.duration) {
        throw new Error('Goong Direction returned no route');
    }

    return {
        distanceKm: round1(leg.distance.value / 1000),
        durationMinutes: Math.max(1, Math.ceil(leg.duration.value / 60)),
        polyline: route.overview_polyline?.points ?? null,
        source: 'ROUTING',
        provider: 'goong'
    };
};

/**
 * Ma trận khoảng cách: nhiều điểm đi (tài xế) -> 1 điểm đến (quán) trong MỘT lần gọi (điều phối — BR-92).
 * @returns [{ distanceKm, durationMinutes } | null] theo đúng thứ tự origins (null: Goong không tìm được đường)
 */
const getMatrix = async (origins, destination) => {
    const data = await goongGet('/DistanceMatrix', {
        origins: origins.map(latlng).join('|'),
        destinations: latlng(destination),
        vehicle: process.env.GOONG_VEHICLE || 'bike'
    });
    return origins.map((_, i) => {
        const el = data.rows?.[i]?.elements?.[0];
        if (!el?.distance || !el?.duration || (el.status && el.status !== 'OK')) {
            return null;
        }
        return {
            distanceKm: round1(el.distance.value / 1000),
            durationMinutes: Math.max(1, Math.ceil(el.duration.value / 60)),
            source: 'ROUTING',
            provider: 'goong'
        };
    });
};

// ---- Tra địa chỉ bằng chữ (ô tìm kiếm trên bản đồ) ----

const autocomplete = async (input, near) => {
    const data = await goongGet('/Place/AutoComplete', {
        input,
        location: near ? latlng(near) : undefined,
        limit: 6
    });
    return (data.predictions ?? []).map((p) => ({
        placeId: p.place_id,
        description: p.description,
        mainText: p.structured_formatting?.main_text,
        secondaryText: p.structured_formatting?.secondary_text
    }));
};

const placeDetail = async (placeId) => {
    const data = await goongGet('/Place/Detail', { place_id: placeId });
    const loc = data.result?.geometry?.location;
    if (!loc) {
        throw new Error('Goong Place/Detail returned no location');
    }
    return { lat: loc.lat, lng: loc.lng, address: data.result.formatted_address ?? data.result.name };
};

const reverseGeocode = async (point) => {
    const data = await goongGet('/Geocode', { latlng: latlng(point) });
    return { address: data.results?.[0]?.formatted_address ?? null };
};

module.exports = {
    name: 'goong',
    isConfigured,
    getRoute,
    getMatrix,
    autocomplete,
    placeDetail,
    reverseGeocode
};
