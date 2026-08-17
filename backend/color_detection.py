"""
Dominant garment color detection — ported from the WYA project's
`services/computer_vision.py::get_dominant_color`.

Given the background-removed garment cutout (RGBA, alpha channel as mask),
this extracts the garment's dominant color as both a hex code and a
human-readable name, so uploads can be auto-tagged with a color instead of
requiring the user to manually pick one from a swatch palette.

Approach (same as WYA):
1. Take only the pixels inside the alpha mask (the garment itself, not the
   transparent background rembg already stripped out).
2. Filter out near-black/near-white/low-saturation pixels — these are
   usually shadow, highlight, or residual background-removal fringing
   rather than the garment's true color.
3. Cluster the remaining pixels with KMeans and pick the largest cluster
   whose brightness isn't itself near-black/near-white (falls back to the
   single largest cluster if none qualify).
4. Map the resulting RGB to the closest name in a small bundled color
   dictionary, with a denim-specific override (blue-gray in a certain range
   reads better as "Denim" than "Navy"/"Blue"/"Gray").

Fallback: if scikit-learn isn't installed or clustering fails for any
reason, falls back to the median color of the filtered pixels — still a
real, unclustered dominant-color estimate, just less noise-resistant.
"""

from typing import Dict, List, Optional, Tuple
from PIL import Image
import io
import numpy as np

try:
    from sklearn.cluster import KMeans
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    print("[ColorDetection] scikit-learn not available — using median-color fallback only")

# Named color reference points (RGB), ported verbatim from WYA's
# data/color_dictionary.json.
COLOR_DICTIONARY: Dict[str, List[int]] = {
    "Black": [25, 25, 25], "White": [245, 245, 245], "Off-White": [240, 235, 225],
    "Gray": [128, 128, 128], "Charcoal": [55, 55, 55], "Silver": [192, 192, 192],
    "Cream": [255, 253, 208], "Ivory": [255, 255, 240], "Champagne": [247, 231, 206],
    "Beige": [235, 215, 185], "Camel": [195, 155, 105], "Tan": [210, 180, 140],
    "Brown": [90, 55, 40], "Coffee": [75, 55, 50], "Rust": [165, 65, 40],
    "Terracotta": [226, 114, 91], "Cognac": [154, 73, 34], "Taupe": [72, 60, 50],
    "Navy": [20, 30, 70], "Royal Blue": [40, 80, 170], "Light Blue": [175, 210, 240],
    "Denim": [75, 115, 155], "Sky Blue": [135, 205, 235], "Teal": [0, 128, 128],
    "Turquoise": [64, 224, 208], "Baby Blue": [137, 207, 240], "Midnight Blue": [25, 25, 112],
    "Red": [190, 30, 45], "Burgundy": [100, 15, 30], "Maroon": [80, 0, 0],
    "Pink": [245, 180, 200], "Rose": [220, 150, 160], "Fuchsia": [190, 50, 130],
    "Coral": [255, 127, 80], "Blush": [222, 93, 131], "Magenta": [255, 0, 255],
    "Brick Red": [178, 34, 34], "Wine": [114, 47, 55], "Forest Green": [35, 65, 45],
    "Olive": [85, 95, 65], "Sage": [150, 165, 145], "Emerald": [0, 140, 80],
    "Mint": [190, 235, 210], "Khaki": [190, 180, 145], "Army Green": [75, 83, 32],
    "Lime": [191, 255, 0], "Hunter Green": [53, 94, 59], "Mustard": [205, 160, 40],
    "Yellow": [245, 230, 100], "Orange": [240, 130, 50], "Purple": [90, 50, 120],
    "Lavender": [190, 175, 215], "Lilac": [180, 150, 200], "Mauve": [224, 176, 255],
    "Plum": [142, 69, 133], "Amber": [255, 191, 0], "Peach": [255, 229, 180],
    "Gold": [255, 215, 0],
}


def _map_rgb_to_color_name(r: int, g: int, b: int) -> str:
    """Map RGB values to the closest color name in COLOR_DICTIONARY."""
    best, min_dist = "Gray", float("inf")
    for name, val in COLOR_DICTIONARY.items():
        dist = (r - val[0]) ** 2 + (g - val[1]) ** 2 + (b - val[2]) ** 2
        if dist < min_dist:
            min_dist, best = dist, name
    return best


