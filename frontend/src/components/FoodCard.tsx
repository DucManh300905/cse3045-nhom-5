import { Link } from 'react-router-dom';
import { defaultVariant, needsChoice, useCart } from '../context/CartContext';
import type { MenuItem, RestaurantSummary } from '../types';
import { formatPrice } from '../utils/format';
import DishImage from './DishImage';
import QtyStepper from './QtyStepper';

interface Props {
  item: MenuItem;
  restaurant: RestaurantSummary;
  /** Mở hộp chọn size/topping */
  onChoose: (item: MenuItem, restaurant: RestaurantSummary) => void;
  /** Hiện tên quán (trang tìm món toàn hệ thống) */
  showShop?: boolean;
}

export default function FoodCard({ item, restaurant, onChoose, showShop = true }: Props) {
  const { add, change, qtyOfItem, lines } = useCart();
  const soldOut = !item.isOrderable;
  const closed = !restaurant.canAcceptOrders;
  const remaining = item.remainingToday;
  const lowStock = !soldOut && remaining !== null && remaining <= 10;
  const custom = needsChoice(item);
  const qty = qtyOfItem(item.id);

  // Món đơn giản (không size/topping): chỉnh số lượng ngay trên thẻ
  const simpleKey = [item.id, defaultVariant(item)?.id ?? '', ''].join('|');
  const simpleLine = !custom ? lines.find(l => l.key === simpleKey) : undefined;

  const onAdd = () => (custom ? onChoose(item, restaurant) : add(item, restaurant));

  return (
    <article className={soldOut ? 'dish sold-out' : 'dish'}>
      <div className="dish-media">
        <DishImage src={item.imageUrl} alt={item.name} className="dish-img" />
        {showShop && <Link to={`/restaurants/${restaurant.slug}`} className="dish-shop">{restaurant.name}</Link>}
        <span className="dish-price">{item.variants.length > 1 && <small>từ </small>}{formatPrice(item.basePrice)}</span>
        {soldOut && <span className="dish-soldout">Hết hàng hôm nay</span>}
      </div>

      <div className="dish-body">
        <span className="dish-kind">{item.type === 'FOOD' ? 'Món ăn' : 'Đồ uống'}</span>
        <h3>{item.name}</h3>
        {item.description && <p className="dish-desc">{item.description}</p>}
        <div className="dish-meta">
          {item.prepMinutes && <span>{item.prepMinutes} phút</span>}
          {soldOut ? <span>Hết suất</span> : remaining !== null && <span className={lowStock ? 'warn' : ''}>Còn {remaining} suất</span>}
          {custom && <span>Có tùy chọn</span>}
          {closed && <span className="warn">Quán đang đóng</span>}
        </div>

        <div className="dish-action">
          {simpleLine ? (
            <QtyStepper
              qty={simpleLine.qty}
              max={remaining === null ? null : remaining - (qty - simpleLine.qty)}
              onChange={d => change(simpleLine.key, d)}
              label={item.name}
              size="lg"
            />
          ) : (
            <button className="btn-add" onClick={onAdd} disabled={soldOut || closed}>
              {soldOut ? 'Tạm hết' : closed ? 'Chưa nhận đơn' : custom ? (qty ? `Thêm lựa chọn khác · ${qty} trong giỏ` : '+ Chọn món') : '+ Thêm vào giỏ'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
