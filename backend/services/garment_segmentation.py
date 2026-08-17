"""
Garment-only extraction from a photo of a person wearing clothes.

rembg's generic foreground segmentation keeps the *whole person* (face, arms,
legs, hands), which is useless as a try-on cutout. This service refines the
person cutout into a garment-only RGBA image:

1. Skin removal      - strips face / arms / hands / legs / feet via HSV skin
                       detection, so a "girl in a dress" becomes just the dress.
2. Largest component - keeps the main garment mass and drops stray artifacts
                       (hair, skin flakes, background fragments).
3. Mask completion   - morphological closing plus a row-wise left/right
                       symmetry fill that "reconstructs" silhouette regions
                       hidden behind a hand / arm / pose.
4. Silhouette smoothing - final clean edges for a crisp cutout.
"""

from typing import Tuple

import cv2
import numpy as np

# Categories whose silhouette is roughly left/right symmetric, so symmetry
# completion is a safe reconstruction strategy for them.
_SYMMETRIC_CATEGORIES = ("top", "dress", "jacket", "bottom")


def _skin_mask(rgb: np.ndarray, person_mask: np.ndarray) -> np.ndarray:
    """
    Conservative skin detection in YCrCb + HSV.

    YCrCb's classic Cr/Cb box covers light, medium and deep skin tones, while
    saturated reds (a very common garment colour) fall *outside* it — so a red
    dress is not mistaken for skin. The HSV branch only kicks in for darker
    skin tones and is gated on low saturation for the same reason.
    """
    ycrcb = cv2.cvtColor(rgb, cv2.COLOR_RGB2YCrCb)
    y, cr, cb = ycrcb[:, :, 0], ycrcb[:, :, 1], ycrcb[:, :, 2]
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    h, s, v = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]

    skin = np.zeros(person_mask.shape, dtype=bool)
    # Classic YCrCb box (light -> deep skin tones)
    skin |= (cr >= 133) & (cr <= 173) & (cb >= 77) & (cb <= 127) & (v > 60)
    # Looser box + warm low-saturation hue for darker / shadowed skin
    dark = (cr >= 100) & (cr <= 173) & (cb >= 55) & (cb <= 127) & (y >= 40) & (v >= 40)
    warm_hue = ((h <= 25) | (h >= 170)) & (s < 160) & (v >= 40)
    skin |= dark & warm_hue

    skin &= person_mask
    return skin


def _largest_component(mask: np.ndarray) -> np.ndarray:
    n, labels, stats, _ = cv2.connectedComponentsWithStats((mask > 0).astype(np.uint8), connectivity=8)
    if n <= 1:
        return ((mask > 0).astype(np.uint8)) * 255
    idx = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
    return (labels == idx).astype(np.uint8) * 255


def _fill_holes(mask: np.ndarray) -> np.ndarray:
    """
    Fill fully-enclosed background regions inside the silhouette.

    Standard trick: invert (holes + outside become 255), flood-fill the
    outside region back to 0 from the border, whatever stays 255 is an
    enclosed hole.
    """
    m = (mask > 0).astype(np.uint8) * 255
    h, w = m.shape
    temp = cv2.copyMakeBorder(m, 1, 1, 1, 1, cv2.BORDER_CONSTANT, value=0)
    inv = cv2.bitwise_not(temp)
    ffmask = np.zeros((h + 4, w + 4), np.uint8)
    cv2.floodFill(inv, ffmask, (0, 0), 0)
    holes = inv[1:-1, 1:-1]
    return np.where((holes > 0) | (m > 0), 255, 0).astype(np.uint8)


def _neckline_row(mask: np.ndarray) -> int:
    """
    Estimate the shoulder/neckline row.

    Robust to flared dresses: first find the narrowest row in the middle of
    the silhouette (the waist), then the shoulder line is the widest row above
    it. This keeps the skirt flare from being mistaken for the shoulders.
    """
    ys, xs = np.nonzero((mask > 0).astype(np.uint8))
    if len(ys) < 60:
        return 0
    top, bottom = int(ys.min()), int(ys.max())
    height = bottom - top
    if height < 30:
        return 0

    def row_width(y: int) -> int:
        idx = xs[ys == y]
        return int(idx.max() - idx.min()) if len(idx) else 0

    # Waist: narrowest row in the middle band (ignore the empty neck rows).
    w0 = top + max(2, int(height * 0.15))
    w1 = top + max(w0 + 1, int(height * 0.7))
    waist = min(
        range(w0, min(w1, bottom)),
        key=lambda y: row_width(y) if row_width(y) > 0 else 10 ** 9,
    )

    # Shoulders: widest row between just above the neck and the waist.
    # Prefer the LAST row holding (near-)max width so a vertical plateau
    # (e.g. straight bust) does not lift the shoulder line into the neck.
    s_start = top + max(2, int(height * 0.02))
    bw = max(
        (row_width(y) for y in range(s_start, max(s_start + 1, waist))),
        default=0,
    )
    best_y = s_start
    for y in range(s_start, max(s_start + 1, waist)):
        if row_width(y) >= bw * 0.97:
            best_y = y
    return best_y


