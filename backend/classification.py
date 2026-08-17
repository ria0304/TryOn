"""
Vision-based category suggestion — now calls WYA's actual
`LocalComputerVision.identify_garment` (vendored in `backend/vendor/wya/`)
instead of a from-scratch reimplementation of its decision tree.

Previously this file carried its own line-for-line port of WYA's
`identify_garment` logic. That port was faithful enough to reproduce WYA's
behavior *and* its bugs verbatim — including one that misclassified a maxi
dress as a skirt in production (the skirt branch fired on skirt-score alone,
without ever checking whether dress actually scored higher). Calling the
real module directly means TryOn only has one copy of this logic to keep in
sync, rather than two drifting in parallel.

The vendored copy (`backend/vendor/wya/computer_vision.py`) is WYA's actual
source, not a rewrite — see that file's module/method docstrings for exactly
what was changed and why (the skirt-vs-dress ordering fix, plus a few
`self._last_*` attribute writes added purely so this wrapper can read back
confidence/aspect-ratio/top-label without re-deriving them).

Not ported/used here (same as before): WYA's Stage 2 shoe-subtype
sub-classifier result (TryOn has no shoe subcategories to resolve to) and
its Hugging Face Inference API / SageMaker fallback path (TryOn has no AWS
setup — falls back to the local aspect-ratio heuristic instead, same as
before). Both are guarded off below rather than allowed to fire.
"""

from typing import Dict, Optional, Tuple
from PIL import Image
import io
import numpy as np

try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False
    print("[Classification] OpenCV not available — using aspect-ratio heuristic only")

try:
    from vendor.wya.computer_vision import LocalComputerVision, load_fashionclip
    WYA_AVAILABLE = CV2_AVAILABLE
except ImportError as e:
    WYA_AVAILABLE = False
    print(f"[Classification] Vendored WYA module not available ({e}) — using aspect-ratio heuristic only")

# Final translation from WYA's own finer-grained output categories down to
# TryOn's fixed 8-category schema (backend/categories.py). This is the one
# TryOn-specific piece — everything upstream of it is WYA's own code.
WYA_CATEGORY_TO_TRYON: Dict[str, str] = {
    "T-Shirt": "top", "Top": "top", "Sweater": "top",
    "Jeans": "bottom", "Trousers": "bottom", "Shorts": "bottom", "Skirt": "bottom",
    "Dress": "dress",
    "Jumpsuit": "dress",  # TryOn has no separate one-piece-non-dress category
    "Jacket": "jacket", "Outerwear": "jacket",
    "Shoes": "shoes",
    "Bag": "bag",
    "Accessories": "accessories",
    "Watch": "jewellery", "Necklace": "jewellery", "Ring": "jewellery", "Earrings": "jewellery",
}

# Global instance cache (loaded once on first use — mirrors WYA's own
# lazy-loading of the FashionCLIP model inside load_fashionclip()).
_cv_engine: Optional["LocalComputerVision"] = None


def _get_cv_engine():
    global _cv_engine
    if _cv_engine is None:
        _cv_engine = LocalComputerVision()
    return _cv_engine


def _crop_to_garment(image: Image.Image, pad: int = 8) -> Tuple[Image.Image, float]:
    """
    Crop an RGBA image to the bounding box of its alpha channel (i.e. the
    garment cutout, not the transparent padding around it), and return the
    cropped RGB image plus its aspect ratio (height / width).

    If the image has no alpha channel (e.g. classification is being run on
    a raw JPEG upload with background removal skipped), this is a no-op and
    just returns the full image — same behavior as before this change.
    """
    aspect_ratio = image.height / image.width if image.width else 1.0

    if image.mode == "RGBA":
        alpha = image.split()[-1]
        bbox = alpha.getbbox()
        if bbox:
            left, top, right, bottom = bbox
            left = max(0, left - pad)
            top = max(0, top - pad)
            right = min(image.width, right + pad)
            bottom = min(image.height, bottom + pad)
            w, h = right - left, bottom - top
            if w > 10 and h > 10:
                return image.crop((left, top, right, bottom)).convert("RGB"), h / w

    return image.convert("RGB"), aspect_ratio


