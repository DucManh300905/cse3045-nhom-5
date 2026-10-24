interface Props {
  qty: number;
  /** null = không giới hạn */
  max: number | null;
  onChange: (delta: number) => void;
  /** Tên món, dùng cho aria-label */
  label: string;
  size?: 'sm' | 'lg';
  /** Không cho giảm xuống dưới mức này (hộp chọn món: tối thiểu 1) */
  min?: number;
}

export default function QtyStepper({ qty, max, onChange, label, size = 'sm', min = 0 }: Props) {
  return (
    <div className={`stepper stepper-${size}`}>
      <button type="button" onClick={() => onChange(-1)} disabled={qty <= min} aria-label={`Bớt một ${label}`}>−</button>
      <span aria-live="polite">{qty}</span>
      <button type="button" onClick={() => onChange(1)} disabled={max !== null && qty >= max} aria-label={`Thêm một ${label}`}>+</button>
    </div>
  );
}
