import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getErrorMessage } from '../api/client';
import { ordersApi } from '../api/orders';
import AppHeader from '../components/AppHeader';
import { useSocketEvent } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import type { Order, OrderStatus } from '../types';
import { formatDateTime, formatPrice } from '../utils/format';

const PAGE_SIZE = 10;
/** API giới hạn limit tối đa 100 */
const MAX_LIMIT = 100;

// Các bước của đơn (BR-35); đơn tự lấy không có bước "Đang giao"
const flowOf = (o: Order): { label: string; statuses: OrderStatus[] }[] => [
  { label: 'Chờ quán nhận', statuses: ['PLACED'] },
  { label: 'Đang chuẩn bị', statuses: ['ACCEPTED', 'PREPARING'] },
  { label: o.fulfillmentType === 'PICKUP' ? 'Sẵn sàng, mời lấy' : 'Sẵn sàng', statuses: ['READY'] },
  ...(o.fulfillmentType === 'DELIVERY' ? [{ label: 'Đang giao', statuses: ['DELIVERING'] as OrderStatus[] }] : []),
  { label: 'Hoàn thành', statuses: ['COMPLETED'] },
];

const ENDED: Partial<Record<OrderStatus, string>> = {
  REJECTED: 'Quán đã từ chối đơn',
  CANCELLED: 'Đơn đã bị hủy',
};

const STATUS_NOTICE: Record<string, string> = {
  ACCEPTED: 'quán đã nhận đơn',
  PREPARING: 'quán đang làm món',
  READY: 'món đã xong',
  DELIVERING: 'đang giao đến bạn',
  COMPLETED: 'hoàn thành. Chúc ngon miệng!',
  REJECTED: 'quán đã từ chối đơn',
  CANCELLED: 'đơn đã bị hủy',
};

const CANCEL_REASON: Record<string, string> = {
  CUSTOMER_CHANGED_MIND: 'Bạn đã hủy đơn',
  TIMEOUT: 'Quán không phản hồi kịp',
  OUT_OF_STOCK: 'Quán hết món',
  OVERLOADED: 'Quán đang quá tải',
  CLOSED: 'Quán đã đóng cửa',
  OTHER: 'Lý do khác',
};

