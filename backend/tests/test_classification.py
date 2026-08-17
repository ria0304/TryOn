import io
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from classification import (
    suggest_category_heuristic,
    suggest_category_heuristic_from_bytes,
    _wya_identify,
    WYA_CATEGORY_TO_TRYON,
    resolve_category_with_geometry,
)


def test_heuristic_tall_ratio_is_dress():
    cat, conf = suggest_category_heuristic(100, 250)  # ratio 2.5
    assert cat == "dress"
    assert 0 < conf <= 1


def test_heuristic_moderately_tall_is_top():
    cat, _ = suggest_category_heuristic(100, 160)  # ratio 1.6
    assert cat == "top"


def test_heuristic_wide_ratio_is_shoes():
    cat, _ = suggest_category_heuristic(200, 100)  # ratio 0.5
    assert cat == "shoes"


def test_heuristic_square_ish_is_bag():
    cat, _ = suggest_category_heuristic(100, 100)  # ratio 1.0
    assert cat == "bag"


def test_heuristic_zero_dimension_is_safe_default():
    cat, conf = suggest_category_heuristic(0, 0)
    assert cat == "accessories"
    assert conf == 0.2


def test_heuristic_from_bytes_matches_actual_image_dimensions():
    img = Image.new("RGB", (100, 250))  # tall -> dress
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    cat, _ = suggest_category_heuristic_from_bytes(buf.getvalue())
    assert cat == "dress"


def test_heuristic_from_garbage_bytes_does_not_raise():
    cat, conf = suggest_category_heuristic_from_bytes(b"garbage")
    assert cat == "accessories"
    assert conf == 0.2


def test_wya_identify_jewellery_watch():
    scores = {k: 0.0 for k in [
        "jumpsuit", "dress", "skirt", "pants", "top", "outerwear",
        "shoes", "bag", "accessory", "jewellery",
    ]}
    scores["jewellery"] = 0.5
    cat, conf = _wya_identify(scores, aspect_ratio=1.0, best_label="a photo of watch")
    assert cat == "Watch"
    assert WYA_CATEGORY_TO_TRYON[cat] == "jewellery"


def test_wya_identify_dress_over_pants_when_dress_scores_higher():
    scores = {k: 0.0 for k in [
        "jumpsuit", "dress", "skirt", "pants", "top", "outerwear",
        "shoes", "bag", "accessory", "jewellery",
    ]}
    scores["dress"] = 0.6
    cat, _ = _wya_identify(scores, aspect_ratio=1.8, best_label="a photo of maxi dress")
    assert cat == "Dress"
    assert WYA_CATEGORY_TO_TRYON[cat] == "dress"


def test_wya_identify_falls_back_to_top_when_nothing_matches():
    scores = {k: 0.0 for k in [
        "jumpsuit", "dress", "skirt", "pants", "top", "outerwear",
        "shoes", "bag", "accessory", "jewellery",
    ]}
    cat, conf = _wya_identify(scores, aspect_ratio=1.0, best_label="a photo of unknown thing")
    assert cat == "Top"  # WYA_RAW_LABEL_FALLBACK.get(raw, "Top") default
    assert conf == 0.2


def test_every_wya_category_maps_to_a_valid_tryon_category():
    from categories import CATEGORIES
    for wya_cat, tryon_cat in WYA_CATEGORY_TO_TRYON.items():
        assert tryon_cat in CATEGORIES, f"{wya_cat} -> {tryon_cat} not a valid TryOn category"


def test_geometry_override_promotes_low_conf_jewellery_to_dress():
    # The synthetic A-line dress case: CLIP says jewellery @ 0.23, silhouette
    # is torso-length, flared, and has a bodice (shoulders wider than waist).
    assert resolve_category_with_geometry("jewellery", 0.23, 1.5, True, top_ratio=2.0) == "dress"


def test_geometry_override_flare_without_bodice_stays_bottom():
    # A flared skirt flares but has no shoulders above its waist.
    assert resolve_category_with_geometry("accessories", 0.2, 1.3, True, top_ratio=1.0) == "bottom"


def test_geometry_override_flare_borderline_ratio_with_bodice_is_dress():
    # Bodice signal is what decides dress vs skirt, not the raw aspect ratio.
    assert resolve_category_with_geometry("jewellery", 0.23, 1.2, True, top_ratio=1.6) == "dress"


def test_geometry_override_promotes_tall_no_flare_to_bottom():
    assert resolve_category_with_geometry("bag", 0.3, 2.0, False) == "bottom"


def test_geometry_override_promotes_medium_no_flare_to_top():
    assert resolve_category_with_geometry("jewellery", 0.2, 1.5, False) == "top"


def test_geometry_override_keeps_high_confidence_label():
    assert resolve_category_with_geometry("jewellery", 0.8, 1.5, True) == "jewellery"


def test_geometry_override_keeps_clothing_categories_unchanged():
    assert resolve_category_with_geometry("dress", 0.1, 1.5, True) == "dress"
    assert resolve_category_with_geometry("top", 0.1, 1.5, True) == "top"


def test_geometry_override_keeps_squat_silhouette_as_small_object():
    # A watch/necklace crop is squat; geometry gives no garment signal.
    assert resolve_category_with_geometry("jewellery", 0.2, 1.0, False) == "jewellery"
