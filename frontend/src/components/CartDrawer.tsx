import { useEffect } from 'react';
import { useCart } from '../context/CartContext';
import { formatPrice } from '../utils/format';
import CartLines from './CartLines';

interface Props {
  open: boolean;
  onClose: () => void;
  onCheckout: () => void;
}

export default function CartDrawer({ open, onClose, onCheckout }: Props) {
  const { restaurant, lines, count, subtotal, clear } = useCart();

  // Khóa cuộn trang + đóng bằng phím Esc khi đang mở
  useEffect(() => {
    if (!open) return;
    document.body.classList.add('no-scroll');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('no-scroll');
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  return (
    <div className={open ? 'drawer open' : 'drawer'} aria-hidden={!open}>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer-panel" role="dialog" aria-modal="true" aria-label="Giỏ hàng">
        <div className="drawer-head">
          <div>
            <h2>Giỏ hàng của bạn</h2>
            <small>{count && restaurant ? `${count} món · ${restaurant.name}` : 'Chưa có món nào'}</small>
          </div>
          <button className="btn-outline" onClick={onClose}>Đóng</button>
        </div>

        <div className="drawer-body">
          {lines.length ? (
            <>
              <CartLines />
              <button className="link-btn" onClick={clear}>Xóa tất cả</button>
            </>
          ) : (
            <div className="drawer-empty">
              <p>Giỏ hàng còn trống.<br />Chọn vài món ngon nhé!</p>
              <button className="btn-soft" onClick={onClose}>Xem thực đơn</button>
            </div>
          )}
        </div>

        <div className="drawer-foot">
          <div className="sum-row">
            <span>Tạm tính</span>
            <strong>{formatPrice(subtotal)}</strong>
          </div>
          <p className="hint">Mỗi đơn đặt món của một quán. Quán tự giao, miễn phí giao hàng.</p>
          <button className="btn-primary wide" disabled={!lines.length} onClick={onCheckout}>
            Xác nhận đặt món
          </button>
        </div>
      </aside>
    </div>
  );
}
