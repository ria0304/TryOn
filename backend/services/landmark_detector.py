import cv2
import numpy as np
import mediapipe as mp
from typing import Dict, List, Tuple, Optional

# Categories that map to a torso garment with shoulders + waist + hem.
TOP_CATEGORIES = {
    "top", "shirt", "jacket", "hoodie", "coat", "cardigan", "blazer",
    "sweater", "tank", "crop top",
}
BOTTOM_CATEGORIES = {"bottom", "pants", "shorts", "jeans", "trousers", "leggings"}
SMALL_CATEGORIES = {"shoes", "bag", "jewellery", "accessories"}


def _row_spans(mask: np.ndarray) -> Dict[int, Tuple[int, int]]:
    """Map row -> (left, right) of nonzero pixels in the mask."""
    ys, xs = np.nonzero((mask > 0))
    if len(ys) == 0:
        return {}
    order = np.argsort(ys, kind="stable")
    ys, xs = ys[order], xs[order]
    spans: Dict[int, Tuple[int, int]] = {}
    start = 0
    for i in range(1, len(ys) + 1):
        if i == len(ys) or ys[i] != ys[start]:
            spans[int(ys[start])] = (int(xs[start]), int(xs[i - 1]))
            start = i
    return spans


def _best_row(spans: Dict[int, Tuple[int, int]], y0: int, y1: int, maximize: bool) -> int:
    best, bw = y0, (-1 if maximize else 10 ** 9)
    for y in range(y0, y1 + 1):
        s = spans.get(y)
        if not s:
            continue
        w = s[1] - s[0]
        if (maximize and w > bw) or (not maximize and w < bw):
            best, bw = y, w
    return best


def _bbox_landmarks(mask: np.ndarray, h: int, w: int) -> Dict[str, Tuple[int, int]]:
    ys, xs = np.nonzero((mask > 0))
    l, r, t, b = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    cx, cy = (l + r) // 2, (t + b) // 2
    return {
        "center": (cx, cy),
        "top": (cx, t),
        "bottom": (cx, b),
        "left": (l, cy),
        "right": (r, cy),
    }


