import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_ORIGIN, TOKEN_KEY } from '../api/client';
import { useAuth } from './AuthContext';

// Realtime (docs/API.md mục 3): server tự cho vào phòng theo token (user / quán / admin).
// Client chỉ nghe sự kiện, mọi thay đổi dữ liệu vẫn đi qua REST.

export interface OrderNewEvent {
  orderId: string;
  code: string;
  total: number;
  itemsCount: number;
  fulfillmentType: 'DELIVERY' | 'PICKUP';
  placedAt: string;
}

export interface OrderStatusEvent {
  orderId: string;
  code: string;
  from?: string;
  to: string;
  actorType?: 'CUSTOMER' | 'OWNER' | 'ADMIN' | 'SYSTEM';
  reason?: string;
  at: string;
}

export interface RestaurantStatusEvent {
  restaurantId: string;
  status: string;
  rejectReason?: string;
}

interface SocketEvents {
  'order:new': OrderNewEvent;
  'order:status_changed': OrderStatusEvent;
  'restaurant:status_changed': RestaurantStatusEvent;
  /** Kết nối lại sau khi mất mạng -> nên tải lại dữ liệu để không sót */
  reconnected: void;
}

interface SocketValue {
  socket: Socket | null;
  connected: boolean;
}

const Ctx = createContext<SocketValue>({ socket: null, connected: false });

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!user) return;
    const s = io(API_ORIGIN, {
      // Đọc token mỗi lần (kết nối lại) để dùng token mới sau khi đổi mật khẩu
      auth: cb => cb({ token: localStorage.getItem(TOKEN_KEY) }),
      transports: ['websocket', 'polling'],
    });
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    setSocket(s);
    return () => {
      s.close();
      setSocket(null);
      setConnected(false);
    };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return <Ctx.Provider value={{ socket, connected }}>{children}</Ctx.Provider>;
}

export const useSocket = () => useContext(Ctx);

/**
 * Nghe một sự kiện realtime. handler luôn là bản mới nhất (không cần useCallback).
 * 'reconnected' phát khi kết nối lại sau khi mất kết nối.
 */
export function useSocketEvent<E extends keyof SocketEvents>(event: E, handler: (payload: SocketEvents[E]) => void) {
  const { socket } = useSocket();
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!socket) return;
    const name = event === 'reconnected' ? 'connect' : event;
    let first = socket.connected;
    const listener = (payload: SocketEvents[E]) => {
      if (event === 'reconnected') {
        // Lần kết nối đầu không tính là "kết nối lại"
        if (!first) { first = true; return; }
      }
      ref.current(payload);
    };
    socket.on(name, listener as never);
    return () => { socket.off(name, listener as never); };
  }, [socket, event]);
}
