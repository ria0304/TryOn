"""
Garment-only extraction from a photo of a person wearing clothes.

rembg's generic foreground segmentation can retain the *whole person* (face,
arms, legs, hands), which is unusable as a dress-up asset. This module refines
that foreground into a canonical garment-only RGBA image. Its Phase 1 path:

1. removes pose-identified head, limbs and hands using BlazePose geometry;
2. uses skin detection only as a secondary clean-up for exposed body pixels;
3. retains every remaining component and the original alpha values exactly;
4. records contour, bounds, confidence and warnings for later fitting.

It intentionally never fills holes, mirrors missing fabric, smooths alpha, or
uses a largest-component rule: the asset must contain photographed garment
pixels only, including real negative spaces and disconnected details.
"""

from dataclasses import asdict, dataclass
from typing import Dict, List, Optional, Tuple

import cv2
import numpy as np

try:
    import mediapipe as mp
except ImportError:  # pragma: no cover - dependency is required in production
    mp = None

# Categories whose silhouette is roughly left/right symmetric, so symmetry
# completion is a safe reconstruction strategy for them.
_SYMMETRIC_CATEGORIES = ("top", "dress", "jacket", "bottom")


@dataclass
class CanonicalGarmentMetadata:
    """Describes a verified, non-synthetic garment cutout.

    ``alpha_mask_url`` is filled by the upload route after the mask is saved.
    Contours use source-image pixel coordinates so a later fitting stage can
    derive a mesh from the real garment outline rather than a rectangle.
    """
    category: str
    alpha_mask_url: Optional[str]
    bounding_box: Dict[str, int]
    contours: List[List[List[int]]]
    extraction_confidence: float
    extraction_warnings: List[str]

    def to_dict(self) -> Dict[str, object]:
        return asdict(self)


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


def _remove_non_garment_above_neckline(mask: np.ndarray, rgb: np.ndarray) -> np.ndarray:
    """
    Fallback cleanup for photos where no human pose was detected (product
    shots on a headless mannequin bust, flat-lays, ghost-mannequin photos).

    `_pose_exclusion_mask` needs BlazePose landmarks to know where a head or
    limbs are; a mannequin bust has neither, so that exclusion silently does
    nothing and the mannequin's neck post/finial and any jewellery on the
    bust stay in the "garment-only" asset. This is a colour-based fallback
    for exactly that gap: above the neckline, anything that doesn't match
    the garment's own dominant fabric colour is not garment fabric (it's
    mannequin material, a chain, a tag, etc.) and is stripped. The collar
    band right at the shoulder line is protected so a strap or trim in a
    different colour from the dominant fabric survives.
    """
    m = (mask > 0).astype(np.uint8)
    h, w = m.shape
    ys, xs = np.nonzero(m)
    if len(ys) < 100:
        return mask
    top, bottom = int(ys.min()), int(ys.max())
    if bottom - top < 40:
        return mask

    px = rgb[m > 0].astype(np.int32)
    dom = np.median(px, axis=0)
    dist = np.abs(rgb.astype(np.int32) - dom).sum(axis=2)
    garment_colour = dist < 140

    gar_mask = (m.astype(bool) & garment_colour).astype(np.uint8) * 255
    shoulder = _neckline_row(gar_mask)
    if shoulder <= 0:
        return mask

    remove = m.astype(bool) & ~garment_colour
    remove[shoulder:, :] = False

    xs_s = xs[ys == shoulder]
    if len(xs_s):
        mid = (int(xs_s.min()) + int(xs_s.max())) / 2.0
        band = max(6, int((xs_s.max() - xs_s.min()) * 0.3))
        x0, x1 = max(0, int(mid) - band), min(w, int(mid) + band)
        protect = np.zeros_like(remove)
        protect[max(0, shoulder - 4):shoulder + 1, x0:x1] = True
        remove &= ~protect

    out = m.astype(bool) & ~remove
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


