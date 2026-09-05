"""
Vision-based category suggestion — ports WYA's real `identify_garment`
decision logic (from `services/computer_vision.py`) directly into this
file, rather than importing it from a vendored copy of the WYA repo.

`_wya_identify` reproduces WYA's `identify_garment` decision tree
faithfully, with one intentional fix: the skirt branch no longer fires on
skirt-score alone. In production WYA could misclassify a maxi dress as a
skirt because the skirt branch fired whenever skirt scored above its own
threshold, without ever checking whether dress had scored higher. Here the
skirt branch also requires skirt's score to be >= dress's score.

Not ported/used here (same as before): WYA's Stage 2 shoe-subtype
sub-classifier (TryOn has no shoe subcategories to resolve to) and its
Hugging Face Inference API / SageMaker fallback path (TryOn has no AWS
setup — falls back to the local aspect-ratio heuristic instead).
"""

from typing import Dict, Optional, Tuple
from PIL import Image
import io

try:
    from transformers import CLIPModel, CLIPProcessor
    import torch
    TRANSFORMERS_AVAILABLE = True
except ImportError as e:
    TRANSFORMERS_AVAILABLE = False
    print(f"[Classification] transformers/torch not available ({e}) — using aspect-ratio heuristic only")

# Lazy-loaded FashionCLIP model (mirrors WYA's own load_fashionclip()).
FASHIONCLIP_AVAILABLE = False
_clip_model = None
_clip_processor = None


def load_fashionclip() -> None:
    """Load FashionCLIP once and cache it at module scope."""
    global FASHIONCLIP_AVAILABLE, _clip_model, _clip_processor
    if FASHIONCLIP_AVAILABLE or _clip_model is not None or not TRANSFORMERS_AVAILABLE:
        return
    try:
        _clip_model = CLIPModel.from_pretrained("patrickjohncyh/fashion-clip")
        _clip_processor = CLIPProcessor.from_pretrained("patrickjohncyh/fashion-clip")
        FASHIONCLIP_AVAILABLE = True
    except Exception as e:
        print(f"[Classification] FashionCLIP failed to load ({e}) — using aspect-ratio heuristic only")


# Stage-1 broad CLIP labels and the buckets they roll up into — ported
# verbatim from WYA's `identify_garment` (Stage 1 section).
WYA_BROAD_LABELS = [
    "t-shirt", "shirt", "blouse", "tank top", "crop top", "sweater", "hoodie",
    "cardigan", "polo", "turtleneck",
    "jeans", "pants", "trousers", "leggings", "shorts", "cargo pants", "joggers",
    "skirt", "mini skirt", "midi skirt", "maxi skirt",
    "dress", "maxi dress", "mini dress", "midi dress", "bodycon dress",
    "jumpsuit", "romper", "overalls",
    "jacket", "coat", "blazer", "puffer jacket", "leather jacket",
    "shoes",
    "handbag", "tote bag", "backpack", "crossbody bag", "clutch",
    "belt", "hat", "scarf", "sunglasses",
    "necklace", "earrings", "ring", "watch",
]

WYA_BUCKETS: Dict[str, list] = {
    "jumpsuit":  ["jumpsuit", "romper", "overalls"],
    "dress":     ["dress", "maxi dress", "mini dress", "midi dress", "bodycon", "a-line"],
    "skirt":     ["skirt", "mini skirt", "midi skirt", "maxi skirt"],
    "pants":     ["jeans", "pants", "trousers", "leggings", "shorts", "cargo", "joggers"],
    "top":       ["t-shirt", "shirt", "blouse", "tank top", "crop top", "sweater", "hoodie", "cardigan", "polo", "turtleneck"],
    "outerwear": ["jacket", "coat", "blazer", "puffer", "leather jacket"],
    "shoes":     ["shoes"],
    "bag":       ["handbag", "tote bag", "backpack", "crossbody bag", "clutch"],
    "accessory": ["belt", "hat", "scarf", "sunglasses"],
    "jewellery": ["necklace", "earrings", "ring", "watch"],
}

