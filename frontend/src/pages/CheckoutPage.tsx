import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppHeader from '../components/AppHeader';
import CartLines from '../components/CartLines';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { useOrders } from '../context/OrderContext';
import { useToast } from '../context/ToastContext';
import { formatPrice, PHONE_REGEX } from '../utils/format';

const STEPS = ['Chọn món', 'Thông tin giao hàng', 'Hoàn tất'];

export default function CheckoutPage() {
  const { user } = useAuth();
  const { lines, count, subtotal, clear } = useCart();
  const { placeOrder } = useOrders();
  const notify = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    receiverName: user?.fullName ?? '',
    phone: user?.phone ?? '',
    address: '',
    note: '',
  });
  const [error, setError] = useState('');
  const setField = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!lines.length) return setError('Giỏ hàng đang trống.');
    if (!form.receiverName.trim()) return setError('Vui lòng nhập tên người nhận.');
    if (!PHONE_REGEX.test(form.phone)) return setError('Vui lòng nhập số điện thoại liên hệ hợp lệ (10 chữ số, bắt đầu bằng 0).');
    if (form.address.trim().length < 5) return setError('Vui lòng nhập địa chỉ giao hàng cụ thể.');

    const order = placeOrder({
      userId: user.id,
      items: lines.map(({ dish, qty }) => ({ dishId: dish.id, name: dish.name, shop: dish.shop, price: dish.price, qty })),
      total: subtotal,
      receiverName: form.receiverName.trim(),
      phone: form.phone,
      address: form.address.trim(),
      note: form.note.trim(),
    });
    clear();
    notify(`Đặt món thành công! Mã đơn ${order.id}`);
    navigate('/orders', { state: { placedId: order.id } });
  };

  return (
    <div className="app">
      <AppHeader />
      <main className="container page-body">
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s} className={i < 1 ? 'done' : i === 1 ? 'current' : ''}>
              <span>{i + 1}</span>{s}
            </li>
          ))}
        </ol>

        <h1 className="page-title">Xác nhận đặt món</h1>

        {lines.length === 0 ? (
          <div className="empty-state">
            <h2>Giỏ hàng đang trống</h2>
            <p>Hãy chọn vài món ngon trước khi đặt nhé.</p>
            <Link to="/menu" className="btn-primary">Xem thực đơn</Link>
          </div>
        ) : (
          <form className="checkout-grid" onSubmit={submit} noValidate>
            <section className="panel form-panel">
              <h2>Giao đến đâu?</h2>
              <label>
                <span>Địa chỉ giao hàng *</span>
                <textarea
                  value={form.address}
                  onChange={e => setField('address', e.target.value)}
                  placeholder="vd: Phòng 305, KTX Đại học Việt Nhật, Khu CNC Hòa Lạc"
                  rows={3}
                  autoFocus
                />
              </label>
              <div className="form-grid">
                <label>
                  <span>Tên người nhận *</span>
                  <input value={form.receiverName} onChange={e => setField('receiverName', e.target.value)} autoComplete="name" />
                </label>
                <label>
                  <span>Số điện thoại liên hệ *</span>
                  <input type="tel" inputMode="numeric" value={form.phone} onChange={e => setField('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="0912345678" autoComplete="tel" />
                </label>
              </div>
              <label>
                <span>Ghi chú cho quán</span>
                <input value={form.note} onChange={e => setField('note', e.target.value)} placeholder="vd: Ít cay, không hành" />
              </label>
              <div className="pay-method">
                <div>
                  <b>Tiền mặt khi nhận hàng</b>
                  <small>Thanh toán trực tiếp cho người giao</small>
                </div>
              </div>
            </section>

            <section className="panel summary">
              <div className="summary-head">
                <h2>Đơn của bạn</h2>
                <Link to="/menu" className="link-btn">+ Thêm món</Link>
              </div>
              <CartLines />
              <div className="totals">
                <div><span>Tạm tính ({count} món)</span><span>{formatPrice(subtotal)}</span></div>
                <div><span>Phí giao hàng</span><span className="muted">Quán xác nhận sau</span></div>
                <div className="grand"><span>Tổng cộng</span><strong>{formatPrice(subtotal)}</strong></div>
              </div>
              {error && <div className="form-error" role="alert">{error}</div>}
              <button className="btn-primary wide" type="submit">Đặt món · {formatPrice(subtotal)}</button>
            </section>
          </form>
        )}
      </main>
    </div>
  );
}
