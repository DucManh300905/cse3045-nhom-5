import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import iconRetinaUrl from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';
import { MapContainer, Marker, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { geoApi, type PlaceSuggestion } from '../api/geo';
import { getErrorMessage } from '../api/client';
import { currentPosition, directionsUrl, HOA_LAC, sameSpot, type LatLng } from '../utils/geo';

// Leaflet tìm ảnh ghim theo đường dẫn CSS -> hỏng khi đóng gói bằng Vite; chỉ định ảnh trực tiếp
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl, iconUrl, shadowUrl });

// Ảnh nền bản đồ: OpenStreetMap France (dữ liệu OSM, nhãn tiếng Việt, không cần khóa). Không dùng:
//  - tile.openstreetmap.org: DNS một số nhà mạng Việt Nam (vd VNPT) chặn tên miền -> chỉ còn nền xám
//  - CARTO basemaps: từ 2026 bắt buộc API key (ảnh trả về chữ "API KEY REQUIRED")
// Đổi nguồn (vd Maptiles của Goong): VITE_MAP_TILE_URL / VITE_MAP_ATTRIBUTION trong frontend/.env
const TILE_URL = (import.meta.env.VITE_MAP_TILE_URL as string | undefined)
  || 'https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png';
const ATTRIBUTION = (import.meta.env.VITE_MAP_ATTRIBUTION as string | undefined)
  || '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · tiles &copy; <a href="https://www.openstreetmap.fr">OpenStreetMap France</a>';

/** Đưa bản đồ tới điểm mới (tìm kiếm / GPS / mở lại form) */
function FollowPoint({ point }: { point: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (point) map.panTo([point.lat, point.lng]);
  }, [map, point]);
  return null;
}

