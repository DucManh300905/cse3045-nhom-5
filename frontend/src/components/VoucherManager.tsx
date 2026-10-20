import { Fragment, useCallback, useEffect, useState, type FormEvent } from 'react';
import { adminApi } from '../api/admin';
import { getErrorCode, getErrorDetail, getErrorMessage } from '../api/client';
import type { VoucherManagerApi } from '../api/vouchers';
import { useToast } from '../context/ToastContext';
import type { ManagedVoucher, Paginated, PaymentMethod, VoucherInput, VoucherType, VoucherUsage } from '../types';
import { formatDateTime, formatPrice } from '../utils/format';
import { describeVoucher, FUNDED_LABEL } from '../utils/voucher';

const STATUS_LABEL: Record<ManagedVoucher['status'], string> = {
  ACTIVE: 'Đang chạy',
  SCHEDULED: 'Chưa bắt đầu',
  INACTIVE: 'Đã tắt',
  EXPIRED: 'Hết hạn',
};

// <input type="datetime-local"> dùng giờ máy, không có múi giờ
const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const fromLocalInput = (s: string) => new Date(s).toISOString();
const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(/\D/g, '')));

const MAX_MONEY = 10_000_000;

// Backend báo lỗi theo tên trường (tiếng Anh) -> câu tiếng Việt chỉ đúng ô cần sửa
const FIELD_HINT: Record<string, string> = {
  code: 'Mã gồm 4–20 chữ cái hoặc chữ số, không dấu, không khoảng trắng.',
  type: 'Chọn loại giảm.',
  value: 'Mức giảm không hợp lệ (số tiền tối đa 10.000.000 đ; phần trăm từ 1 đến 100).',
  maxDiscount: 'Giảm tối đa phải từ 1.000 đ đến 10.000.000 đ.',
  minOrderAmount: 'Đơn tối thiểu phải từ 0 đến 10.000.000 đ.',
  usageLimit: 'Tổng lượt phải từ 1 trở lên (để trống = không giới hạn).',
  perUserLimit: 'Lượt mỗi khách phải từ 1 đến 100.',
  startAt: 'Thời gian bắt đầu không hợp lệ.',
  endAt: 'Thời gian kết thúc phải sau thời gian bắt đầu.',
  description: 'Mô tả tối đa 200 ký tự.',
  restaurants: 'Danh sách quán áp dụng không hợp lệ.',
  paymentMethods: 'Chọn ít nhất một phương thức thanh toán áp dụng.',
};

