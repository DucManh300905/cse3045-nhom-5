"""Hàng đợi bếp: đơn nào có hạn hoàn thành sớm nhất được làm trước.

Dùng min-heap (`heapq`): thêm và lấy đơn đều O(log n), xem đơn đầu O(1).
Hai đơn cùng hạn thì đơn vào trước được làm trước (bộ đếm `seq` phá hòa).
"""

import heapq
import itertools
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import datetime, timedelta


@dataclass(order=True, frozen=True, slots=True)
class QueuedOrder:
    deadline: datetime
    seq: int
    order_id: str = field(compare=False)


class KitchenQueue:
    def __init__(self) -> None:
        self._heap: list[QueuedOrder] = []
        self._counter = itertools.count()

    def __len__(self) -> int:
        return len(self._heap)

    def __bool__(self) -> bool:
        return bool(self._heap)

    def push(self, order_id: str, placed_at: datetime, prep_minutes: int) -> QueuedOrder:
        if prep_minutes < 0:
            raise ValueError("prep_minutes phải >= 0")
        entry = QueuedOrder(
            placed_at + timedelta(minutes=prep_minutes), next(self._counter), order_id
        )
        heapq.heappush(self._heap, entry)
        return entry

    def peek(self) -> QueuedOrder:
        if not self._heap:
            raise IndexError("hàng đợi rỗng")
        return self._heap[0]

    def pop(self) -> QueuedOrder:
        if not self._heap:
            raise IndexError("hàng đợi rỗng")
        return heapq.heappop(self._heap)

    def drain(self) -> Iterator[QueuedOrder]:
        """Generator: lần lượt lấy hết đơn theo thứ tự ưu tiên."""
        while self._heap:
            yield heapq.heappop(self._heap)

    def overdue(self, now: datetime) -> list[str]:
        """Các đơn đã quá hạn tại thời điểm `now` (không lấy ra khỏi hàng đợi)."""
        return [o.order_id for o in sorted(self._heap) if o.deadline < now]
