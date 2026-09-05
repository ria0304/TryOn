"""
Fabric classification — ported from the WYA project's
`services/fabric_classifier.py::FabricClassifier` plus the texture/pattern
analysis it depends on (`services/computer_vision.py::analyze_texture_properties`
and `::detect_pattern`).

Given the background-removed garment cutout (RGBA, alpha channel as mask),
this estimates the garment's fabric (e.g. "Denim", "Silk", "Leather") from
texture variance, brightness, dominant colour, category, and detected
pattern — the same rule-based Logic Inference Engine WYA uses, so a garment
autotagged here reads the same way a WYA-autotagged one does.

Pipeline (mirrors WYA's `ai_model.py::autotag_garment` ordering):
    texture = analyze_texture(image_bytes)          # variance, brightness
    pattern = detect_pattern(image_bytes)            # has_pattern, pattern_type
    fabric  = FabricClassifier.classify(
        variance=texture["variance"], brightness=texture["brightness"],
        color=color_name, category=wya_category,
        pattern_type=pattern["pattern_type"], shoe_subtype=shoe_subtype,
    )

`category` here is WYA's own fine-grained category vocabulary (e.g. "Dress",
"Jeans", "Sweater"), not TryOn's coarse 8-category schema — pass the
`wya_category` that `classification.classify_garment_detail` now returns
alongside `category`, falling back to `WYA_CATEGORY_FALLBACK` keyed by
TryOn's coarse category when the finer one isn't available (e.g. the
heuristic-only classification path).

Fallback: if OpenCV isn't installed or texture/pattern analysis fails for
any reason, texture defaults to (variance=0.0, brightness=128.0) and
pattern to "solid" — FabricClassifier.classify() still returns a real
fabric guess (its own per-category default), just without texture/pattern
refinement.
"""

from typing import Dict, Optional
import io

import numpy as np
from PIL import Image

try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False
    print("[FabricClassification] OpenCV not available — texture/pattern analysis will use defaults")


# TryOn's coarse category -> a reasonable WYA fine-grained category, used
# only when the caller doesn't have WYA's own finer category on hand (e.g.
# the aspect-ratio heuristic fallback in classification.py, which never
# produces one).
WYA_CATEGORY_FALLBACK: Dict[str, str] = {
    "top": "Top",
    "bottom": "Trousers",
    "dress": "Dress",
    "jacket": "Jacket",
    "shoes": "Shoes",
    "bag": "Bag",
    "jewellery": "Necklace",
    "accessories": "Accessories",
}


