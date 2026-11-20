"""Vòng đời đơn hàng (BR-35) cài bằng Enum và bảng chuyển trạng thái.

Bảng chuyển là một dict: trạng thái hiện tại -> tập trạng thái được phép đi tới.
Kiểm tra một bước chuyển chỉ tốn O(1).
"""

from enum import StrEnum


class OrderStatus(StrEnum):
    PLACED = "PLACED"
    ACCEPTED = "ACCEPTED"
    PREPARING = "PREPARING"
    READY = "READY"
    DELIVERING = "DELIVERING"
    COMPLETED = "COMPLETED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class Fulfillment(StrEnum):
    DELIVERY = "DELIVERY"
    PICKUP = "PICKUP"


class InvalidTransitionError(ValueError):
    """Tương ứng lỗi 409 INVALID_STATUS_TRANSITION của backend."""


S = OrderStatus
TRANSITIONS: dict[OrderStatus, frozenset[OrderStatus]] = {
    S.PLACED: frozenset({S.ACCEPTED, S.REJECTED, S.CANCELLED}),
    S.ACCEPTED: frozenset({S.PREPARING, S.CANCELLED}),
    S.PREPARING: frozenset({S.READY}),
    S.READY: frozenset({S.DELIVERING, S.COMPLETED}),
    S.DELIVERING: frozenset({S.COMPLETED}),
    S.COMPLETED: frozenset(),
    S.REJECTED: frozenset(),
    S.CANCELLED: frozenset(),
}


def next_status(
    current: OrderStatus,
    target: OrderStatus,
    fulfillment: Fulfillment = Fulfillment.DELIVERY,
) -> OrderStatus:
    """Trả về `target` nếu bước chuyển hợp lệ, ngược lại ném InvalidTransitionError."""
    if target not in TRANSITIONS[current]:
        raise InvalidTransitionError(f"{current} -> {target}")
    # READY -> DELIVERING chỉ cho đơn giao tận nơi; READY -> COMPLETED chỉ cho đơn tự lấy.
    if current is S.READY:
        expected = S.DELIVERING if fulfillment is Fulfillment.DELIVERY else S.COMPLETED
        if target is not expected:
            raise InvalidTransitionError(f"{current} -> {target} ({fulfillment})")
    return target


def is_final(status: OrderStatus) -> bool:
    return not TRANSITIONS[status]
