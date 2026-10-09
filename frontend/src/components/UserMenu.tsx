import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

/** Nút "Đăng nhập" khi chưa đăng nhập, hoặc tên người dùng + menu khi đã đăng nhập */
export default function UserMenu() {
  const { user, loading, logout } = useAuth();
  const notify = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (loading) return null;
  if (!user) return <Link to="/login" className="btn-outline">Đăng nhập</Link>;

  return (
    <div className="user-menu" ref={ref}>
      <button className="btn-outline user-chip" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="avatar">{user.fullName.charAt(0).toUpperCase()}</span>
        <span className="user-name">{user.fullName}</span>
      </button>
      {open && (
        <div className="user-pop">
          <div className="user-pop-head">
            <b>{user.fullName}</b>
            <small>{user.email || user.phone}</small>
          </div>
          {user.role === 'RESTAURANT_OWNER' ? (
            <button onClick={() => { setOpen(false); navigate('/owner'); }}>Kênh chủ quán</button>
          ) : user.role === 'ADMIN' ? (
            <button onClick={() => { setOpen(false); navigate('/admin'); }}>Trang quản trị</button>
          ) : (
            <>
              <button onClick={() => { setOpen(false); navigate('/orders'); }}>Đơn của tôi</button>
              <button onClick={() => { setOpen(false); navigate('/account'); }}>Tài khoản & sổ địa chỉ</button>
            </>
          )}
          <button onClick={() => { setOpen(false); logout(); notify('Đã đăng xuất'); navigate('/', { replace: true }); }}>Đăng xuất</button>
        </div>
      )}
    </div>
  );
}
