import { useCart } from '../context/CartContext';
import type { Dish } from '../types';
import { formatPrice } from '../utils/format';
import DishImage from './DishImage';
import QtyStepper from './QtyStepper';

export default function FoodCard({ dish }: { dish: Dish }) {
  const { add, change, qtyOf } = useCart();
  const soldOut = dish.stock === 0;
  const qty = qtyOf(dish.id);
  const lowStock = !soldOut && dish.stock <= 10;

  return (
    <article className={soldOut ? 'dish sold-out' : 'dish'}>
      <div className="dish-media">
        <DishImage dish={dish} className="dish-img" />
        <span className="dish-shop">{dish.shop}</span>
        <span className="dish-price">{formatPrice(dish.price)}</span>
        {soldOut && <span className="dish-soldout">Hết hàng hôm nay</span>}
      </div>

      <div className="dish-body">
        <span className="dish-kind">{dish.category === 'FOOD' ? 'Món ăn' : 'Đồ uống'}</span>
        <h3>{dish.name}</h3>
        <p className="dish-desc">{dish.description}</p>
        <div className="dish-meta">
          <span>{dish.prepMinutes} phút</span>
          <span className={lowStock ? 'warn' : ''}>{soldOut ? 'Hết suất' : `Còn ${dish.stock} suất`}</span>
          <span>Chốt {dish.closesAt}</span>
        </div>

        <div className="dish-action">
          {qty > 0 ? (
            <QtyStepper
              qty={qty}
              max={dish.stock}
              onChange={d => change(dish.id, d)}
              label={dish.name}
              size="lg"
            />
          ) : (
            <button className="btn-add" onClick={() => add(dish)} disabled={soldOut}>
              {soldOut ? 'Tạm hết' : '+ Thêm vào giỏ'}
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
