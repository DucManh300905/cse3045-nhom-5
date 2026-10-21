import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { io, type Socket } from 'socket.io-client';
import { API_ORIGIN, TOKEN_KEY } from '../api/client';
import type { AppNotification } from '../types';
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
  actorType?: 'CUSTOMER' | 'OWNER' | 'ADMIN' | 'SYSTEM' | 'SHIPPER';
  reason?: string;
  at: string;
}

export interface RestaurantStatusEvent {
  restaurantId: string;
  status: string;
  rejectReason?: string;
}

/** Bước giao của tài xế đổi (đơn PLATFORM) */
export interface DeliveryChangedEvent {
  orderId: string;
  code: string;
  status: string;
  deliveryStatus: string | null;
  shipper: { fullName: string; phone?: string; licensePlate?: string; vehicleType?: string } | null;
}

/** Vị trí tài xế của đơn đang giao — chỉ khách + quán của đơn đó nhận được */
export interface ShipperLocationEvent {
  orderId: string;
  lat: number;
  lng: number;
  at: string;
  eta: { minutes: number; target: 'STORE' | 'CUSTOMER'; updatedAt: string } | null;
}

/** Lời mời nhận đơn (tài xế) — cùng dạng ShipperOffer */
export interface DispatchOfferEvent {
  offerId: string;
  orderId: string;
  code: string;
  expiresAt: string;
}

export interface DispatchCancelledEvent {
  orderId: string;
  offerId?: string;
  code?: string;
  reason: 'EXPIRED' | 'ORDER_CHANGED' | 'ORDER_CANCELLED' | 'ASSIGNED_TO_OTHER';
}

interface SocketEvents {
  'order:new': OrderNewEvent;
  'order:status_changed': OrderStatusEvent;
  'restaurant:status_changed': RestaurantStatusEvent;
  'delivery:changed': DeliveryChangedEvent;
  'shipper:location': ShipperLocationEvent;
  'dispatch:offer': DispatchOfferEvent;
  'dispatch:cancelled': DispatchCancelledEvent;
  /** Thông báo vừa lưu cho chính người dùng này (chuông) */
  'notification:new': AppNotification;
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
    // API_ORIGIN rỗng khi build với VITE_API_URL=/api (VPS): truyền undefined để socket nối về đúng trang đang mở
    const s = io(API_ORIGIN || undefined, {
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
