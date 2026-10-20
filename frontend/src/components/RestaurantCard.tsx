import { Link } from 'react-router-dom';
import { assetUrl } from '../api/client';
import type { Restaurant } from '../types';
import { closedReason } from '../utils/openingHours';
import { RatingBadge } from './Stars';

/** Thẻ quán: ảnh bìa + logo + điểm đánh giá; bấm vào mở trang quán với toàn bộ món */
export default function RestaurantCard({ restaurant: r }: { restaurant: Restaurant }) {
  const reason = closedReason(r);
  return (
    <Link to={`/restaurants/${r.slug}`} className={r.canAcceptOrders ? 'shop-card' : 'shop-card closed'}>
      <div className="shop-card-cover" style={r.coverUrl ? { backgroundImage: `url(${assetUrl(r.coverUrl)})` } : undefined}>
        <span className={r.canAcceptOrders ? 'shop-card-status' : 'shop-card-status off'} title={reason?.full}>
          {reason ? reason.short : 'Đang nhận đơn'}
        </span>
      </div>
      <div className="shop-card-body">
        {r.logoUrl ? <img className="shop-card-logo" src={assetUrl(r.logoUrl)} alt="" /> : <span className="shop-card-logo fallback">{r.name.charAt(0)}</span>}
        <div className="shop-card-text">
          <b>{r.name}</b>
          <small>{r.distanceKm !== undefined && <b className="shop-distance">~{r.distanceKm.toLocaleString('vi-VN')} km · </b>}{r.address}</small>
        </div>
        <RatingBadge avg={r.ratingAvg} count={r.ratingCount} />
      </div>
    </Link>
  );
}
