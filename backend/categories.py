"""Category definitions shared by every router.

Kept on the backend (instead of duplicated in the frontend) so the layering
order and the dress/top/bottom exclusivity rule only need to change in one
place.
"""
from typing import Dict, List

CATEGORIES: List[str] = [
    "top", "bottom", "dress", "jacket", "shoes", "bag", "jewellery", "accessories",
]

# Higher = drawn on top. Top/dress share a layer since a dress replaces both.
LAYER_ORDER: Dict[str, int] = {
    "shoes": 10,
    "bottom": 20,
    "dress": 30,
    "top": 30,
    "jacket": 40,
    "jewellery": 50,
    "accessories": 50,
    "bag": 60,
}

# category -> list of categories it can't be combined with in one outfit
EXCLUSIVE_WITH: Dict[str, List[str]] = {
    "dress": ["top", "bottom"],
}


def is_valid_category(category: str) -> bool:
    return category in CATEGORIES
