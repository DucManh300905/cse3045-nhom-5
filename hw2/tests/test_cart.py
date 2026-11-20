import pytest

from mak_dsa.cart import Cart, DifferentRestaurantError


def test_add_merges_same_item():
    cart = Cart()
    cart.add("quan-a", "pho", "Phở bò", 45_000)
    cart.add("quan-a", "pho", "Phở bò", 45_000, 2)
    assert len(cart) == 1
    assert cart.subtotal == 135_000


def test_one_restaurant_per_cart():
    cart = Cart()
    cart.add("quan-a", "pho", "Phở bò", 45_000)
    with pytest.raises(DifferentRestaurantError):
        cart.add("quan-b", "bun", "Bún chả", 40_000)


def test_removing_last_item_frees_restaurant():
    cart = Cart()
    cart.add("quan-a", "pho", "Phở bò", 45_000)
    cart.set_qty("pho", 0)
    assert cart.restaurant_id is None
    cart.add("quan-b", "bun", "Bún chả", 40_000)
    assert cart.restaurant_id == "quan-b"


@pytest.mark.parametrize("price", [45_000.5, -1, True])
def test_price_must_be_non_negative_int(price):
    with pytest.raises((TypeError, ValueError)):
        Cart().add("quan-a", "pho", "Phở bò", price)


def test_total_with_capped_voucher():
    cart = Cart()
    cart.add("quan-a", "pho", "Phở bò", 50_000, 4)
    assert cart.total() == 200_000
    assert cart.total(10) == 180_000
    assert cart.total(50, max_discount=30_000) == 170_000
    with pytest.raises(ValueError):
        cart.total(150)