def _reopen_neckline(mask: np.ndarray) -> np.ndarray:
    """
    Re-open enclosed holes that sit in the neckline (top-centre) region.

    `_fill_holes` fills *every* enclosed hole, including the crew-neck / V-neck
    opening. Filling that makes the neck, skin and hair inside the opening show
    through as opaque garment -- the classic "hair at the neckline" artifact.
    Holes above the shoulder line and near the horizontal centre are the neck
    opening, so they are cut back open.
    """
    m = (mask > 0).astype(np.uint8)
    h, w = m.shape
    shoulder = _neckline_row(mask)
    if shoulder <= 0:
        return mask

    # Connected components of the background (4-connectivity so diagonal
    # outside pixels don't seal the neck opening).
    bg = 1 - m
    n, labels, stats, _ = cv2.connectedComponentsWithStats(bg, connectivity=4)
    out = m.copy()
    for i in range(1, n):
        x, y, ww, hh, area = stats[i]
        if area < 4:
            continue
        # Open (border-touching) regions are not holes; keep them as-is.
        if x == 0 or y == 0 or x + ww >= w or y + hh >= h:
            continue
        cy = y + hh / 2.0
        cx = x + ww / 2.0
        # Only holes in the neckline region: above the shoulder line, centred.
        if cy > shoulder:
            continue
        if not (0.25 * w < cx < 0.75 * w):
            continue
        out[labels == i] = 0
    return out * 255


def _remove_hair_above_neckline(mask: np.ndarray, rgb: np.ndarray) -> np.ndarray:
    """
    Remove hair that drapes over the shoulders / around the neckline.

    Hair is generally dark or warm-brown; in the region strictly above the
    shoulder line the only legitimate garment content is the neckline itself,
    which is protected by a central band around the shoulder row. To stay safe
    on garments whose colour overlaps hair ranges (a red or brown dress), a
    pixel is only removed when it is ALSO far from the garment's dominant
    colour.
    """
    m = (mask > 0).astype(np.uint8)
    h, w = m.shape
    ys, xs = np.nonzero(m)
    if len(ys) < 100:
        return mask
    top, bottom = int(ys.min()), int(ys.max())
    height = bottom - top
    if height < 40:
        return mask

    # Dominant garment colour (median of the current mask pixels).
    px = rgb[m > 0].astype(np.int32)
    dom = np.median(px, axis=0)
    gar_dist = np.abs(rgb.astype(np.int32) - dom).sum(axis=2)
    garment_colour = gar_dist < 140

    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)
    hh, s, v = hsv[:, :, 0], hsv[:, :, 1], hsv[:, :, 2]
    dark = v < 120
    warm_brown = ((hh <= 30) | (hh >= 175)) & (v < 200) & (s < 220)
    hair = (dark | warm_brown) & ~garment_colour

    # Shoulder row estimated from garment-coloured pixels only, so long hair
    # sticking out wider than the shoulders does not lift the shoulder line.
    gar_mask = ((m > 0) & garment_colour).astype(np.uint8) * 255
    shoulder = _neckline_row(gar_mask)
    if shoulder <= 0:
        return mask

    remove = (m > 0) & hair
    # Small band above the garment top: any hair-coloured pixel there (and far
    # from the garment colour) is hair draped down over the shoulders.
    rem_start = max(0, top - max(12, int(height * 0.08)))
    remove[:rem_start, :] = False
    remove[shoulder:, :] = False

    # Protect only the collar zone (rows at / just above the shoulder line) so
    # a dark collar or strap is not eaten, but hair sitting higher up in the
    # neckline opening still gets cleared.
    xs_s = xs[ys == shoulder]
    if len(xs_s):
        mid = (int(xs_s.min()) + int(xs_s.max())) / 2.0
        band = max(6, int((xs_s.max() - xs_s.min()) * 0.3))
        x0, x1 = max(0, int(mid) - band), min(w, int(mid) + band)
        protect = np.zeros_like(remove)
        protect[max(0, shoulder - 4):shoulder + 1, x0:x1] = True
        remove &= ~protect

    out = m & ~remove
    return out.astype(np.uint8) * 255


