import { useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { assetUrl, getErrorMessage } from '../../api/client';
import { merchantApi, type RestaurantInput } from '../../api/merchant';
import { useToast } from '../../context/ToastContext';
import type { DocumentType, MerchantRestaurant, OpeningHour } from '../../types';
import { formatDateTime, PHONE_REGEX } from '../../utils/format';
import { DAY_NAMES as DAYS, DOCUMENTS, STATUS_LABEL } from '../../utils/labels';
import { useOwner } from './OwnerLayout';

const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
const DOC_ACCEPT = `${IMAGE_ACCEPT},application/pdf`;
const MAX_FILE = 2 * 1024 * 1024;

/** Kiểm tra file trước khi upload (backend cũng kiểm tra) */
const pickFile = (e: ChangeEvent<HTMLInputElement>, notify: (m: string) => void) => {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return null;
  if (file.size > MAX_FILE) { notify('File vượt quá 2MB'); return null; }
  return file;
};

export default function OwnerProfilePage() {
  const { restaurant } = useOwner();

  if (!restaurant) {
    return (
      <>
        <h1 className="page-title">Tạo quán của bạn</h1>
        <p className="page-lead">Bước 1/4: nhập thông tin cơ bản. Sau đó bạn thêm giờ mở cửa, giấy tờ và nộp hồ sơ để quản trị viên duyệt.</p>
        <InfoPanel />
      </>
    );
  }

  return (
    <>
      <h1 className="page-title">{restaurant.name}</h1>
      <StatusPanel />
      <div className="owner-grid">
        <InfoPanel />
        <div className="owner-col">
          <ImagesPanel />
          <DocumentsPanel />
        </div>
      </div>
      <HoursPanel />
    </>
  );
}

// ======================= Trạng thái + nộp hồ sơ + nhận đơn =======================

function StatusPanel() {
  const { restaurant, setRestaurant } = useOwner();
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const r = restaurant!;

  const checklist = [
    { label: 'Thông tin quán', ok: true },
    { label: 'Giờ mở cửa', ok: r.openingHours.length > 0 },
    ...DOCUMENTS.filter(d => d.required).map(d => ({ label: d.label, ok: r.documents.some(x => x.type === d.type) })),
  ];
  const ready = checklist.every(c => c.ok);

  const run = async (fn: () => Promise<MerchantRestaurant>, ok: string) => {
    setBusy(true);
    try {
      setRestaurant(await fn());
      notify(ok);
    } catch (err) {
      notify(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`panel status-panel s-${r.status}`}>
      <div className="status-head">
        <div>
          <span className={`status-chip s-${r.status}`}>{STATUS_LABEL[r.status]}</span>
          <h2>
            {{
              DRAFT: 'Hoàn thiện hồ sơ và nộp để được duyệt',
              SUBMITTED: 'Hồ sơ đang chờ quản trị viên duyệt',
              APPROVED: r.isAcceptingOrders ? 'Quán đang hiển thị và nhận đơn' : 'Quán đã được duyệt',
              REJECTED: 'Hồ sơ bị từ chối — sửa lại và nộp lại',
              BLOCKED: 'Quán đang bị khóa',
            }[r.status]}
          </h2>
          {r.status === 'SUBMITTED' && r.submittedAt && <small>Nộp lúc {formatDateTime(r.submittedAt)}. Trong lúc chờ không sửa được thông tin quán, nhưng vẫn soạn thực đơn được.</small>}
          {r.status === 'REJECTED' && r.rejectReason && <p className="reject-reason">Lý do: {r.rejectReason}</p>}
          {r.status === 'BLOCKED' && <small>Liên hệ quản trị viên để được mở khóa. Bạn chỉ xem được dữ liệu.</small>}
          {r.status === 'APPROVED' && (
            <small>
              {r.isOpenNow ? 'Đang trong giờ mở cửa.' : 'Hiện ngoài giờ mở cửa — khách chưa đặt được.'}{' '}
              <Link to={`/restaurants/${r.slug}`} className="link-btn">Xem trang quán →</Link>
            </small>
          )}
        </div>

        {r.status === 'APPROVED' && (
          <label className="switch big-switch">
            <input
              type="checkbox"
              checked={r.isAcceptingOrders}
              disabled={busy}
              onChange={e => run(() => merchantApi.setAcceptingOrders(e.target.checked), e.target.checked ? 'Đã bật nhận đơn' : 'Đã tạm ngưng nhận đơn')}
            />
            <span className="switch-track" aria-hidden />
            <span>{r.isAcceptingOrders ? 'Đang nhận đơn' : 'Tạm ngưng nhận đơn'}</span>
          </label>
        )}
      </div>

      {(r.status === 'DRAFT' || r.status === 'REJECTED') && (
        <div className="submit-row">
          <ul className="checklist">
            {checklist.map(c => <li key={c.label} className={c.ok ? 'ok' : ''}>{c.label}</li>)}
          </ul>
          <button
            className="btn-primary"
            disabled={busy || !ready}
            onClick={() => run(merchantApi.submit, 'Đã nộp hồ sơ, vui lòng chờ duyệt')}
          >
            {r.status === 'REJECTED' ? 'Nộp lại hồ sơ' : 'Nộp hồ sơ'}
          </button>
        </div>
      )}
    </section>
  );
}

// ======================= Thông tin quán =======================

const toForm = (r: MerchantRestaurant | null) => ({
  name: r?.name ?? '',
  address: r?.address ?? '',
  phone: r?.phone ?? '',
  description: r?.description ?? '',
  cuisineTypes: r?.cuisineTypes.join(', ') ?? '',
  minOrderAmount: String(r?.minOrderAmount ?? 0),
  deliveryRadiusKm: String(r?.deliveryRadiusKm ?? 5),
  avgPrepMinutes: String(r?.avgPrepMinutes ?? 15),
});

function InfoPanel() {
  const { restaurant, setRestaurant } = useOwner();
  const notify = useToast();
  const [form, setForm] = useState(() => toForm(restaurant));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const setField = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));
  const locked = restaurant?.status === 'SUBMITTED' || restaurant?.status === 'BLOCKED';
  const digits = (v: string) => v.replace(/\D/g, '');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setError('Vui lòng nhập tên quán.');
    if (form.address.trim().length < 5) return setError('Vui lòng nhập địa chỉ quán.');
    if (!PHONE_REGEX.test(form.phone)) return setError('Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.');
    const radius = Number(form.deliveryRadiusKm);
    if (!(radius >= 0.5 && radius <= 30)) return setError('Bán kính giao hàng từ 0,5 đến 30 km.');
    const prep = Number(form.avgPrepMinutes);
    if (!(Number.isInteger(prep) && prep >= 1 && prep <= 180)) return setError('Thời gian chuẩn bị từ 1 đến 180 phút.');

    const body: RestaurantInput = {
      name: form.name.trim(),
      address: form.address.trim(),
      phone: form.phone,
      description: form.description.trim(),
      cuisineTypes: form.cuisineTypes.split(',').map(s => s.trim()).filter(Boolean),
      minOrderAmount: Number(form.minOrderAmount || 0),
      deliveryRadiusKm: radius,
      avgPrepMinutes: prep,
    };
    setError('');
    setSaving(true);
    try {
      const saved = restaurant ? await merchantApi.updateRestaurant(body) : await merchantApi.createRestaurant(body);
      setRestaurant(saved);
      notify(restaurant ? 'Đã lưu thông tin quán' : 'Đã tạo quán! Tiếp theo: giờ mở cửa và giấy tờ.');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="panel form-panel" onSubmit={submit} noValidate>
      <h2>Thông tin quán</h2>
      <fieldset className="plain" disabled={locked}>
        <label>
          <span>Tên quán *</span>
          <input value={form.name} onChange={e => setField('name', e.target.value)} placeholder="vd: Cơm rang Hòa Lạc" maxLength={100} />
        </label>
        <label>
          <span>Địa chỉ *</span>
          <input value={form.address} onChange={e => setField('address', e.target.value)} placeholder="vd: Số 5, Thôn 3, Thạch Hòa, Thạch Thất" maxLength={255} />
        </label>
        <div className="form-grid">
          <label>
            <span>Số điện thoại quán *</span>
            <input type="tel" inputMode="numeric" value={form.phone} onChange={e => setField('phone', digits(e.target.value).slice(0, 10))} placeholder="0912345678" />
          </label>
          <label>
            <span>Loại món (cách nhau dấu phẩy)</span>
            <input value={form.cuisineTypes} onChange={e => setField('cuisineTypes', e.target.value)} placeholder="vd: Cơm, Bún phở, Đồ uống" />
          </label>
        </div>
        <label>
          <span>Giới thiệu</span>
          <textarea rows={3} value={form.description} onChange={e => setField('description', e.target.value)} maxLength={1000} placeholder="Món đặc trưng, giá sinh viên..." />
        </label>
        <div className="form-grid">
          <label>
            <span>Đơn tối thiểu (đ)</span>
            <input inputMode="numeric" value={form.minOrderAmount} onChange={e => setField('minOrderAmount', digits(e.target.value))} />
          </label>
          <label>
            <span>Bán kính giao (km)</span>
            <input inputMode="decimal" value={form.deliveryRadiusKm} onChange={e => setField('deliveryRadiusKm', e.target.value.replace(/[^\d.]/g, ''))} />
          </label>
          <label>
            <span>Thời gian chuẩn bị TB (phút)</span>
            <input inputMode="numeric" value={form.avgPrepMinutes} onChange={e => setField('avgPrepMinutes', digits(e.target.value))} />
          </label>
        </div>
      </fieldset>
      {error && <div className="form-error" role="alert">{error}</div>}
      {!locked && (
        <button className="btn-primary" type="submit" disabled={saving}>
          {saving ? 'Đang lưu...' : restaurant ? 'Lưu thông tin' : 'Tạo quán →'}
        </button>
      )}
    </form>
  );
}