const formError = (err: unknown) => {
  const field = getErrorDetail(err)?.field as string | undefined;
  if (getErrorCode(err) === 'VALIDATION_ERROR' && field) {
    const key = field.split(/[.[]/)[0];
    if (FIELD_HINT[key]) return FIELD_HINT[key];
  }
  return getErrorMessage(err);
};

/** Kiểm tra ngay trên form (cùng giới hạn với backend) — trả câu lỗi hoặc '' */
const checkInput = (v: VoucherInput) => {
  if (!/^[A-Z0-9]{4,20}$/.test(v.code ?? '')) return FIELD_HINT.code;
  if (!v.value || v.value < 1 || v.value > MAX_MONEY) return 'Nhập mức giảm.';
  if (v.type === 'PERCENT' && v.value > 100) return 'Phần trăm giảm phải từ 1 đến 100.';
  if (v.type === 'PERCENT' && (!v.maxDiscount || v.maxDiscount < 1000 || v.maxDiscount > MAX_MONEY)) return FIELD_HINT.maxDiscount;
  if ((v.minOrderAmount ?? 0) > MAX_MONEY) return FIELD_HINT.minOrderAmount;
  if (v.usageLimit !== null && v.usageLimit !== undefined && v.usageLimit < 1) return FIELD_HINT.usageLimit;
  if (!v.perUserLimit || v.perUserLimit < 1 || v.perUserLimit > 100) return FIELD_HINT.perUserLimit;
  if (!v.startAt || !v.endAt || Number.isNaN(Date.parse(v.startAt)) || Number.isNaN(Date.parse(v.endAt))) return 'Chọn đủ thời gian bắt đầu và kết thúc.';
  if (Date.parse(v.endAt) <= Date.parse(v.startAt)) return FIELD_HINT.endAt;
  if (!v.paymentMethods?.length) return FIELD_HINT.paymentMethods;
  if ((v.description ?? '').length > 200) return FIELD_HINT.description;
  return '';
};

interface FormState {
  code: string;
  description: string;
  type: VoucherType;
  value: string;
  maxDiscount: string;
  minOrderAmount: string;
  usageLimit: string;
  perUserLimit: string;
  startAt: string;
  endAt: string;
  restaurants: string[];
  paymentMethods: PaymentMethod[];
}

const PAYMENT_OPTIONS: [PaymentMethod, string][] = [['COD', 'Tiền mặt'], ['BANK_TRANSFER', 'Chuyển khoản']];

const emptyForm = (): FormState => ({
  code: '',
  description: '',
  type: 'FIXED',
  value: '',
  maxDiscount: '',
  minOrderAmount: '0',
  usageLimit: '',
  perUserLimit: '1',
  startAt: toLocalInput(new Date()),
  endAt: toLocalInput(new Date(Date.now() + 7 * 24 * 3600 * 1000)),
  restaurants: [],
  paymentMethods: ['COD', 'BANK_TRANSFER'],
});

interface Props {
  api: VoucherManagerApi;
  /** Admin: tạo voucher MAK (nền tảng chịu), chọn phạm vi quán, xem cả voucher của quán */
  isAdmin?: boolean;
}

/** Quản lý voucher (API-5b) — dùng cho /owner/vouchers và /admin/vouchers */
export default function VoucherManager({ api, isAdmin = false }: Props) {
  const notify = useToast();
  const [status, setStatus] = useState<'' | 'ACTIVE' | 'INACTIVE' | 'EXPIRED'>('');
  const [fundedBy, setFundedBy] = useState<'' | 'PLATFORM' | 'RESTAURANT'>('');
  const [data, setData] = useState<Paginated<ManagedVoucher> | null>(null);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [shops, setShops] = useState<{ id: string; name: string }[]>([]);
  /** Dòng đang mở: `usage:<id>` hoặc `extend:<id>` */
  const [open, setOpen] = useState<string | null>(null);
  const [usage, setUsage] = useState<(Paginated<VoucherUsage> & { summary: { uses: number; totalDiscount: number } }) | null>(null);
  const [extendTo, setExtendTo] = useState('');
  const [extendLimit, setExtendLimit] = useState('');

  const load = useCallback(() => {
    api.list({ status: status || undefined, fundedBy: fundedBy || undefined, limit: 100 })
      .then(d => { setData(d); setError(''); })
      .catch(err => setError(getErrorMessage(err)));
  }, [api, status, fundedBy]);
  useEffect(load, [load]);

  // Admin chọn phạm vi: các quán đã duyệt
  useEffect(() => {
    if (!isAdmin) return;
    adminApi.listRestaurants({ status: 'APPROVED', limit: 100 })
      .then(r => setShops(r.items.map(s => ({ id: s.id, name: s.name }))))
      .catch(() => setShops([]));
  }, [isAdmin]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm(f => ({ ...f, [k]: v }));

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try {
      await fn();
      notify(done);
      setOpen(null);
      load();
      return true;
    } catch (err) {
      notify(formError(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const input: VoucherInput = {
      code: form.code.trim().toUpperCase(),
      description: form.description.trim() || undefined,
      type: form.type,
      value: Number(form.value),
      maxDiscount: form.type === 'PERCENT' ? num(form.maxDiscount) : null,
      minOrderAmount: num(form.minOrderAmount) ?? 0,
      paymentMethods: form.paymentMethods,
      usageLimit: num(form.usageLimit),
      perUserLimit: num(form.perUserLimit) ?? 1,
      startAt: form.startAt ? fromLocalInput(form.startAt) : '',
      endAt: form.endAt ? fromLocalInput(form.endAt) : '',
      ...(isAdmin && { restaurants: form.restaurants }),
    };
    const problem = checkInput(input);
    if (problem) return notify(problem);
    if (await run(() => api.create(input), `Đã tạo voucher ${input.code}`)) {
      setForm(emptyForm());
      setShowForm(false);
    }
  };

  const showUsage = async (v: ManagedVoucher) => {
    if (open === `usage:${v.id}`) return setOpen(null);
    try {
      setUsage(await api.usage(v.id));
      setOpen(`usage:${v.id}`);
    } catch (err) {
      notify(getErrorMessage(err));
    }
  };

  const openExtend = (v: ManagedVoucher) => {
    setExtendTo(toLocalInput(new Date(Math.max(new Date(v.endAt).getTime(), Date.now() + 24 * 3600 * 1000))));
    setExtendLimit(v.usageLimit === null ? '' : String(v.usageLimit));
    setOpen(`extend:${v.id}`);
  };

  return (
    <>
      <div className="owner-title-row">
        <h1 className="page-title">{isAdmin ? 'Voucher' : 'Voucher của quán'}</h1>
        <button className="btn-primary" onClick={() => setShowForm(s => !s)}>{showForm ? 'Đóng' : '+ Tạo voucher'}</button>
      </div>
      <p className="muted">
        {isAdmin
          ? 'Voucher MAK do nền tảng chịu tiền giảm: khi đơn hoàn thành, ví quán được cộng lại phần giảm. Mỗi đơn dùng tối đa 1 voucher MAK + 1 voucher quán.'
          : 'Voucher của quán do quán tự chịu tiền giảm, chỉ dùng được ở quán bạn. Hoa hồng tính trên số tiền sau khi trừ voucher quán.'}
      </p>

      {showForm && (
        <form className="panel voucher-form" onSubmit={submit}>
          <div className="form-grid three">
            <label className="field"><span>Mã (khách nhập)</span><input value={form.code} onChange={e => set('code', e.target.value.toUpperCase())} placeholder="GIAM10K" maxLength={20} /></label>
            <label className="field">
              <span>Loại giảm</span>
              <select value={form.type} onChange={e => set('type', e.target.value as VoucherType)}>
                <option value="FIXED">Số tiền (đ)</option>
                <option value="PERCENT">Phần trăm (%)</option>
              </select>
            </label>
            <label className="field"><span>{form.type === 'PERCENT' ? 'Giảm (%)' : 'Giảm (đ)'}</span><input inputMode="numeric" value={form.value} onChange={e => set('value', e.target.value.replace(/\D/g, ''))} /></label>
            {form.type === 'PERCENT' && (
              <label className="field"><span>Giảm tối đa (đ)</span><input inputMode="numeric" value={form.maxDiscount} onChange={e => set('maxDiscount', e.target.value.replace(/\D/g, ''))} /></label>
            )}
            <label className="field"><span>Đơn tối thiểu (đ)</span><input inputMode="numeric" value={form.minOrderAmount} onChange={e => set('minOrderAmount', e.target.value.replace(/\D/g, ''))} /></label>
            <label className="field"><span>Tổng lượt (trống = không giới hạn)</span><input inputMode="numeric" value={form.usageLimit} onChange={e => set('usageLimit', e.target.value.replace(/\D/g, ''))} /></label>
            <label className="field"><span>Lượt mỗi khách</span><input inputMode="numeric" value={form.perUserLimit} onChange={e => set('perUserLimit', e.target.value.replace(/\D/g, ''))} /></label>
            <label className="field"><span>Bắt đầu</span><input type="datetime-local" value={form.startAt} onChange={e => set('startAt', e.target.value)} /></label>
            <label className="field"><span>Kết thúc</span><input type="datetime-local" value={form.endAt} onChange={e => set('endAt', e.target.value)} /></label>
          </div>
          <fieldset className="field method-pick">
            <span>Áp dụng khi khách thanh toán bằng</span>
            <div>
              {PAYMENT_OPTIONS.map(([m, label]) => (
                <label key={m} className="check">
                  <input
                    type="checkbox"
                    checked={form.paymentMethods.includes(m)}
                    onChange={e => set('paymentMethods', e.target.checked
                      ? PAYMENT_OPTIONS.map(([k]) => k).filter(k => k === m || form.paymentMethods.includes(k))
                      : form.paymentMethods.filter(k => k !== m))}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            {form.paymentMethods.length === 0 && <small className="form-error">Chọn ít nhất một phương thức</small>}
          </fieldset>
          <label className="field"><span>Mô tả (khách thấy)</span><input value={form.description} onChange={e => set('description', e.target.value)} maxLength={200} placeholder="Chào bạn mới" /></label>
          {isAdmin && (
            <label className="field">
              <span>Áp dụng cho quán (không chọn = mọi quán) — giữ Ctrl để chọn nhiều</span>
              <select multiple size={Math.min(6, Math.max(3, shops.length))} value={form.restaurants}
                onChange={e => set('restaurants', Array.from(e.target.selectedOptions).map(o => o.value))}>
                {shops.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          )}
          <div className="form-actions">
            <button type="button" className="btn-outline" onClick={() => setShowForm(false)}>Hủy</button>
            <button className="btn-primary" disabled={busy}>{busy ? 'Đang lưu...' : 'Tạo voucher'}</button>
          </div>
        </form>
      )}

      <section className="toolbar admin-toolbar">
        <div className="cat-tabs" role="tablist">
          {([['', 'Tất cả'], ['ACTIVE', 'Đang chạy'], ['INACTIVE', 'Đã tắt'], ['EXPIRED', 'Hết hạn']] as const).map(([k, label]) => (
            <button key={k} role="tab" aria-selected={status === k} className={status === k ? 'active' : ''} onClick={() => setStatus(k)}>{label}</button>
          ))}
        </div>
        {isAdmin && (
          <select value={fundedBy} onChange={e => setFundedBy(e.target.value as typeof fundedBy)} aria-label="Loại voucher">
            <option value="">Mọi loại</option>
            <option value="PLATFORM">Voucher MAK</option>
            <option value="RESTAURANT">Voucher của quán</option>
          </select>
        )}
      </section>

      {error ? (
        <div className="empty-state"><h2>Không tải được voucher</h2><p>{error}</p></div>
      ) : !data ? (
        <div className="page-loading">Đang tải...</div>
      ) : data.items.length === 0 ? (
        <div className="empty-state"><h2>Chưa có voucher</h2><p>Bấm "+ Tạo voucher" để tạo mã giảm giá đầu tiên.</p></div>
      ) : (
        <div className="panel table-wrap">
          <table className="data-table">
            <thead><tr><th>Mã</th><th>Ưu đãi</th><th>Đã dùng</th><th>Thời hạn</th><th>Trạng thái</th><th></th></tr></thead>
            <tbody>
              {data.items.map(v => (
                <Fragment key={v.id}>
                  <tr>
                    <td>
                      <b className="mono">{v.code}</b>
                      {isAdmin && <><br /><small className={`voucher-kind k-${v.fundedBy}`}>{FUNDED_LABEL[v.fundedBy]}{v.restaurant ? ` · ${v.restaurant.name}` : ''}</small></>}
                      {v.description && <><br /><small className="muted">{v.description}</small></>}
                    </td>
                    <td>
                      {describeVoucher(v)}
                      {isAdmin && v.fundedBy === 'PLATFORM' && <><br /><small className="muted">{v.restaurants.length ? v.restaurants.map(r => r.name).join(', ') : 'Mọi quán'}</small></>}
                    </td>
                    <td className="nowrap">
                      {v.usedCount}{v.usageLimit !== null && ` / ${v.usageLimit}`}
                      {v.usageLimit !== null && <span className="progress"><i style={{ width: `${Math.min(100, (v.usedCount / v.usageLimit) * 100)}%` }} /></span>}
                      <small className="muted"> · {v.perUserLimit} lượt/khách</small>
                    </td>
                    <td className="nowrap"><small>{formatDateTime(v.startAt)}<br />→ {formatDateTime(v.endAt)}</small></td>
                    <td>{STATUS_LABEL[v.status]}</td>
                    <td className="nowrap">
                      <button className="link-btn" onClick={() => showUsage(v)}>{open === `usage:${v.id}` ? 'Ẩn' : 'Lượt dùng'}</button>{' '}
                      <button className="link-btn" onClick={() => openExtend(v)}>Gia hạn</button>{' '}
                      <button className="link-btn" disabled={busy}
                        onClick={() => run(() => api.update(v.id, { isActive: !v.isActive }), v.isActive ? `Đã tắt ${v.code}` : `Đã bật ${v.code}`)}>
                        {v.isActive ? 'Tắt' : 'Bật'}
                      </button>
                      {v.usedCount === 0 && (
                        <>{' '}<button className="link-btn danger" disabled={busy}
                          onClick={() => window.confirm(`Xóa voucher ${v.code}?`) && run(() => api.remove(v.id), `Đã xóa ${v.code}`)}>Xóa</button></>
                      )}
                    </td>
                  </tr>
                  {open === `extend:${v.id}` && (
                    <tr><td colSpan={6}>
                      <div className="inline-form wrap">
                        <label className="field"><span>Kết thúc mới</span><input type="datetime-local" value={extendTo} onChange={e => setExtendTo(e.target.value)} /></label>
                        <label className="field"><span>Tổng lượt (trống = không giới hạn)</span><input inputMode="numeric" value={extendLimit} onChange={e => setExtendLimit(e.target.value.replace(/\D/g, ''))} /></label>
                        <button className="btn-primary" disabled={busy}
                          onClick={() => run(() => api.update(v.id, { endAt: fromLocalInput(extendTo), usageLimit: num(extendLimit) }), `Đã cập nhật ${v.code}`)}>Lưu</button>
                        <button className="link-btn" onClick={() => setOpen(null)}>Hủy</button>
                      </div>
                    </td></tr>
                  )}
                  {open === `usage:${v.id}` && usage && (
                    <tr><td colSpan={6}>
                      <p><b>{usage.summary.uses}</b> lượt đang hiệu lực · tổng giảm <b>{formatPrice(usage.summary.totalDiscount)}</b></p>
                      {usage.items.length === 0 ? <p className="muted">Chưa có ai dùng.</p> : (
                        <table className="data-table nested">
                          <tbody>
                            {usage.items.map(u => (
                              <tr key={u.id}>
                                <td className="mono">{u.order?.code ?? '—'}</td>
                                <td>{u.customer}</td>
                                <td className="num">−{formatPrice(u.discount)}</td>
                                <td>{u.active ? '' : <small className="muted">Đơn đã hủy (đã trả lượt)</small>}</td>
                                <td className="nowrap"><small>{formatDateTime(u.createdAt)}</small></td>
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
        </div>
      )}
    </>
  );
}
