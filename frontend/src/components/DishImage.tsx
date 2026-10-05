import { useState } from 'react';
import type { Dish } from '../types';

/** Ảnh món; nếu ảnh lỗi thì hiện khung màu thay thế */
export default function DishImage({ dish, className }: { dish: Dish; className?: string }) {
  const [failed, setFailed] = useState(false);
  return failed
    ? <div className={`${className ?? ''} img-fallback`} aria-hidden />
    : <img className={className} src={dish.image} alt={dish.name} loading="lazy" onError={() => setFailed(true)} />;
}
