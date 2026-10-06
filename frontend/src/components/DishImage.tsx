import { useState } from 'react';
import { assetUrl } from '../api/client';

/** Ảnh món; nếu không có ảnh hoặc ảnh lỗi thì hiện khung màu thay thế */
export default function DishImage({ src, alt, className }: { src?: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  return failed || !src
    ? <div className={`${className ?? ''} img-fallback`} aria-hidden />
    : <img className={className} src={assetUrl(src)} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}
