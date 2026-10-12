import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getErrorMessage } from '../api/client';
import { ordersApi } from '../api/orders';
import AppHeader from '../components/AppHeader';
import { useSocketEvent } from '../context/SocketContext';
import { useToast } from '../context/ToastContext';
import type { OrderPaymentInfo } from '../types';
import { formatPrice } from '../utils/format';

/** Hỏi lại server định kỳ phòng khi mất kết nối socket */
const POLL_MS = 5000;

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Trang thanh toán đơn trả trước (W2): quét VietQR -> SePay báo về backend -> trang tự chuyển "đã thanh toán".
 * Không có nút "Tôi đã chuyển": chỉ webhook ngân hàng mới xác nhận được tiền.
 */
export default function PaymentPage() {
  const { id = '' } = useParams();
  const notify = useToast();
  const navigate = useNavigate();
  const [info, setInfo] = useState<OrderPaymentInfo | null>(null);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(() => {
    ordersApi.payment(id)
      .then(d => { setInfo(d); setError(''); })
      .catch(err => setError(getErrorMessage(err)));
  }, [id]);
  useEffect(load, [load]);

  const waiting = info?.status === 'PENDING_PAYMENT';

  // Đồng hồ đếm ngược + hỏi lại server khi đang chờ tiền
  useEffect(() => {
    if (!waiting) return;
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(load, POLL_MS);
    return () => { window.clearInterval(tick); window.clearInterval(poll); };
  }, [waiting, load]);

  useSocketEvent('order:status_changed', e => { if (e.orderId === id) load(); });
  useSocketEvent('reconnected', load);

  const copy = (text: string) =>
    navigator.clipboard?.writeText(text).then(() => notify('Đã sao chép'), () => notify(text));

  const cancel = async () => {
    if (!info || !window.confirm(`Hủy đơn ${info.code}? Nếu bạn đã chuyển khoản, MAK sẽ hoàn tiền.`)) return;
    setCancelling(true);
    try {
      await ordersApi.cancel(id);
      notify('Đã hủy đơn');
      navigate('/orders');
    } catch (err) {
      notify(getErrorMessage(err));
      load();
    } finally {
      setCancelling(false);
    }
  };

  const left = info?.paymentDeadline ? new Date(info.paymentDeadline).getTime() - now : 0;

  return (
    <div className="app">
      <AppHeader />
      <main className="container page-body narrow">
        <h1 className="page-title">Thanh toán chuyển khoản</h1>

        {error ? (
          <div className="empty-state"><h2>Không tải được đơn</h2><p>{error}</p><Link to="/orders" className="btn-primary">Về đơn của tôi</Link></div>
        ) : !info ? (
          <div className="page-loading">Đang tải...</div>
        ) : waiting ? (
          <section className="panel pay-panel">
            <div className="pay-head">
              <div>
                <small className="muted">Đơn {info.code}</small>
                <strong className="pay-amount">{formatPrice(info.amount)}</strong>
              </div>
              <div className={`pay-timer ${left < 2 * 60_000 ? 'urgent' : ''}`} aria-live="polite">
                <small>Còn lại</small>
                <b>{mmss(left)}</b>
              </div>
            </div>

            {info.qrUrl && <img className="qr-img large" src={info.qrUrl} alt={`Mã VietQR thanh toán ${formatPrice(info.amount)}`} width={280} height={280} />}
            <p className="muted small-text">Mở app ngân hàng, quét mã — số tiền và nội dung đã điền sẵn.</p>

            {info.bank && (
              <dl className="kv">
                <dt>Ngân hàng</dt><dd>{info.bank.bankId}</dd>
                <dt>Số tài khoản</dt><dd><b>{info.bank.accountNo}</b> <button className="link-btn small" onClick={() => copy(info.bank!.accountNo)}>Sao chép</button></dd>
                {info.bank.accountName && <><dt>Chủ tài khoản</dt><dd>{info.bank.accountName}</dd></>}
                <dt>Số tiền</dt><dd><b>{formatPrice(info.amount)}</b> <button className="link-btn small" onClick={() => copy(String(info.amount))}>Sao chép</button></dd>
                <dt>Nội dung</dt><dd><b className="mono">{info.paymentCode}</b> <button className="link-btn small" onClick={() => copy(info.paymentCode ?? '')}>Sao chép</button></dd>
              </dl>
            )}

            <p className="wallet-alert">
              Chuyển <b>đúng số tiền</b> và <b>đúng nội dung</b>. Đơn tự xác nhận trong vài giây sau khi tiền về rồi mới gửi tới quán.
              Quá hạn chưa nhận đủ tiền, đơn sẽ tự hủy.
            </p>
            <p className="pay-waiting"><span className="live-dot on" aria-hidden /> Đang chờ ngân hàng báo tiền về...</p>

            <div className="form-actions">
              <Link to="/orders" className="btn-outline">Xem đơn của tôi</Link>
              <button className="btn-outline danger-outline" onClick={cancel} disabled={cancelling}>{cancelling ? 'Đang hủy...' : 'Hủy đơn'}</button>
            </div>
          </section>
        ) : info.paymentStatus === 'PAID' ? (
          <div className="empty-state">
            <h2>✓ Đã nhận thanh toán</h2>
            <p>Đơn {info.code} — {formatPrice(info.paidAmount ?? info.amount)}. Đơn đã được gửi tới quán.</p>
            <Link to="/orders" className="btn-primary">Theo dõi đơn</Link>
          </div>
        ) : (
          <div className="empty-state">
            <h2>{info.status === 'CANCELLED' ? 'Đơn đã bị hủy' : 'Đơn không còn chờ thanh toán'}</h2>
            <p>
              {info.paymentStatus === 'REFUND_PENDING' ? 'MAK sẽ hoàn tiền chuyển khoản cho bạn.'
                : info.paymentStatus === 'REFUNDED' ? 'Tiền đã được hoàn lại.'
                : 'Nếu bạn đã chuyển khoản sau khi đơn hết hạn, MAK sẽ hoàn lại tiền.'}
            </p>
            <Link to="/menu" className="btn-primary">Đặt lại</Link>
          </div>
        )}
      </main>
    </div>
  );
}
