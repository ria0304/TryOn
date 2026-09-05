import sys
import io
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.fitting_service import FittingService


def _rgba(shape):
    return np.zeros(shape, dtype=np.uint8)


def _bytes(img):
    buf = io.BytesIO()
    Image.fromarray(img).save(buf, format="PNG")
    return buf.getvalue()


def _fit(img, category):
    return FittingService().fit_garment(_bytes(img), category)


def _profile(alpha):
    ys, xs = np.nonzero(alpha > 0)
    assert len(ys) > 0, "no content"

    def width(y):
        row = np.nonzero(alpha[y] > 0)[0]
        return (row.max() - row.min() + 1) if len(row) else 0

    top, bottom = int(ys.min()), int(ys.max())
    max_w = max((width(y) for y in range(top, bottom + 1)), default=1)
    hem = max(y for y in range(top, bottom + 1) if width(y) > max_w * 0.5)
    return top, bottom, width, hem


def _tee(h=180, w=200):
    """Short-sleeve tee: wide sleeve band, then a straight narrower torso."""
    img = _rgba((h, w, 4))
    img[0:45, 25:175] = (80, 140, 200, 255)          # sleeve band (150px)
    for y in range(45, h):
        t = (y - 45) / (h - 45)
        l = int(50 + (60 - 50) * t)
        r = int(150 + (140 - 150) * t)
        img[y, l:r + 1] = (80, 140, 200, 255)         # torso (100px)
    return img


def test_sleeved_top_keeps_sleeve_band_and_conforms_torso():
    """Category-aware: the sleeve band (shoulder line -> sleeve hem) must keep
    its natural width -- a sleeve hangs on the arm and must NOT be pulled into
    the torso silhouette -- while the torso below conforms to the body."""
    out = _fit(_tee(), "top")
    alpha = out[:, :, 3]
    top, bottom, width, hem = _profile(alpha)
    assert 120 <= top <= 185

    # Shoulders anchor on the mannequin's shoulders (~96px wide).
    sh = max(range(top, top + 40), key=width)
    sh_w = width(sh)
    assert 80 <= sh_w <= 115

    # Sleeve band rows: the fabric between the shoulder line and the sleeve
    # hem must stay roughly as wide as the placed shoulders (not squeezed to
    # the ~64px torso). Source sleeve band is 45 rows over a 150px shoulder,
    # so the placed band is ~45 * (sh_w / 150) rows tall.
    sleeve_hi = sh + int(45 * (sh_w / 150.0))
    sleeve_max = max(width(y) for y in range(sh, min(sleeve_hi, bottom) + 1))
    assert sleeve_max >= sh_w * 0.85, f"sleeve squeezed to {sleeve_max}px"

    # Torso rows conform to the body (~64-80px), clearly narrower than the
    # preserved sleeve band.
    torso_lo = min(sleeve_hi + 40, bottom)
    torso_hi = min(torso_lo + 30, bottom)
    torso_max = max(width(y) for y in range(torso_lo, torso_hi + 1))
    assert torso_max < sh_w * 0.85, f"torso not conformed ({torso_max}px)"


def test_long_sleeve_top_preserves_sleeve_down_the_arm():
    h, w = 220, 220
    img = _rgba((h, w, 4))
    img[0:120, 20:200] = (70, 110, 190, 255)          # long sleeves (180px)
    for y in range(120, h):
        t = (y - 120) / (h - 120)
        l = int(55 + (62 - 55) * t)
        r = int(165 + (158 - 165) * t)
        img[y, l:r + 1] = (70, 110, 190, 255)          # torso
    out = _fit(img, "top")
    alpha = out[:, :, 3]
    top, bottom, width, hem = _profile(alpha)
    sh = max(range(top, top + 40), key=width)
    sh_w = width(sh)

    # Mid-sleeve rows must stay near the shoulder width, not the torso width.
    mid = (sh + hem) // 2
    sleeve_w = max(width(y) for y in range(mid - 25, mid + 26))
    torso_w = width(max(range(hem - 40, hem), key=width))
    assert sleeve_w > torso_w * 1.25, f"sleeve pulled in: {sleeve_w} vs {torso_w}"


