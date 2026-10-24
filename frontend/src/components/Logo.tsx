import { Link } from 'react-router-dom';

/** Ảnh logo MAK (hình tròn). Ảnh lớn dùng bản webp, ảnh nhỏ dùng bản 192px */
export function LogoMark({ size = 48, className = '' }: { size?: number; className?: string }) {
  return (
    <img
      className={`logo-mark ${className}`}
      src={size > 96 ? '/logo-400.webp' : '/logo-192.png'}
      width={size}
      height={size}
      alt="MAK Food and Drink"
    />
  );
}

export default function Logo() {
  return (
    <Link to="/" className="logo" aria-label="MAK Food and Drink - trang chủ">
      <LogoMark size={46} />
      <span className="logo-text">
        <b>MAK</b>
        <span>Food and Drink</span>
      </span>
    </Link>
  );
}
