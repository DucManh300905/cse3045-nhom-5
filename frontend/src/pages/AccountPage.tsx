import { useEffect, useState, type FormEvent } from 'react';
import { getErrorMessage } from '../api/client';
import { usersApi, type AddressInput } from '../api/users';
import AppHeader from '../components/AppHeader';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import type { Address } from '../types';
import { PHONE_REGEX } from '../utils/format';

const MAX_ADDRESSES = 5;

export default function AccountPage() {
  return (
    <div className="app">
      <AppHeader />
      <main className="container page-body narrow">
        <h1 className="page-title">Tài khoản của tôi</h1>
        <div className="account-grid">
          <ProfilePanel />
          <PasswordPanel />
        </div>
        <AddressBook />
      </main>
    </div>
  );
}

/** Sửa họ tên, số điện thoại (PUT /users/me) */
export function ProfilePanel() {
  const { user, updateProfile } = useAuth();
  const notify = useToast();
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return setError('Vui lòng nhập họ và tên.');
    if (phone && !PHONE_REGEX.test(phone)) return setError('Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.');
    setError('');
    setSaving(true);
    try {
      await updateProfile({ fullName: fullName.trim(), phone });
      notify('Đã lưu thông tin cá nhân');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="panel form-panel" onSubmit={submit} noValidate>
      <h2>Thông tin cá nhân</h2>
      {user?.email && (
        <label>
          <span>Email</span>
          <input value={user.email} disabled />
        </label>
      )}
      <label>
        <span>Họ và tên</span>
        <input value={fullName} onChange={e => setFullName(e.target.value)} autoComplete="name" />
      </label>
      <label>
        <span>Số điện thoại</span>
        <input type="tel" inputMode="numeric" value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="0912345678" autoComplete="tel" />
      </label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu thay đổi'}</button>
    </form>
  );
}

/** Đổi mật khẩu — backend trả token mới, AuthContext tự lưu (BR-05) */
export function PasswordPanel() {
  const { changePassword } = useAuth();
  const notify = useToast();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const setField = (k: keyof typeof form, v: string) => setForm(f => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.current) return setError('Vui lòng nhập mật khẩu hiện tại.');
    if (form.next.length < 8) return setError('Mật khẩu mới phải có ít nhất 8 ký tự.');
    if (form.next === form.current) return setError('Mật khẩu mới phải khác mật khẩu hiện tại.');
    if (form.next !== form.confirm) return setError('Mật khẩu xác nhận không khớp.');
    setError('');
    setSaving(true);
    try {
      await changePassword(form.current, form.next);
      setForm({ current: '', next: '', confirm: '' });
      notify('Đã đổi mật khẩu');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="panel form-panel" onSubmit={submit} noValidate>
      <h2>Đổi mật khẩu</h2>
      <label>
        <span>Mật khẩu hiện tại</span>
        <input type="password" value={form.current} onChange={e => setField('current', e.target.value)} autoComplete="current-password" />
      </label>
      <label>
        <span>Mật khẩu mới</span>
        <input type="password" value={form.next} onChange={e => setField('next', e.target.value)} placeholder="Ít nhất 8 ký tự" autoComplete="new-password" />
      </label>
      <label>
        <span>Xác nhận mật khẩu mới</span>
        <input type="password" value={form.confirm} onChange={e => setField('confirm', e.target.value)} autoComplete="new-password" />
      </label>
      {error && <div className="form-error" role="alert">{error}</div>}
      <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Đang đổi...' : 'Đổi mật khẩu'}</button>
    </form>
  );
}

const EMPTY_ADDRESS: AddressInput = { label: '', receiverName: '', phone: '', addressLine: '', isDefault: false };

