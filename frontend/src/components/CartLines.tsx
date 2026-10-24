import { useCart } from '../context/CartContext';
import { formatPrice } from '../utils/format';
import DishImage from './DishImage';
import QtyStepper from './QtyStepper';

/** Danh sách món trong giỏ, dùng chung cho ngăn kéo giỏ hàng và trang đặt món */
export default function CartLines() {
  const { lines, change } = useCart();
  return (
    <ul className="cart-lines">
      {lines.map(l => {
        const extras = [l.variantName && `Size ${l.variantName}`, ...l.optionNames].filter(Boolean).join(', ');
        // Suất còn lại tính chung cho mọi dòng của cùng món
        const others = lines.reduce((s, o) => (o.menuItemId === l.menuItemId && o.key !== l.key ? s + o.qty : s), 0);
        return (
          <li key={l.key} className="cart-line">
            <DishImage src={l.imageUrl} alt={l.name} className="cart-thumb" />
            <div className="cart-line-info">
              <b>{l.name}</b>
              {extras && <small className="cart-line-extras">{extras}</small>}
              <small>{formatPrice(l.unitPrice)}</small>
              <QtyStepper qty={l.qty} max={l.maxQty === null ? null : l.maxQty - others} onChange={d => change(l.key, d)} label={l.name} />
            </div>
            <strong>{formatPrice(l.unitPrice * l.qty)}</strong>
          </li>
        );
      })}
    </ul>
  );
}
