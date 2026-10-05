import { Link, useLocation } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import { useAuth } from '../context/AuthContext';
import { useOrders } from '../context/OrderContext';
import type { OrderStatus } from '../types';
import { formatDateTime, formatPrice } from '../utils/format';

// Các bước của một đơn; CANCELLED hiển thị riêng
const FLOW: { status: OrderStatus; label: string }[] = [
  { status: 'PENDING', label: 'Chờ xác nhận' },
  { status: 'CONFIRMED', label: 'Đang chuẩn bị' },
  { status: 'DELIVERING', label: 'Đang giao' },
  { status: 'DONE', label: 'Đã giao' },
];

export default function OrdersPage() {
  const { user } = useAuth();
  const { ordersOf } = useOrders();
  const placedId = (useLocation().state as { placedId?: string } | null)?.placedId;
  const orders = user ? ordersOf(user.id) : [];

  return (
    <div className="app">
      <AppHeader />
      <main className="container page-body narrow">
        <h1 className="page-title">Đơn của tôi</h1>

        {placedId && (
          <div className="success-banner" role="status">
            <div>
              <b>Đặt món thành công!</b>
              <small>Quán sẽ sớm xác nhận đơn #{placedId} của bạn.</small>
            </div>
          </div>
        )}

        {orders.length === 0 ? (
          <div className="empty-state">
            <h2>Bạn chưa có đơn nào</h2>
            <p>Món ngon đang chờ bạn ở thực đơn hôm nay.</p>
            <Link to="/menu" className="btn-primary">Đặt món ngay</Link>
          </div>
        ) : (
          <ul className="order-list">
            {orders.map(o => {
              const step = FLOW.findIndex(f => f.status === o.status);
              return (
                <li key={o.id} className={o.id === placedId ? 'panel order highlight' : 'panel order'}>
                  <div className="order-top">
                    <div>
                      <b>Đơn #{o.id}</b>
                      <small>{formatDateTime(o.createdAt)}</small>
                    </div>
                    <strong>{formatPrice(o.total)}</strong>
                  </div>

                  {o.status === 'CANCELLED' ? (
                    <p className="order-cancelled">Đơn đã bị hủy</p>
                  ) : (
                    <ol className="track" aria-label="Trạng thái đơn">
                      {FLOW.map((f, i) => (
                        <li key={f.status} className={i < step ? 'done' : i === step ? 'current' : ''}>
                          <span className="dot" aria-hidden />
                          {f.label}
                        </li>
                      ))}
                    </ol>
                  )}

                  <ul className="order-items">
                    {o.items.map(i => (
                      <li key={i.dishId}>
                        <span><b>{i.qty}×</b> {i.name} <small>· {i.shop}</small></span>
                        <span>{formatPrice(i.price * i.qty)}</span>
                      </li>
                    ))}
                  </ul>

                  <p className="order-address">Giao đến: {o.address}</p>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
