import { Fragment, useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../api/client';
import { walletApi } from '../../api/wallet';
import { useSocketEvent } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import { useBadges, useMarkSeen } from '../../context/BadgeContext';
import { ADMIN_WALLET_TABS } from '../../utils/badges';
import type { AdminWallet, BankPayment, BankPaymentStatus, Paginated, Payout, PayoutStatus, Refund, RestaurantRef, Topup, TopupStatus, WalletEntry, WalletOverview } from '../../types';
import { formatDateTime, formatPrice } from '../../utils/format';
import { BANK_PAYMENT_STATUS_LABEL, PAYOUT_STATUS_LABEL, REFUND_REASON_LABEL, TOPUP_STATUS_LABEL, WALLET_ENTRY_LABEL, WALLET_LOCK_LABEL } from '../../utils/labels';

type Tab = 'wallets' | 'topups' | 'payouts' | 'refunds' | 'payments';
const PAGE_SIZE = 20;
const ADMIN_EVENTS = new Set(['TOPUP_REQUESTED', 'PAYOUT_REQUESTED', 'REFUND_REQUESTED', 'PAYMENT_UNMATCHED']);
/** Tab có ô tìm theo tên quán */
const SEARCHABLE: Tab[] = ['wallets', 'topups', 'payouts'];

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatPrice(Math.abs(n))}`;
const toInt = (s: string) => Number(s.replace(/[^\d-]/g, '')) || 0;
const shopName = (r: RestaurantRef) => (typeof r === 'string' ? '—' : r.name);
const shopId = (r: RestaurantRef) => (typeof r === 'string' ? r : r.id);

/** Admin: ví đối soát của các quán, xác nhận nạp tiền, chuyển tiền cho quán rút (API-11) */
export default function AdminWalletsPage() {
  const notify = useToast();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'wallets';
  const status = params.get('status') ?? '';
  const q = params.get('q') ?? '';
  const page = Number(params.get('page')) || 1;
  const [search, setSearch] = useState(q);
  const { countOf } = useBadges();
  // Mở tab nào thì thông báo của tab đó coi như đã xem
  useMarkSeen(ADMIN_WALLET_TABS[tab]);
  const [overview, setOverview] = useState<WalletOverview | null>(null);
  const [wallets, setWallets] = useState<Paginated<AdminWallet> | null>(null);
  const [topups, setTopups] = useState<Paginated<Topup> | null>(null);
  const [payouts, setPayouts] = useState<Paginated<Payout> | null>(null);
  const [refunds, setRefunds] = useState<Paginated<Refund> | null>(null);
  const [payments, setPayments] = useState<Paginated<BankPayment> | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  /** Dòng đang mở form: `${loại}:${id}` */
  const [open, setOpen] = useState<string | null>(null);
  const [fieldA, setFieldA] = useState('');
  const [fieldB, setFieldB] = useState('');
  const [history, setHistory] = useState<WalletEntry[]>([]);

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next, { replace: true });
  };

  // Mặc định tab nạp / rút chỉ hiện lệnh đang chờ
  const effectiveStatus = status || ({ topups: 'PENDING', payouts: 'REQUESTED', refunds: 'PENDING' } as Partial<Record<Tab, string>>)[tab] || '';

  const load = useCallback(async () => {
    try {
      const query = { q: q || undefined, page, limit: PAGE_SIZE };
      const st = effectiveStatus === 'ALL' ? undefined : effectiveStatus || undefined;
      const [ov] = await Promise.all([
        walletApi.overview(),
        tab === 'wallets' && walletApi.listWallets({ ...query, status: st as 'negative' }).then(setWallets),
        tab === 'topups' && walletApi.listTopups({ ...query, status: st as TopupStatus }).then(setTopups),
        tab === 'payouts' && walletApi.listPayouts({ ...query, status: st as PayoutStatus }).then(setPayouts),
        tab === 'refunds' && walletApi.listRefunds({ page, limit: PAGE_SIZE, status: st as 'PENDING' }).then(setRefunds),
        tab === 'payments' && walletApi.listPayments({ page, limit: PAGE_SIZE, status: st as BankPaymentStatus }).then(setPayments),
      ]);
      setOverview(ov);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [tab, effectiveStatus, q, page]);
  useEffect(() => { load(); }, [load]);

  useSocketEvent('notification:new', n => { if (ADMIN_EVENTS.has(n.type)) load(); });

  const openForm = (key: string, a = '', b = '') => { setOpen(key); setFieldA(a); setFieldB(b); };

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      notify(done);
      setOpen(null);
      await load();
    } catch (err) {
      notify(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const showHistory = async (w: AdminWallet) => {
    if (!w.restaurant) return;
    const key = `history:${w.id}`;
    if (open === key) return setOpen(null);
    try {
      const res = await walletApi.restaurantEntries(w.restaurant.id, { limit: 20 });
      setHistory(res.items);
      setOpen(key);
    } catch (err) {
      notify(getErrorMessage(err));
    }
  };

  const tabs: [Tab, string, number?][] = [
    ['wallets', 'Ví các quán'],
    // Số đỏ = thông báo chưa xem của tab (số việc đang chờ vẫn hiện ở các ô thống kê phía trên)
    ['topups', 'Nạp tiền chờ xác nhận', countOf(ADMIN_WALLET_TABS.topups)],
    ['payouts', 'Yêu cầu rút', countOf(ADMIN_WALLET_TABS.payouts)],
    ['refunds', 'Hoàn tiền cho khách', countOf(ADMIN_WALLET_TABS.refunds)],
    ['payments', 'Giao dịch ngân hàng', countOf(ADMIN_WALLET_TABS.payments)],
  ];

  const statusTabs: Record<Tab, [string, string][]> = {
    wallets: [['', 'Tất cả'], ['negative', 'Đang âm'], ['positive', 'Đang dương'], ['locked', 'Bị tạm ngưng']],
    topups: [['PENDING', 'Chờ xác nhận'], ['CONFIRMED', 'Đã nhận'], ['REJECTED', 'Từ chối'], ['CANCELLED', 'Đã hủy'], ['ALL', 'Tất cả']],
    payouts: [['REQUESTED', 'Chờ chuyển'], ['PAID', 'Đã chuyển'], ['REJECTED', 'Từ chối'], ['ALL', 'Tất cả']],
    refunds: [['PENDING', 'Chờ hoàn'], ['DONE', 'Đã hoàn'], ['ALL', 'Tất cả']],
    payments: [['', 'Tất cả'], ...(['UNMATCHED', 'MATCHED_ORDER', 'MATCHED_TOPUP', 'LATE', 'UNDERPAID', 'DUPLICATE', 'REFUNDING', 'IGNORED'] as const).map(k => [k, BANK_PAYMENT_STATUS_LABEL[k]] as [string, string])],
  };

  const current = { wallets, topups, payouts, refunds, payments }[tab];
  const pages = current ? Math.max(1, Math.ceil(current.total / current.limit)) : 1;

  return (
    <>
      <h1 className="page-title">Ví đối soát</h1>

      {overview && (
        <div className="stat-grid">
          <div className="stat-tile accent">
            <small>Doanh thu nền tảng</small>
            <strong>{formatPrice(overview.platformRevenue)}</strong>
            <span>Hoa hồng − voucher MAK chịu</span>
          </div>
          <div className="stat-tile">
            <small>Quán đang nợ MAK</small>
            <strong>{formatPrice(overview.owedByRestaurants)}</strong>
            <span>{overview.negativeRestaurants} quán âm · {overview.lockedRestaurants} bị tạm ngưng</span>
          </div>
          <div className="stat-tile">
            <small>MAK nợ các quán</small>
            <strong>{formatPrice(overview.owedToRestaurants + overview.payoutHold)}</strong>
            <span>Trong đó chờ chuyển {formatPrice(overview.pendingPayouts.amount)}</span>
          </div>
          <div className="stat-tile">
            <small>Khách trả trước (đang giữ)</small>
            <strong>{formatPrice(overview.escrow)}</strong>
            <span>Chuyển cho quán khi đơn hoàn thành</span>
          </div>
          <div className={`stat-tile ${overview.pendingRefunds.count ? 'warn' : ''}`}>
            <small>Chờ hoàn cho khách</small>
            <strong>{formatPrice(overview.refundHold)}</strong>
            <span>{overview.pendingRefunds.count} lệnh · {overview.unmatchedPayments} giao dịch chưa khớp</span>
          </div>
          <div className="stat-tile">
            <small>Tiền thật trong TK MAK</small>
            <strong>{formatPrice(overview.cashHeld)}</strong>
            <span>Nạp vào − đã chuyển cho quán</span>
          </div>
          <div className={`stat-tile ${overview.balanced ? '' : 'warn'}`}>
            <small>Đối soát sổ cái</small>
            <strong>{overview.balanced ? '✓ Cân bằng' : '✗ Lệch'}</strong>
            <span>{overview.balanced ? 'Tổng số dư mọi ví = 0' : 'Kiểm tra lại các bút toán'}</span>
          </div>
        </div>
      )}

      <section className="toolbar admin-toolbar">
        <div className="cat-tabs" role="tablist">
          {tabs.map(([k, label, count]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'active' : ''} onClick={() => { setOpen(null); update({ tab: k === 'wallets' ? '' : k, status: '', page: '' }); }}>
              {label}{!!count && <span className="nav-badge">{count}</span>}
            </button>
          ))}
        </div>
        <div className="toolbar-right">
          <select value={effectiveStatus} onChange={e => update({ status: e.target.value, page: '' })} aria-label="Lọc trạng thái">
            {statusTabs[tab].map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          {SEARCHABLE.includes(tab) && (
            <form className="admin-search" onSubmit={e => { e.preventDefault(); update({ q: search.trim(), page: '' }); }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tên quán" maxLength={100} />
              <button className="btn-soft" type="submit">Tìm</button>
            </form>
          )}
        </div>
      </section>

      {error ? (
        <div className="empty-state"><h2>Không tải được</h2><p>{error}</p></div>
      ) : !current ? (
        <div className="page-loading">Đang tải...</div>
      ) : current.items.length === 0 ? (
        <div className="empty-state"><h2>Không có dữ liệu</h2><p>{tab === 'wallets' ? 'Ví quán được tạo khi có giao dịch đầu tiên (đơn hoàn thành, nạp tiền...).' : tab === 'payments' ? 'Chưa có giao dịch nào SePay báo về.' : 'Không có lệnh nào ở trạng thái này.'}</p></div>
      ) : (
        <>
          <p className="result-line"><span><b>{current.total}</b> mục</span></p>
          <div className="panel table-wrap">
            {tab === 'wallets' && wallets && (
              <table className="data-table">
                <thead><tr><th>Quán</th><th className="num">Số dư</th><th>Trạng thái</th><th></th></tr></thead>
                <tbody>
                  {wallets.items.map(w => (
                    <Fragment key={w.id}>
                      <tr className={w.restaurant?.walletLockedAt ? 'row-blocked' : undefined}>
                        <td>{w.restaurant ? <Link to={`/admin/restaurants/${w.restaurant.id}`} className="link-btn">{w.restaurant.name}</Link> : '—'}</td>
                        <td className={`num nowrap ${w.balance < 0 ? 'amount-neg' : ''}`}>{signed(w.balance)}</td>
                        <td>
                          {w.restaurant?.walletLockedAt ? (
                            <>Tạm ngưng: {WALLET_LOCK_LABEL[w.restaurant.walletLockReason ?? ''] ?? '—'}<br /><small className="muted">từ {formatDateTime(w.restaurant.walletLockedAt)}</small></>
                          ) : w.balance < 0 && w.lockDeadline ? (
                            <small className="muted">Hạn nạp {formatDateTime(w.lockDeadline)}</small>
                          ) : (
                            <small className="muted">Bình thường</small>
                          )}
                        </td>
                        <td className="nowrap">
                          <button className="link-btn" onClick={() => showHistory(w)}>{open === `history:${w.id}` ? 'Ẩn' : 'Lịch sử'}</button>{' '}
                          <button className="link-btn" onClick={() => openForm(`adjust:${w.id}`)}>Điều chỉnh</button>
                        </td>
                      </tr>
                      {open === `adjust:${w.id}` && w.restaurant && (
                        <tr><td colSpan={4}>
                          <div className="inline-form wrap">
                            <input value={fieldA} onChange={e => setFieldA(e.target.value)} placeholder="+50000 / -20000" aria-label="Số tiền (có dấu)" />
                            <input className="grow" value={fieldB} onChange={e => setFieldB(e.target.value)} placeholder="Lý do (bắt buộc, ghi nhật ký)" maxLength={500} />
                            <button className="btn-primary" disabled={busy} onClick={() => {
                              const amount = toInt(fieldA);
                              if (!amount || !fieldB.trim()) return notify('Nhập số tiền khác 0 và lý do');
                              if (!window.confirm(`${amount > 0 ? 'Cộng' : 'Trừ'} ${formatPrice(Math.abs(amount))} vào ví ${w.restaurant!.name}?`)) return;
                              run(() => walletApi.adjust(w.restaurant!.id, amount, fieldB.trim()), 'Đã điều chỉnh ví');
                            }}>Lưu</button>
                            <button className="link-btn" onClick={() => setOpen(null)}>Hủy</button>
                          </div>
                        </td></tr>
                      )}
                      {open === `history:${w.id}` && (
                        <tr><td colSpan={4}>
                          {history.length === 0 ? <p className="muted">Chưa có giao dịch.</p> : (
                            <table className="data-table nested">
                              <tbody>
                                {history.map(e => (
                                  <tr key={e.id}>
                                    <td className="nowrap">{formatDateTime(e.createdAt)}</td>
                                    <td className="nowrap">{WALLET_ENTRY_LABEL[e.kind] ?? e.kind}</td>
                                    <td>{e.note}</td>
                                    <td className={`num nowrap ${e.amount < 0 ? 'amount-neg' : 'amount-pos'}`}>{signed(e.amount)}</td>
                                    <td className="num nowrap muted">{signed(e.balanceAfter)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td></tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}

            {tab === 'topups' && topups && (
              <table className="data-table">
                <thead><tr><th>Mã / nội dung CK</th><th>Quán</th><th className="num">Số tiền</th><th>Tạo lúc</th><th>Trạng thái</th><th></th></tr></thead>
                <tbody>
                  {topups.items.map(t => (
                    <Fragment key={t.id}>
                      <tr>
                        <td className="mono">{t.code}</td>
                        <td><Link to={`/admin/restaurants/${shopId(t.restaurant)}`} className="link-btn">{shopName(t.restaurant)}</Link></td>
                        <td className="num nowrap">{formatPrice(t.amount)}{t.receivedAmount !== undefined && t.receivedAmount !== t.amount && <><br /><small className="muted">nhận {formatPrice(t.receivedAmount)}</small></>}</td>
                        <td className="nowrap">{formatDateTime(t.createdAt)}</td>
                        <td>{TOPUP_STATUS_LABEL[t.status]}{t.bankRef && <><br /><small className="muted">GD {t.bankRef}</small></>}{t.rejectReason && <><br /><small className="muted">{t.rejectReason}</small></>}</td>
                        <td className="nowrap">
                          {(t.status === 'PENDING' || t.status === 'CANCELLED') && (
                            <button className="btn-soft" onClick={() => openForm(`confirm:${t.id}`, String(t.amount))}>Đã nhận tiền</button>
                          )}{' '}
                          {t.status === 'PENDING' && <button className="btn-outline danger-outline" onClick={() => openForm(`reject:${t.id}`)}>Từ chối</button>}
                        </td>
                      </tr>
                      {open === `confirm:${t.id}` && (
                        <tr><td colSpan={6}>
                          <div className="inline-form wrap">
                            <label className="field"><span>Số tiền thực nhận</span><input inputMode="numeric" value={fieldA} onChange={e => setFieldA(e.target.value)} /></label>
                            <label className="field grow"><span>Mã giao dịch ngân hàng (tùy chọn)</span><input value={fieldB} onChange={e => setFieldB(e.target.value)} maxLength={100} /></label>
                            <button className="btn-primary" disabled={busy} onClick={() => {
                              const received = toInt(fieldA);
                              if (received <= 0) return notify('Nhập số tiền thực nhận');
                              run(() => walletApi.confirmTopup(t.id, { receivedAmount: received, bankRef: fieldB.trim() || undefined }), `Đã cộng ${formatPrice(received)} vào ví quán`);
                            }}>Xác nhận</button>
                            <button className="link-btn" onClick={() => setOpen(null)}>Hủy</button>
                          </div>
                        </td></tr>
                      )}
                      {open === `reject:${t.id}` && (
                        <tr><td colSpan={6}>
                          <div className="inline-form wrap">
                            <input className="grow" value={fieldA} onChange={e => setFieldA(e.target.value)} placeholder="Lý do từ chối (vd: không thấy giao dịch)" maxLength={500} />
                            <button className="btn-primary danger" disabled={busy} onClick={() => {
                              if (!fieldA.trim()) return notify('Nhập lý do');
                              run(() => walletApi.rejectTopup(t.id, fieldA.trim()), 'Đã từ chối lệnh nạp');
                            }}>Từ chối</button>
                            <button className="link-btn" onClick={() => setOpen(null)}>Hủy</button>
                          </div>
                        </td></tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}

            {tab === 'payouts' && payouts && (
              <table className="data-table">
                <thead><tr><th>Quán</th><th className="num">Số tiền</th><th>Chuyển về</th><th>Yêu cầu lúc</th><th>Trạng thái</th><th></th></tr></thead>
                <tbody>
                  {payouts.items.map(p => (
                    <Fragment key={p.id}>
                      <tr>
                        <td>
                          {p.shipper
                            ? <Link to={`/admin/shippers/${typeof p.shipper === 'string' ? p.shipper : p.shipper.id}`} className="link-btn">🛵 {typeof p.shipper === 'string' ? 'Tài xế' : p.shipper.fullName}</Link>
                            : p.restaurant ? <Link to={`/admin/restaurants/${shopId(p.restaurant)}`} className="link-btn">{shopName(p.restaurant)}</Link> : '—'}
                        </td>
                        <td className="num nowrap"><b>{formatPrice(p.amount)}</b></td>
                        <td>{p.bankAccount.bankName} · <span className="mono">{p.bankAccount.accountNumber}</span><br /><small className="muted">{p.bankAccount.accountName}</small></td>
                        <td className="nowrap">{formatDateTime(p.createdAt)}</td>
                        <td>{PAYOUT_STATUS_LABEL[p.status]}{p.bankRef && <><br /><small className="muted">GD {p.bankRef}</small></>}{p.rejectReason && <><br /><small className="muted">{p.rejectReason}</small></>}</td>
                        <td className="nowrap">
                          {p.status === 'REQUESTED' && (
                            <>
                              <button className="btn-soft" onClick={() => openForm(`paid:${p.id}`)}>Đã chuyển</button>{' '}
                              <button className="btn-outline danger-outline" onClick={() => openForm(`reject:${p.id}`)}>Từ chối</button>
                            </>
                          )}
                        </td>
                      </tr>
                      {open === `paid:${p.id}` && (
                        <tr><td colSpan={6}>
                          <div className="inline-form wrap">
                            <input className="grow" value={fieldA} onChange={e => setFieldA(e.target.value)} placeholder="Mã giao dịch ngân hàng (nên nhập để đối soát)" maxLength={100} />
                            <button className="btn-primary" disabled={busy} onClick={() =>
                              run(() => walletApi.markPayoutPaid(p.id, fieldA.trim() || undefined), 'Đã ghi nhận chuyển tiền')
                            }>Xác nhận đã chuyển {formatPrice(p.amount)}</button>
                            <button className="link-btn" onClick={() => setOpen(null)}>Hủy</button>
                          </div>
                        </td></tr>
                      )}
                      {open === `reject:${p.id}` && (
                        <tr><td colSpan={6}>
                          <div className="inline-form wrap">
                            <input className="grow" value={fieldA} onChange={e => setFieldA(e.target.value)} placeholder="Lý do (vd: sai tên chủ tài khoản) — tiền trả lại ví quán" maxLength={500} />
                            <button className="btn-primary danger" disabled={busy} onClick={() => {
                              if (!fieldA.trim()) return notify('Nhập lý do');
                              run(() => walletApi.rejectPayout(p.id, fieldA.trim()), 'Đã từ chối, tiền trả lại ví quán');
                            }}>Từ chối</button>
                            <button className="link-btn" onClick={() => setOpen(null)}>Hủy</button>
                          </div>
                        </td></tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}

            {tab === 'refunds' && refunds && (
              <table className="data-table">
                <thead><tr><th>Khách / đơn</th><th className="num">Số tiền</th><th>Lý do</th><th>Giao dịch gốc</th><th>Trạng thái</th><th></th></tr></thead>
                <tbody>
                  {refunds.items.map(r => (
                    <Fragment key={r.id}>
                      <tr>
                        <td>
                          {r.customer ? <><b>{r.customer.fullName}</b><br /><small className="muted">{[r.customer.phone, r.customer.email].filter(Boolean).join(' · ')}</small></> : <span className="muted">Không rõ người chuyển</span>}
                          {r.order && <><br /><small className="mono">{r.order.code}</small></>}
                        </td>
                        <td className="num nowrap"><b>{formatPrice(r.amount)}</b></td>
                        <td>{REFUND_REASON_LABEL[r.reason] ?? r.reason}{r.note && <><br /><small className="muted">{r.note}</small></>}</td>
                        <td>{r.payment ? <><span className="mono">{r.payment.referenceCode}</span><br /><small className="muted">{r.payment.gateway} · {r.payment.transactionDate}</small></> : <small className="muted">Tiền trong ví giữ (đơn đã trả bị hủy)</small>}</td>
                        <td>{r.status === 'DONE' ? <>Đã hoàn{r.bankRef && <><br /><small className="muted">GD {r.bankRef}</small></>}</> : <b className="amount-neg">Chờ hoàn</b>}<br /><small className="muted">{formatDateTime(r.createdAt)}</small></td>
                        <td className="nowrap">{r.status === 'PENDING' && <button className="btn-soft" onClick={() => openForm(`refund:${r.id}`)}>Đã hoàn tiền</button>}</td>
                      </tr>
                      {open === `refund:${r.id}` && (
                        <tr><td colSpan={6}>
                          <div className="inline-form wrap">
                            <input className="grow" value={fieldA} onChange={e => setFieldA(e.target.value)} placeholder="Mã giao dịch chuyển trả (nên nhập để đối soát)" maxLength={100} />
                            <button className="btn-primary" disabled={busy} onClick={() =>
                              run(() => walletApi.completeRefund(r.id, fieldA.trim() || undefined), `Đã ghi nhận hoàn ${formatPrice(r.amount)}`)
                            }>Xác nhận đã hoàn {formatPrice(r.amount)}</button>
                            <button className="link-btn" onClick={() => setOpen(null)}>Hủy</button>
                          </div>
                        </td></tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}

            {tab === 'payments' && payments && (
              <table className="data-table">
                <thead><tr><th>Thời gian</th><th className="num">Số tiền</th><th>Nội dung</th><th>Kết quả</th><th></th></tr></thead>
                <tbody>
                  {payments.items.map(p => (
                    <Fragment key={p.id}>
                      <tr>
                        <td className="nowrap">{p.transactionDate ?? formatDateTime(p.createdAt)}<br /><small className="muted">{p.gateway} · <span className="mono">{p.referenceCode}</span></small></td>
                        <td className={`num nowrap ${p.transferType === 'in' ? 'amount-pos' : 'amount-neg'}`}>{p.transferType === 'in' ? '+' : '−'}{formatPrice(p.amount)}</td>
                        <td>{p.content}{p.code && <><br /><small className="mono">Mã: {p.code}</small></>}</td>
                        <td>
                          {p.status === 'UNMATCHED' ? <b className="amount-neg">{BANK_PAYMENT_STATUS_LABEL[p.status]}</b> : BANK_PAYMENT_STATUS_LABEL[p.status] ?? p.status}
                          {p.order && <><br /><small className="mono">{p.order.code}</small></>}
                          {p.note && <><br /><small className="muted">{p.note}</small></>}
                        </td>
                        <td className="nowrap">
                          {p.status === 'UNMATCHED' && (
                            <>
                              <button className="btn-soft" onClick={() => openForm(`pay-refund:${p.id}`)}>Hoàn lại</button>{' '}
                              <button className="btn-outline" onClick={() => openForm(`pay-ignore:${p.id}`)}>Bỏ qua</button>
                            </>
                          )}
                        </td>
                      </tr>
                      {(open === `pay-refund:${p.id}` || open === `pay-ignore:${p.id}`) && (
                        <tr><td colSpan={5}>
                          <div className="inline-form wrap">
                            <input className="grow" value={fieldA} onChange={e => setFieldA(e.target.value)} maxLength={500}
                              placeholder={open.startsWith('pay-refund') ? 'Ghi chú (vd: khách gọi báo ghi sai mã đơn)' : 'Lý do bỏ qua (vd: tiền cá nhân, không phải khách MAK)'} />
                            <button className="btn-primary" disabled={busy} onClick={() => {
                              if (!fieldA.trim()) return notify('Nhập ghi chú');
                              const refund = open.startsWith('pay-refund');
                              run(() => walletApi.resolvePayment(p.id, refund ? 'refund' : 'ignore', fieldA.trim()), refund ? 'Đã tạo lệnh hoàn tiền' : 'Đã bỏ qua giao dịch');
                            }}>{open.startsWith('pay-refund') ? 'Tạo lệnh hoàn' : 'Bỏ qua'}</button>
                            <button className="link-btn" onClick={() => setOpen(null)}>Hủy</button>
                          </div>
                        </td></tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          {pages > 1 && (
            <div className="pager">
              <button className="btn-outline" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>← Trước</button>
              <span>Trang {page}/{pages}</span>
              <button className="btn-outline" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })}>Sau →</button>
            </div>
          )}
        </>
      )}
    </>
  );
}