class FabricClassifier:
    """
    Rule-based fabric inference from texture metrics, colour, garment
    category, and pattern. Ported verbatim from WYA's
    `services/fabric_classifier.py`. Defaults to "Cotton" for any
    unmatched case.
    """

    @staticmethod
    def classify(
        variance: float,
        brightness: float,
        color: str,
        category: str,
        pattern_type: str = "solid",
        shoe_subtype: str = "",
    ) -> str:
        _DENIM_COLORS = {
            "Denim", "Light Denim", "Navy", "Blue", "Charcoal", "Ice Blue",
            "Gray", "Black", "Light Blue", "Royal Blue", "Sky Blue",
            "Slate", "Indigo", "Midnight Navy",
        }
        _DENIM_CATS = {"Pants", "Trousers", "Jeans", "Shorts", "Jacket", "Skirt", "Dress", "Jumpsuit", "Top"}
        _EARTH = {"White", "Beige", "Cream", "Olive", "Sage", "Brown", "Tan", "Rust", "Sand", "Khaki"}
        _JEWEL = {"Red", "Burgundy", "Navy", "Black", "Green", "Emerald", "Purple", "Plum", "Bordeaux"}
        _PASTELS = {"Blush", "Lavender", "Mint", "Baby Blue", "Cream", "White", "Soft Peony", "Champagne"}
        _LEATHER_COLORS = {"Brown", "Tan", "Black", "Camel", "Cognac", "Burgundy", "Red", "Olive"}

        # ── Jewellery ──────────────────────────────────────────────────────
        if category in ("Necklace", "Ring", "Earrings", "Watch", "Jewellery"):
            if color in ("Gold", "Yellow", "Orange", "Beige", "Cream", "Champagne"):
                return "Gold"
            if color in ("Silver", "Gray", "White", "Platinum", "Ash", "Steel Blue"):
                return "Silver"
            if category == "Watch" and color in ("Black", "Brown", "Tan", "Cognac"):
                return "Leather Strap"
            return "Metal"

        # ── Shoes — sub-type aware fabric ─────────────────────────────────
        if category == "Shoes":
            st = shoe_subtype.lower()
            # Canvas sneakers / sporty
            if "sneaker" in st:
                if color in ("White", "Cream", "Off-White") and variance > 200:
                    return "Canvas"
                if variance > 400:
                    return "Canvas"
                return "Leather" if color in _LEATHER_COLORS else "Synthetic / Mesh"
            # Boots
            if "boot" in st:
                if color in _LEATHER_COLORS and variance < 350:
                    return "Leather"
                if variance < 200 and color in ("Brown", "Tan", "Camel", "Olive"):
                    return "Suede"
                return "Leather"
            # Heels
            if "heel" in st:
                if variance < 80 and brightness > 150:
                    return "Patent Leather"
                if color in _LEATHER_COLORS:
                    return "Leather"
                if color in ("Nude", "Blush", "Beige", "Cream"):
                    return "Satin"
                return "Leather"
            # Sandals
            if "sandal" in st:
                if color in _LEATHER_COLORS and variance < 300:
                    return "Leather"
                return "Synthetic"
            # Loafers / Oxfords / Flats
            if any(w in st for w in ["loafer", "oxford", "brogue", "derby", "flat", "mary jane"]):
                if color in _LEATHER_COLORS:
                    return "Leather"
                return "Suede" if variance < 150 else "Leather"
            # Slides / Mules / Flip flops
            if any(w in st for w in ["slide", "mule", "flip"]):
                return "Rubber" if color in ("White", "Black", "Gray") else "Synthetic"
            # Generic fallback
            if color in _LEATHER_COLORS and variance < 300:
                return "Leather"
            if variance > 500:
                return "Canvas"
            return "Synthetic / Mesh"

        # ── Bag ───────────────────────────────────────────────────────────
        if category == "Bag":
            if color in _LEATHER_COLORS:
                return "Leather"
            if variance > 400:
                return "Canvas"
            return "Synthetic"

        # ── Accessories ───────────────────────────────────────────────────
        if category == "Accessories":
            if color in _LEATHER_COLORS and variance < 250:
                return "Leather"
            if color in ("Gold", "Silver", "Platinum"):
                return "Metal"
            return "Fabric"

        # ── Denim shortcut (before other clothing) ─────────────────────────
        if category in _DENIM_CATS and color in _DENIM_COLORS:
            if 150 < variance < 800 or color in ("Denim", "Light Denim"):
                return "Denim"

        # ── Knitwear detection (high variance + dark/warm + cool season cats) ─
        if variance > 900 and category in ("Top", "Sweater", "Outerwear", "Jacket", "Dress"):
            return "Knit"

        # ── Velvet detection ──────────────────────────────────────────────
        if variance > 800 and brightness < 110 and color in _JEWEL:
            return "Velvet"

        # ── Printed / floral fabric bump ──────────────────────────────────
        if pattern_type in ("floral", "geometric") and variance > 200:
            if category in ("Dress", "Top", "Skirt", "Blouse"):
                return "Chiffon" if brightness > 160 else "Cotton"

        # ── Per-category rules ────────────────────────────────────────────
        if category in ("Pants", "Trousers", "Jeans", "Shorts"):
            if color in _EARTH and variance > 200:  return "Linen"
            return "Cotton" if variance > 200 else "Polyester"

        if category == "Skirt":
            if variance < 30 and brightness > 120:   return "Satin"
            if 300 < variance < 700:
                return "Linen" if color in _EARTH else "Cotton"
            if variance < 100 and brightness > 150:  return "Silk"
            return "Polyester"

        if category == "Dress":
            if variance < 30 and brightness > 120:   return "Satin"
            if 30 < variance < 100 and brightness > 150:
                return "Chiffon" if color in _PASTELS else "Silk"
            if 100 < variance < 400:
                return "Linen" if color in _EARTH else "Cotton"
            if 400 < variance < 700:
                return "Crepe" if brightness < 100 else "Ponte"
            return "Polyester"

        if category in ("Top", "T-Shirt", "Sweater"):
            if variance < 30 and brightness > 120:   return "Satin"
            if 300 < variance < 700 and color in _EARTH: return "Linen"
            if color in _PASTELS and variance < 200 and brightness > 160: return "Chiffon"
            return "Cotton"

        if category == "Jumpsuit":
            if variance < 30 and brightness > 120:   return "Satin"
            if 30 < variance < 200 and brightness > 150: return "Silk"
            if 200 < variance < 500:
                return "Linen" if color in _EARTH else "Cotton"
            return "Polyester"

        if category in ("Jacket", "Coat", "Outerwear", "Blazer"):
            if color in _LEATHER_COLORS and variance < 250:   return "Leather"
            if color in _LEATHER_COLORS and variance < 400:   return "Suede"
            if variance > 400:                                 return "Cotton"
            return "Polyester"

        return "Cotton"


def _decode_rgb_and_mask(image_bytes: bytes):
    """
    Decode image bytes to an (RGB uint8 ndarray, mask uint8 ndarray) pair.
    Mask is the alpha channel thresholded at 127 when present (i.e. the
    background-removed garment cutout TryOn already produces), otherwise a
    full-image mask (every pixel counts).
    """
    image = Image.open(io.BytesIO(image_bytes))
    if image.mode == "RGBA":
        arr = np.array(image)
        rgb = arr[:, :, :3]
        mask = (arr[:, :, 3] > 127).astype(np.uint8) * 255
    else:
        rgb = np.array(image.convert("RGB"))
        mask = np.full(rgb.shape[:2], 255, dtype=np.uint8)
    return rgb, mask


