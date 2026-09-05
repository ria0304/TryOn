import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fabric_classification import (
    FabricClassifier,
    analyze_texture,
    detect_pattern,
    classify_garment_fabric,
    WYA_CATEGORY_FALLBACK,
)


def _solid_rgba_png(rgb, size=(120, 120)):
    img = Image.new("RGBA", size, (*rgb, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _checkerboard_rgba_png(size=(120, 120), square=10):
    arr = np.zeros((*size, 4), dtype=np.uint8)
    for y in range(size[0]):
        for x in range(size[1]):
            on = ((x // square) + (y // square)) % 2 == 0
            arr[y, x] = (230, 230, 230, 255) if on else (20, 20, 20, 255)
    img = Image.fromarray(arr, "RGBA")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# --- FabricClassifier.classify (pure rule-based logic) --------------------

def test_jewellery_gold_color_returns_gold():
    assert FabricClassifier.classify(0, 128, "Gold", "Necklace") == "Gold"


def test_jewellery_silver_color_returns_silver():
    assert FabricClassifier.classify(0, 128, "Silver", "Ring") == "Silver"


def test_denim_shortcut_for_jeans():
    fabric = FabricClassifier.classify(variance=400, brightness=100, color="Navy", category="Jeans")
    assert fabric == "Denim"


def test_leather_jacket_low_variance_leather_color():
    fabric = FabricClassifier.classify(variance=100, brightness=90, color="Black", category="Jacket")
    assert fabric == "Leather"


def test_unmatched_category_defaults_to_cotton():
    assert FabricClassifier.classify(variance=50, brightness=100, color="Red", category="UnknownCategory") == "Cotton"


def test_shoe_sneaker_high_variance_is_canvas():
    fabric = FabricClassifier.classify(
        variance=450, brightness=200, color="White", category="Shoes", shoe_subtype="sneaker"
    )
    assert fabric == "Canvas"


# --- texture / pattern analysis --------------------------------------------

def test_analyze_texture_solid_color_has_near_zero_variance():
    png = _solid_rgba_png((100, 50, 50))
    texture = analyze_texture(png)
    assert texture["variance"] < 5
    assert 0 <= texture["brightness"] <= 255


def test_analyze_texture_checkerboard_has_high_variance():
    png = _checkerboard_rgba_png()
    texture = analyze_texture(png)
    assert texture["variance"] > 1000


def test_detect_pattern_solid_color_is_solid():
    png = _solid_rgba_png((60, 60, 200))
    pattern = detect_pattern(png)
    assert pattern["has_pattern"] is False
    assert pattern["pattern_type"] == "solid"


def test_detect_pattern_checkerboard_has_pattern():
    png = _checkerboard_rgba_png()
    pattern = detect_pattern(png)
    assert pattern["has_pattern"] is True
    assert pattern["pattern_type"] != "solid"


def test_texture_and_pattern_do_not_raise_on_garbage_bytes():
    texture = analyze_texture(b"not a real image")
    pattern = detect_pattern(b"not a real image")
    assert texture == {"variance": 0.0, "brightness": 128.0}
    assert pattern["has_pattern"] is False
    assert pattern["pattern_type"] == "solid"


# --- end-to-end classify_garment_fabric ------------------------------------

def test_classify_garment_fabric_returns_expected_shape():
    png = _solid_rgba_png((90, 55, 40))  # "Brown"-ish leather-color swatch
    result = classify_garment_fabric(png, color_name="Brown", category="jacket", wya_category="Jacket")
    assert set(result.keys()) == {"fabric", "pattern", "has_pattern", "texture_variance", "brightness"}
    assert isinstance(result["fabric"], str)


def test_classify_garment_fabric_falls_back_to_wya_category_by_tryon_category():
    png = _solid_rgba_png((190, 30, 45))  # solid "Red"
    result = classify_garment_fabric(png, color_name="Red", category="bottom", wya_category=None)
    # bottom -> "Trousers" per WYA_CATEGORY_FALLBACK; solid low-variance red
    # trousers should classify as a real fabric, not raise.
    assert result["fabric"] in ("Cotton", "Polyester", "Linen")


def test_every_tryon_category_has_a_wya_fallback():
    from categories import CATEGORIES
    for cat in CATEGORIES:
        assert cat in WYA_CATEGORY_FALLBACK