/** Sổ địa chỉ giao hàng — tối đa 5, luôn có 1 mặc định (BR-06) */
function AddressBook() {
  const { user } = useAuth();
  const notify = useToast();
  const [addresses, setAddresses] = useState<Address[] | null>(null);
  /** null = đóng form, 'new' = thêm mới, còn lại = id đang sửa */
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<AddressInput>(EMPTY_ADDRESS);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const setField = <K extends keyof AddressInput>(k: K, v: AddressInput[K]) => setForm(f => ({ ...f, [k]: v }));

  const reload = () => usersApi.listAddresses().then(setAddresses).catch(err => { setAddresses([]); setError(getErrorMessage(err)); });
  useEffect(() => { reload(); }, []);

  const openNew = () => {
    setForm({ ...EMPTY_ADDRESS, receiverName: user?.fullName ?? '', phone: user?.phone ?? '', isDefault: !addresses?.length });
    setEditing('new');
    setError('');
  };
  const openEdit = (a: Address) => {
    setForm({ label: a.label ?? '', receiverName: a.receiverName, phone: a.phone, addressLine: a.addressLine, isDefault: a.isDefault });
    setEditing(a.id);
    setError('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.receiverName.trim()) return setError('Vui lòng nhập tên người nhận.');
    if (!PHONE_REGEX.test(form.phone)) return setError('Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0.');
    if (form.addressLine.trim().length < 5) return setError('Vui lòng nhập địa chỉ cụ thể.');
    const body: AddressInput = {
      label: form.label?.trim() || undefined,
      receiverName: form.receiverName.trim(),
      phone: form.phone,
      addressLine: form.addressLine.trim(),
      // Chỉ gửi true: bỏ mặc định = đặt địa chỉ khác làm mặc định
      ...(form.isDefault && { isDefault: true }),
    };
    setError('');
    setSaving(true);
    try {
      if (editing === 'new') await usersApi.createAddress(body);
      else if (editing) await usersApi.updateAddress(editing, body);
      await reload();
      setEditing(null);
      notify('Đã lưu địa chỉ');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const makeDefault = async (a: Address) => {
    try {
      await usersApi.updateAddress(a.id, { isDefault: true });
      await reload();
    } catch (err) {
      notify(getErrorMessage(err));
    }
  };

  const remove = async (a: Address) => {
    if (!window.confirm(`Xóa địa chỉ "${a.label || a.addressLine}"?`)) return;
    try {
      setAddresses(await usersApi.deleteAddress(a.id));
      if (editing === a.id) setEditing(null);
      notify('Đã xóa địa chỉ');
    } catch (err) {
      notify(getErrorMessage(err));
    }
  };

  const full = (addresses?.length ?? 0) >= MAX_ADDRESSES;

  return (
    <section className="panel address-book">
      <div className="summary-head">
        <h2>Sổ địa chỉ <small className="muted">{addresses?.length ?? 0}/{MAX_ADDRESSES}</small></h2>
        {editing === null && (
          <button className="btn-soft" onClick={openNew} disabled={full} title={full ? 'Đã đủ 5 địa chỉ' : undefined}>
            + Thêm địa chỉ
          </button>
        )}
      </div>

      {addresses === null ? (
        <p className="muted">Đang tải...</p>
      ) : addresses.length === 0 && editing === null ? (
        <p className="muted">Bạn chưa lưu địa chỉ nào. Lưu sẵn để đặt món nhanh hơn.</p>
      ) : (
        <ul className="address-list">
          {addresses.map(a => (
            <li key={a.id} className={a.isDefault ? 'address-item default' : 'address-item'}>
              <div>
                <b>{a.label || a.receiverName}{a.isDefault && <em className="tag">Mặc định</em>}</b>
                <small>{a.receiverName} · {a.phone}</small>
                <small>{a.addressLine}</small>
              </div>
              <div className="address-actions">
                {!a.isDefault && <button className="link-btn" onClick={() => makeDefault(a)}>Đặt mặc định</button>}
                <button className="link-btn" onClick={() => openEdit(a)}>Sửa</button>
                <button className="link-btn danger" onClick={() => remove(a)}>Xóa</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing !== null && (
        <form className="form-panel address-form" onSubmit={submit} noValidate>
          <h3>{editing === 'new' ? 'Thêm địa chỉ' : 'Sửa địa chỉ'}</h3>
          <div className="form-grid">
            <label>
              <span>Tên gợi nhớ</span>
              <input value={form.label} onChange={e => setField('label', e.target.value)} placeholder="vd: KTX, Nhà, Công ty" maxLength={50} />
            </label>
            <label>
              <span>Tên người nhận *</span>
              <input value={form.receiverName} onChange={e => setField('receiverName', e.target.value)} autoComplete="name" />
            </label>
          </div>
          <label>
            <span>Số điện thoại *</span>
            <input type="tel" inputMode="numeric" value={form.phone} onChange={e => setField('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="0912345678" autoComplete="tel" />
          </label>
          <label>
            <span>Địa chỉ *</span>
            <textarea rows={2} value={form.addressLine} onChange={e => setField('addressLine', e.target.value)} placeholder="vd: Phòng 305, KTX Đại học Việt Nhật, Khu CNC Hòa Lạc" maxLength={255} />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={!!form.isDefault}
              // Không bỏ mặc định trực tiếp được — đặt địa chỉ khác làm mặc định
              disabled={!!addresses?.find(a => a.id === editing)?.isDefault}
              onChange={e => setField('isDefault', e.target.checked)}
            />
            <span>Đặt làm địa chỉ mặc định</span>
          </label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="form-actions">
            <button type="button" className="btn-outline" onClick={() => setEditing(null)}>Hủy</button>
            <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu địa chỉ'}</button>
          </div>
        </form>
      )}
    </section>
  );
}
