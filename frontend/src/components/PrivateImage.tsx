import { useEffect, useState, type ReactNode } from 'react';
import { fetchProof } from '../api/shipper';

/**
 * Ảnh private (ảnh chân dung tài xế, ảnh xác nhận giao): tải bằng token rồi hiện.
 * url dạng "/delivery/..." (API có kiểm quyền). Không xem được / chưa có ảnh -> hiện `fallback`.
 */
export default function PrivateImage({ url, alt, className, fallback = null }: { url?: string | null; alt: string; className?: string; fallback?: ReactNode }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setSrc(null);
    setFailed(false);
    if (!url) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    fetchProof(url)
      .then(blob => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  if (!url || failed || !src) return <>{fallback}</>;
  return <img src={src} alt={alt} className={className} />;
}
