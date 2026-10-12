import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { getErrorMessage } from '../../api/client';
import { walletApi } from '../../api/wallet';
import { useSocketEvent } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import type { BankAccount, MerchantWallet, Paginated, WalletEntry } from '../../types';
import { formatDateTime, formatPrice } from '../../utils/format';
import { WALLET_ENTRY_LABEL, WALLET_LOCK_LABEL } from '../../utils/labels';
import { useOwner } from './OwnerLayout';

const PAGE_SIZE = 20;
const WALLET_EVENTS = new Set(['WALLET_NEGATIVE', 'WALLET_LOCKED', 'WALLET_UNLOCKED', 'TOPUP_CONFIRMED', 'TOPUP_REJECTED', 'PAYOUT_PAID', 'PAYOUT_REJECTED', 'ORDER_STATUS']);
const EMPTY_BANK: BankAccount = { bankName: '', accountNumber: '', accountName: '' };

const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatPrice(Math.abs(n))}`;
const toInt = (s: string) => Number(s.replace(/\D/g, '')) || 0;

/**
 * Ví đối soát của quán (API-11).
 * Đơn COD hoàn thành -> ví trừ hoa hồng; ví âm thì nạp tiền (chuyển khoản VietQR) để trả;
 * ví dương (MAK nợ quán, vd bù voucher) thì yêu cầu rút về tài khoản ngân hàng.
 */
export default function OwnerWalletPage() {
  const { restaurant } = useOwner();
  const notify = useToast();
  const [wallet, setWallet] = useState<MerchantWallet | null>(null);
  const [entries, setEntries] = useState<Paginated<WalletEntry> | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [topupAmount, setTopupAmount] = useState('');
  const [payoutAmount, setPayoutAmount] = useState('');
  const [bank, setBank] = useState<BankAccount>(EMPTY_BANK);
  const [editingBank, setEditingBank] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, e] = await Promise.all([walletApi.get(), walletApi.entries({ limit })]);
      setWallet(w);
      setEntries(e);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [limit]);

  useEffect(() => {
    if (restaurant) load();
  }, [restaurant, load]);

  // Đơn hoàn thành, admin xác nhận nạp / chuyển tiền... -> tải lại số dư
  useSocketEvent('notification:new', n => { if (WALLET_EVENTS.has(n.type)) load(); });

  if (!restaurant) {
    return (
      <div className="empty-state">
        <h2>Bạn chưa có quán</h2>
        <Link to="/owner" className="btn-primary">Tạo quán</Link>
      </div>
    );
  }

  if (error) {
    return <div className="empty-state"><h2>Không tải được ví</h2><p>{error}</p><button className="btn-soft" onClick={load}>Thử lại</button></div>;
  }
  if (!wallet || !entries) return <div className="page-loading">Đang tải...</div>;

  const debt = Math.max(0, -wallet.balance);
  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      notify(done);
      await load();
    } catch (err) {
      notify(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const createTopup = (e: FormEvent) => {
    e.preventDefault();
    const amount = toInt(topupAmount) || Math.max(wallet.topupMin, debt);
    if (amount < wallet.topupMin) return notify(`Nạp tối thiểu ${formatPrice(wallet.topupMin)}`);
    run(() => walletApi.createTopup(amount), 'Đã tạo mã nạp tiền').then(() => setTopupAmount(''));
  };

  const saveBank = (e: FormEvent) => {
    e.preventDefault();
    if (!bank.bankName.trim() || !bank.accountNumber.trim() || !bank.accountName.trim()) return notify('Điền đủ ngân hàng, số tài khoản và tên chủ tài khoản');
    run(() => walletApi.saveBankAccount(bank), 'Đã lưu tài khoản nhận tiền').then(() => setEditingBank(false));
  };

  const requestPayout = (e: FormEvent) => {
    e.preventDefault();
    const amount = toInt(payoutAmount);
    if (amount < wallet.payoutMin) return notify(`Rút tối thiểu ${formatPrice(wallet.payoutMin)}`);
    if (amount > wallet.available) return notify('Số dư ví không đủ');
    if (!window.confirm(`Rút ${formatPrice(amount)} về ${wallet.bankAccount?.bankName} ${wallet.bankAccount?.accountNumber}?`)) return;
    run(() => walletApi.requestPayout(amount), 'Đã gửi yêu cầu rút tiền').then(() => setPayoutAmount(''));
  };

  const copy = (text: string) =>
    navigator.clipboard?.writeText(text).then(() => notify('Đã sao chép'), () => notify(text));

  const topup = wallet.pendingTopup;
  const bankInfo = wallet.platformBank;
  const showBankForm = editingBank || !wallet.bankAccount;

  return (
    <>
      <div className="owner-title-row">
        <h1 className="page-title">Ví đối soát</h1>
      </div>

      {wallet.locked ? (
        <p className="wallet-alert danger">
          <b>Quán đang tạm ngưng nhận đơn</b> — {WALLET_LOCK_LABEL[wallet.lockReason ?? ''] ?? 'Ví âm'}.
          Nạp ít nhất <b>{formatPrice(debt)}</b> để quán tự mở lại ngay khi MAK xác nhận.
        </p>
      ) : wallet.balance < 0 ? (
        <p className="wallet-alert">
          Ví đang âm <b>{formatPrice(debt)}</b> (hoa hồng đơn tiền mặt). Hãy nạp trước <b>{wallet.lockDeadline ? formatDateTime(wallet.lockDeadline) : '—'}</b>.
          Nếu âm quá {formatPrice(wallet.creditLimit)} hoặc quá {wallet.graceDays} ngày, quán sẽ tạm ngưng nhận đơn.
        </p>
      ) : null}

      <div className="stat-grid">
        <div className={`stat-tile ${wallet.balance < 0 ? 'warn' : 'accent'}`}>
          <small>Số dư ví</small>
          <strong className={wallet.balance < 0 ? 'amount-neg' : undefined}>{signed(wallet.balance)}</strong>
          <span>{wallet.balance < 0 ? 'Quán đang nợ MAK' : wallet.balance > 0 ? 'MAK đang giữ của quán' : 'Không nợ'}</span>
        </div>
        <div className="stat-tile">
          <small>Có thể rút</small>
          <strong>{formatPrice(wallet.available)}</strong>
          <span>Tối thiểu {formatPrice(wallet.payoutMin)} / lần</span>
        </div>
        <div className="stat-tile">
          <small>Hạn mức âm</small>
          <strong>{formatPrice(wallet.creditLimit)}</strong>
          <span>Tối đa {wallet.graceDays} ngày</span>
        </div>
        <div className="stat-tile">
          <small>Hoa hồng</small>
          <strong>{Math.round(restaurant.commissionRate * 1000) / 10}%</strong>
          <span>Trên tạm tính mỗi đơn hoàn thành</span>
        </div>
      </div>

      <div className="wallet-cols">
        <section className="panel">
          <div className="section-head"><h2>Nạp tiền</h2></div>
          {topup ? (
            <div className="topup-box">
              {topup.qrUrl && <img className="qr-img" src={topup.qrUrl} alt={`Mã VietQR nạp ${formatPrice(topup.amount)}`} width={220} height={220} />}
              <dl className="kv">
                {bankInfo ? (
                  <>
                    <dt>Ngân hàng</dt><dd>{bankInfo.bankId}</dd>
                    <dt>Số tài khoản</dt><dd><b>{bankInfo.accountNo}</b> <button className="link-btn small" onClick={() => copy(bankInfo.accountNo)}>Sao chép</button></dd>
                    {bankInfo.accountName && <><dt>Chủ tài khoản</dt><dd>{bankInfo.accountName}</dd></>}
                  </>
                ) : (
                  <><dt>Tài khoản MAK</dt><dd className="muted">Admin chưa cấu hình — liên hệ quản trị viên</dd></>
                )}
                <dt>Số tiền</dt><dd><b>{formatPrice(topup.amount)}</b></dd>
                <dt>Nội dung</dt><dd><b className="mono">{topup.transferContent}</b> <button className="link-btn small" onClick={() => copy(topup.transferContent)}>Sao chép</button></dd>
              </dl>
              <p className="muted small-text">Ghi đúng nội dung chuyển khoản. Số dư được cộng sau khi MAK xác nhận đã nhận tiền.</p>
              <div className="form-actions">
                <button className="btn-outline" disabled={busy} onClick={() => run(() => walletApi.cancelTopup(topup.id), 'Đã hủy lệnh nạp')}>Hủy lệnh</button>
              </div>
            </div>
          ) : (
            <form onSubmit={createTopup} className="wallet-form">
              <label className="field">
                <span>Số tiền nạp (đ)</span>
                <input inputMode="numeric" value={topupAmount} onChange={e => setTopupAmount(e.target.value)} placeholder={String(Math.max(wallet.topupMin, debt))} />
              </label>
              {debt > 0 && <button type="button" className="link-btn" onClick={() => setTopupAmount(String(Math.max(wallet.topupMin, debt)))}>Nạp đủ số nợ ({formatPrice(debt)})</button>}
              <button className="btn-primary" disabled={busy}>Tạo mã chuyển khoản</button>
            </form>
          )}
        </section>

        <section className="panel">
          <div className="section-head"><h2>Rút tiền</h2></div>
          {showBankForm ? (
            <form onSubmit={saveBank} className="wallet-form">
              <label className="field"><span>Ngân hàng</span><input value={bank.bankName} onChange={e => setBank({ ...bank, bankName: e.target.value })} placeholder="MB Bank" maxLength={100} /></label>
              <label className="field"><span>Số tài khoản</span><input inputMode="numeric" value={bank.accountNumber} onChange={e => setBank({ ...bank, accountNumber: e.target.value.replace(/\D/g, '') })} maxLength={20} /></label>
              <label className="field"><span>Tên chủ tài khoản</span><input value={bank.accountName} onChange={e => setBank({ ...bank, accountName: e.target.value })} placeholder="NGUYEN VAN A" maxLength={100} /></label>
              <div className="form-actions">
                {wallet.bankAccount && <button type="button" className="btn-outline" onClick={() => setEditingBank(false)}>Hủy</button>}
                <button className="btn-primary" disabled={busy}>Lưu tài khoản</button>
              </div>
            </form>
          ) : (
            <>
              <dl className="kv">
                <dt>Nhận về</dt>
                <dd>
                  {wallet.bankAccount!.bankName} · <b>{wallet.bankAccount!.accountNumber}</b><br />
                  <small>{wallet.bankAccount!.accountName}</small>{' '}
                  <button className="link-btn small" onClick={() => { setBank(wallet.bankAccount!); setEditingBank(true); }}>Đổi</button>
                </dd>
              </dl>
              {wallet.pendingPayout ? (
                <p className="wallet-alert info">
                  Đang chờ MAK chuyển <b>{formatPrice(wallet.pendingPayout.amount)}</b> (yêu cầu lúc {formatDateTime(wallet.pendingPayout.createdAt)}).
                </p>
              ) : (
                <form onSubmit={requestPayout} className="wallet-form">
                  <label className="field">
                    <span>Số tiền rút (đ)</span>
                    <input inputMode="numeric" value={payoutAmount} onChange={e => setPayoutAmount(e.target.value)} placeholder={String(wallet.available)} disabled={wallet.available < wallet.payoutMin} />
                  </label>
                  {wallet.available >= wallet.payoutMin && <button type="button" className="link-btn" onClick={() => setPayoutAmount(String(wallet.available))}>Rút toàn bộ</button>}
                  <button className="btn-primary" disabled={busy || wallet.available < wallet.payoutMin}>Yêu cầu rút</button>
                  {wallet.available < wallet.payoutMin && <small className="muted">Cần số dư từ {formatPrice(wallet.payoutMin)} để rút.</small>}
                </form>
              )}
            </>
          )}
        </section>
      </div>

      <section className="panel">
        <div className="section-head">
          <h2>Lịch sử giao dịch</h2>
          <small className="muted">{entries.total} giao dịch</small>
        </div>
        {entries.items.length === 0 ? (
          <p className="muted">Chưa có giao dịch. Mỗi đơn tiền mặt hoàn thành sẽ trừ hoa hồng vào ví.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>Thời gian</th><th>Loại</th><th>Nội dung</th><th className="num">Số tiền</th><th className="num">Số dư sau</th></tr></thead>
              <tbody>
                {entries.items.map(e => (
                  <tr key={e.id}>
                    <td className="nowrap">{formatDateTime(e.createdAt)}</td>
                    <td className="nowrap">{WALLET_ENTRY_LABEL[e.kind] ?? e.kind}</td>
                    <td>{e.note}</td>
                    <td className={`num nowrap ${e.amount < 0 ? 'amount-neg' : 'amount-pos'}`}>{signed(e.amount)}</td>
                    <td className="num nowrap">{signed(e.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {entries.items.length < entries.total && (
          <div className="pager"><button className="btn-outline" onClick={() => setLimit(l => l + PAGE_SIZE)}>Xem thêm</button></div>
        )}
      </section>
    </>
  );
}
