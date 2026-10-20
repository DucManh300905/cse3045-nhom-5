import client, { type ApiResponse } from './client';
import type { LatLng } from '../utils/geo';

// Tra địa chỉ bằng chữ (backend gọi Goong, giấu khóa). search = false -> ẩn ô tìm kiếm.

export interface GeoStatus {
  search: boolean;
  /** goong = đường đi thật, estimate = ước lượng */
  routing: 'goong' | 'estimate';
}

export interface PlaceSuggestion {
  placeId: string;
  description: string;
  mainText?: string;
  secondaryText?: string;
}

let statusCache: Promise<GeoStatus> | null = null;

export const geoApi = {
  /** Gọi 1 lần cho cả phiên */
  status() {
    statusCache ??= client
      .get<ApiResponse<GeoStatus>>('/geo/status')
      .then(r => r.data.data)
      .catch(() => ({ search: false, routing: 'estimate' as const }));
    return statusCache;
  },

  async autocomplete(input: string, near?: LatLng | null) {
    const res = await client.get<ApiResponse<PlaceSuggestion[]>>('/geo/autocomplete', { params: { input, ...near } });
    return res.data.data;
  },

  async place(placeId: string) {
    const res = await client.get<ApiResponse<LatLng & { address?: string }>>(`/geo/place/${encodeURIComponent(placeId)}`);
    return res.data.data;
  },

  async reverse(point: LatLng) {
    const res = await client.get<ApiResponse<{ address: string | null }>>('/geo/reverse', { params: point });
    return res.data.data.address;
  },
};
