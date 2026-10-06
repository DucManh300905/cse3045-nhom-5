import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '../../api/client';
import { merchantApi } from '../../api/merchant';
import { useSocketEvent } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import type { MerchantOrder, OrderStatus, OwnerReasonCode } from '../../types';
import { formatPrice } from '../../utils/format';
import { useOwner } from './OwnerLayout';

/** Đơn chờ quá thời gian này sẽ bị hệ thống tự hủy (BR-36, backend ORDER_TIMEOUT_MINUTES) */
const TIMEOUT_MINUTES = 5;

const TABS: { key: string; label: string; statuses: OrderStatus[] }[] = [
  { key: 'new', label: 'Chờ nhận', statuses: ['PLACED'] },
  { key: 'active', label: 'Đang làm', statuses: ['ACCEPTED', 'PREPARING', 'READY', 'DELIVERING'] },
  { key: 'done', label: 'Đã xong', statuses: ['COMPLETED', 'REJECTED', 'CANCELLED'] },
];

const STATUS_TEXT: Record<OrderStatus, string> = {
  PLACED: 'Chờ nhận',
  ACCEPTED: 'Đã nhận',
  PREPARING: 'Đang làm',
  READY: 'Món đã xong',
  DELIVERING: 'Đang giao',
  COMPLETED: 'Hoàn thành',
  REJECTED: 'Đã từ chối',
  CANCELLED: 'Đã hủy',
};

const REASONS: { code: OwnerReasonCode; label: string }[] = [
  { code: 'OUT_OF_STOCK', label: 'Hết món' },
  { code: 'OVERLOADED', label: 'Quán đang quá tải' },
  { code: 'CLOSED', label: 'Quán sắp đóng cửa' },
  { code: 'OTHER', label: 'Lý do khác' },
];

const CANCEL_TEXT: Record<string, string> = {
  CUSTOMER_CHANGED_MIND: 'Khách hủy',
  TIMEOUT: 'Hệ thống tự hủy (quá giờ không nhận)',
  OUT_OF_STOCK: 'Hết món',
  OVERLOADED: 'Quá tải',
  CLOSED: 'Sắp đóng cửa',
  OTHER: 'Lý do khác',
};

/** Nhãn nút cho bước tiếp theo */
const nextLabel = (o: MerchantOrder) =>
  ({
    PREPARING: 'Bắt đầu làm',
    READY: 'Món đã xong',
    DELIVERING: 'Đi giao',
    COMPLETED: o.fulfillmentType === 'PICKUP' ? 'Khách đã lấy · Đã thu tiền' : 'Đã giao · Đã thu tiền',
  } as Partial<Record<OrderStatus, string>>)[o.nextStatus ?? 'PLACED'];

const time = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '');

