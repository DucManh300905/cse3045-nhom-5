import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '../../api/client';
import { adminShipperApi } from '../../api/shipper';
import { TrackMap } from '../../components/LazyMap';
import type { TrackPoint } from '../../components/LocationPicker';
import ProofPhoto from '../../components/ProofPhoto';
import PrivateImage from '../../components/PrivateImage';
import { useSocketEvent } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import type { DispatchItem, OnlineShipper } from '../../types';
import { DELIVERY_STATUS_LABEL } from '../../utils/delivery';
import { formatDateTime, formatPrice } from '../../utils/format';

const REFRESH_MS = 15000;
const minutesAgo = (iso?: string | null) => (iso ? Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)) : null);

/**
 * Điều phối tài xế MAK: bản đồ tài xế đang trực tuyến, đơn đang tìm / không có tài xế / đang giao / giao thất bại.
 * Admin gán tay, tìm lại, và quyết định đơn giao thất bại (hoàn thành hoặc hủy + hoàn tiền).
 */
export default function AdminDispatchPage() {
  const notify = useToast();
  const [orders, setOrders] = useState<DispatchItem[] | null>(null);
  const [drivers, setDrivers] = useState<OnlineShipper[]>([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pick, setPick] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [o, d] = await Promise.all([adminShipperApi.dispatch(), adminShipperApi.online()]);
      setOrders(o);
      setDrivers(d);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, []);

  useEffect(() => {
    load();
    const t = window.setInterval(load, REFRESH_MS);
    return () => window.clearInterval(t);
  }, [load]);
  useSocketEvent('delivery:changed', () => load());
  useSocketEvent('reconnected', () => load());

  const free = drivers.filter(d => !d.activeOrder);
  const points = useMemo<TrackPoint[]>(() => [
    ...drivers.filter(d => d.location).map(d => ({ ...d.location!, kind: 'driver' as const, label: `${d.fullName}${d.activeOrder ? ` · ${d.activeOrder.code}` : ''}` })),
    ...(orders ?? []).filter(o => o.dropoff.location && ['SEARCHING', 'NO_SHIPPER', 'FAILED'].includes(o.delivery.status))
      .map(o => ({ ...o.dropoff.location!, kind: 'customer' as const, label: o.code })),
  ], [drivers, orders]);

  const act = async (id: string, fn: () => Promise<void>, ok: string) => {
    setBusyId(id);
    try {
      await fn();
      notify(ok);
    } catch (err) {
      notify(getErrorMessage(err));
    } finally {
      setBusyId(null);
      load();
    }
  };

  if (error) return <div className="empty-state"><h2>Không tải được bảng điều phối</h2><p>{error}</p><button className="btn-soft" onClick={load}>Thử lại</button></div>;
  if (!orders) return <div className="page-loading">Đang tải...</div>;

  const waiting = orders.filter(o => ['SEARCHING', 'NO_SHIPPER', 'FAILED'].includes(o.delivery.status));
  const running = orders.filter(o => !waiting.includes(o));

  return (
    <>
      <div className="owner-title-row">
        <h1 className="page-title">Điều phối tài xế</h1>
        <Link to="/admin/shippers" className="btn-soft">Hồ sơ tài xế →</Link>
      </div>

      <div className="stat-grid">
        <div className="stat-tile accent"><small>Trực tuyến</small><strong>{drivers.length}</strong><span>{free.length} đang rảnh</span></div>
        <div className="stat-tile"><small>Cần xử lý</small><strong>{waiting.length}</strong><span>Đang tìm / không có tài xế / thất bại</span></div>
        <div className="stat-tile"><small>Đang giao</small><strong>{running.length}</strong><span>Tài xế đang giữ đơn</span></div>
      </div>

      <section className="panel">
        <h2>Bản đồ</h2>
        {points.length > 0 ? <TrackMap points={points} height={320} /> : <p className="muted">Chưa có tài xế trực tuyến.</p>}
        <small className="muted">🛵 tài xế trực tuyến · K nơi giao của đơn đang chờ tài xế</small>
      </section>

      <section className="panel">
        <h2>Cần xử lý</h2>
        {waiting.length === 0 ? <p className="muted">Không có đơn nào đang chờ tài xế.</p> : (
          <ul className="dispatch-list">
            {waiting.map(o => (
              <li key={o.id}>
                <div className="dispatch-main">
                  <b>{o.code}</b> <span className={`delivery-status d-${o.delivery.status}`}>{DELIVERY_STATUS_LABEL[o.delivery.status]}</span>
                  <small>{o.restaurant.name} → {o.dropoff.addressLine}</small>
                  <small>
                    {o.delivery.status === 'SEARCHING' && `Đã mời ${o.delivery.attempts ?? 0} tài xế · tìm từ ${minutesAgo(o.delivery.searchStartedAt) ?? 0} phút trước · `}
                    Tiền công {formatPrice(o.shipperFee)}{o.placedAt && ` · đặt ${formatDateTime(o.placedAt)}`}
                  </small>
                  {o.delivery.status === 'FAILED' && (
                    <>
                      <p className="form-error">Tài xế {o.delivery.shipper?.fullName}: {o.delivery.failReason}</p>
                      {o.delivery.proof && <ProofPhoto proof={o.delivery.proof} />}
                    </>
                  )}
                </div>
                <div className="dispatch-actions">
                  {o.delivery.status === 'FAILED' ? (
                    <>
                      <button className="btn-outline" disabled={busyId === o.id} onClick={() => {
                        if (!window.confirm(`Xác nhận khách đã nhận đơn ${o.code}? Đơn hoàn thành, quán và tài xế nhận tiền như bình thường.`)) return;
                        act(o.id, () => adminShipperApi.resolve(o.id, 'COMPLETE'), `${o.code}: đã hoàn thành`);
                      }}>Đã giao được</button>
                      <button className="btn-primary danger" disabled={busyId === o.id} onClick={() => {
                        const note = window.prompt(`Hủy đơn ${o.code} và hoàn tiền cho khách? Ghi chú (không bắt buộc):`);
                        if (note === null) return;
                        act(o.id, () => adminShipperApi.resolve(o.id, 'CANCEL', note.trim() || undefined), `${o.code}: đã hủy, tạo lệnh hoàn tiền`);
                      }}>Hủy + hoàn tiền</button>
                    </>
                  ) : (
                    <>
                      <select value={pick[o.id] ?? ''} onChange={e => setPick(p => ({ ...p, [o.id]: e.target.value }))} aria-label="Chọn tài xế">
                        <option value="">Chọn tài xế rảnh...</option>
                        {free.map(d => <option key={d.id} value={d.id}>{d.fullName} · {d.licensePlate ?? d.phone}</option>)}
                      </select>
                      <button className="btn-primary" disabled={busyId === o.id || !pick[o.id]} onClick={() => act(o.id, () => adminShipperApi.assign(o.id, pick[o.id]), `Đã gán ${o.code}`)}>Gán</button>
                      {o.delivery.status === 'NO_SHIPPER' && (
                        <button className="btn-soft" disabled={busyId === o.id} onClick={() => act(o.id, () => adminShipperApi.redispatch(o.id), `Đang tìm lại tài xế cho ${o.code}`)}>Tìm lại</button>
                      )}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <h2>Đang giao</h2>
        {running.length === 0 ? <p className="muted">Không có đơn nào đang giao.</p> : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Đơn</th><th>Bước</th><th>Tài xế</th><th>Quán → nơi giao</th></tr></thead>
              <tbody>
                {running.map(o => (
                  <tr key={o.id} className={o.delivery.staleAlertAt ? 'row-blocked' : undefined}>
                    <td className="nowrap"><b>{o.code}</b></td>
                    <td className="nowrap">{DELIVERY_STATUS_LABEL[o.delivery.status]}{o.delivery.staleAlertAt && <><br /><small className="amount-neg">mất vị trí</small></>}</td>
                    <td>{o.delivery.shipper ? <>{o.delivery.shipperId && <PrivateImage url={`/delivery/shippers/${o.delivery.shipperId}/portrait`} alt="" className="driver-avatar photo small" />}{o.delivery.shipper.fullName}<br /><small>{o.delivery.shipper.licensePlate} · <a href={`tel:${o.delivery.shipper.phone}`}>{o.delivery.shipper.phone}</a></small></> : '—'}</td>
                    <td>{o.restaurant.name} → {o.dropoff.addressLine}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
