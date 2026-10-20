// Tọa độ trong giao diện: { lat, lng }. API trả vị trí dạng GeoJSON: coordinates = [lng, lat]

export interface LatLng {
  lat: number;
  lng: number;
}

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

/** Dùng khi không lấy được vị trí người dùng (từ chối quyền / máy không có GPS) — khu Hòa Lạc */
export const HOA_LAC: LatLng = { lat: 21.0136, lng: 105.5254 };

export const fromPoint = (p?: GeoPoint | null): LatLng | null =>
  p?.coordinates?.length === 2 ? { lat: p.coordinates[1], lng: p.coordinates[0] } : null;

/** Vị trí hiện tại qua GPS trình duyệt (chỉ chạy trên HTTPS hoặc localhost) */
export const currentPosition = (timeout = 10000) =>
  new Promise<LatLng>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Trình duyệt không hỗ trợ định vị'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      err => reject(new Error(err.code === err.PERMISSION_DENIED ? 'Bạn chưa cho phép truy cập vị trí' : 'Không lấy được vị trí hiện tại')),
      { enableHighAccuracy: true, timeout, maximumAge: 60_000 }
    );
  });

/** Đã cho phép vị trí từ trước (để hiện khoảng cách mà không bật hộp hỏi quyền) */
export const geoPermissionGranted = async () => {
  try {
    const state = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    return state?.state === 'granted';
  } catch {
    return false;
  }
};

/** Mở Google Maps chỉ đường tới điểm (không cần API key) */
export const directionsUrl = (to: LatLng) => `https://www.google.com/maps/dir/?api=1&destination=${to.lat},${to.lng}`;

export const formatKm = (km: number) => `${km.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} km`;

export const sameSpot = (a: LatLng | null, b: LatLng | null) =>
  !!a && !!b && Math.abs(a.lat - b.lat) < 1e-6 && Math.abs(a.lng - b.lng) < 1e-6;