def _pose_exclusion_mask(rgb: np.ndarray) -> Tuple[np.ndarray, bool]:
    """Return a conservative mask for visible *human* parts.

    This is deliberately geometry/pose based, not colour based: head, arms,
    hands and exposed legs are identified from BlazePose landmarks and removed
    as body regions.  The torso is not masked because it is where the garment
    lives.  Skin detection remains a small secondary clean-up only for exposed
    torso pixels that pose geometry cannot describe.
    """
    h, w = rgb.shape[:2]
    empty = np.zeros((h, w), dtype=np.uint8)
    if mp is None:
        return empty, False

    pose = mp.solutions.pose.Pose(static_image_mode=True, min_detection_confidence=0.5)
    try:
        result = pose.process(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
    finally:
        pose.close()
    if not result.pose_landmarks:
        return empty, False

    lms = result.pose_landmarks.landmark
    landmark = mp.solutions.pose.PoseLandmark

    def point(name):
        lm = lms[landmark[name].value]
        if lm.visibility < 0.35:
            return None
        return (int(np.clip(lm.x * w, 0, w - 1)), int(np.clip(lm.y * h, 0, h - 1)))

    def line(a, b, radius):
        if a and b:
            cv2.line(empty, a, b, 255, max(1, radius), cv2.LINE_AA)

    left_shoulder, right_shoulder = point("LEFT_SHOULDER"), point("RIGHT_SHOULDER")
    shoulder_width = int(np.hypot(*(np.subtract(left_shoulder, right_shoulder)))) if left_shoulder and right_shoulder else max(16, w // 8)
    head_center = point("NOSE")
    if head_center:
        cv2.circle(empty, head_center, max(shoulder_width // 2, 18), 255, -1, cv2.LINE_AA)

    for side in ("LEFT", "RIGHT"):
        shoulder, elbow, wrist = point(f"{side}_SHOULDER"), point(f"{side}_ELBOW"), point(f"{side}_WRIST")
        hip, knee, ankle = point(f"{side}_HIP"), point(f"{side}_KNEE"), point(f"{side}_ANKLE")
        line(shoulder, elbow, max(5, shoulder_width // 9))
        line(elbow, wrist, max(5, shoulder_width // 10))
        if wrist:
            cv2.circle(empty, wrist, max(7, shoulder_width // 10), 255, -1, cv2.LINE_AA)
        line(hip, knee, max(7, shoulder_width // 7))
        line(knee, ankle, max(6, shoulder_width // 8))
        if ankle:
            cv2.circle(empty, ankle, max(8, shoulder_width // 9), 255, -1, cv2.LINE_AA)
    return empty, True


def _category_region_mask(shape: Tuple[int, int], category: str, pose_available: bool, pose_mask: np.ndarray) -> np.ndarray:
    """Keep the body-height band where the selected garment category belongs.

    The mask is intentionally generous horizontally so sleeves, straps and
    flared hems survive.  If pose is unavailable, no guessed crop is applied.
    """
    # Never crop the asset to a guessed body-height band. A photograph may be
    # tightly cropped, tilted, seated, or contain a long coat/dress; a wrong
    # category band would destroy genuine sleeves, straps or hems. Category is
    # recorded as metadata in Phase 1 and will guide mesh fitting in Phase 2.
    h, w = shape
    return np.full((h, w), 255, dtype=np.uint8)


def _mask_metadata(mask: np.ndarray, category: str, warnings: List[str], pose_available: bool) -> CanonicalGarmentMetadata:
    contours, _ = cv2.findContours((mask > 0).astype(np.uint8), cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    points: List[List[List[int]]] = []
    for contour in contours:
        simplified = cv2.approxPolyDP(contour, 1.5, True).reshape(-1, 2)
        if len(simplified) >= 3:
            points.append([[int(x), int(y)] for x, y in simplified])
    ys, xs = np.nonzero(mask > 0)
    if len(xs) == 0:
        box = {"x": 0, "y": 0, "width": 0, "height": 0}
        warnings.append("No garment pixels remained after extraction.")
    else:
        box = {"x": int(xs.min()), "y": int(ys.min()), "width": int(xs.max() - xs.min() + 1), "height": int(ys.max() - ys.min() + 1)}
    confidence = 0.92 if pose_available else 0.68
    if warnings:
        confidence = min(confidence, 0.70)
    return CanonicalGarmentMetadata(category, None, box, points, confidence, warnings)


def extract_canonical_garment(rgba: np.ndarray, category: str = "dress") -> Tuple[np.ndarray, np.ndarray, CanonicalGarmentMetadata]:
    """Create the authoritative, non-synthetic RGBA garment asset.

    Unlike the legacy extractor, this function never fills holes, mirrors
    missing regions, blurs the alpha, or discards components solely because
    they are smaller than another component. Every retained pixel comes from
    the uploaded image and the alpha remains the actual retained alpha.
    """
    alpha = rgba[:, :, 3]
    person_mask = alpha > 0
    warnings: List[str] = []
    if not person_mask.any():
        metadata = _mask_metadata(np.zeros_like(alpha), category, ["The upload has no visible foreground alpha."], False)
        return np.zeros_like(rgba), np.zeros_like(alpha), metadata

    pose_mask, pose_available = _pose_exclusion_mask(rgba[:, :, :3])
    if not pose_available:
        warnings.append("Body pose could not be verified; review this cutout before fitting.")

    # Body-part exclusion is primarily semantic/pose geometry. Colour is only
    # a secondary clean-up for exposed skin that remains inside the otherwise
    # valid garment region (for example a deep neckline or bare midriff).
    candidate = person_mask & (pose_mask == 0)
    if pose_available:
        # Only clean skin immediately adjacent to a pose-identified body part.
        # This avoids treating a beige/tan garment as skin based on colour
        # alone, while still clearing exposed neck/limb-edge pixels that leak
        # out of the conservative pose capsules.
        body_margin = cv2.dilate(pose_mask, np.ones((11, 11), np.uint8)) > 0
        skin = _skin_mask(rgba[:, :, :3], candidate)
        candidate &= ~(skin & body_margin)
    else:
        warnings.append("No pose-based body mask was available; a colour-based fallback removed non-garment content (mannequin parts, jewellery) above the neckline instead.")
        cleaned = _remove_non_garment_above_neckline(
            np.where(candidate, 255, 0).astype(np.uint8), rgba[:, :, :3]
        )
        candidate &= cleaned > 0
    candidate &= _category_region_mask(alpha.shape, category, pose_available, pose_mask) > 0

    # Keep all surviving components: straps, belt tails, split hems and other
    # legitimate disconnected garment detail are part of the canonical asset.
    canonical_alpha = np.where(candidate, alpha, 0).astype(np.uint8)
    out = np.zeros_like(rgba)
    out[:, :, :3] = rgba[:, :, :3]
    out[:, :, 3] = canonical_alpha
    metadata = _mask_metadata(canonical_alpha, category, warnings, pose_available)
    return out, canonical_alpha, metadata


def extract_garment(rgba: np.ndarray, category: str = "dress") -> Tuple[np.ndarray, np.ndarray]:
    """
    Refine a person cutout into a garment-only RGBA image.

    Args:
        rgba: RGBA image where the alpha channel is the person cutout
            (e.g. produced by rembg).
        category: garment category hint controlling which heuristics apply.

    Returns:
        (out, strict_alpha) where:
        - out: RGBA image whose alpha channel is the canonical garment mask.
          It contains no filled, mirrored, or otherwise invented pixels.
        - strict_alpha: the same retained source alpha, returned for backward
          compatibility with fitting and colour-analysis callers.
    """
    out, strict_alpha, _metadata = extract_canonical_garment(rgba, category)
    return out, strict_alpha


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
