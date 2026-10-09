import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '../api/notifications';
import { useAuth } from '../context/AuthContext';
import { useSocketEvent } from '../context/SocketContext';
import type { AppNotification } from '../types';

const PAGE_SIZE = 10;

/** "vừa xong", "5 phút trước", "3 giờ trước", rồi tới ngày */
const timeAgo = (iso: string) => {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return 'vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} giờ trước`;
  return new Date(iso).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
};

/** Chuông thông báo (API-7): dùng chung cho khách, chủ quán, admin */
export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async (limit = PAGE_SIZE) => {
    setLoading(true);
    try {
      // API cho tối đa 100 mỗi lần
      const res = await notificationsApi.list({ limit: Math.min(100, limit) });
      setItems(res.items);
      setUnread(res.unreadCount);
      setTotal(res.total);
    } catch {
      // Chuông lỗi không làm hỏng trang; lần mở sau tải lại
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  // Thông báo mới tới ngay, không cần tải lại
  useSocketEvent('notification:new', n => {
    setItems(list => [n, ...list.filter(x => x.id !== n.id)].slice(0, Math.max(PAGE_SIZE, list.length)));
    setUnread(c => c + 1);
    setTotal(t => t + 1);
  });
  useSocketEvent('reconnected', () => load(Math.max(PAGE_SIZE, items.length)));

  // Đóng khi bấm ra ngoài hoặc nhấn Esc
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  const openItem = async (n: AppNotification) => {
    setOpen(false);
    if (!n.isRead) {
      setItems(list => list.map(x => (x.id === n.id ? { ...x, isRead: true } : x)));
      setUnread(c => Math.max(0, c - 1));
      notificationsApi.markRead(n.id).catch(() => load());
    }
    if (n.data.link) navigate(n.data.link);
  };

  const readAll = async () => {
    setItems(list => list.map(x => ({ ...x, isRead: true })));
    setUnread(0);
    await notificationsApi.markAllRead().catch(() => load());
  };

  return (
    <div className="bell" ref={ref}>
      <button
        className="btn-outline bell-btn"
        onClick={() => { setOpen(o => !o); if (!open) load(Math.max(PAGE_SIZE, items.length)); }}
        aria-expanded={open}
        aria-label={unread ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && <span className="bell-count">{unread > 99 ? '99+' : unread}</span>}
      </button>

      {open && (
        <div className="bell-pop" role="dialog" aria-label="Thông báo">
          <div className="bell-head">
            <b>Thông báo</b>
            {unread > 0 && <button className="link-btn" onClick={readAll}>Đánh dấu đã đọc tất cả</button>}
          </div>

          {items.length === 0 ? (
            <p className="bell-empty">{loading ? 'Đang tải...' : 'Chưa có thông báo nào.'}</p>
          ) : (
            <ul className="bell-list">
              {items.map(n => (
                <li key={n.id}>
                  <button className={n.isRead ? 'bell-item' : 'bell-item unread'} onClick={() => openItem(n)}>
                    <span className="bell-dot" aria-hidden />
                    <span className="bell-text">
                      <b>{n.title}</b>
                      {n.body && <small>{n.body}</small>}
                      <small className="bell-time">{timeAgo(n.createdAt)}</small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {items.length < total && (
            <button className="bell-more" onClick={() => load(items.length + PAGE_SIZE)} disabled={loading}>
              {loading ? 'Đang tải...' : 'Xem thêm'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
