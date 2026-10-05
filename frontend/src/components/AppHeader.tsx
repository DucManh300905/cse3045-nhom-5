import { NavLink } from 'react-router-dom';
import Logo from './Logo';
import UserMenu from './UserMenu';

interface Props {
  /** Có truyền thì hiện ô tìm kiếm (trang thực đơn) */
  search?: { value: string; onChange: (v: string) => void };
  /** Có truyền thì hiện nút giỏ hàng */
  cart?: { count: number; onOpen: () => void };
}

export default function AppHeader({ search, cart }: Props) {
  return (
    <header className="app-header">
      <div className="container header-row">
        <Logo />

        {search && (
          <label className="search">
            <input
              type="search"
              value={search.value}
              onChange={e => search.onChange(e.target.value)}
              placeholder="Hôm nay bạn muốn ăn gì?"
              aria-label="Tìm món, quán"
            />
          </label>
        )}

        <nav className="header-actions">
          <NavLink to="/menu" className="nav-link">Thực đơn</NavLink>
          <NavLink to="/orders" className="nav-link">Đơn của tôi</NavLink>
          {cart && (
            <button className="cart-btn" onClick={cart.onOpen} aria-label={`Giỏ hàng, ${cart.count} món`}>
              <span>Giỏ hàng</span>
              {cart.count > 0 && <span className="cart-count">{cart.count}</span>}
            </button>
          )}
          <UserMenu />
        </nav>
      </div>
    </header>
  );
}