def _complete_symmetric(mask: np.ndarray) -> np.ndarray:
    """
    Reconstruct silhouette regions hidden behind a hand / arm.

    For each row, if one side of the garment silhouette is much shorter than
    the other, extend the short side by mirroring the long side across the
    row's midpoint. This restores a clean, full garment outline (e.g. a waist
    covered by a hand) without flattening genuinely asymmetric designs.
    """
    m = (mask > 0)
    h, w = m.shape
    ys, xs = np.nonzero(m)
    if len(ys) == 0:
        return mask
    out = m.copy()
    for y in range(h):
        idxs = xs[ys == y]
        if len(idxs) < 2:
            continue
        l0, r1 = int(idxs.min()), int(idxs.max())
        mid = (l0 + r1) / 2.0
        left_span = mid - l0
        right_span = r1 - mid
        if left_span < right_span * 0.7:
            new_left = max(0, int(round(mid - right_span)))
            out[y, new_left:l0] = True
        elif right_span < left_span * 0.7:
            new_right = min(w - 1, int(round(mid + left_span)))
            out[y, r1 + 1:new_right + 1] = True
    return (out * 255).astype(np.uint8)


def extract_garment(rgba: np.ndarray, category: str = "dress") -> np.ndarray:
    """
    Refine a person cutout into a garment-only RGBA image.

    Args:
        rgba: RGBA image where the alpha channel is the person cutout
            (e.g. produced by rembg).
        category: garment category hint controlling which heuristics apply.

    Returns:
        RGBA image whose alpha channel covers only the garment.
    """
    alpha = rgba[:, :, 3]
    person_mask = alpha > 128

    if not person_mask.any():
        return rgba

    # 1. Skin removal
    skin = _skin_mask(rgba[:, :, :3], person_mask)
    mask = person_mask & ~skin

    # 2. Keep the main garment mass
    mask = _largest_component(mask.astype(np.uint8))

    # 3. Fill holes (e.g. a hand covering the waist leaves a gap in the dress)
    mask = _fill_holes(mask)

    # 3a. Strip hair draping over the shoulders / around the neckline. Run
    # before mirroring so one-sided hair is not amplified to the other side.
    if category in _SYMMETRIC_CATEGORIES:
        mask = _remove_hair_above_neckline(mask, rgba[:, :, :3])

    # 3b. Reconstruct silhouette hidden behind hands / arms / pose
    if category in _SYMMETRIC_CATEGORIES:
        mask = _complete_symmetric(mask)

    # 3c. Re-open the neckline: never let the neck/skin/hair inside a crew-neck
    # or V-neck opening show through as opaque garment.
    if category in _SYMMETRIC_CATEGORIES:
        mask = _reopen_neckline(mask)
        mask = _largest_component(mask)

    # 4. Closing + smoothing for a clean silhouette
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    mask = cv2.GaussianBlur(mask.astype(np.float32), (5, 5), 0)
    mask = (mask > 128).astype(np.uint8) * 255

    out = np.zeros_like(rgba)
    out[:, :, :3] = rgba[:, :, :3]
    out[:, :, 3] = mask
    return out


def compute_flare(mask: np.ndarray) -> bool:
    """
    Heuristic: does the garment silhouette flare out below the waist
    (i.e. an A-line / flared dress or skirt)?
    """
    ys, xs = np.nonzero((mask > 0).astype(np.uint8))
    if len(ys) < 50:
        return False
    top = ys.min()
    bottom = ys.max()
    if bottom - top < 30:
        return False

    def row_width(y: int) -> int:
        row = xs[ys == y]
        return int(row.max() - row.min()) if len(row) else 0

    top_w = row_width(top + int((bottom - top) * 0.15))
    mid_w = row_width(top + int((bottom - top) * 0.45))
    bot_w = row_width(bottom - int((bottom - top) * 0.1))
    # Flared when the bottom is clearly wider than the narrowest middle point
    return bot_w > mid_w * 1.4 and bot_w > top_w


def compute_top_ratio(mask: np.ndarray) -> float:
    """
    Bodice signal: widest width in the top of the silhouette divided by the
    waist (narrowest mid) width.

    A dress/top has shoulders and bust above the waist, so this ratio is well
    above 1.0. A skirt is a waist-to-hem column with nothing above the waist,
    so its widest top point IS the waist and the ratio is near 1.0. This is
    what tells an A-line *dress* apart from a flared *skirt* on geometry alone.
    Returns 1.0 when the mask is too small to analyse.
    """
    ys, xs = np.nonzero((mask > 0).astype(np.uint8))
    if len(ys) < 50:
        return 1.0
    top = int(ys.min())
    bottom = int(ys.max())
    height = bottom - top
    if height < 30:
        return 1.0

    def row_width(y: int) -> int:
        row = xs[ys == y]
        return int(row.max() - row.min()) if len(row) else 0

    # Waist: narrowest row in the middle band (same idea as compute_flare).
    w0 = top + int(height * 0.2)
    w1 = top + int(height * 0.65)
    waist = min(range(w0, min(w1, bottom)), key=lambda y: row_width(y) or 10 ** 9)
    waist_w = max(1, row_width(waist))

    # Widest row above the waist (shoulders / bust).
    top_w = max((row_width(y) for y in range(top, max(top + 1, waist))), default=1)
    return top_w / waist_w