def _rgb_to_hsv_arrays(rgb: np.ndarray) -> np.ndarray:
    """Vectorized RGB (0-255, Nx3) -> HSV (0-255, Nx3), matching cv2.COLOR_RGB2HSV ranges."""
    arr = rgb.astype(np.float32) / 255.0
    r, g, b = arr[:, 0], arr[:, 1], arr[:, 2]
    maxc = np.max(arr, axis=1)
    minc = np.min(arr, axis=1)
    v = maxc
    delta = maxc - minc
    s = np.where(maxc == 0, 0, delta / np.where(maxc == 0, 1, maxc))

    h = np.zeros_like(maxc)
    mask = delta != 0
    rc = np.zeros_like(maxc)
    gc = np.zeros_like(maxc)
    bc = np.zeros_like(maxc)
    safe_delta = np.where(delta == 0, 1, delta)
    rc[mask] = (maxc[mask] - r[mask]) / safe_delta[mask]
    gc[mask] = (maxc[mask] - g[mask]) / safe_delta[mask]
    bc[mask] = (maxc[mask] - b[mask]) / safe_delta[mask]

    is_r = mask & (maxc == r)
    is_g = mask & (maxc == g) & ~is_r
    is_b = mask & ~is_r & ~is_g

    h[is_r] = (bc[is_r] - gc[is_r]) % 6.0
    h[is_g] = 2.0 + rc[is_g] - bc[is_g]
    h[is_b] = 4.0 + gc[is_b] - rc[is_b]
    h = (h / 6.0) % 1.0

    return np.stack([h * 255.0, s * 255.0, v * 255.0], axis=1)


def detect_dominant_color(image_bytes: bytes) -> Tuple[Optional[str], Optional[str]]:
    """
    Detect the dominant garment color from image bytes.

    Args:
        image_bytes: Ideally the background-removed RGBA cutout (alpha
            channel used as the garment mask). Falls back to treating the
            whole image as the garment if there's no usable alpha channel.

    Returns:
        (hex_color, color_name) — either may be None if detection fails
        entirely (e.g. unreadable image bytes). Callers should keep
        whatever default/manual color they already have in that case.
    """
    try:
        image = Image.open(io.BytesIO(image_bytes))

        if image.mode == "RGBA":
            arr = np.array(image)
            alpha = arr[:, :, 3]
            pixels = arr[:, :, :3][alpha > 127]
        else:
            arr = np.array(image.convert("RGB"))
            pixels = arr.reshape(-1, 3)

        if len(pixels) < 200:
            return None, None

        hsv = _rgb_to_hsv_arrays(pixels)
        quality = (
            (hsv[:, 2] > 30) & (hsv[:, 2] < 220) & (hsv[:, 1] > 20) &
            (pixels[:, 0] < 240) & (pixels[:, 1] < 240) & (pixels[:, 2] < 240) &
            (pixels[:, 0] > 30) & (pixels[:, 1] > 30) & (pixels[:, 2] > 30)
        )
        filtered = pixels[quality] if np.sum(quality) > 500 else pixels

        r = g = b = None
        if SKLEARN_AVAILABLE:
            try:
                n = min(5, max(3, len(filtered) // 1000))
                km = KMeans(n_clusters=n, n_init=5, random_state=42)
                km.fit(filtered)
                counts = np.bincount(km.labels_)
                for idx in np.argsort(counts)[::-1][:2]:
                    rgb = km.cluster_centers_[idx].astype(int)
                    if 60 < int(rgb.sum()) < 750:
                        r, g, b = int(rgb[0]), int(rgb[1]), int(rgb[2])
                        break
                if r is None:
                    rgb = km.cluster_centers_[np.argsort(counts)[-1]].astype(int)
                    r, g, b = int(rgb[0]), int(rgb[1]), int(rgb[2])
            except Exception as e:
                print(f"[ColorDetection] KMeans failed: {e}, falling back to median color")

        if r is None:
            r, g, b = (int(x) for x in np.median(filtered, axis=0))

        name = _map_rgb_to_color_name(r, g, b)
        if name in ("Navy", "Royal Blue", "Light Blue", "Gray") and 60 < g < 150 and 40 < r < 140 and 80 < b < 200:
            name = "Denim"

        hex_color = "#{:02x}{:02x}{:02x}".format(r, g, b)
        return hex_color, name

    except Exception as e:
        print(f"[ColorDetection] Failed: {e}")
        return None, None