def test_sleeveless_tank_conforms_shoulders_and_stays_natural_length():
    h, w = 180, 200
    img = _rgba((h, w, 4))
    for y in range(h):
        t = y / (h - 1)
        l = int(45 + (55 - 45) * t)
        r = int(155 + (145 - 155) * t)
        img[y, l:r + 1] = (220, 120, 60, 255)
    out = _fit(img, "top")
    alpha = out[:, :, 3]
    top, bottom, width, hem = _profile(alpha)
    assert 120 <= top <= 185
    sh = max(range(top, top + 40), key=width)
    assert 80 <= width(sh) <= 115
    # Shoulder->hem follows the source length scaled by the width ratio: no
    # vertical stretch to fill the canvas.
    expected = sh + (h - 1) * (width(sh) / 100.0)
    assert abs(hem - expected) < 60, f"hem {hem}, expected ~{expected:.0f}"


def test_skirt_anchors_waist_and_preserves_flare():
    """A skirt is anchored by its waistband on the mannequin's waist and keeps
    its A-line flare down to a natural-length hem."""
    h, w = 150, 120
    img = _rgba((h, w, 4))
    img[0:12, 35:85] = (120, 80, 180, 255)             # waistband (50px)
    img[12:60, 25:95] = (120, 80, 180, 255)            # hips (70px)
    for y in range(60, h):
        t = (y - 60) / (h - 60)
        l = int(25 + (5 - 25) * t)
        r = int(95 + (115 - 95) * t)
        img[y, l:r + 1] = (120, 80, 180, 255)          # flare
    out = _fit(img, "skirt")
    alpha = out[:, :, 3]
    top, bottom, width, hem = _profile(alpha)

    # Waistband sits on the mannequin's waist row (258).
    assert 230 <= top <= 285, f"waist anchored at {top}"
    # The hem flares wider than the waist and sits at a natural length.
    hem_w = width(hem)
    waist_w = width(top)
    assert hem_w > waist_w * 1.4
    assert hem < 490  # a midi skirt must not be stretched to the ankles


def test_pants_anchor_waist_and_legs_taper_naturally():
    """Pants start at the mannequin's waist and their leg length follows the
    garment's own proportions -- nothing is stretched to fill the canvas."""
    h, w = 150, 160
    img = _rgba((h, w, 4))
    img[0:25, 55:105] = (40, 60, 120, 255)             # waistband (50px)
    img[25:80, 45:115] = (40, 60, 120, 255)            # hips (70px)
    for y in range(80, h):
        t = (y - 80) / (h - 80)
        l = int(55 + (62 - 55) * t)
        r = int(105 + (98 - 105) * t)
        img[y, l:r + 1] = (40, 60, 120, 255)           # legs
    out = _fit(img, "pants")
    alpha = out[:, :, 3]
    top, bottom, width, hem = _profile(alpha)
    assert 230 <= top <= 285, f"waist anchored at {top}"
    # Natural length: source height (150) scaled by waist ratio (64/50).
    expected = top + 150 * (64.0 / 50.0)
    assert abs(hem - expected) < 80, f"hem {hem}, expected ~{expected:.0f}"
    # Legs taper toward the hem (no flare at the bottom).
    assert width(hem) < width(top) * 1.1


def test_shorts_hem_stays_above_knees():
    h, w = 90, 160
    img = _rgba((h, w, 4))
    img[0:20, 55:105] = (40, 60, 120, 255)
    img[20:90, 50:110] = (40, 60, 120, 255)
    out = _fit(img, "shorts")
    alpha = out[:, :, 3]
    top, bottom, width, hem = _profile(alpha)
    assert 230 <= top <= 285
    # Shorts end well above the knee row (470).
    assert hem < 380


def test_shoe_fallback_places_at_feet():
    shoe = _rgba((60, 90, 4))
    shoe[10:50, 10:80] = (40, 40, 40, 255)
    shoe[50:56, 5:85] = (90, 90, 90, 255)
    out = _fit(shoe, "shoes")
    alpha = out[:, :, 3]
    ys, xs = np.nonzero(alpha > 0)
    assert len(ys) > 0
    # Feet region on the 550-high canvas, horizontally centred.
    assert 420 <= ys.min() <= 480
    assert 480 <= ys.max() <= 540
    assert xs.min() >= 150 and xs.max() <= 250


def test_jewellery_fallback_places_at_neck():
    neck = _rgba((50, 40, 4))
    for y in range(50):
        t = y / 49.0
        l = int(5 + (12 - 5) * t)
        r = int(35 - (12 - 5) * t)
        neck[y, l:r + 1] = (200, 180, 60, 255)
    out = _fit(neck, "jewellery")
    alpha = out[:, :, 3]
    ys, xs = np.nonzero(alpha > 0)
    assert len(ys) > 0
    # Neck region (NECK row 150), horizontally centred.
    assert 110 <= ys.min() <= 200
    assert xs.min() >= 160 and xs.max() <= 240