// ======================= Ảnh logo / ảnh bìa =======================

function ImagesPanel() {
  const { restaurant, setRestaurant } = useOwner();
  const notify = useToast();
  const [busy, setBusy] = useState<'logo' | 'cover' | null>(null);
  const r = restaurant!;
  const locked = r.status === 'BLOCKED';

  const onPick = async (kind: 'logo' | 'cover', e: ChangeEvent<HTMLInputElement>) => {
    const file = pickFile(e, notify);
    if (!file) return;
    setBusy(kind);
    try {
      setRestaurant(await merchantApi.uploadImage(kind, file));
      notify('Đã cập nhật ảnh');
    } catch (err) {
      notify(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="panel form-panel">
      <h2>Ảnh quán</h2>
      <div className="image-pickers">
        {(['logo', 'cover'] as const).map(kind => {
          const url = kind === 'logo' ? r.logoUrl : r.coverUrl;
          return (
            <div key={kind} className={`image-picker ${kind}`}>
              {url ? <img src={assetUrl(url)} alt="" /> : <div className="img-fallback" />}
              <label className={locked ? 'btn-soft disabled' : 'btn-soft'}>
                {busy === kind ? 'Đang tải...' : kind === 'logo' ? 'Đổi logo' : 'Đổi ảnh bìa'}
                <input type="file" accept={IMAGE_ACCEPT} hidden disabled={locked || !!busy} onChange={e => onPick(kind, e)} />
              </label>
            </div>
          );
        })}
      </div>
      <small className="muted">JPG, PNG hoặc WEBP, tối đa 2MB.</small>
    </section>
  );
}

// ======================= Giấy tờ pháp lý =======================

function DocumentsPanel() {
  const { restaurant, setRestaurant } = useOwner();
  const notify = useToast();
  const [busy, setBusy] = useState<DocumentType | null>(null);
  const r = restaurant!;
  const editable = r.status === 'DRAFT' || r.status === 'REJECTED';

  const onPick = async (type: DocumentType, e: ChangeEvent<HTMLInputElement>) => {
    const file = pickFile(e, notify);
    if (!file) return;
    setBusy(type);
    try {
      setRestaurant(await merchantApi.uploadDocument(type, file));
      notify('Đã tải giấy tờ lên');
    } catch (err) {
      notify(getErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="panel form-panel">
      <h2>Giấy tờ pháp lý</h2>
      <ul className="doc-list">
        {DOCUMENTS.map(d => {
          const doc = r.documents.find(x => x.type === d.type);
          return (
            <li key={d.type} className={doc ? 'ok' : ''}>
              <div>
                <b>{d.label}{d.required ? ' *' : ''}</b>
                <small>{doc ? `${doc.originalName} · ${formatDateTime(doc.uploadedAt)}` : 'Chưa tải lên'}</small>
              </div>
              {editable && (
                <label className="btn-outline">
                  {busy === d.type ? 'Đang tải...' : doc ? 'Thay' : 'Tải lên'}
                  <input type="file" accept={DOC_ACCEPT} hidden disabled={!!busy} onChange={e => onPick(d.type, e)} />
                </label>
              )}
            </li>
          );
        })}
      </ul>
      <small className="muted">
        {editable ? 'Ảnh hoặc PDF, tối đa 2MB. Chỉ quản trị viên xem được giấy tờ.' : 'Giấy tờ đã khóa sau khi nộp hồ sơ.'}
      </small>
    </section>
  );
}

// ======================= Giờ mở cửa =======================

/** Hiển thị Thứ hai trước, Chủ nhật cuối */
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
type Slot = { open: string; close: string };

const toDays = (hours: OpeningHour[]) =>
  Array.from({ length: 7 }, (_, d) => hours.filter(h => h.dayOfWeek === d).map(({ open, close }) => ({ open, close })));

function HoursPanel() {
  const { restaurant, setRestaurant } = useOwner();
  const notify = useToast();
  const [days, setDays] = useState<Slot[][]>(() => toDays(restaurant!.openingHours));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const locked = restaurant!.status === 'BLOCKED';

  const update = (d: number, fn: (slots: Slot[]) => Slot[]) => setDays(all => all.map((s, i) => (i === d ? fn(s) : s)));
  const copyToAll = (d: number) => setDays(all => all.map(() => all[d].map(s => ({ ...s }))));

  const save = async () => {
    for (const d of DAY_ORDER) {
      const sorted = [...days[d]].sort((a, b) => a.open.localeCompare(b.open));
      for (let i = 0; i < sorted.length; i++) {
        if (!sorted[i].open || !sorted[i].close) return setError(`${DAYS[d]}: nhập đủ giờ mở và giờ đóng.`);
        if (sorted[i].close <= sorted[i].open) return setError(`${DAYS[d]}: giờ đóng phải sau giờ mở (${sorted[i].open}–${sorted[i].close}).`);
        if (i > 0 && sorted[i - 1].close > sorted[i].open) return setError(`${DAYS[d]}: các khung giờ bị chồng nhau.`);
      }
    }
    setError('');
    setSaving(true);
    try {
      const openingHours = days.flatMap((slots, dayOfWeek) => slots.map(s => ({ dayOfWeek, ...s })));
      const saved = await merchantApi.updateOpeningHours(openingHours);
      setRestaurant(saved);
      setDays(toDays(saved.openingHours));
      notify('Đã lưu giờ mở cửa');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel form-panel hours-panel">
      <div className="summary-head">
        <h2>Giờ mở cửa</h2>
        <small className="muted">Giờ Việt Nam. Một ngày có thể có nhiều khung giờ (vd sáng và tối).</small>
      </div>
      <fieldset className="plain" disabled={locked}>
        <ul className="hours-list">
          {DAY_ORDER.map(d => (
            <li key={d}>
              <b>{DAYS[d]}</b>
              <div className="slots">
                {days[d].length === 0 && <span className="muted">Nghỉ</span>}
                {days[d].map((s, i) => (
                  <span key={i} className="slot">
                    <input type="time" value={s.open} onChange={e => update(d, sl => sl.map((x, j) => (j === i ? { ...x, open: e.target.value } : x)))} aria-label={`${DAYS[d]} mở`} />
                    –
                    <input type="time" value={s.close} onChange={e => update(d, sl => sl.map((x, j) => (j === i ? { ...x, close: e.target.value } : x)))} aria-label={`${DAYS[d]} đóng`} />
                    <button type="button" className="icon-btn" onClick={() => update(d, sl => sl.filter((_, j) => j !== i))} aria-label="Xóa khung giờ">×</button>
                  </span>
                ))}
              </div>
              <div className="hours-actions">
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => update(d, sl => [...sl, sl.length ? { open: sl[sl.length - 1].close, close: '21:00' } : { open: '07:00', close: '21:00' }])}
                >
                  + Khung giờ
                </button>
                {days[d].length > 0 && <button type="button" className="link-btn muted" onClick={() => copyToAll(d)}>Áp dụng mọi ngày</button>}
              </div>
            </li>
          ))}
        </ul>
      </fieldset>
      {error && <div className="form-error" role="alert">{error}</div>}
      {!locked && <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu giờ mở cửa'}</button>}
    </section>
  );
}
