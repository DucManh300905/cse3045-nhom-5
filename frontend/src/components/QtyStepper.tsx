interface Props {
  qty: number;
  max: number;
  onChange: (delta: number) => void;
  /** Tên món, dùng cho aria-label */
  label: string;
  size?: 'sm' | 'lg';
}

export default function QtyStepper({ qty, max, onChange, label, size = 'sm' }: Props) {
  return (
    <div className={`stepper stepper-${size}`}>
      <button type="button" onClick={() => onChange(-1)} aria-label={`Bớt một ${label}`}>−</button>
      <span aria-live="polite">{qty}</span>
      <button type="button" onClick={() => onChange(1)} disabled={qty >= max} aria-label={`Thêm một ${label}`}>+</button>
    </div>
  );
}
