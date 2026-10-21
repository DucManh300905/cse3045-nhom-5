import { useEffect, useState } from 'react';
import { fetchProof } from '../api/shipper';
import type { DeliveryProof } from '../types';
import { formatDateTime } from '../utils/format';

/**
 * Ảnh tài xế chụp khi giao (Q8) — file private nên tải kèm token rồi hiện.
 * Khách, chủ quán, tài xế của đơn và admin đều dùng component này.
 */
export default function ProofPhoto({ proof }: { proof: DeliveryProof }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    fetchProof(proof.url)
      .then(blob => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [proof.url]);

  return (
    <figure className="proof-photo">
      {src ? (
        <a href={src} target="_blank" rel="noreferrer" title="Mở ảnh lớn">
          <img src={src} alt={proof.kind === 'DELIVERED' ? 'Ảnh xác nhận giao hàng' : 'Ảnh giao không thành công'} />
        </a>
      ) : (
        <div className="proof-placeholder">{failed ? 'Không tải được ảnh' : 'Đang tải ảnh...'}</div>
      )}
      <figcaption>
        {proof.kind === 'DELIVERED' ? 'Ảnh xác nhận giao' : 'Ảnh tại nơi giao (không thành công)'} · {formatDateTime(proof.takenAt)}
      </figcaption>
    </figure>
  );
}
