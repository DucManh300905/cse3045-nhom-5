"""Chạy demo: `uv run python -m mak_dsa`.

In kết quả từng cấu trúc dữ liệu và so sánh tốc độ Trie với duyệt tuyến tính.
"""

import random
import time
from collections.abc import Callable
from datetime import datetime
from functools import wraps
from typing import ParamSpec, TypeVar

from mak_dsa import Cart, KitchenQueue, MenuTrie, OrderStatus, next_status
from mak_dsa.menu_search import linear_search

P = ParamSpec("P")
R = TypeVar("R")


def timed(label: str) -> Callable[[Callable[P, R]], Callable[P, R]]:
    """Decorator đo thời gian chạy của một hàm."""

    def decorator(func: Callable[P, R]) -> Callable[P, R]:
        @wraps(func)
        def wrapper(*args: P.args, **kwargs: P.kwargs) -> R:
            start = time.perf_counter()
            result = func(*args, **kwargs)
            print(f"  {label}: {(time.perf_counter() - start) * 1000:.2f} ms")
            return result

        return wrapper

    return decorator


DISHES = ["Phở bò", "Bún chả", "Cơm rang dưa bò", "Bánh mì trứng", "Trà đá", "Bún bò Huế"]


def demo_cart() -> None:
    print("== Giỏ hàng ==")
    cart = Cart()
    cart.add("quan-a", "pho", "Phở bò", 45_000, 2)
    cart.add("quan-a", "tra", "Trà đá", 5_000, 2)
    print(f"  {len(cart)} món, tạm tính {cart.subtotal:,}đ, voucher 10% -> {cart.total(10):,}đ")


def demo_state() -> None:
    print("== Vòng đời đơn ==")
    status = OrderStatus.PLACED
    for target in ("ACCEPTED", "PREPARING", "READY", "DELIVERING", "COMPLETED"):
        status = next_status(status, OrderStatus(target))
        print(f"  -> {status}")


def demo_queue() -> None:
    print("== Hàng đợi bếp ==")
    q = KitchenQueue()
    now = datetime(2026, 11, 20, 11, 0)
    q.push("DH01", now, 20)
    q.push("DH02", now, 5)
    q.push("DH03", now, 10)
    print("  Thứ tự làm:", ", ".join(o.order_id for o in q.drain()))


def demo_search(n: int = 10_000, rounds: int = 30) -> None:
    print(f"== Tìm món: {n} món, {rounds} lần tìm ==")
    rng = random.Random(42)
    names = {f"m{i}": f"{rng.choice(DISHES)} số {i}" for i in range(n)}
    trie = MenuTrie()
    for item_id, name in names.items():
        trie.insert(item_id, name)
    queries = [rng.choice(["pho", "bun bo", "banh", "tra da", "com rang"]) for _ in range(rounds)]

    @timed("Duyệt tuyến tính O(n)")
    def run_linear() -> int:
        return sum(len(linear_search(names, q)) for q in queries)

    @timed("Trie O(độ dài từ khóa)")
    def run_trie() -> int:
        return sum(len(trie.search(q)) for q in queries)

    assert run_linear() == run_trie()
    print(f"  Ví dụ 'bun bo': {trie.search('bun bo')[:3]} ...")


def main() -> None:
    demo_cart()
    demo_state()
    demo_queue()
    demo_search()


if __name__ == "__main__":
    main()