def _bottoms_landmarks(
    mask: np.ndarray,
    h: int,
    w: int,
    top: int,
    bottom: int,
    height: int,
    spans: Dict[int, Tuple[int, int]],
) -> Dict[str, Tuple[int, int]]:
    """Landmarks for bottoms and skirts: the garment begins at the waistband,
    so the neckline/shoulder/bust torso model does not apply. The waist is the
    waistband -- the top edge of the garment -- the hips the widest row just
    below it, and the hem the bottom edge. This is what anchors pants at the
    mannequin's waist instead of the torso being mistaken for a pair of legs."""
    def span(y):
        return spans.get(y)

    # The waistband is the top of the garment. Use the widest row in a tight
    # band near the top edge (robust to a slightly curved/ragged top seam), but
    # never let the search descend into the hips below.
    band_bot = min(bottom, top + max(2, int(height * 0.05)))
    waist_row = _best_row(spans, top, band_bot, maximize=True)
    w_span = span(waist_row) or span(top)
    left_waist = (w_span[0], waist_row)
    right_waist = (w_span[1], waist_row)
    waist_center = ((w_span[0] + w_span[1]) // 2, waist_row)

    hip_bot = min(bottom, waist_row + max(5, int(height * 0.32)))
    hip_row = _best_row(spans, waist_row, hip_bot, maximize=True)
    hip_span = span(hip_row) or w_span
    left_hip = (hip_span[0], hip_row)
    right_hip = (hip_span[1], hip_row)

    hip_w = max(8, hip_span[1] - hip_span[0])
    hem_row = bottom
    for y in range(bottom, top - 1, -1):
        s = span(y)
        if s and (s[1] - s[0]) >= hip_w * 0.5:
            hem_row = y
            break
    hem_span = span(hem_row) or hip_span

    return {
        "left_waist": left_waist,
        "right_waist": right_waist,
        "waist_center": waist_center,
        "left_hip": left_hip,
        "right_hip": right_hip,
        "hem_left": (hem_span[0], hem_row),
        "hem_right": (hem_span[1], hem_row),
        "flare": (hem_span[1] - hem_span[0]) / max(hip_w, 1),
        "hem_ratio": (hem_row - waist_row) / max(hip_row - waist_row, 1),
        "length_ratio": (hem_row - hip_row) / max(height, 1),
    }


def garment_landmarks_from_mask(mask: np.ndarray, category: str) -> Dict[str, Tuple[int, int]]:
    """
    Detect garment landmarks from the cutout silhouette.

    Instead of bounding-box fractions, each landmark is derived from the real
    silhouette profile: the neckline is the top edge, the shoulders are the
    widest band below the neck (inset so straps land on the shoulder joint),
    the bust is the widest row below the shoulders, the waist is the narrowest
    row below the bust, and the hips are the widest row below the waist. The
    hem is the bottom edge. Extra metadata (`sleeved`, `flare`, `hem_ratio`,
    `length_ratio`) drives how the garment is mapped and scaled onto the
    mannequin.
    """
    if mask is None or mask.size == 0 or not np.any(mask):
        return {}

    if mask.dtype != np.uint8:
        mask = (mask > 0).astype(np.uint8) * 255

    h, w = mask.shape[:2]
    ys, xs = np.nonzero((mask > 0))
    if len(ys) < 30:
        return _bbox_landmarks(mask, h, w)

    top, bottom = int(ys.min()), int(ys.max())
    height = bottom - top
    spans = _row_spans(mask)

    def span(y):
        return spans.get(y)

    # Bottoms and skirts start at the waistband -- the neckline/shoulder/bust
    # torso model does not apply, so use the dedicated bottoms landmarks.
    if category in BOTTOM_CATEGORIES or category == "skirt":
        return _bottoms_landmarks(mask, h, w, top, bottom, height, spans)

    # --- neckline ------------------------------------------------------
    t_span = span(top)
    neck = ((t_span[0] + t_span[1]) // 2, top)

    # --- shoulders (widest band just below the neck) -------------------
    band_top = top + max(2, int(height * 0.04))
    band_bot = min(bottom, top + int(height * 0.22))
    if band_bot <= band_top:
        band_bot = min(bottom, band_top + 2)
    shoulder_row = _best_row(spans, band_top, band_bot, maximize=True)
    s_span = span(shoulder_row) or t_span
    s_w = s_span[1] - s_span[0]
    inset = max(3, int(s_w * 0.12))
    left_shoulder = (s_span[0] + inset, shoulder_row)
    right_shoulder = (s_span[1] - inset, shoulder_row)

    # --- sleeve end (where the shoulder plateau narrows to the torso) --
    # Scan far enough down to catch long sleeves (a 3/4 or full sleeve ends
    # well below a quarter of the garment height).
    sleeve_end = shoulder_row
    scan_end = min(bottom, shoulder_row + max(10, int(height * 0.60)))
    for y in range(shoulder_row + 1, scan_end):
        s = span(y)
        if s and (s[1] - s[0]) < s_w * 0.9:
            sleeve_end = y
            break
    torso_span = span(sleeve_end) or s_span
    torso_w = torso_span[1] - torso_span[0]

    # --- armpits (side of the torso just under the shoulder) -----------
    left_armpit = (torso_span[0] + 1, sleeve_end)
    right_armpit = (torso_span[1] - 1, sleeve_end)

    # --- waist (narrowest row in the middle of the silhouette) ---------
    w_top = max(sleeve_end, top + int(height * 0.15))
    w_bot = min(bottom, top + int(height * 0.65))
    if w_bot <= w_top:
        w_bot = min(bottom, w_top + 2)
    waist_row = _best_row(spans, w_top, w_bot, maximize=False)
    w_span = span(waist_row) or torso_span
    left_waist = (w_span[0], waist_row)
    right_waist = (w_span[1], waist_row)
    waist_center = ((w_span[0] + w_span[1]) // 2, waist_row)

    # --- bust (widest row between the sleeve end and the waist) --------
    b_top = max(sleeve_end, top + int(height * 0.05))
    b_bot = max(b_top + 1, waist_row)
    bust_row = _best_row(spans, b_top, min(b_bot, bottom), maximize=True)
    b_span = span(bust_row) or torso_span
    left_bust = (b_span[0], bust_row)
    right_bust = (b_span[1], bust_row)
    chest_center = ((b_span[0] + b_span[1]) // 2, bust_row)

    # --- hips (widest row just below the waist) ------------------------
    h_top = waist_row
    h_bot = min(bottom, waist_row + max(int(height * 0.20), 2))
    hip_row = _best_row(spans, h_top, h_bot, maximize=True)
    hip_span = span(hip_row) or w_span
    left_hip = (hip_span[0], hip_row)
    right_hip = (hip_span[1], hip_row)

    # --- hem (bottom edge, skipping a stray tail of pixels) ------------
    hip_w = max(8, hip_span[1] - hip_span[0])
    hem_row = bottom
    for y in range(bottom, top - 1, -1):
        s = span(y)
        if s and (s[1] - s[0]) >= hip_w * 0.5:
            hem_row = y
            break
    hem_span = span(hem_row) or hip_span
    left_hem = (hem_span[0], hem_row)
    right_hem = (hem_span[1], hem_row)

    return {
        "neck": neck,
        "left_shoulder": left_shoulder,
        "right_shoulder": right_shoulder,
        # Outer silhouette edges of the shoulder row. The (inset) shoulder
        # points approximate the shoulder joints; these edges are the garment's
        # real width there, used by the fitting stage to size the garment
        # proportionally (uniform scale) without oversizing it.
        "left_shoulder_edge": (s_span[0], shoulder_row),
        "right_shoulder_edge": (s_span[1], shoulder_row),
        "left_armpit": left_armpit,
        "right_armpit": right_armpit,
        "left_bust": left_bust,
        "right_bust": right_bust,
        "chest_center": chest_center,
        "left_waist": left_waist,
        "right_waist": right_waist,
        "waist_center": waist_center,
        "left_hip": left_hip,
        "right_hip": right_hip,
        "hem_left": left_hem,
        "hem_right": right_hem,
        "sleeved": s_w >= max(torso_w, 1) * 1.32 and sleeve_end > shoulder_row,
        # Row where the shoulder plateau narrows to the torso (sleeve hem for
        # sleeved garments). The fitting stage uses it to leave the sleeve band
        # at its natural width instead of squeezing it to the torso silhouette.
        "sleeve_end": sleeve_end,
        "flare": (hem_span[1] - hem_span[0]) / max(hip_span[1] - hip_span[0], 1),
        "hem_ratio": (hem_row - waist_row) / max(hip_row - waist_row, 1),
        "length_ratio": (hem_row - hip_row) / max(height, 1),
    }


def _shoulder_target(garment_lms: Dict, body_lms: Dict, side: str):
    """Mannequin shoulder target: the joint itself, or for sleeved garments
    the midpoint toward the elbow so sleeves wrap the upper arm."""
    if garment_lms.get("sleeved"):
        sh = body_lms.get(side.upper() + "_SHOULDER")
        el = body_lms.get(side.upper() + "_ELBOW")
        if sh and el:
            return ((sh[0] + el[0]) // 2, (sh[1] + el[1]) // 2)
    return body_lms.get(side.upper() + "_SHOULDER")


def _add_flared_hem(mapping: List, garment_lms: Dict, body_lms: Dict) -> None:
    """Hem target for dresses/skirts: preserves the garment's own flare so an
    A-line hem drapes wide from the hips instead of being squeezed flat."""
    if "hem_left" not in garment_lms or "hem_right" not in garment_lms:
        return
    if "LEFT_HIP" not in body_lms or "RIGHT_HIP" not in body_lms:
        return
    hip_cx = (body_lms["LEFT_HIP"][0] + body_lms["RIGHT_HIP"][0]) // 2
    hip_w = abs(body_lms["RIGHT_HIP"][0] - body_lms["LEFT_HIP"][0])
    hip_y = body_lms["LEFT_HIP"][1]
    knee_y = body_lms.get("LEFT_KNEE", (0, hip_y))[1]
    ankle_y = body_lms.get("LEFT_ANKLE", (0, hip_y))[1]
    flare = garment_lms.get("flare", 1.0)
    length = garment_lms.get("length_ratio", 0.3)

    if length > 0.45:
        y = ankle_y - 10
    elif length > 0.25:
        y = (hip_y + knee_y) // 2
    else:
        y = knee_y + 10

    hem_w = hip_w * (min(flare * 0.85, 1.85) if flare > 1.25 else 0.95)
    mapping.append((garment_lms["hem_left"], (int(hip_cx - hem_w / 2), y)))
    mapping.append((garment_lms["hem_right"], (int(hip_cx + hem_w / 2), y)))


def map_garment_to_body(
    garment_lms: Dict[str, Tuple[int, int]],
    body_lms: Dict[str, Tuple[int, int]],
    category: str,
) -> List[Tuple[Tuple[int, int], Tuple[int, int]]]:
    """Map garment landmarks to the corresponding mannequin body landmarks.

    Each mapping entry is (source_point, target_point) used as control points
    for the thin-plate-spline warp. The target points live in the mannequin's
    coordinate space, so the warped garment lands exactly where the garment
    should be worn.
    """
    mapping: List[Tuple[Tuple[int, int], Tuple[int, int]]] = []

    def add(g_key, b_key):
        if g_key in garment_lms and b_key in body_lms:
            mapping.append((garment_lms[g_key], body_lms[b_key]))

    def add_to(g_key, target):
        if g_key in garment_lms and target is not None:
            mapping.append((garment_lms[g_key], target))

    if category in TOP_CATEGORIES:
        add_to("left_shoulder", _shoulder_target(garment_lms, body_lms, "left"))
        add_to("right_shoulder", _shoulder_target(garment_lms, body_lms, "right"))
        add("neck", "NECK")
        add("left_armpit", "LEFT_ARMPIT")
        add("right_armpit", "RIGHT_ARMPIT")
        add("left_bust", "LEFT_BUST")
        add("right_bust", "RIGHT_BUST")
        add("chest_center", "CHEST")
        add("left_waist", "LEFT_WAIST")
        add("right_waist", "RIGHT_WAIST")
        add("waist_center", "WAIST")
        # A long top drops to the hips; a crop top ends at the waist.
        anchor = "HIP" if garment_lms.get("hem_ratio", 0) > 0.55 else "WAIST"
        add("hem_left", "LEFT_" + anchor)
        add("hem_right", "RIGHT_" + anchor)

    elif category == "dress":
        add_to("left_shoulder", _shoulder_target(garment_lms, body_lms, "left"))
        add_to("right_shoulder", _shoulder_target(garment_lms, body_lms, "right"))
        add("neck", "NECK")
        add("left_bust", "LEFT_BUST")
        add("right_bust", "RIGHT_BUST")
        add("chest_center", "CHEST")
        add("left_waist", "LEFT_WAIST")
        add("right_waist", "RIGHT_WAIST")
        add("waist_center", "WAIST")
        add("left_hip", "LEFT_HIP")
        add("right_hip", "RIGHT_HIP")
        _add_flared_hem(mapping, garment_lms, body_lms)

    elif category == "skirt":
        add("left_waist", "LEFT_WAIST")
        add("right_waist", "RIGHT_WAIST")
        add("waist_center", "WAIST")
        add("left_hip", "LEFT_HIP")
        add("right_hip", "RIGHT_HIP")
        _add_flared_hem(mapping, garment_lms, body_lms)

    elif category in BOTTOM_CATEGORIES:
        add("left_waist", "LEFT_WAIST")
        add("right_waist", "RIGHT_WAIST")
        add("waist_center", "WAIST")
        add("left_hip", "LEFT_HIP")
        add("right_hip", "RIGHT_HIP")
        add("hem_left", "LEFT_ANKLE")
        add("hem_right", "RIGHT_ANKLE")

    elif category in SMALL_CATEGORIES:
        if "center" in garment_lms and "LEFT_ANKLE" in body_lms and "RIGHT_ANKLE" in body_lms:
            cx = (body_lms["LEFT_ANKLE"][0] + body_lms["RIGHT_ANKLE"][0]) // 2
            cy = body_lms["LEFT_ANKLE"][1] - 10
            mapping.append((garment_lms["center"], (cx, cy)))

    return mapping


class LandmarkDetector:
    def __init__(self):
        self.mp_pose = mp.solutions.pose
        self.pose = self.mp_pose.Pose(static_image_mode=True, min_detection_confidence=0.5)

    def detect_body_landmarks(self, image: np.ndarray) -> Dict[str, Tuple[int, int]]:
        """Detect body landmarks using MediaPipe BlazePose."""
        results = self.pose.process(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
        if not results.pose_landmarks:
            return {}

        h, w, _ = image.shape
        landmarks = {}
        for idx, lm in enumerate(results.pose_landmarks.landmark):
            name = self.mp_pose.PoseLandmark(idx).name
            landmarks[name] = (int(lm.x * w), int(lm.y * h))

        return landmarks

    def detect_garment_landmarks(self, mask: np.ndarray, category: str) -> Dict[str, Tuple[int, int]]:
        """Robustly detect garment landmarks from the cutout silhouette."""
        return garment_landmarks_from_mask(mask, category)

    def map_garment_to_body(
        self, garment_lms: Dict[str, Tuple[int, int]],
        body_lms: Dict[str, Tuple[int, int]],
        category: str,
    ) -> List[Tuple[Tuple[int, int], Tuple[int, int]]]:
        return map_garment_to_body(garment_lms, body_lms, category)