export default function OrdersPage() {
  const notify = useToast();
  const placed = useLocation().state as { placedCode?: string; placedId?: string } | null;
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  /** Tải lại từ trang 1 tới trang hiện tại (giữ danh sách đang xem) */
  const load = useCallback(async (upTo: number) => {
    setLoading(true);
    try {
      const res = await ordersApi.list({ page: 1, limit: Math.min(MAX_LIMIT, PAGE_SIZE * upTo) });
      setOrders(res.items);
      setTotal(res.total);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(page); }, [load, page]);

  // Realtime: quán nhận / làm xong / giao... -> cập nhật đúng đơn đó, không cần F5
  useSocketEvent('order:status_changed', async e => {
    if (e.actorType !== 'CUSTOMER') notify(`Đơn ${e.code}: ${STATUS_NOTICE[e.to] ?? e.to}`);
    try {
      const fresh = await ordersApi.get(e.orderId);
      setOrders(list => (list.some(o => o.id === fresh.id) ? list.map(o => (o.id === fresh.id ? fresh : o)) : [fresh, ...list]));
    } catch {
      load(page);
    }
  });
  useSocketEvent('reconnected', () => load(page));

  const cancel = async (o: Order) => {
    if (!window.confirm(`Hủy đơn ${o.code}?`)) return;
    setBusyId(o.id);
    try {
      const updated = await ordersApi.cancel(o.id);
      setOrders(list => list.map(x => (x.id === updated.id ? updated : x)));
      notify('Đã hủy đơn');
    } catch (err) {
      notify(getErrorMessage(err));
      load(page);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="app">
      <AppHeader />
      <main className="container page-body narrow">
        <div className="owner-title-row">
          <h1 className="page-title">Đơn của tôi</h1>
          {orders.length > 0 && (
            <button className="btn-outline" onClick={() => load(page)} disabled={loading}>
              {loading ? 'Đang tải...' : '↻ Tải lại'}
            </button>
          )}
        </div>

        {placed?.placedCode && (
          <div className="success-banner" role="status">
            <div>
              <b>Đặt món thành công!</b>
              <small>Quán sẽ sớm xác nhận đơn {placed.placedCode} của bạn. Bạn có thể hủy khi quán chưa nhận đơn.</small>
            </div>
          </div>
        )}

        {error ? (
          <div className="empty-state">
            <h2>Không tải được đơn hàng</h2>
            <p>{error}</p>
            <button className="btn-soft" onClick={() => load(page)}>Thử lại</button>
          </div>
        ) : loading && orders.length === 0 ? (
          <div className="page-loading">Đang tải...</div>
        ) : orders.length === 0 ? (
          <div className="empty-state">
            <h2>Bạn chưa có đơn nào</h2>
            <p>Món ngon đang chờ bạn ở thực đơn hôm nay.</p>
            <Link to="/menu" className="btn-primary">Đặt món ngay</Link>
          </div>
        ) : (
          <>
            <ul className="order-list">
              {orders.map(o => {
                const flow = flowOf(o);
                const step = flow.findIndex(f => f.statuses.includes(o.status));
                return (
                  <li key={o.id} className={o.id === placed?.placedId ? 'panel order highlight' : 'panel order'}>
                    <div className="order-top">
                      <div>
                        <b>{o.code}</b>
                        <small>
                          {o.restaurantSnapshot.slug
                            ? <Link to={`/restaurants/${o.restaurantSnapshot.slug}`} className="link-btn">{o.restaurantSnapshot.name}</Link>
                            : o.restaurantSnapshot.name}
                          {' · '}{formatDateTime(o.placedAt)} · {o.fulfillmentType === 'PICKUP' ? 'Tự đến lấy' : 'Giao tận nơi'}
                        </small>
                      </div>
                      <strong>{formatPrice(o.total)}</strong>
                    </div>

                    {ENDED[o.status] ? (
                      <p className="order-cancelled">
                        {ENDED[o.status]}
                        {o.cancelReason?.code && o.cancelReason.code !== 'CUSTOMER_CHANGED_MIND' && ` — ${CANCEL_REASON[o.cancelReason.code] ?? o.cancelReason.code}`}
                        {o.cancelReason?.note && `: ${o.cancelReason.note}`}
                      </p>
                    ) : (
                      <ol className="track" aria-label="Trạng thái đơn" style={{ gridTemplateColumns: `repeat(${flow.length}, 1fr)` }}>
                        {flow.map((f, i) => (
                          <li key={f.label} className={i < step ? 'done' : i === step ? 'current' : ''}>
                            <span className="dot" aria-hidden />
                            {f.label}
                          </li>
                        ))}
                      </ol>
                    )}

                    {o.estimatedReadyAt && ['ACCEPTED', 'PREPARING'].includes(o.status) && (
                      <p className="order-eta">
                        Dự kiến món xong lúc {new Date(o.estimatedReadyAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}

                    <ul className="order-items">
                      {o.items.map(i => {
                        const extras = [i.variant && `Size ${i.variant.name}`, ...i.options.map(op => op.name)].filter(Boolean).join(', ');
                        return (
                          <li key={i.id}>
                            <span><b>{i.qty}×</b> {i.name}{extras && <small> · {extras}</small>}</span>
                            <span>{formatPrice(i.lineTotal)}</span>
                          </li>
                        );
                      })}
                      {o.fulfillmentType === 'DELIVERY' && (
                        <li className="order-fee"><span>Phí giao hàng</span><span>Miễn phí</span></li>
                      )}
                    </ul>

                    <div className="order-foot">
                      <p className="order-address">
                        {o.delivery
                          ? <>Giao đến: {o.delivery.receiverName} · {o.delivery.phone} · {o.delivery.addressLine}{o.delivery.note && <> · <i>{o.delivery.note}</i></>}</>
                          : 'Tự đến lấy tại quán'}
                      </p>
                      {o.status === 'PLACED' && (
                        <button className="btn-outline danger-outline" onClick={() => cancel(o)} disabled={busyId === o.id}>
                          {busyId === o.id ? 'Đang hủy...' : 'Hủy đơn'}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {orders.length < total && PAGE_SIZE * page < MAX_LIMIT && (
              <div className="load-more">
                <button className="btn-soft" onClick={() => setPage(p => p + 1)} disabled={loading}>
                  {loading ? 'Đang tải...' : 'Xem thêm đơn cũ'}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
