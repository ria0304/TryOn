"""
Auto-name generation for uploaded garments.

Combines the dominant colour, the top FashionCLIP label, garment aspect
ratio, and silhouette heuristics into a human-readable name such as
"Red Maxi Flared Dress" or "Black Leather Tote Bag".
"""

from typing import Optional

from classification import classify_garment_detail

CATEGORY_NOUNS = {
    "top": "Top",
    "bottom": "Bottom",
    "dress": "Dress",
    "jacket": "Jacket",
    "shoes": "Shoes",
    "bag": "Bag",
    "jewellery": "Jewelry",
    "accessories": "Accessory",
}

# Substring-keyword -> display token, matched against the top CLIP label.
STYLE_WORDS = {
    # lengths
    "mini": "Mini", "midi": "Midi", "maxi": "Maxi",
    # tops
    "t-shirt": "T-Shirt", "shirt": "Shirt", "blouse": "Blouse", "tank top": "Tank",
    "crop top": "Crop", "sweater": "Sweater", "hoodie": "Hooded", "cardigan": "Cardigan",
    "turtleneck": "Turtleneck", "polo": "Polo",
    # bottoms
    "jeans": "Jeans", "leggings": "Leggings", "shorts": "Shorts", "cargo": "Cargo",
    "joggers": "Joggers", "trousers": "Trousers",
    # dresses / one-pieces
    "bodycon": "Bodycon", "jumpsuit": "Jumpsuit", "romper": "Romper", "overalls": "Overalls",
    # outerwear
    "blazer": "Blazer", "coat": "Coat", "puffer": "Puffer", "leather jacket": "Leather",
    # shoes
    "heels": "Heels", "boots": "Boots", "sneakers": "Sneakers", "sandals": "Sandals",
    "loafers": "Loafers", "flats": "Flats",
    # bags
    "tote bag": "Tote", "backpack": "Backpack", "crossbody": "Crossbody", "clutch": "Clutch",
    "handbag": "Handbag",
    # fabric / print
    "denim": "Denim", "leather": "Leather", "knit": "Knit", "silk": "Silk", "satin": "Satin",
    "floral": "Floral", "striped": "Striped", "plaid": "Plaid", "chiffon": "Chiffon",
    "velvet": "Velvet", "sequin": "Sequin",
    # accessories
    "belt": "Belt", "hat": "Hat", "scarf": "Scarf", "sunglasses": "Sunglasses",
}

_JEWELLERY_NOUNS = (
    "necklace", "earrings", "ring", "watch", "bracelet", "anklet", "pendant", "choker",
)


def _style_tokens(top_label: Optional[str]) -> list:
    if not top_label:
        return []
    tl = top_label.lower()
    found = []
    for key, nice in STYLE_WORDS.items():
        if key in tl and nice not in found:
            found.append(nice)
    return found


def build_garment_name(
    category: str,
    color_name: Optional[str],
    top_label: Optional[str],
    aspect_ratio: Optional[float],
    flare: bool = False,
) -> str:
    """
    Build a human-readable auto-name for a garment upload.

    Args:
        category: TryOn 8-category value (top/bottom/dress/...).
        color_name: human-readable dominant colour (e.g. "Red").
        top_label: best CLIP broad label (e.g. "maxi dress").
        aspect_ratio: garment crop height/width (used to infer dress length).
        flare: True if the silhouette flares below the waist.
    """
    parts: list = []
    tl = (top_label or "").lower()

    if color_name:
        parts.append(color_name.title())

    for token in _style_tokens(top_label):
        parts.append(token)

    # Flared silhouette (A-line dresses / skirts)
    if flare and category in ("dress", "bottom"):
        parts.append("Flared")

    # Dress / skirt length from aspect ratio when CLIP didn't say
    if category in ("dress", "bottom") and not any(
        p in parts for p in ("Mini", "Midi", "Maxi")
    ):
        if aspect_ratio:
            if aspect_ratio >= 2.6:
                parts.append("Maxi")
            elif aspect_ratio >= 1.9:
                parts.append("Midi")
            elif aspect_ratio < 1.6:
                parts.append("Mini")

    # Jewellery specifics win over the generic noun
    noun = CATEGORY_NOUNS.get(category, "Garment")
    if category == "jewellery":
        for key in _JEWELLERY_NOUNS:
            if key in tl:
                noun = key.title()
                break

    parts.append(noun)
    return " ".join(parts)


def suggest_name_from_image(
    category: str,
    color_name: Optional[str],
    image_bytes: Optional[bytes],
    flare: bool = False,
) -> str:
    """
    Convenience wrapper: classify detail (top label / aspect ratio) from the
    image and build a name. Falls back to a colourless generic name when the
    image detail is unavailable (avoids a second CLIP inference in callers
    that already ran classify_garment_detail).
    """
    top_label = None
    aspect_ratio = None
    if image_bytes is not None:
        try:
            info = classify_garment_detail(image_bytes)
            top_label = info.get("top_label")
            aspect_ratio = info.get("aspect_ratio")
        except Exception:
            pass
    return build_garment_name(category, color_name, top_label, aspect_ratio, flare)
