import { Component, lazy, Suspense, type ComponentProps, type ReactNode } from 'react';

// Leaflet khá nặng -> chỉ tải khi trang thật sự hiện bản đồ (giữ gói JS chính <= 200 KB gzip — QUALITY Q3)
const Picker = lazy(() => import('./LocationPicker'));
const Mini = lazy(() => import('./LocationPicker').then(m => ({ default: m.MiniMap })));

const Loading = ({ height }: { height: number }) => (
  <div className="location-map map-loading" style={{ height }}>Đang tải bản đồ...</div>
);

/**
 * Bản đồ lỗi (mất mạng khi tải chunk, Leaflet khởi tạo lại khi Vite nạp nóng code...) -> báo + nút thử lại,
 * thay vì làm biến mất cả khối bản đồ.
 */
class MapErrorBoundary extends Component<{ height: number; children: ReactNode }, { error: Error | null; attempt: number }> {
  state = { error: null as Error | null, attempt: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[map] lỗi hiển thị bản đồ:', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="location-map map-loading" style={{ height: this.props.height }}>
          <span>
            Không hiển thị được bản đồ.{' '}
            <button type="button" className="link-btn" onClick={() => this.setState(s => ({ error: null, attempt: s.attempt + 1 }))}>
              Tải lại bản đồ
            </button>
          </span>
        </div>
      );
    }
    // key đổi sau mỗi lần thử lại -> dựng khung bản đồ mới hoàn toàn
    return <div key={this.state.attempt}>{this.props.children}</div>;
  }
}

export function LocationPicker(props: ComponentProps<typeof Picker>) {
  const height = props.height ?? 280;
  return (
    <MapErrorBoundary height={height}>
      <Suspense fallback={<Loading height={height} />}>
        <Picker {...props} />
      </Suspense>
    </MapErrorBoundary>
  );
}

export function MiniMap(props: ComponentProps<typeof Mini>) {
  const height = props.height ?? 180;
  return (
    <MapErrorBoundary height={height}>
      <Suspense fallback={<Loading height={height} />}>
        <Mini {...props} />
      </Suspense>
    </MapErrorBoundary>
  );
}
