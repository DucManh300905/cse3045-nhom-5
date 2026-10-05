import { useCart } from '../context/CartContext';
import { formatPrice } from '../utils/format';
import DishImage from './DishImage';
import QtyStepper from './QtyStepper';

/** Danh sách món trong giỏ, dùng chung cho ngăn kéo giỏ hàng và trang đặt món */
export default function CartLines() {
  const { lines, change } = useCart();
  return (
    <ul className="cart-lines">
      {lines.map(({ dish, qty }) => (
        <li key={dish.id} className="cart-line">
          <DishImage dish={dish} className="cart-thumb" />
          <div className="cart-line-info">
            <b>{dish.name}</b>
            <small>{dish.shop} · {formatPrice(dish.price)}</small>
            <QtyStepper qty={qty} max={dish.stock} onChange={d => change(dish.id, d)} label={dish.name} />
          </div>
          <strong>{formatPrice(dish.price * qty)}</strong>
        </li>
      ))}
    </ul>
  );
}
