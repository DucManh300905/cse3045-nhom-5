"""Giỏ hàng: dict theo id món để thêm / sửa / xóa O(1).

Quy tắc nghiệp vụ áp dụng:
- BR-30: một giỏ chỉ chứa món của một quán.
- BR-21 / BR-50: giá là số nguyên VND >= 0.
"""

from collections.abc import Iterator
from dataclasses import dataclass, replace


class DifferentRestaurantError(ValueError):
    """Thêm món của quán khác vào giỏ đang có món (BR-30)."""


@dataclass(frozen=True, slots=True)
class CartLine:
    item_id: str
    name: str
    unit_price: int
    qty: int

    def __post_init__(self) -> None:
        if not isinstance(self.unit_price, int) or isinstance(self.unit_price, bool):
            raise TypeError("unit_price phải là số nguyên VND")
        if self.unit_price < 0:
            raise ValueError("unit_price phải >= 0")
        if self.qty <= 0:
            raise ValueError("qty phải > 0")

    @property
    def line_total(self) -> int:
        return self.unit_price * self.qty


class Cart:
    def __init__(self) -> None:
        self.restaurant_id: str | None = None
        self._lines: dict[str, CartLine] = {}

    def __len__(self) -> int:
        return len(self._lines)

    def __iter__(self) -> Iterator[CartLine]:
        return iter(self._lines.values())

    def add(
        self, restaurant_id: str, item_id: str, name: str, unit_price: int, qty: int = 1
    ) -> None:
        if self.restaurant_id is not None and restaurant_id != self.restaurant_id:
            raise DifferentRestaurantError(
                f"Giỏ đang có món của quán {self.restaurant_id}, hãy xóa giỏ trước"
            )
        current = self._lines.get(item_id)
        if current is None:
            self._lines[item_id] = CartLine(item_id, name, unit_price, qty)
        else:
            self._lines[item_id] = replace(current, qty=current.qty + qty)
        self.restaurant_id = restaurant_id

    def set_qty(self, item_id: str, qty: int) -> None:
        if qty == 0:
            self.remove(item_id)
            return
        self._lines[item_id] = replace(self._lines[item_id], qty=qty)

    def remove(self, item_id: str) -> None:
        del self._lines[item_id]
        if not self._lines:
            self.restaurant_id = None

    def clear(self) -> None:
        self._lines.clear()
        self.restaurant_id = None

    @property
    def subtotal(self) -> int:
        return sum(line.line_total for line in self._lines.values())

    def total(self, percent_off: int = 0, max_discount: int | None = None) -> int:
        """Tổng tiền sau voucher phần trăm; giảm không vượt `max_discount` và tạm tính."""
        if not 0 <= percent_off <= 100:
            raise ValueError("percent_off phải trong [0, 100]")
        discount = self.subtotal * percent_off // 100
        if max_discount is not None:
            discount = min(discount, max_discount)
        return self.subtotal - min(discount, self.subtotal)
