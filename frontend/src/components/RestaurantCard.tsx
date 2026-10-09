import { Link } from 'react-router-dom';
import { assetUrl } from '../api/client';
import type { Restaurant } from '../types';
import { RatingBadge } from './Stars';

/** Thẻ quán: ảnh bìa + logo + điểm đánh giá; bấm vào mở trang quán với toàn bộ món */
export default function RestaurantCard({ restaurant: r }: { restaurant: Restaurant }) {
  return (
    <Link to={`/restaurants/${r.slug}`} className={r.canAcceptOrders ? 'shop-card' : 'shop-card closed'}>
      <div className="shop-card-cover" style={r.coverUrl ? { backgroundImage: `url(${assetUrl(r.coverUrl)})` } : undefined}>
        <span className={r.canAcceptOrders ? 'shop-card-status' : 'shop-card-status off'}>
          {r.canAcceptOrders ? 'Đang nhận đơn' : 'Tạm nghỉ'}
        </span>
      </div>
      <div className="shop-card-body">
        {r.logoUrl ? <img className="shop-card-logo" src={assetUrl(r.logoUrl)} alt="" /> : <span className="shop-card-logo fallback">{r.name.charAt(0)}</span>}
        <div className="shop-card-text">
          <b>{r.name}</b>
          <small>{r.address}</small>
        </div>
        <RatingBadge avg={r.ratingAvg} count={r.ratingCount} />
      </div>
    </Link>
  );
}
