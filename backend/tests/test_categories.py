import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from categories import CATEGORIES, LAYER_ORDER, EXCLUSIVE_WITH, is_valid_category


def test_eight_categories_defined():
    assert len(CATEGORIES) == 8
    assert set(CATEGORIES) == {
        "top", "bottom", "dress", "jacket", "shoes", "bag", "jewellery", "accessories",
    }


def test_every_category_has_a_layer_order():
    for cat in CATEGORIES:
        assert cat in LAYER_ORDER, f"{cat} missing from LAYER_ORDER"


def test_dress_is_drawn_above_shoes_and_bottom():
    assert LAYER_ORDER["dress"] > LAYER_ORDER["shoes"]
    assert LAYER_ORDER["dress"] > LAYER_ORDER["bottom"]


def test_top_and_dress_share_a_layer_since_dress_replaces_both():
    assert LAYER_ORDER["top"] == LAYER_ORDER["dress"]


def test_dress_excludes_top_and_bottom():
    assert set(EXCLUSIVE_WITH["dress"]) == {"top", "bottom"}


def test_is_valid_category():
    assert is_valid_category("top") is True
    assert is_valid_category("hat") is False
    assert is_valid_category("") is False