def analyze_texture(image_bytes: bytes) -> Dict[str, float]:
    """
    Analyze texture variance and brightness of the garment, restricted to
    the masked (non-transparent) pixels. Ported from WYA's
    `analyze_texture_properties`.
    """
    if not CV2_AVAILABLE:
        return {"variance": 0.0, "brightness": 128.0}
    try:
        rgb, mask = _decode_rgb_and_mask(image_bytes)
        gray = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY)
        center = gray[mask > 0]
        if center.size == 0:
            center = gray.ravel()
        return {"variance": float(np.var(center)), "brightness": float(np.mean(center))}
    except Exception as e:
        print(f"[FabricClassification] Texture analysis failed: {e}")
        return {"variance": 0.0, "brightness": 128.0}


def detect_pattern(image_bytes: bytes) -> Dict[str, object]:
    """
    Detect if the garment has a pattern (floral, striped, geometric) from
    edge density and hue variance within the masked region. Ported from
    WYA's `detect_pattern`.
    """
    if not CV2_AVAILABLE:
        return {"has_pattern": False, "pattern_type": "solid", "confidence": 0.5}
    try:
        rgb, mask = _decode_rgb_and_mask(image_bytes)
        coords = cv2.findNonZero(mask)
        if coords is not None:
            x, y, w, h = cv2.boundingRect(coords)
            cropped = rgb[y:y + h, x:x + w]
        else:
            cropped = rgb

        if cropped.size == 0:
            return {"has_pattern": False, "pattern_type": "solid", "confidence": 0.5}

        gray = cv2.cvtColor(cropped, cv2.COLOR_RGB2GRAY)
        edges = cv2.Canny(gray, 50, 150)
        edge_density = np.sum(edges > 0) / edges.size
        hsv = cv2.cvtColor(cropped, cv2.COLOR_RGB2HSV)
        hue_variance = np.var(hsv[:, :, 0])
        has_pattern = bool(edge_density > 0.05 or hue_variance > 500)

        pattern_type = "solid"
        if has_pattern:
            sobelx = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
            sobely = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
            angle = np.arctan2(sobely, sobelx)
            angle_hist, _ = np.histogram(angle, bins=36)
            max_orientation = np.max(angle_hist) / np.sum(angle_hist)

            if max_orientation > 0.3:
                pattern_type = "striped"
            elif edge_density > 0.15:
                pattern_type = "floral"
            else:
                pattern_type = "geometric"

        return {
            "has_pattern": has_pattern,
            "pattern_type": pattern_type,
            "confidence": min(0.95, edge_density * 5 + 0.3),
        }
    except Exception as e:
        print(f"[FabricClassification] Pattern detection failed: {e}")
        return {"has_pattern": False, "pattern_type": "solid", "confidence": 0.5}


def classify_garment_fabric(
    image_bytes: bytes,
    color_name: Optional[str],
    category: Optional[str] = None,
    wya_category: Optional[str] = None,
    shoe_subtype: str = "",
) -> Dict[str, object]:
    """
    End-to-end fabric classification for one garment upload — the same
    texture -> pattern -> FabricClassifier pipeline WYA runs in
    `ai_model.py::autotag_garment`.

    Args:
        image_bytes: the background-removed garment cutout (RGBA PNG
            ideal; the alpha channel is used as the mask). Plain RGB bytes
            still work, just without mask restriction.
        color_name: dominant colour name (e.g. from `detect_dominant_color`).
        category: TryOn's coarse category (top/bottom/dress/...), used to
            look up a fallback WYA category when `wya_category` isn't given.
        wya_category: WYA's own fine-grained category (e.g. "Dress",
            "Jeans", "Sweater") when available — pass
            `classify_garment_detail(...)["wya_category"]` here for the
            most accurate fabric guess.
        shoe_subtype: only used when the effective category is "Shoes";
            TryOn doesn't classify shoe sub-types, so this is normally left
            blank and the classifier's generic shoe fallback rules apply.

    Returns:
        {"fabric": str, "pattern": str, "has_pattern": bool,
         "texture_variance": float, "brightness": float}
    """
    effective_category = wya_category or WYA_CATEGORY_FALLBACK.get(category or "", "Top")

    texture = analyze_texture(image_bytes)
    pattern = detect_pattern(image_bytes)

    fabric = FabricClassifier.classify(
        variance=texture["variance"],
        brightness=texture["brightness"],
        color=color_name or "Gray",
        category=effective_category,
        pattern_type=pattern["pattern_type"],
        shoe_subtype=shoe_subtype,
    ) or "Cotton"

    return {
        "fabric": fabric,
        "pattern": pattern["pattern_type"] if pattern["has_pattern"] else "solid",
        "has_pattern": pattern["has_pattern"],
        "texture_variance": round(texture["variance"], 2),
        "brightness": round(texture["brightness"], 2),
    }
