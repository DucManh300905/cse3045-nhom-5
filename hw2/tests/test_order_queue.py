from datetime import datetime

import pytest

from mak_dsa.order_queue import KitchenQueue

NOW = datetime(2026, 11, 20, 11, 0)


def test_earliest_deadline_first():
    q = KitchenQueue()
    q.push("A", NOW, 20)
    q.push("B", NOW, 5)
    q.push("C", NOW, 10)
    assert q.peek().order_id == "B"
    assert [o.order_id for o in q.drain()] == ["B", "C", "A"]
    assert len(q) == 0 and not q


def test_tie_keeps_insertion_order():
    q = KitchenQueue()
    for order_id in ("X", "Y", "Z"):
        q.push(order_id, NOW, 10)
    assert [q.pop().order_id for _ in range(3)] == ["X", "Y", "Z"]


def test_overdue_does_not_remove():
    q = KitchenQueue()
    q.push("A", NOW, 5)
    q.push("B", NOW, 30)
    assert q.overdue(datetime(2026, 11, 20, 11, 10)) == ["A"]
    assert len(q) == 2


def test_empty_queue_errors():
    q = KitchenQueue()
    with pytest.raises(IndexError):
        q.pop()
    with pytest.raises(IndexError):
        q.peek()
    with pytest.raises(ValueError):
        q.push("A", NOW, -1)