function ClickToPin({ onPick, disabled }: { onPick: (p: LatLng) => void; disabled?: boolean }) {
  useMapEvents({ click: e => !disabled && onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

interface Props {
  value: LatLng | null;
  onChange: (p: LatLng) => void;
  /** Địa chỉ dạng chữ của điểm vừa chọn (khi có tra địa chỉ) — để gợi ý điền ô địa chỉ */
  onAddress?: (address: string) => void;
  /** Chưa có điểm: tự lấy vị trí hiện tại khi mở (mặc định bật) */
  autoLocate?: boolean;
  height?: number;
  disabled?: boolean;
}

/**
 * Chọn vị trí trên bản đồ (đặc tả Bản đồ mục 7.1): bấm / kéo ghim, "Dùng vị trí hiện tại",
 * tìm địa chỉ bằng chữ (khi backend có khóa Goong). Mở bản đồ tại vị trí hiện tại của người dùng;
 * từ chối quyền vị trí thì mở ở khu Hòa Lạc để ghim tay.
 */
export default function LocationPicker({ value, onChange, onAddress, autoLocate = true, height = 280, disabled }: Props) {
  const [searchOn, setSearchOn] = useState(false);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [message, setMessage] = useState('');
  const [locating, setLocating] = useState(false);
  const [center] = useState<LatLng>(() => value ?? HOA_LAC);
  const lastReverse = useRef<LatLng | null>(null);
  const triedAuto = useRef(false);
  // Chữ vừa điền vào ô sau khi chọn gợi ý -> không tìm lại (nếu không bảng gợi ý mở lại che bản đồ)
  const chosenText = useRef('');
  // Điểm hiện tại để ưu tiên gợi ý gần đó — dùng ref để ghim / kéo ghim không kích hoạt tìm lại
  const nearRef = useRef<LatLng | null>(value);
  nearRef.current = value;

  useEffect(() => {
    geoApi.status().then(s => setSearchOn(s.search));
  }, []);

  const pick = (p: LatLng, address?: string) => {
    onChange(p);
    if (address && onAddress) {
      lastReverse.current = p;
      onAddress(address);
    }
  };

  const locate = async (auto = false) => {
    setLocating(true);
    try {
      const p = await currentPosition();
      pick(p);
      setMessage(auto ? 'Đã đặt ghim tại vị trí hiện tại của bạn — kéo ghim hoặc bấm lên bản đồ nếu vị trí đúng ở chỗ khác.' : '');
    } catch (err) {
      setMessage(`${(err as Error).message}. Hãy bấm lên bản đồ hoặc tìm địa chỉ để ghim.`);
    } finally {
      setLocating(false);
    }
  };

  // Mở lần đầu chưa có điểm -> vị trí hiện tại (quyết định 20/10/2026)
  useEffect(() => {
    if (!value && autoLocate && !disabled && !triedAuto.current) {
      triedAuto.current = true;
      locate(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Điểm đổi -> tra địa chỉ chữ (để gợi ý), bỏ qua nếu điểm đến từ ô tìm kiếm
  useEffect(() => {
    if (!value || !searchOn || !onAddress || sameSpot(value, lastReverse.current)) return;
    const t = window.setTimeout(() => {
      lastReverse.current = value;
      geoApi.reverse(value).then(a => a && onAddress(a)).catch(() => {});
    }, 600);
    return () => window.clearTimeout(t);
  }, [value, searchOn, onAddress]);

  // Gợi ý địa chỉ khi gõ (chờ 400 ms sau phím cuối)
  useEffect(() => {
    const text = query.trim();
    if (!searchOn || text.length < 2 || text === chosenText.current) {
      setSuggestions([]);
      return;
    }
    let ignore = false;
    const t = window.setTimeout(() => {
      geoApi.autocomplete(text, nearRef.current ?? HOA_LAC)
        .then(list => { if (!ignore) setSuggestions(list); })
        .catch(err => setMessage(getErrorMessage(err)));
    }, 400);
    return () => { ignore = true; window.clearTimeout(t); };
  }, [query, searchOn]);

  const choose = async (s: PlaceSuggestion) => {
    try {
      const place = await geoApi.place(s.placeId);
      const label = s.mainText ?? s.description;
      chosenText.current = label;
      setSuggestions([]);
      setQuery(label);
      pick({ lat: place.lat, lng: place.lng }, place.address ?? s.description);
      setMessage('');
    } catch (err) {
      setMessage(getErrorMessage(err));
    }
  };

  return (
    <div className="location-picker">
      <div className="location-tools">
        {searchOn && (
          <div className="location-search">
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              // Bấm ra ngoài / Esc -> đóng gợi ý (chờ chút để kịp nhận cú bấm vào gợi ý)
              onBlur={() => window.setTimeout(() => setSuggestions([]), 150)}
              onKeyDown={e => { if (e.key === 'Escape') setSuggestions([]); if (e.key === 'Enter') e.preventDefault(); }}
              placeholder="Tìm địa chỉ (vd: ĐH Việt Nhật, KTX...)"
              disabled={disabled}
              aria-label="Tìm địa chỉ trên bản đồ"
            />
            {suggestions.length > 0 && (
              <ul className="location-suggestions" role="listbox">
                {suggestions.map(s => (
                  <li key={s.placeId}>
                    {/* onMouseDown: chọn trước khi ô nhập mất focus (onBlur đóng danh sách) */}
                    <button type="button" onMouseDown={e => { e.preventDefault(); choose(s); }}>
                      <b>{s.mainText ?? s.description}</b>
                      {s.secondaryText && <small>{s.secondaryText}</small>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <button type="button" className="btn-soft" onClick={() => locate()} disabled={locating || disabled}>
          {locating ? 'Đang định vị...' : '📍 Dùng vị trí hiện tại'}
        </button>
      </div>

      <div className="location-map" style={{ height }}>
        <MapContainer center={[center.lat, center.lng]} zoom={16} scrollWheelZoom style={{ height: '100%' }}>
          <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
          <ClickToPin onPick={p => pick(p)} disabled={disabled} />
          <FollowPoint point={value} />
          {value && (
            <Marker
              position={[value.lat, value.lng]}
              draggable={!disabled}
              eventHandlers={{
                dragend: e => {
                  const ll = (e.target as L.Marker).getLatLng();
                  pick({ lat: ll.lat, lng: ll.lng });
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <small className={value ? 'location-hint' : 'location-hint warn'}>
        {message || (value
          ? <>Đã ghim vị trí · bấm lên bản đồ hoặc kéo ghim để chỉnh · <a href={directionsUrl(value)} target="_blank" rel="noreferrer">xem trên Google Maps</a></>
          : 'Chưa có vị trí — bấm lên bản đồ để ghim.')}
      </small>
    </div>
  );
}

/** Bản đồ nhỏ chỉ để xem (trang quán) */
export function MiniMap({ point, height = 180 }: { point: LatLng; height?: number }) {
  return (
    <div className="location-map mini" style={{ height }}>
      <MapContainer center={[point.lat, point.lng]} zoom={16} scrollWheelZoom={false} dragging={false} zoomControl={false} style={{ height: '100%' }}>
        <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
        <Marker position={[point.lat, point.lng]} />
      </MapContainer>
    </div>
  );
}

// ======================= Bản đồ theo dõi giao hàng (tài xế MAK) =======================

export interface TrackPoint {
  lat: number;
  lng: number;
  kind: 'store' | 'customer' | 'driver';
  label?: string;
}

const PIN_TEXT: Record<TrackPoint['kind'], string> = { store: 'Q', customer: 'K', driver: '🛵' };
const pinIcon = (kind: TrackPoint['kind']) =>
  L.divIcon({ className: '', html: `<span class="map-pin pin-${kind}">${PIN_TEXT[kind]}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] });

/** Khung nhìn ôm vừa các điểm lần đầu; sau đó chỉ đi theo tài xế khi tài xế ra khỏi khung */
function FitPoints({ points }: { points: TrackPoint[] }) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (points.length === 0) return;
    if (!fitted.current) {
      fitted.current = true;
      if (points.length === 1) map.setView([points[0].lat, points[0].lng], 16);
      else map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lng] as [number, number])), { padding: [30, 30], maxZoom: 17 });
      return;
    }
    const driver = points.find(p => p.kind === 'driver');
    if (driver && !map.getBounds().contains([driver.lat, driver.lng])) map.panTo([driver.lat, driver.lng]);
  }, [map, points]);
  return null;
}

/**
 * Bản đồ theo dõi: quán (Q), nơi giao (K), tài xế (🛵) + tuyến đường quán -> khách (nếu có).
 * Chỉ xem, không ghim. path: danh sách [lat, lng] đã giải mã.
 */
export function TrackMap({ points, path, height = 260 }: { points: TrackPoint[]; path?: [number, number][]; height?: number }) {
  const first = points[0] ?? { ...HOA_LAC };
  return (
    <div className="location-map track-map" style={{ height }}>
      <MapContainer center={[first.lat, first.lng]} zoom={15} scrollWheelZoom style={{ height: '100%' }}>
        <TileLayer url={TILE_URL} attribution={ATTRIBUTION} />
        <FitPoints points={points} />
        {path && path.length > 1 && <Polyline positions={path} pathOptions={{ color: '#d4540c', weight: 4, opacity: 0.7 }} />}
        {points.map((p, i) => (
          <Marker key={`${p.kind}-${i}`} position={[p.lat, p.lng]} icon={pinIcon(p.kind)} title={p.label} />
        ))}
      </MapContainer>
    </div>
  );
}