def _pil_rgba_to_cv2_bgr_and_mask(image: Image.Image) -> Tuple[np.ndarray, Optional[np.ndarray]]:
    """
    Convert a PIL image to the (BGR ndarray, alpha-mask ndarray) pair that
    WYA's `identify_garment(image, mask)` expects. Mask is None when the
    image has no real transparency (raw upload, background removal
    skipped) — a fully-opaque alpha channel means "no mask", same as
    passing mask=None.
    """
    rgba = np.array(image.convert("RGBA"))
    bgr = cv2.cvtColor(rgba[:, :, :3], cv2.COLOR_RGB2BGR)
    alpha = rgba[:, :, 3]
    mask = None if image.mode != "RGBA" or alpha.min() == 255 else alpha
    return bgr, mask


def _vision_predict(image_bytes: bytes) -> dict:
    """
    Core classification via WYA's real `identify_garment`. Returns a dict
    with richer detail than the legacy (category, confidence) tuple so
    callers can also build auto-names:

        {
            "category": <TryOn 8-category value>,
            "confidence": <0.0-1.0>,
            "top_label": <best CLIP broad label, e.g. "maxi dress">,
            "aspect_ratio": <height/width of the garment crop>,
        }
    """
    fallback = {
        "category": "accessories",
        "confidence": 0.2,
        "top_label": None,
        "aspect_ratio": None,
    }
    if not WYA_AVAILABLE:
        category, confidence = suggest_category_heuristic_from_bytes(image_bytes)
        fallback.update(category=category, confidence=confidence)
        return fallback

    try:
        raw_image = Image.open(io.BytesIO(image_bytes))
        _, aspect_ratio = _crop_to_garment(raw_image)  # only used if we fall back below
        bgr, mask = _pil_rgba_to_cv2_bgr_and_mask(raw_image)

        # Same guard the original port used: TryOn has no AWS/HF Inference
        # API setup, so if the local FashionCLIP weights aren't loaded, skip
        # straight to the aspect-ratio heuristic rather than letting WYA's
        # identify_garment fall through to its HF/SageMaker network path.
        load_fashionclip()
        from vendor.wya.computer_vision import FASHIONCLIP_AVAILABLE
        if not FASHIONCLIP_AVAILABLE:
            category, confidence = suggest_category_heuristic_from_bytes(image_bytes)
            fallback.update(category=category, confidence=confidence)
            return fallback

        engine = _get_cv_engine()
        wya_category = engine.identify_garment(bgr, mask)

        category = WYA_CATEGORY_TO_TRYON.get(wya_category, "accessories")
        confidence = max(0.0, min(1.0, getattr(engine, "_last_confidence", 0.2)))
        top_label = getattr(engine, "_last_top_label", None)
        aspect_ratio = getattr(engine, "_last_aspect_ratio", aspect_ratio)

        print(
            f"[Classification] Predicted: {category} (WYA: {wya_category}, {confidence:.2%}) "
            f"— top label '{top_label}', aspect_ratio={aspect_ratio:.2f}"
        )
        return {
            "category": category,
            "confidence": confidence,
            "top_label": top_label,
            "aspect_ratio": aspect_ratio,
        }

    except Exception as e:
        print(f"[Classification] Vision model failed: {e}, falling back to heuristic")
        category, confidence = suggest_category_heuristic_from_bytes(image_bytes)
        fallback.update(category=category, confidence=confidence)
        return fallback


def suggest_category_vision(image_bytes: bytes) -> Tuple[str, float]:
    """
    Classify garment category using WYA's real `identify_garment`.

    Args:
        image_bytes: Image bytes. Pass the background-removed RGBA cutout
            when available (its alpha channel is used both to crop to just
            the garment before classifying, and as the mask WYA's own
            garment-crop logic expects) — classifying a clean cutout instead
            of the raw upload is what makes this accurate. Plain RGB bytes
            still work, just without the crop/mask refinement.

    Returns:
        (suggested_category, confidence_score) — suggested_category is one
        of TryOn's 8 schema values; confidence is 0.0-1.0.
    """
    info = _vision_predict(image_bytes)
    return info["category"], info["confidence"]


def classify_garment_detail(image_bytes: bytes) -> dict:
    """
    Public entry point for callers that also need the top CLIP label and
    garment aspect ratio (e.g. auto-name generation) alongside the category
    and confidence.

    Returns:
        {
            "category": str,        # TryOn 8-category value
            "confidence": float,    # 0.0-1.0
            "top_label": str|None,  # best CLIP broad label
            "aspect_ratio": float|None,
        }
    """
    return _vision_predict(image_bytes)


