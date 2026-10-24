import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { notificationsApi } from '../api/notifications';
import type { NotificationType } from '../types';
import { groupForPath, groupOf } from '../utils/badges';
import { useAuth } from './AuthContext';
import { useSocketEvent } from './SocketContext';

/** Chuông và số đỏ trên menu báo cho nhau khi số chưa đọc đổi (vd bấm một thông báo trong chuông) */
export const NOTIFICATIONS_CHANGED = 'mak:notifications-changed';
const REFRESH_MS = 60_000;

interface BadgeValue {
  /** Số chưa đọc theo loại thông báo */
  byType: Partial<Record<NotificationType, number>>;
  countOf: (types: NotificationType[]) => number;
  markTypesRead: (types: NotificationType[]) => void;
  refresh: () => void;
}

const Ctx = createContext<BadgeValue>({ byType: {}, countOf: () => 0, markTypesRead: () => {}, refresh: () => {} });

/**
 * Số thông báo chưa đọc theo loại cho số đỏ trên menu / tab (một API cho tất cả: GET /notifications/unread-counts).
 * Tải khi đăng nhập, khi có thông báo mới (realtime), khi kết nối lại và mỗi 60 giây.
 */
export function BadgeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [byType, setByType] = useState<BadgeValue['byType']>({});
  const pending = useRef(new Set<string>());

  const refresh = useCallback(() => {
    if (!user) return;
    notificationsApi.unreadCounts().then(r => setByType(r.byType)).catch(() => {});
  }, [user]);

  useEffect(() => {
    setByType({});
    if (!user) return;
    refresh();
    const t = window.setInterval(refresh, REFRESH_MS);
    const onChanged = (e: Event) => { if ((e as CustomEvent).detail !== 'badges') refresh(); };
    window.addEventListener(NOTIFICATIONS_CHANGED, onChanged);
    return () => {
      window.clearInterval(t);
      window.removeEventListener(NOTIFICATIONS_CHANGED, onChanged);
    };
  }, [user, refresh]);

  useSocketEvent('notification:new', n => setByType(m => ({ ...m, [n.type]: (m[n.type] ?? 0) + 1 })));
  useSocketEvent('reconnected', () => refresh());

  const countOf = useCallback((types: NotificationType[]) => types.reduce((sum, t) => sum + (byType[t] ?? 0), 0), [byType]);

  const markTypesRead = useCallback((types: NotificationType[]) => {
    const unread = types.filter(t => (byType[t] ?? 0) > 0);
    const keyOf = unread.sort().join(',');
    if (!unread.length || pending.current.has(keyOf)) return;
    pending.current.add(keyOf);
    setByType(m => ({ ...m, ...Object.fromEntries(unread.map(t => [t, 0])) }));
    notificationsApi.markTypesRead(unread)
      // Báo chuông tải lại số chưa đọc
      .then(() => window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED, { detail: 'badges' })))
      .catch(() => refresh())
      .finally(() => pending.current.delete(keyOf));
  }, [byType, refresh]);

  const value = useMemo(() => ({ byType, countOf, markTypesRead, refresh }), [byType, countOf, markTypesRead, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useBadges = () => useContext(Ctx);

/** Số chưa đọc của một mục menu theo key trong utils/badges.ts */
export function useBadgeCount(key: string) {
  const { user } = useAuth();
  const { countOf } = useBadges();
  const group = groupOf(user?.role, key);
  return group ? countOf(group.types) : 0;
}

/**
 * Đang xem mục nào thì đánh dấu đã đọc thông báo của mục đó — cả thông báo tới trong lúc đang xem.
 */
export function useMarkSeen(types: NotificationType[] | undefined) {
  const { countOf, markTypesRead } = useBadges();
  const list = types ?? [];
  const unread = countOf(list);
  const key = list.join(',');
  useEffect(() => {
    if (unread > 0) markTypesRead(list);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, unread]);
}

/** Số đỏ cạnh tên mục (ẩn khi 0) */
export function NavBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return <span className="nav-badge" aria-label={`${n} thông báo mới`}>{n > 99 ? '99+' : n}</span>;
}

/** Số đỏ cho một mục menu theo key (vd <MenuBadge k="dispatch" />) */
export function MenuBadge({ k }: { k: string }) {
  return <NavBadge n={useBadgeCount(k)} />;
}

/** Đặt trong layout: trang đang mở thuộc mục nào thì đánh dấu đã đọc mục đó. skip: mục tự xử lý theo tab (Ví đối soát) */
export function useMarkCurrentSeen(pathname: string, skip: string[] = []) {
  const { user } = useAuth();
  const group = groupForPath(user?.role, pathname);
  useMarkSeen(group && !skip.includes(group.key) ? group.types : undefined);
}
