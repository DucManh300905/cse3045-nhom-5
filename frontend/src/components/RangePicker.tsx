import { useState } from 'react';

// Chọn khoảng ngày cho báo cáo (giờ VN). Bỏ trống = server lấy 30 ngày gần nhất.

export interface DateRange {
  from: string;
  to: string;
}

type Preset = '7d' | '30d' | '90d' | 'month' | 'custom';

const DAY = 864e5;
/** Hôm nay theo giờ VN, dạng YYYY-MM-DD */
export const todayVN = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * DAY).toISOString().slice(0, 10);

export const presetRange = (p: Exclude<Preset, 'custom'>): DateRange => {
  const to = todayVN();
  if (p === 'month') return { from: `${to.slice(0, 8)}01`, to };
  const days = { '7d': 7, '30d': 30, '90d': 90 }[p];
  return { from: shift(to, -(days - 1)), to };
};

const PRESETS: { key: Exclude<Preset, 'custom'>; label: string }[] = [
  { key: '7d', label: '7 ngày' },
  { key: '30d', label: '30 ngày' },
  { key: '90d', label: '90 ngày' },
  { key: 'month', label: 'Tháng này' },
];

export default function RangePicker({ value, onChange }: { value: DateRange; onChange: (r: DateRange) => void }) {
  const match = PRESETS.find(p => {
    const r = presetRange(p.key);
    return r.from === value.from && r.to === value.to;
  });
  const [custom, setCustom] = useState(!match);
  const [draft, setDraft] = useState(value);

  return (
    <div className="range-picker">
      <div className="cat-tabs" role="tablist" aria-label="Khoảng thời gian">
        {PRESETS.map(p => (
          <button
            key={p.key}
            role="tab"
            aria-selected={!custom && match?.key === p.key}
            className={!custom && match?.key === p.key ? 'active' : ''}
            onClick={() => { setCustom(false); onChange(presetRange(p.key)); }}
          >
            {p.label}
          </button>
        ))}
        <button role="tab" aria-selected={custom} className={custom ? 'active' : ''} onClick={() => { setCustom(true); setDraft(value); }}>
          Tùy chọn
        </button>
      </div>
      {custom && (
        <form
          className="range-custom"
          onSubmit={e => { e.preventDefault(); if (draft.from && draft.to && draft.from <= draft.to) onChange(draft); }}
        >
          <input type="date" value={draft.from} max={draft.to || todayVN()} onChange={e => setDraft(d => ({ ...d, from: e.target.value }))} aria-label="Từ ngày" />
          <span>→</span>
          <input type="date" value={draft.to} min={draft.from} max={todayVN()} onChange={e => setDraft(d => ({ ...d, to: e.target.value }))} aria-label="Đến ngày" />
          <button className="btn-soft" type="submit" disabled={!draft.from || !draft.to || draft.from > draft.to}>Xem</button>
        </form>
      )}
    </div>
  );
}