# Categories that are tiny, non-garment objects. WYA's decision tree checks
# these first, so a misrouted garment photo can land here and then be
# "fitted" as a small accessory. `resolve_category_with_geometry` promotes
# such silhouettes back to a clothing category when the geometry clearly
# describes a garment.
SMALL_CATEGORIES = ("jewellery", "accessories", "bag", "shoes")


def resolve_category_with_geometry(
    category: str,
    confidence: float,
    aspect_ratio: float,
    flare: bool,
    top_ratio: float = None,
) -> str:
    """
    Silhouette-geometry override for the vision category.

    When FashionCLIP is unsure (low confidence) about a torso-sized garment
    and buckets it as a small object (jewellery / accessories / bag / shoes),
    the cutout's own geometry — length (aspect ratio), flare, and the
    top/waist bodice ratio — is a much stronger signal than the label.
    Promote it back to a clothing category so the fitting stage uses a sane
    template instead of the small-accessory one.

    Also corrects a skirt-vs-dress mislabel specifically: a real skirt is
    structurally a waistband-to-hem column with nothing above the waist, so
    its top_ratio sits near 1.0. A pronounced bodice/straps above the
    narrowest point (high top_ratio) is geometric proof of a dress, not a
    skirt, regardless of classifier confidence — this is a labeling error
    the vendored WYA fix (skirt no longer preempting a higher dress score)
    reduces but doesn't eliminate on its own, so this stays as a second,
    independent line of defense.
    """
    if category == "bottom" and top_ratio is not None and top_ratio >= 1.15:
        return "dress"

    if category not in SMALL_CATEGORIES:
        return category
    if confidence is not None and confidence >= 0.5:
        return category
    if aspect_ratio is None or flare is None:
        return category
    if flare:
        # Bodice above the waist means a dress, not a skirt.
        if top_ratio is not None and top_ratio >= 1.15:
            return "dress"
        if aspect_ratio >= 1.4:
            return "dress"
        return "bottom"
    if aspect_ratio >= 1.8:
        return "bottom"
    if aspect_ratio >= 1.4:
        return "top"
    return category


def suggest_category_heuristic_from_bytes(image_bytes: bytes) -> Tuple[str, float]:
    """Fallback aspect-ratio heuristic when the vision model is unavailable."""
    try:
        image = Image.open(io.BytesIO(image_bytes))
        width, height = image.size
        return suggest_category_heuristic(width, height)
    except Exception as e:
        print(f"[Classification] Heuristic failed: {e}")
        return "accessories", 0.2


def suggest_category_heuristic(width: int, height: int) -> Tuple[str, float]:
    """
    Fallback lightweight aspect-ratio heuristic.
    Used when the vision model is unavailable or fails.
    """
    if not width or not height:
        return "accessories", 0.2

    ratio = height / width

    if ratio >= 2.2:
        return "dress", 0.35
    if ratio >= 1.5:
        return "top", 0.3
    if ratio <= 0.55:
        return "shoes", 0.3
    if 0.85 <= ratio < 1.3:
        return "bag", 0.25

    return "accessories", 0.2


def suggest_category(width: int, height: int) -> Tuple[str, float]:
    """
    Public API for category suggestion.

    This is the main entry point called by the backend upload handler.
    For backward compatibility, it accepts width/height but prefers image_bytes
    when available.

    Args:
        width: Image width in pixels (used for heuristic fallback)
        height: Image height in pixels (used for heuristic fallback)

    Returns:
        (suggested_category, confidence_score)
    """
    return suggest_category_heuristic(width, height)


def suggest_category_from_image(image_bytes: bytes) -> Tuple[str, float]:
    """
    Enhanced API that accepts image bytes for vision-based classification.

    Callers should pass the background-removed RGBA cutout when one is
    available (see `uploads.py`), not the raw upload — classification uses
    the alpha channel to crop to just the garment before running CLIP.
    Falls back gracefully to whole-image classification if plain RGB bytes
    are passed instead.

    Args:
        image_bytes: Image bytes (ideally the RGBA cutout, PNG or similar)

    Returns:
        (suggested_category, confidence_score)
    """
    return suggest_category_vision(image_bytes)
