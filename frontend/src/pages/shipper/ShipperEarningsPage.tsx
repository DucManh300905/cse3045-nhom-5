import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { getErrorMessage } from '../../api/client';
import { shipperApi } from '../../api/shipper';
import { useSocketEvent } from '../../context/SocketContext';
import { useToast } from '../../context/ToastContext';
import type { BankAccount, Paginated, ShipperWallet, WalletEntry } from '../../types';
import { formatDateTime, formatPrice } from '../../utils/format';
import { WALLET_ENTRY_LABEL } from '../../utils/labels';

const PAGE_SIZE = 20;
const EMPTY_BANK: BankAccount = { bankName: '', accountNumber: '', accountName: '' };
const WALLET_EVENTS = new Set(['SHIPPER_EARNING', 'PAYOUT_PAID', 'PAYOUT_REJECTED', 'DELIVERY_CANCELLED']);
const signed = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${formatPrice(Math.abs(n))}`;

/**
 * Thu nhập tài xế: tiền công mỗi đơn (MAK trả, cộng vào ví khi giao xong), tiền bù khi đơn bị hủy,
 * rút về tài khoản ngân hàng (cùng luồng rút tiền với quán — admin chuyển khoản rồi xác nhận).
 */
export default function ShipperEarningsPage() {
  const notify = useToast();
  const [wallet, setWallet] = useState<ShipperWallet | null>(null);
  const [entries, setEntries] = useState<Paginated<WalletEntry> | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState('');
  const [bank, setBank] = useState<BankAccount>(EMPTY_BANK);
  const [editingBank, setEditingBank] = useState(false);

  const load = useCallback(async () => {
    try {
      const [w, e] = await Promise.all([shipperApi.wallet(), shipperApi.entries({ limit })]);
      setWallet(w);
      setEntries(e);
      setError('');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [limit]);
  useEffect(() => { load(); }, [load]);
  useSocketEvent('notification:new', n => { if (WALLET_EVENTS.has(n.type)) load(); });

  if (error) return <div className="empty-state"><h2>Không tải được thu nhập</h2><p>{error}</p><button className="btn-soft" onClick={load}>Thử lại</button></div>;
  if (!wallet || !entries) return <div className="page-loading">Đang tải...</div>;

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

  const saveBank = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      await shipperApi.saveBankAccount({ ...bank, bankName: bank.bankName.trim(), accountName: bank.accountName.trim() });
      setEditingBank(false);
    }, 'Đã lưu tài khoản nhận tiền');
  };

  const requestPayout = (e: FormEvent) => {
    e.preventDefault();
    const value = Number(amount.replace(/\D/g, '')) || 0;
    if (value < wallet.payoutMin) {
      notify(`Rút tối thiểu ${formatPrice(wallet.payoutMin)}`);
      return;
    }
    run(async () => {
      await shipperApi.requestPayout(value);
      setAmount('');
    }, 'Đã gửi yêu cầu rút tiền');
  };

  const showBankForm = editingBank || !wallet.bankAccount;

  return (
    <div className="narrow-body">
      <h1 className="page-title">Thu nhập</h1>

      <div className="stat-grid">
        <div className="stat-tile accent">
          <small>Chưa rút</small>
          <strong>{formatPrice(wallet.balance)}</strong>
          <span>Tối thiểu {formatPrice(wallet.payoutMin)} / lần rút</span>
        </div>
        <div className="stat-tile">
          <small>Cách tính tiền công</small>
          <strong>{formatPrice(wallet.baseFee)}</strong>
          <span>{wallet.baseKm} km đầu · +{formatPrice(wallet.perKm)} / km tiếp theo</span>
        </div>
        <div className="stat-tile">
          <small>Đơn bị hủy khi đang tới quán</small>
          <strong>+{formatPrice(wallet.cancelCompensation)}</strong>
          <span>MAK bù cho chuyến</span>
        </div>
      </div>

      <section className="panel">
        <div className="section-head"><h2>Rút tiền</h2></div>
        {showBankForm ? (
          <form onSubmit={saveBank} className="wallet-form">
            <label className="field"><span>Ngân hàng</span><input value={bank.bankName} onChange={e => setBank({ ...bank, bankName: e.target.value })} placeholder="MB Bank" maxLength={100} required /></label>
            <label className="field"><span>Số tài khoản</span><input inputMode="numeric" value={bank.accountNumber} onChange={e => setBank({ ...bank, accountNumber: e.target.value.replace(/\D/g, '') })} maxLength={20} required /></label>
            <label className="field"><span>Tên chủ tài khoản</span><input value={bank.accountName} onChange={e => setBank({ ...bank, accountName: e.target.value })} placeholder="NGUYEN VAN A" maxLength={100} required /></label>
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
                  <input inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} placeholder={String(wallet.available)} disabled={wallet.available < wallet.payoutMin} />
                </label>
                {wallet.available >= wallet.payoutMin && <button type="button" className="link-btn" onClick={() => setAmount(String(wallet.available))}>Rút toàn bộ</button>}
                <button className="btn-primary" disabled={busy || wallet.available < wallet.payoutMin}>Yêu cầu rút</button>
                {wallet.available < wallet.payoutMin && <small className="muted">Cần từ {formatPrice(wallet.payoutMin)} để rút.</small>}
              </form>
            )}
          </>
        )}
      </section>

      <section className="panel">
        <div className="section-head">
          <h2>Lịch sử thu nhập</h2>
          <small className="muted">{entries.total} giao dịch</small>
        </div>
        {entries.items.length === 0 ? (
          <p className="muted">Chưa có giao dịch. Mỗi đơn giao xong sẽ cộng tiền công vào đây.</p>
        ) : (
          <ul className="entry-list">
            {entries.items.map(e => (
              <li key={e.id}>
                <div>
                  <b>{WALLET_ENTRY_LABEL[e.kind] ?? e.kind}</b>
                  <small>{e.note}</small>
                  <small className="muted">{formatDateTime(e.createdAt)}</small>
                </div>
                <span className={e.amount < 0 ? 'amount-neg' : 'amount-pos'}>{signed(e.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        {entries.items.length < entries.total && (
          <div className="pager"><button className="btn-outline" onClick={() => setLimit(l => l + PAGE_SIZE)}>Xem thêm</button></div>
        )}
      </section>
    </div>
  );
}
