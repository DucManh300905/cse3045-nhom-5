import { useEffect, useState, type FormEvent } from 'react';
import { assetUrl, getErrorMessage } from '../../api/client';
import { merchantApi, type MenuItemInput } from '../../api/merchant';
import { useToast } from '../../context/ToastContext';
import type { MenuItemType, MerchantCategory, MerchantMenuItem } from '../../types';

interface Props {
  /** undefined = thêm món mới */
  item?: MerchantMenuItem;
  categories: MerchantCategory[];
  defaultCategory?: string;
  onSaved: (item: MerchantMenuItem) => void;
  onClose: () => void;
}

// Form giữ số dưới dạng chuỗi để ô nhập trống được; chuyển sang số khi gửi
type VariantForm = { id?: string; name: string; price: string; isDefault: boolean };
type OptionForm = { id?: string; name: string; price: string; isAvailable: boolean };
type GroupForm = { id?: string; name: string; minSelect: string; maxSelect: string; options: OptionForm[] };

const digits = (v: string) => v.replace(/\D/g, '');
const newOption = (): OptionForm => ({ name: '', price: '0', isAvailable: true });

/** Thêm / sửa món: giá, biến thể (size), nhóm topping (BR-20..23) */
export default function MenuItemEditor({ item, categories, defaultCategory, onSaved, onClose }: Props) {
  const notify = useToast();
  const [form, setForm] = useState({
    category: item?.category ?? defaultCategory ?? categories[0]?.id ?? '',
    name: item?.name ?? '',
    description: item?.description ?? '',
    type: (item?.type ?? 'FOOD') as MenuItemType,
    basePrice: item ? String(item.basePrice) : '',
    prepMinutes: item?.prepMinutes ? String(item.prepMinutes) : '',
    dailyLimit: item?.dailyLimit === null || item?.dailyLimit === undefined ? '' : String(item.dailyLimit),
    isAvailable: item?.isAvailable ?? true,
  });
  const [variants, setVariants] = useState<VariantForm[]>(
    () => item?.variants.map(v => ({ id: v.id, name: v.name, price: String(v.price), isDefault: v.isDefault })) ?? []
  );
  const [groups, setGroups] = useState<GroupForm[]>(
    () => item?.optionGroups.map(g => ({
      id: g.id, name: g.name, minSelect: String(g.minSelect), maxSelect: String(g.maxSelect),
      options: g.options.map(o => ({ id: o.id, name: o.name, price: String(o.price), isAvailable: o.isAvailable })),
    })) ?? []
  );
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState(assetUrl(item?.imageUrl));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const setField = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    document.body.classList.add('no-scroll');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('no-scroll');
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Ảnh xem trước của file vừa chọn
  useEffect(() => {
    if (!image) return;
    const url = URL.createObjectURL(image);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  // ---------- biến thể ----------
  const setVariant = (i: number, patch: Partial<VariantForm>) =>
    setVariants(vs => vs.map((v, j) => (j === i ? { ...v, ...patch } : patch.isDefault ? { ...v, isDefault: false } : v)));
  const addVariant = () =>
    setVariants(vs => (vs.length
      ? [...vs, { name: '', price: '', isDefault: false }]
      // Bật size lần đầu: tạo sẵn size mặc định theo giá hiện tại
      : [{ name: 'M', price: form.basePrice, isDefault: true }, { name: 'L', price: '', isDefault: false }]));
  const removeVariant = (i: number) =>
    setVariants(vs => {
      const next = vs.filter((_, j) => j !== i);
      if (next.length && !next.some(v => v.isDefault)) next[0] = { ...next[0], isDefault: true };
      return next;
    });

  // ---------- nhóm topping ----------
  const setGroup = (i: number, patch: Partial<GroupForm>) => setGroups(gs => gs.map((g, j) => (j === i ? { ...g, ...patch } : g)));
  const setOption = (gi: number, oi: number, patch: Partial<OptionForm>) =>
    setGroups(gs => gs.map((g, j) => (j === gi ? { ...g, options: g.options.map((o, k) => (k === oi ? { ...o, ...patch } : o)) } : g)));

  const validate = (): string | null => {
    if (!form.category) return 'Hãy tạo và chọn danh mục cho món.';
    if (!form.name.trim()) return 'Vui lòng nhập tên món.';
    if (!variants.length && form.basePrice === '') return 'Vui lòng nhập giá món.';
    if (form.prepMinutes && (Number(form.prepMinutes) < 1 || Number(form.prepMinutes) > 180)) return 'Thời gian chuẩn bị từ 1 đến 180 phút.';
    if (variants.length === 1) return 'Cần ít nhất 2 size — hoặc xóa size để dùng một giá.';
    for (const v of variants) if (!v.name.trim() || v.price === '') return 'Mỗi size cần có tên và giá.';
    for (const g of groups) {
      if (!g.name.trim()) return 'Mỗi nhóm tùy chọn cần có tên.';
      if (!g.options.length) return `Nhóm "${g.name}" cần ít nhất 1 lựa chọn.`;
      if (g.options.some(o => !o.name.trim() || o.price === '')) return `Nhóm "${g.name}": mỗi lựa chọn cần tên và giá (0 nếu miễn phí).`;
      const min = Number(g.minSelect || 0);
      const max = Number(g.maxSelect || 1);
      if (max < 1) return `Nhóm "${g.name}": chọn tối đa phải ≥ 1.`;
      if (min > max) return `Nhóm "${g.name}": chọn tối thiểu không được lớn hơn tối đa.`;
      if (max > g.options.length) return `Nhóm "${g.name}": chọn tối đa không vượt quá số lựa chọn (${g.options.length}).`;
    }
    return null;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const msg = validate();
    if (msg) return setError(msg);

    const body: MenuItemInput = {
      category: form.category,
      name: form.name.trim(),
      description: form.description.trim(),
      type: form.type,
      ...(variants.length ? {} : { basePrice: Number(form.basePrice) }),
      ...(form.prepMinutes ? { prepMinutes: Number(form.prepMinutes) } : {}),
      isAvailable: form.isAvailable,
      dailyLimit: form.dailyLimit === '' ? null : Number(form.dailyLimit),
      variants: variants.map(v => ({ id: v.id, name: v.name.trim(), price: Number(v.price), isDefault: v.isDefault })),
      optionGroups: groups.map(g => ({
        id: g.id,
        name: g.name.trim(),
        minSelect: Number(g.minSelect || 0),
        maxSelect: Number(g.maxSelect || 1),
        options: g.options.map(o => ({ id: o.id, name: o.name.trim(), price: Number(o.price), isAvailable: o.isAvailable })),
      })),
    };

    setError('');
    setSaving(true);
    let saved: MerchantMenuItem;
    try {
      saved = item ? await merchantApi.updateMenuItem(item.id, body) : await merchantApi.createMenuItem(body);
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
      return;
    }
    // Món đã lưu; ảnh lỗi thì vẫn đóng form (tránh bấm lưu lại tạo trùng món) và báo để tải ảnh lại
    if (image) {
      try {
        saved = await merchantApi.uploadMenuItemImage(saved.id, image);
      } catch (err) {
        notify(`Đã lưu món nhưng chưa tải được ảnh: ${getErrorMessage(err)}`);
      }
    }
    onSaved(saved);
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={item ? 'Sửa món' : 'Thêm món'}>
      <div className="modal-backdrop" onClick={onClose} />
      <form className="modal-panel wide-modal" onSubmit={submit} noValidate>
        <div className="modal-head">
          <h2>{item ? `Sửa: ${item.name}` : 'Thêm món mới'}</h2>
          <button type="button" className="modal-close static" onClick={onClose} aria-label="Đóng">×</button>
        </div>

        <div className="modal-body form-panel">
          <div className="editor-top">
            <label className="image-drop">
              {preview ? <img src={preview} alt="" /> : <div className="img-fallback" />}
              <span className="btn-soft">{preview ? 'Đổi ảnh' : 'Chọn ảnh'}</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                hidden
                onChange={e => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f && f.size > 2 * 1024 * 1024) return setError('Ảnh vượt quá 2MB.');
                  if (f) setImage(f);
                }}
              />
            </label>
            <div className="editor-fields">
              <label>
                <span>Tên món *</span>
                <input value={form.name} onChange={e => setField('name', e.target.value)} maxLength={100} autoFocus />
              </label>
              <div className="form-grid">
                <label>
                  <span>Danh mục *</span>
                  <select value={form.category} onChange={e => setField('category', e.target.value)}>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label>
                  <span>Loại</span>
                  <select value={form.type} onChange={e => setField('type', e.target.value as MenuItemType)}>
                    <option value="FOOD">Món ăn</option>
                    <option value="DRINK">Đồ uống</option>
                  </select>
                </label>
              </div>
            </div>
          </div>

          <label>
            <span>Mô tả</span>
            <textarea rows={2} value={form.description} onChange={e => setField('description', e.target.value)} maxLength={1000} placeholder="vd: Cơm + gà + rau củ" />
          </label>

          <div className="form-grid three">
            <label>
              <span>Giá (đ) {variants.length ? '— theo size' : '*'}</span>
              <input inputMode="numeric" value={variants.length ? '' : form.basePrice} disabled={!!variants.length} onChange={e => setField('basePrice', digits(e.target.value))} placeholder={variants.length ? 'Lấy theo size mặc định' : 'vd: 30000'} />
            </label>
            <label>
              <span>Số suất mỗi ngày</span>
              <input inputMode="numeric" value={form.dailyLimit} onChange={e => setField('dailyLimit', digits(e.target.value))} placeholder="Để trống = không giới hạn" />
            </label>
            <label>
              <span>Thời gian làm (phút)</span>
              <input inputMode="numeric" value={form.prepMinutes} onChange={e => setField('prepMinutes', digits(e.target.value))} placeholder="vd: 10" />
            </label>
          </div>

          <label className="check-row">
            <input type="checkbox" checked={form.isAvailable} onChange={e => setField('isAvailable', e.target.checked)} />
            <span>Đang bán (bỏ chọn khi tạm hết món)</span>
          </label>

          {/* ---------- Size ---------- */}
          <section className="editor-block">
            <div className="summary-head">
              <h3>Size / biến thể</h3>
              <button type="button" className="link-btn" onClick={addVariant}>+ Thêm size</button>
            </div>
            {variants.length === 0 ? (
              <p className="muted small">Món chỉ có một giá. Thêm size nếu món có nhiều cỡ (M, L...).</p>
            ) : (
              <ul className="editor-rows">
                {variants.map((v, i) => (
                  <li key={i}>
                    <input value={v.name} onChange={e => setVariant(i, { name: e.target.value })} placeholder="Tên size" maxLength={50} />
                    <input inputMode="numeric" value={v.price} onChange={e => setVariant(i, { price: digits(e.target.value) })} placeholder="Giá" />
                    <label className="check-row">
                      <input type="radio" name="default-variant" checked={v.isDefault} onChange={() => setVariant(i, { isDefault: true })} />
                      <span>Mặc định</span>
                    </label>
                    <button type="button" className="icon-btn" onClick={() => removeVariant(i)} aria-label="Xóa size">×</button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ---------- Topping ---------- */}
          <section className="editor-block">
            <div className="summary-head">
              <h3>Nhóm tùy chọn / topping</h3>
              <button
                type="button"
                className="link-btn"
                onClick={() => setGroups(gs => [...gs, { name: '', minSelect: '0', maxSelect: '1', options: [newOption()] }])}
              >
                + Thêm nhóm
              </button>
            </div>
            {groups.length === 0 && <p className="muted small">vd: "Mức đường" (bắt buộc chọn 1), "Topping" (tùy chọn, tối đa 3).</p>}
            {groups.map((g, gi) => (
              <div key={gi} className="option-group-editor">
                <div className="group-head">
                  <input value={g.name} onChange={e => setGroup(gi, { name: e.target.value })} placeholder="Tên nhóm, vd: Topping" maxLength={50} />
                  <label>
                    <span>Chọn tối thiểu</span>
                    <input inputMode="numeric" value={g.minSelect} onChange={e => setGroup(gi, { minSelect: digits(e.target.value) })} />
                  </label>
                  <label>
                    <span>Tối đa</span>
                    <input inputMode="numeric" value={g.maxSelect} onChange={e => setGroup(gi, { maxSelect: digits(e.target.value) })} />
                  </label>
                  <button type="button" className="icon-btn" onClick={() => setGroups(gs => gs.filter((_, j) => j !== gi))} aria-label="Xóa nhóm">×</button>
                </div>
                <ul className="editor-rows">
                  {g.options.map((o, oi) => (
                    <li key={oi}>
                      <input value={o.name} onChange={e => setOption(gi, oi, { name: e.target.value })} placeholder="Lựa chọn" maxLength={50} />
                      <input inputMode="numeric" value={o.price} onChange={e => setOption(gi, oi, { price: digits(e.target.value) })} placeholder="Giá thêm" />
                      <label className="check-row">
                        <input type="checkbox" checked={o.isAvailable} onChange={e => setOption(gi, oi, { isAvailable: e.target.checked })} />
                        <span>Còn</span>
                      </label>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => setGroup(gi, { options: g.options.filter((_, k) => k !== oi) })}
                        aria-label="Xóa lựa chọn"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                <button type="button" className="link-btn" onClick={() => setGroup(gi, { options: [...g.options, newOption()] })}>+ Thêm lựa chọn</button>
              </div>
            ))}
          </section>
        </div>

        <div className="modal-foot">
          {error && <div className="form-error grow" role="alert">{error}</div>}
          <button type="button" className="btn-outline" onClick={onClose}>Hủy</button>
          <button className="btn-primary" type="submit" disabled={saving}>{saving ? 'Đang lưu...' : 'Lưu món'}</button>
        </div>
      </form>
    </div>
  );
}
