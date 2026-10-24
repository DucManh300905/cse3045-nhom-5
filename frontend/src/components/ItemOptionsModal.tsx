import { useEffect, useState } from 'react';
import { defaultVariant, useCart } from '../context/CartContext';
import type { MenuItem, OptionGroup, RestaurantSummary } from '../types';
import { formatPrice } from '../utils/format';
import DishImage from './DishImage';
import QtyStepper from './QtyStepper';

interface Props {
  item: MenuItem;
  restaurant: RestaurantSummary;
  onClose: () => void;
}

const groupHint = (g: OptionGroup) =>
  g.minSelect === 0
    ? `Tùy chọn, tối đa ${g.maxSelect}`
    : g.minSelect === g.maxSelect
      ? `Bắt buộc chọn ${g.minSelect}`
      : `Chọn ${g.minSelect}–${g.maxSelect}`;

/** Hộp chọn size + topping trước khi thêm món vào giỏ (BR-22: đủ minSelect / maxSelect) */
export default function ItemOptionsModal({ item, restaurant, onClose }: Props) {
  const { add, qtyOfItem } = useCart();
  const [variantId, setVariantId] = useState(defaultVariant(item)?.id);
  const [selected, setSelected] = useState<Record<string, string[]>>({});
  const [qty, setQty] = useState(1);

  useEffect(() => {
    document.body.classList.add('no-scroll');
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('no-scroll');
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const toggle = (g: OptionGroup, optionId: string) =>
    setSelected(s => {
      const cur = s[g.id] ?? [];
      if (g.maxSelect === 1) return { ...s, [g.id]: cur[0] === optionId && g.minSelect === 0 ? [] : [optionId] };
      if (cur.includes(optionId)) return { ...s, [g.id]: cur.filter(id => id !== optionId) };
      if (cur.length >= g.maxSelect) return s;
      return { ...s, [g.id]: [...cur, optionId] };
    });

  const variant = item.variants.find(v => v.id === variantId);
  const optionIds = item.optionGroups.flatMap(g => selected[g.id] ?? []);
  const optionsPrice = item.optionGroups
    .flatMap(g => g.options)
    .filter(o => optionIds.includes(o.id))
    .reduce((s, o) => s + o.price, 0);
  const unitPrice = (variant?.price ?? item.basePrice) + optionsPrice;
  const missing = item.optionGroups.filter(g => (selected[g.id]?.length ?? 0) < g.minSelect);

  const inCart = qtyOfItem(item.id);
  const maxQty = item.remainingToday === null ? null : Math.max(0, item.remainingToday - inCart);

  const submit = () => {
    if (missing.length) return;
    if (add(item, restaurant, { variantId, optionIds }, qty)) onClose();
  };

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={item.name}>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal-panel">
        <div className="modal-media">
          <DishImage src={item.imageUrl} alt={item.name} className="dish-img" />
          <button className="modal-close" onClick={onClose} aria-label="Đóng">×</button>
        </div>

        <div className="modal-body">
          <span className="dish-kind">{restaurant.name}</span>
          <h2>{item.name}</h2>
          {item.description && <p className="dish-desc">{item.description}</p>}

          {item.variants.length > 1 && (
            <fieldset className="opt-group">
              <legend><b>Chọn size</b><small>Bắt buộc</small></legend>
              {item.variants.map(v => (
                <label key={v.id} className="opt-row">
                  <input type="radio" name="variant" checked={variantId === v.id} onChange={() => setVariantId(v.id)} />
                  <span>{v.name}</span>
                  <span className="opt-price">{formatPrice(v.price)}</span>
                </label>
              ))}
            </fieldset>
          )}

          {item.optionGroups.map(g => {
            const cur = selected[g.id] ?? [];
            const single = g.maxSelect === 1;
            return (
              <fieldset key={g.id} className="opt-group">
                <legend><b>{g.name}</b><small className={cur.length < g.minSelect ? 'warn' : ''}>{groupHint(g)}</small></legend>
                {g.options.map(o => {
                  const checked = cur.includes(o.id);
                  const full = !single && !checked && cur.length >= g.maxSelect;
                  return (
                    <label key={o.id} className={!o.isAvailable || full ? 'opt-row disabled' : 'opt-row'}>
                      <input
                        type={single ? 'radio' : 'checkbox'}
                        name={g.id}
                        checked={checked}
                        disabled={!o.isAvailable || full}
                        onChange={() => toggle(g, o.id)}
                        onClick={() => { if (single && checked && g.minSelect === 0) toggle(g, o.id); }}
                      />
                      <span>{o.name}{!o.isAvailable && ' (hết)'}</span>
                      <span className="opt-price">{o.price ? `+${formatPrice(o.price)}` : 'Miễn phí'}</span>
                    </label>
                  );
                })}
              </fieldset>
            );
          })}
        </div>

        <div className="modal-foot">
          <QtyStepper qty={qty} min={1} max={maxQty} onChange={d => setQty(q => Math.max(1, q + d))} label={item.name} />
          <button className="btn-primary" onClick={submit} disabled={!!missing.length || maxQty === 0}>
            {maxQty === 0
              ? 'Đã đủ suất trong giỏ'
              : missing.length
                ? `Chọn ${missing[0].name}`
                : `Thêm vào giỏ · ${formatPrice(unitPrice * qty)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
