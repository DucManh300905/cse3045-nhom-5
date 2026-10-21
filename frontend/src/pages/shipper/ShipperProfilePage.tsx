import { useState, type ChangeEvent, type FormEvent } from 'react';
import { getErrorMessage } from '../../api/client';
import { shipperApi, type ShipperProfileInput } from '../../api/shipper';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import type { ShipperDocumentType, VehicleType } from '../../types';
import { formatDateTime, PHONE_REGEX } from '../../utils/format';
import { SHIPPER_STATUS_LABEL, VEHICLE_LABEL, requiredShipperDocuments } from '../../utils/delivery';
import { useShipper } from './ShipperLayout';
import { EmailVerifyPanel } from './ShipperShiftsPage';

const DOC_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';
const MAX_FILE = 2 * 1024 * 1024;

/** Hồ sơ tài xế: thông tin + xe + giấy tờ -> nộp cho admin duyệt (giống hồ sơ quán) */
export default function ShipperProfilePage() {
  const { profile, setProfile, reload } = useShipper();
  const { user } = useAuth();
  const notify = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<ShipperProfileInput>({
    fullName: profile?.fullName ?? user?.fullName ?? '',
    phone: profile?.phone ?? user?.phone ?? '',
    idNumber: profile?.idNumber ?? '',
    vehicleType: profile?.vehicleType ?? 'MOTORBIKE',
    licensePlate: profile?.licensePlate ?? '',
  });
  const set = <K extends keyof ShipperProfileInput>(k: K, v: ShipperProfileInput[K]) => setForm(f => ({ ...f, [k]: v }));

  const editable = !profile || ['DRAFT', 'REJECTED'].includes(profile.status);
  const docs = requiredShipperDocuments(profile?.vehicleType ?? form.vehicleType);
  const missing = profile ? docs.filter(d => !profile.documents.some(x => x.type === d.type)) : docs;
  const needPlate = (profile?.vehicleType ?? form.vehicleType) === 'MOTORBIKE' && !(profile?.licensePlate);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!PHONE_REGEX.test(form.phone.trim())) {
      setError('Số điện thoại gồm 10 chữ số, bắt đầu bằng 0.');
      return;
    }
    if (form.vehicleType === 'MOTORBIKE' && !form.licensePlate?.trim()) {
      setError('Xe máy cần nhập biển số.');
      return;
    }
    setBusy(true);
    setError('');
    const input = {
      fullName: form.fullName.trim(),
      phone: form.phone.trim(),
      vehicleType: form.vehicleType,
      ...(form.idNumber?.trim() && { idNumber: form.idNumber.trim() }),
      ...(form.licensePlate?.trim() && { licensePlate: form.licensePlate.trim() }),
    };
    try {
      setProfile(profile ? await shipperApi.updateProfile(input) : await shipperApi.createProfile(input));
      notify(profile ? 'Đã lưu hồ sơ' : 'Đã tạo hồ sơ — tải giấy tờ lên rồi bấm "Nộp hồ sơ"');
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const upload = async (type: ShipperDocumentType, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_FILE) {
      notify('File quá 2MB — hãy chụp lại hoặc giảm dung lượng.');
      return;
    }
    setBusy(true);
    try {
      setProfile(await shipperApi.uploadDocument(type, file));
      notify('Đã tải giấy tờ lên');
    } catch (err) {
      notify(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    try {
      setProfile(await shipperApi.submit());
      notify('Đã nộp hồ sơ, vui lòng chờ MAK duyệt');
    } catch (err) {
      notify(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="narrow-body">
      <h1 className="page-title">Hồ sơ tài xế</h1>

      {profile && (
        <section className={`panel status-panel s-${profile.status}`}>
          <span className={`status-chip s-${profile.status}`}>{SHIPPER_STATUS_LABEL[profile.status]}</span>
          <h2>
            {{
              DRAFT: 'Hoàn thiện hồ sơ và nộp để được duyệt',
              SUBMITTED: 'Hồ sơ đang chờ MAK duyệt',
              APPROVED: 'Bạn đã là tài xế MAK — bật "Trực tuyến" ở trang Làm việc để nhận đơn',
              REJECTED: 'Hồ sơ bị từ chối — sửa lại và nộp lại',
              BLOCKED: 'Tài khoản tài xế đang bị khóa — liên hệ MAK',
            }[profile.status]}
          </h2>
          {profile.status === 'SUBMITTED' && profile.submittedAt && <small>Nộp lúc {formatDateTime(profile.submittedAt)}</small>}
          {profile.status === 'REJECTED' && profile.rejectReason && <p className="reject-reason">Lý do: {profile.rejectReason}</p>}
          {editable && (
            <div className="submit-row">
              <ul className="checklist">
                <li className="ok">Thông tin cá nhân</li>
                {docs.map(d => <li key={d.type} className={profile.documents.some(x => x.type === d.type) ? 'ok' : ''}>{d.label}</li>)}
                {(profile.vehicleType === 'MOTORBIKE') && <li className={needPlate ? '' : 'ok'}>Biển số xe</li>}
                <li className={profile.emailVerified ? 'ok' : ''}>Email đã xác thực</li>
              </ul>
              <button className="btn-primary" disabled={busy || missing.length > 0 || needPlate || !profile.emailVerified} onClick={submit}>Nộp hồ sơ</button>
            </div>
          )}
        </section>
      )}

      {profile?.emailVerified === false && <EmailVerifyPanel onDone={reload} />}

      <form className="panel form-panel" onSubmit={save}>
        <h2>Thông tin tài xế</h2>
        <fieldset disabled={!editable || busy} className="plain-fieldset">
          <div className="form-grid">
            <label>
              <span>Họ và tên *</span>
              <input value={form.fullName} onChange={e => set('fullName', e.target.value)} required maxLength={100} />
            </label>
            <label>
              <span>Số điện thoại (khách / quán gọi) *</span>
              <input value={form.phone} onChange={e => set('phone', e.target.value)} required inputMode="tel" placeholder="09xxxxxxxx" />
            </label>
            <label>
              <span>Số CCCD</span>
              <input value={form.idNumber} onChange={e => set('idNumber', e.target.value)} inputMode="numeric" maxLength={12} placeholder="12 chữ số" />
            </label>
            <label>
              <span>Phương tiện *</span>
              <select value={form.vehicleType} onChange={e => set('vehicleType', e.target.value as VehicleType)}>
                {(Object.keys(VEHICLE_LABEL) as VehicleType[]).map(v => <option key={v} value={v}>{VEHICLE_LABEL[v]}</option>)}
              </select>
            </label>
            <label>
              <span>Biển số {form.vehicleType === 'MOTORBIKE' ? '*' : ''}</span>
              <input value={form.licensePlate} onChange={e => set('licensePlate', e.target.value.toUpperCase())} maxLength={15} placeholder="vd 29A-123.45" />
            </label>
          </div>
          {error && <div className="form-error" role="alert">{error}</div>}
          <div className="form-actions">
            <button className="btn-primary" type="submit">{profile ? 'Lưu thay đổi' : 'Tạo hồ sơ'}</button>
          </div>
        </fieldset>
        {!editable && <small className="muted">Hồ sơ đã nộp / đã duyệt không sửa được. Cần đổi xe hoặc số điện thoại, hãy liên hệ MAK.</small>}
      </form>

      {profile && (
        <section className="panel">
          <h2>Giấy tờ</h2>
          <p className="muted small">Ảnh rõ nét (JPG, PNG, WEBP) hoặc PDF, tối đa 2MB. Giấy tờ chỉ quản trị viên MAK xem được.</p>
          <ul className="doc-list">
            {docs.map(d => {
              const doc = profile.documents.find(x => x.type === d.type);
              return (
                <li key={d.type}>
                  <div>
                    <b>{d.label} *</b>
                    <small>{doc ? `${doc.originalName} · ${formatDateTime(doc.uploadedAt)}` : 'Chưa tải lên'}</small>
                  </div>
                  {editable && (
                    <label className="btn-outline file-btn">
                      {doc ? 'Thay' : 'Tải lên'}
                      <input type="file" accept={DOC_ACCEPT} hidden onChange={e => upload(d.type, e)} disabled={busy} />
                    </label>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