# Fallback when nothing in the decision tree below matches: maps a raw
# best-scoring CLIP label straight to a WYA category, same role as WYA's
# `CATEGORY_MAP.get(raw, "Top")` (WYA's is data-driven from
# `data/category_map.json`; this is TryOn's own copy, restricted to WYA
# category names that WYA_CATEGORY_TO_TRYON below actually knows about).
WYA_RAW_LABEL_FALLBACK: Dict[str, str] = {
    "t-shirt": "T-Shirt", "shirt": "Top", "blouse": "Top", "tank top": "Top",
    "sweater": "Sweater", "hoodie": "Top", "cardigan": "Sweater", "polo": "Top",
    "jeans": "Jeans", "pants": "Trousers", "trousers": "Trousers", "leggings": "Trousers",
    "shorts": "Shorts", "cargo pants": "Trousers", "joggers": "Trousers",
    "skirt": "Skirt", "dress": "Dress", "maxi dress": "Dress", "mini dress": "Dress",
    "jumpsuit": "Jumpsuit", "romper": "Jumpsuit",
    "jacket": "Jacket", "coat": "Outerwear", "blazer": "Jacket", "puffer": "Jacket",
    "shoes": "Shoes", "sneakers": "Shoes", "boots": "Shoes", "heels": "Shoes", "sandals": "Shoes",
}

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


def _wya_identify(scores: Dict[str, float], aspect_ratio: float, best_label: str) -> Tuple[str, float]:
    """
    Pure decision tree, ported from WYA's `identify_garment` — same
    branch order and thresholds, minus the CLIP call itself (the caller
    passes in the already-computed bucket scores, garment aspect ratio,
    and the single highest-scoring raw CLIP label).

    Returns (wya_category, confidence).
    """
    raw = (best_label or "").lower()
    s = scores or {}

    if s.get("jewellery", 0) > 0.2:
        conf = s["jewellery"]
        if "watch" in raw: return "Watch", conf
        if "necklace" in raw: return "Necklace", conf
        if "ring" in raw: return "Ring", conf
        if "earring" in raw: return "Earrings", conf
        return "Necklace", conf
    if s.get("bag", 0) > 0.2:
        return "Bag", s["bag"]
    if s.get("accessory", 0) > 0.2:
        return "Accessories", s["accessory"]

    # Shoes — WYA's Stage 2 sub-classifier isn't ported (see module
    # docstring); TryOn only needs the top-level "Shoes" category.
    if s.get("shoes", 0) > 0.18:
        return "Shoes", s["shoes"]

    # Bug fix vs. WYA production: skirt no longer preempts a higher dress
    # score (see module docstring).
    if s.get("skirt", 0) > 0.2 and s["skirt"] >= s.get("dress", 0) and (0.8 < aspect_ratio < 2.5 or s["skirt"] > 0.4):
        return "Skirt", s["skirt"]
    if s.get("jumpsuit", 0) > 0.25 and (aspect_ratio > 1.8 or s["jumpsuit"] > 0.45):
        return "Jumpsuit", s["jumpsuit"]
    if s.get("pants", 0) > 0.3:
        if s.get("jumpsuit", 0) > 0.2 and aspect_ratio > 2.0:
            return "Jumpsuit", s["jumpsuit"]
        if "short" in raw: return "Shorts", s["pants"]
        if "jean" in raw: return "Jeans", s["pants"]
        if "legging" in raw: return "Trousers", s["pants"]
        return "Trousers", s["pants"]
    if s.get("dress", 0) > 0.3:
        if aspect_ratio > 2.5 and s.get("jumpsuit", 0) > 0.2:
            return "Jumpsuit", s["jumpsuit"]
        return "Dress", s["dress"]
    if s.get("top", 0) > 0.3:
        if "sweater" in raw or "cardigan" in raw: return "Sweater", s["top"]
        if "t-shirt" in raw: return "T-Shirt", s["top"]
        return "Top", s["top"]
    if s.get("outerwear", 0) > 0.3:
        return ("Jacket" if "blazer" in raw or "jacket" in raw else "Outerwear"), s["outerwear"]

    # Tiebreakers
    if s.get("jumpsuit", 0) > 0.15 and s.get("pants", 0) > 0.15:
        cat = "Jumpsuit" if aspect_ratio > 2.0 else "Trousers"
        return cat, max(s["jumpsuit"], s["pants"])
    if s.get("jumpsuit", 0) > 0.15 and s.get("skirt", 0) > 0.15:
        cat = "Jumpsuit" if aspect_ratio > 2.2 else "Skirt"
        return cat, max(s["jumpsuit"], s["skirt"])

    if "skirt" in raw and aspect_ratio < 2.5:
        return "Skirt", 0.2

    return WYA_RAW_LABEL_FALLBACK.get(raw, "Top"), 0.2


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