export default function OwnerOrdersPage() {
  const { restaurant, pendingCount, refreshPending } = useOwner();
  const notify = useToast();
  const [tab, setTab] = useState(TABS[0]);
  const [orders, setOrders] = useState<MerchantOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Đơn đang mở hộp chọn lý do từ chối / hủy */
  const [reasonFor, setReasonFor] = useState<{ id: string; action: 'reject' | 'cancel' } | null>(null);
  const [reason, setReason] = useState<{ code: OwnerReasonCode; note: string }>({ code: 'OUT_OF_STOCK', note: '' });
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    try {
      const res = await merchantApi.listOrders({ status: tab.statuses, limit: 50 });
      setOrders(res.items);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  // Đồng hồ đếm ngược cho đơn chờ nhận
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Realtime: có đơn mới / đơn đổi trạng thái / vừa kết nối lại -> tải lại tab đang xem
  useSocketEvent('order:new', () => load());
  useSocketEvent('order:status_changed', e => {
    if (e.actorType === 'CUSTOMER' && e.to === 'CANCELLED') notify(`Khách đã hủy đơn ${e.code}`);
    if (e.actorType === 'SYSTEM') notify(`Đơn ${e.code} bị hủy do quá ${TIMEOUT_MINUTES} phút chưa nhận`);
    load();
  });
  useSocketEvent('reconnected', () => load());

  if (!restaurant) {
    return (
      <div className="empty-state">
        <h2>Bạn chưa có quán</h2>
        <p>Tạo hồ sơ quán và được duyệt để bắt đầu nhận đơn.</p>
        <Link to="/owner" className="btn-primary">Tạo quán</Link>
      </div>
    );
  }

  const act = async (o: MerchantOrder, fn: () => Promise<MerchantOrder>, ok: string) => {
    setBusyId(o.id);
    try {
      await fn();
      notify(ok);
      setReasonFor(null);
    } catch (err) {
      notify(getErrorMessage(err));
    } finally {
      setBusyId(null);
      load();
      refreshPending();
    }
  };

  const openReason = (id: string, action: 'reject' | 'cancel') => {
    setReasonFor({ id, action });
    setReason({ code: action === 'reject' ? 'OUT_OF_STOCK' : 'OVERLOADED', note: '' });
  };

  return (
    <>
      <div className="owner-title-row">
        <h1 className="page-title">Đơn hàng</h1>
        <button className="btn-outline" onClick={() => { setLoading(true); load(); }} disabled={loading}>↻ Tải lại</button>
      </div>

      {!restaurant.canAcceptOrders && (
        <p className="form-error">
          Quán hiện <b>không nhận đơn mới</b>
          {restaurant.status !== 'APPROVED' ? ' (hồ sơ chưa được duyệt).' : !restaurant.isAcceptingOrders ? ' — bật "Đang nhận đơn" ở trang Hồ sơ quán.' : ' (ngoài giờ mở cửa).'}
          {' '}Đơn đang dở vẫn xử lý bình thường.
        </p>
      )}

      <div className="cat-tabs order-tabs" role="tablist">
        {TABS.map(t => (
          <button key={t.key} role="tab" aria-selected={tab.key === t.key} className={tab.key === t.key ? 'active' : ''} onClick={() => setTab(t)}>
            {t.label}
            {t.key === 'new' && pendingCount > 0 && <span className="nav-badge">{pendingCount}</span>}
          </button>
        ))}
      </div>

      {error ? (
        <div className="empty-state"><h2>Không tải được đơn</h2><p>{error}</p><button className="btn-soft" onClick={load}>Thử lại</button></div>
      ) : loading && orders.length === 0 ? (
        <div className="page-loading">Đang tải...</div>
      ) : orders.length === 0 ? (
        <div className="empty-state">
          <h2>{tab.key === 'new' ? 'Chưa có đơn mới' : tab.key === 'active' ? 'Không có đơn đang làm' : 'Chưa có đơn nào'}</h2>
          {tab.key === 'new' && <p>Đơn mới sẽ hiện ngay ở đây kèm âm báo — nhớ bấm "Bật âm báo" ở trên.</p>}
        </div>
      ) : (
        <ul className="kitchen-list">
          {orders.map(o => {
            const leftMs = new Date(o.placedAt).getTime() + TIMEOUT_MINUTES * 60_000 - now;
            const busy = busyId === o.id;
            return (
              <li key={o.id} className={`panel kitchen-card s-${o.status}`}>
                <div className="kitchen-head">
                  <div>
                    <b>{o.code}</b>
                    <span className={`status-chip s-${o.status === 'COMPLETED' ? 'APPROVED' : ['REJECTED', 'CANCELLED'].includes(o.status) ? 'REJECTED' : 'SUBMITTED'}`}>
                      {STATUS_TEXT[o.status]}
                    </span>
                    <span className="tag muted-tag">{o.fulfillmentType === 'PICKUP' ? 'Tự đến lấy' : 'Giao tận nơi'}</span>
                  </div>
                  <small>
                    Đặt lúc {time(o.placedAt)}
                    {o.status === 'PLACED' && (
                      <b className={leftMs < 60_000 ? 'countdown urgent' : 'countdown'}>
                        {leftMs > 0
                          ? ` · tự hủy sau ${Math.floor(leftMs / 60_000)}:${String(Math.floor((leftMs % 60_000) / 1000)).padStart(2, '0')}`
                          : ' · sắp tự hủy'}
                      </b>
                    )}
                    {o.estimatedReadyAt && ['ACCEPTED', 'PREPARING'].includes(o.status) && <> · dự kiến xong {time(o.estimatedReadyAt)}</>}
                  </small>
                </div>

                <ul className="kitchen-items">
                  {o.items.map(i => (
                    <li key={i.id}>
                      <b className="qty">{i.qty}×</b>
                      <div>
                        <b>{i.name}</b>
                        {(i.variant || i.options.length > 0) && (
                          <small>{[i.variant && `Size ${i.variant.name}`, ...i.options.map(op => op.name)].filter(Boolean).join(' · ')}</small>
                        )}
                        {i.note && <small className="item-note">Ghi chú: {i.note}</small>}
                      </div>
                      <span>{formatPrice(i.lineTotal)}</span>
                    </li>
                  ))}
                </ul>

                <div className="kitchen-meta">
                  <div>
                    <small>Khách</small>
                    <b>{o.delivery?.receiverName ?? o.customer?.fullName ?? '—'}</b>
                    {(o.delivery?.phone ?? o.customer?.phone) && (
                      <a href={`tel:${o.delivery?.phone ?? o.customer?.phone}`} className="link-btn">{o.delivery?.phone ?? o.customer?.phone}</a>
                    )}
                  </div>
                  {o.delivery && (
                    <div>
                      <small>Giao đến</small>
                      <b>{o.delivery.addressLine}</b>
                      {o.delivery.note && <small className="item-note">“{o.delivery.note}”</small>}
                    </div>
                  )}
                  <div className="kitchen-total">
                    <small>{o.paymentStatus === 'PAID' ? 'Đã thu tiền mặt' : 'Thu tiền mặt'}</small>
                    <strong>{formatPrice(o.total)}</strong>
                  </div>
                </div>

                {o.cancelReason?.code && (
                  <p className="order-cancelled">
                    {CANCEL_TEXT[o.cancelReason.code] ?? o.cancelReason.code}{o.cancelReason.note && `: ${o.cancelReason.note}`}
                  </p>
                )}

                {reasonFor?.id === o.id ? (
                  <form
                    className="reason-form"
                    onSubmit={e => {
                      e.preventDefault();
                      const note = reason.note.trim() || undefined;
                      act(
                        o,
                        () => (reasonFor.action === 'reject' ? merchantApi.rejectOrder(o.id, reason.code, note) : merchantApi.cancelOrder(o.id, reason.code, note)),
                        reasonFor.action === 'reject' ? `Đã từ chối đơn ${o.code}` : `Đã hủy đơn ${o.code}`
                      );
                    }}
                  >
                    <div className="form-grid">
                      <label>
                        <span>Lý do {reasonFor.action === 'reject' ? 'từ chối' : 'hủy'} *</span>
                        <select value={reason.code} onChange={e => setReason(r => ({ ...r, code: e.target.value as OwnerReasonCode }))}>
                          {REASONS.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>Ghi chú cho khách</span>
                        <input value={reason.note} onChange={e => setReason(r => ({ ...r, note: e.target.value }))} maxLength={200} placeholder="vd: Hết gà, mong bạn thông cảm" />
                      </label>
                    </div>
                    <div className="form-actions">
                      <button type="button" className="btn-outline" onClick={() => setReasonFor(null)}>Quay lại</button>
                      <button className="btn-primary danger" type="submit" disabled={busy}>
                        {reasonFor.action === 'reject' ? 'Xác nhận từ chối' : 'Xác nhận hủy đơn'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="kitchen-actions">
                    {o.status === 'PLACED' && (
                      <>
                        <button className="btn-outline danger-outline" disabled={busy} onClick={() => openReason(o.id, 'reject')}>Từ chối</button>
                        <button className="btn-primary" disabled={busy} onClick={() => act(o, () => merchantApi.acceptOrder(o.id), `Đã nhận đơn ${o.code}`)}>
                          {busy ? 'Đang xử lý...' : 'Nhận đơn'}
                        </button>
                      </>
                    )}
                    {o.status === 'ACCEPTED' && (
                      <button className="btn-outline danger-outline" disabled={busy} onClick={() => openReason(o.id, 'cancel')}>Hủy đơn</button>
                    )}
                    {o.status !== 'PLACED' && o.nextStatus && (
                      <button
                        className="btn-primary"
                        disabled={busy}
                        onClick={() => act(o, () => merchantApi.advanceOrder(o.id, o.nextStatus!), `${o.code}: ${STATUS_TEXT[o.nextStatus!]}`)}
                      >
                        {busy ? 'Đang xử lý...' : nextLabel(o)}
                      </button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
