import pytest

from mak_dsa.order_state import (
    Fulfillment,
    InvalidTransitionError,
    OrderStatus,
    is_final,
    next_status,
)

S = OrderStatus


def test_full_delivery_flow():
    status = S.PLACED
    for target in (S.ACCEPTED, S.PREPARING, S.READY, S.DELIVERING, S.COMPLETED):
        status = next_status(status, target, Fulfillment.DELIVERY)
    assert status is S.COMPLETED
    assert is_final(status)


def test_pickup_completes_from_ready():
    assert next_status(S.READY, S.COMPLETED, Fulfillment.PICKUP) is S.COMPLETED


@pytest.mark.parametrize(
    ("fulfillment", "target"),
    [(Fulfillment.PICKUP, S.DELIVERING), (Fulfillment.DELIVERY, S.COMPLETED)],
)
def test_ready_respects_fulfillment(fulfillment, target):
    with pytest.raises(InvalidTransitionError):
        next_status(S.READY, target, fulfillment)


@pytest.mark.parametrize(
    ("current", "target"),
    [(S.PLACED, S.COMPLETED), (S.COMPLETED, S.PLACED), (S.PREPARING, S.CANCELLED)],
)
def test_invalid_transitions(current, target):
    with pytest.raises(InvalidTransitionError):
        next_status(current, target)