def _vision_predict(image_bytes: bytes) -> dict:
    """
    Core classification via WYA's real CLIP call + decision tree
    (`_wya_identify` above). Returns a dict with richer detail than the
    legacy (category, confidence) tuple so callers can also build
    auto-names:

        {
            "category": <TryOn 8-category value>,
            "confidence": <0.0-1.0>,
            "top_label": <best CLIP broad label, e.g. "maxi dress">,
            "aspect_ratio": <height/width of the garment crop>,
            "wya_category": <WYA's own finer-grained category, e.g. "Dress">,
        }
    """
    fallback = {
        "category": "accessories",
        "confidence": 0.2,
        "top_label": None,
        "aspect_ratio": None,
        "wya_category": None,
    }

    try:
        raw_image = Image.open(io.BytesIO(image_bytes))
        cropped, aspect_ratio = _crop_to_garment(raw_image)

        # Same guard WYA itself uses before its HF/SageMaker network
        # fallback: if the local FashionCLIP weights aren't loaded, skip
        # straight to the aspect-ratio heuristic instead (TryOn has no
        # AWS setup to fall through to).
        load_fashionclip()
        if not FASHIONCLIP_AVAILABLE:
            category, confidence = suggest_category_heuristic_from_bytes(image_bytes)
            fallback.update(category=category, confidence=confidence)
            return fallback

        inputs = _clip_processor(text=WYA_BROAD_LABELS, images=cropped, return_tensors="pt", padding=True)
        with torch.no_grad():
            probs = _clip_model(**inputs).logits_per_image.softmax(dim=1)

        top_probs, top_indices = torch.topk(probs[0], 5)
        top_labels = [WYA_BROAD_LABELS[i] for i in top_indices]
        top_scores = [p.item() for p in top_probs]

        scores = {k: 0.0 for k in WYA_BUCKETS}
        for label, score in zip(top_labels, top_scores):
            for bucket, keywords in WYA_BUCKETS.items():
                if any(kw in label.lower() for kw in keywords):
                    scores[bucket] += score
                    break

        best_label = WYA_BROAD_LABELS[probs.argmax().item()]
        wya_category, confidence = _wya_identify(scores, aspect_ratio, best_label)
        confidence = max(0.0, min(1.0, confidence))
        category = WYA_CATEGORY_TO_TRYON.get(wya_category, "accessories")

        print(
            f"[Classification] Predicted: {category} (WYA: {wya_category}, {confidence:.2%}) "
            f"— top label '{best_label}', aspect_ratio={aspect_ratio:.2f}"
        )
        return {
            "category": category,
            "confidence": confidence,
            "top_label": best_label,
            "aspect_ratio": aspect_ratio,
            "wya_category": wya_category,
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
    garment aspect ratio (e.g. auto-name generation), or WYA's own
    finer-grained category (e.g. fabric classification), alongside the
    category and confidence.

    Returns:
        {
            "category": str,        # TryOn 8-category value
            "confidence": float,    # 0.0-1.0
            "top_label": str|None,  # best CLIP broad label
            "aspect_ratio": float|None,
            "wya_category": str|None,  # WYA's finer category, e.g. "Jeans"
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
