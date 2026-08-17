"""Baseline and proposed-method fitting pipelines for the evaluation harness.

Every pipeline below is built ONLY from the real, unmodified functions in
`services/warping.py`, `services/landmark_detector.py` and
`services/fitting_service.py`. Nothing here reimplements pipeline logic --
the baselines are just different (weaker) compositions of the same building
blocks the real app uses, so the comparison is apples-to-apples:

  Resize        : cv2.resize + centered paste. No landmarks used at all.
  Affine        : cv2.getAffineTransform on 3 landmark correspondences
                   (services.warping.WarpingEngine.warp_affine).
  TPS           : full multi-point thin-plate-spline from garment landmarks
                   to body landmarks (the app's own "legacy" fallback path --
                   services.landmark_detector.map_garment_to_body +
                   services.warping.WarpingEngine.process_garment / warp_tps).
  TPS+silhouette: the TPS result above, then also run it through
                   conform_to_body_silhouette (the app's row-wise
                   silhouette-hugging stage) -- isolates how much of the
                   improvement comes from silhouette conforming alone,
                   without the proposed method's similarity-transform
                   placement.
  Proposed      : services.fitting_service.FittingService.fit_garment's
                   primary path -- similarity-transform placement
                   (compute_placement) + conform_to_body_silhouette +
                   feather_edges + add_depth_shading.

We don't instantiate the real `LandmarkDetector` / `FittingService` classes
here because their __init__ pulls in MediaPipe purely for real-photo BODY
pose detection (`detect_body_landmarks`), which this synthetic-mannequin
benchmark never calls -- the target body landmarks are always the
mannequin's fixed reference set. Garment-landmark detection
(`garment_landmarks_from_mask`) and every warping function are plain
NumPy/OpenCV and imported directly, so the actual production code is what
runs in every pipeline below.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Dict, Tuple

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/

from services.warping import WarpingEngine, TOP_CATEGORIES, BOTTOM_CATEGORIES  # noqa: E402
from services.landmark_detector import (  # noqa: E402
    garment_landmarks_from_mask,
    map_garment_to_body,
)
from services.fitting_service import compute_placement, _robust_span  # noqa: E402

WARP = WarpingEngine()


def detect_landmarks(rgba: np.ndarray, category: str) -> Dict[str, Tuple[int, int]]:
    return garment_landmarks_from_mask(rgba[:, :, 3], category)


def _center_paste(rgba: np.ndarray, target_size: Tuple[int, int], category: str) -> np.ndarray:
    tw, th = target_size
    h, w = rgba.shape[:2]
    if category in TOP_CATEGORIES or category == "dress":
        scale = (tw * 0.42) / w
    elif category in BOTTOM_CATEGORIES:
        scale = (tw * 0.42) / w
    else:
        scale = min((tw * 0.4) / w, (th * 0.4) / h)
    nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
    resized = cv2.resize(rgba, (nw, nh), interpolation=cv2.INTER_LINEAR)
    out = np.zeros((th, tw, 4), dtype=np.uint8)
    x0 = (tw - nw) // 2
    y0 = int(th * 0.05)
    y1, x1 = min(y0 + nh, th), min(x0 + nw, tw)
    out[y0:y1, x0:x1] = resized[0:y1 - y0, 0:x1 - x0]
    return out


def baseline_resize(rgba, garment_lms, body_lms, category, target_size) -> np.ndarray:
    """Baseline A: simple resize + centered paste. No landmark alignment."""
    return _center_paste(rgba, target_size, category)


def _triangle_area2(a, b, c) -> float:
    """Twice the signed area of triangle abc -- 0 means collinear."""
    return abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]))


def _first_noncollinear_triple(mapping):
    """Pick the first 3 mapping entries whose SOURCE points aren't (near)
    collinear -- `cv2.getAffineTransform` is singular on collinear input and
    produces garbage/empty output, which is what was happening for bottoms:
    `map_garment_to_body`'s first 3 entries for BOTTOM_CATEGORIES are
    left_waist, right_waist, waist_center -- and waist_center is exactly the
    midpoint of the other two, so `mapping[:3]` was always degenerate for
    pants/shorts/jeans. Walking the list for a non-degenerate triple keeps
    the baseline a genuine (if weak) 3-point affine fit instead of silently
    falling back to a center-paste, which would make the Affine baseline
    look artificially bad relative to the other methods."""
    n = len(mapping)
    for i in range(n):
        for j in range(i + 1, n):
            for k in range(j + 1, n):
                a, b, c = mapping[i][0], mapping[j][0], mapping[k][0]
                if _triangle_area2(a, b, c) > 1e-3:
                    return [mapping[i], mapping[j], mapping[k]]
    return None


def baseline_affine(rgba, garment_lms, body_lms, category, target_size) -> np.ndarray:
    """Baseline B: 3-point affine warp (garment -> body landmarks)."""
    mapping = map_garment_to_body(garment_lms, body_lms, category)
    if len(mapping) < 3:
        return _center_paste(rgba, target_size, category)
    triple = _first_noncollinear_triple(mapping)
    if triple is None:
        return _center_paste(rgba, target_size, category)
    src = np.array([m[0] for m in triple], dtype=np.float32)
    dst = np.array([m[1] for m in triple], dtype=np.float32)
    return WARP.warp_affine(rgba, src, dst, output_size=target_size)


def baseline_tps(rgba, garment_lms, body_lms, category, target_size) -> np.ndarray:
    """Baseline C: full multi-point TPS (the app's own legacy fallback path)."""
    mapping = map_garment_to_body(garment_lms, body_lms, category)
    if len(mapping) < 6:
        return _center_paste(rgba, target_size, category)
    return WARP.process_garment(rgba, mapping, target_size)


def baseline_tps_silhouette(rgba, garment_lms, body_lms, category, target_size) -> np.ndarray:
    """Baseline D: TPS above, then also silhouette-conform the result."""
    warped = baseline_tps(rgba, garment_lms, body_lms, category, target_size)
    alpha = warped[:, :, 3]
    if not alpha.any():
        return warped
    top_row, hem_row = _robust_span(alpha)
    return WARP.conform_to_body_silhouette(warped, body_lms, category, top_row, hem_row)


def proposed_method(
    rgba, garment_lms, body_lms, category, target_size,
    use_similarity: bool = True,
    use_conform: bool = True,
    use_depth_shading: bool = True,
    use_real_landmarks: bool = True,
) -> np.ndarray:
    """The app's primary fit_garment path, with ablation toggles.

    Mirrors services.fitting_service.FittingService.fit_garment exactly when
    all toggles are True. Toggles let the ablation study isolate each stage:
      use_similarity     : similarity-transform placement (compute_placement)
                            vs. naive centered resize/paste.
      use_real_landmarks : silhouette-derived garment landmarks vs. a crude
                            bounding-box heuristic (4 corner/edge points).
      use_conform         : row-wise silhouette conforming.
      use_depth_shading   : shading pass (photometric, not geometric).
    """
    tw, th = target_size
    lms = garment_lms if use_real_landmarks else _bbox_pseudo_landmarks(rgba, category)

    if use_similarity:
        M = compute_placement(lms, body_lms, category)
    else:
        M = None

    if M is not None:
        base = WARP.warp_affine_matrix(rgba, M, (tw, th))
    else:
        base = _center_paste(rgba, target_size, category)

    if not base[:, :, 3].any():
        return base

    if use_conform:
        top_row, hem_row = _robust_span(base[:, :, 3])
        out = WARP.conform_to_body_silhouette(base, body_lms, category, top_row, hem_row)
    else:
        out = base

    out = WARP.feather_edges(out)
    if use_depth_shading:
        out = WARP.add_depth_shading(out, category=category, body_lms=body_lms)
    return out


def _bbox_pseudo_landmarks(rgba: np.ndarray, category: str) -> Dict[str, Tuple[int, int]]:
    """Crude ablation stand-in for real landmark detection: 4 bounding-box
    edge points instead of the silhouette-derived neck/shoulder/waist/hip/hem
    set. Used only by the 'remove garment landmarks' ablation arm."""
    alpha = rgba[:, :, 3]
    ys, xs = np.nonzero(alpha > 0)
    if len(ys) == 0:
        return {}
    l, r, t, b = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
    mid_y = (t + b) // 2
    if category in TOP_CATEGORIES or category == "dress":
        return {
            "left_shoulder": (l, t), "right_shoulder": (r, t),
            "left_shoulder_edge": (l, t), "right_shoulder_edge": (r, t),
            "neck": ((l + r) // 2, t),
            "left_waist": (l, mid_y), "right_waist": (r, mid_y),
            "waist_center": ((l + r) // 2, mid_y),
            "left_bust": (l, mid_y), "right_bust": (r, mid_y),
            "chest_center": ((l + r) // 2, mid_y),
            "left_hip": (l, b), "right_hip": (r, b),
            "hem_left": (l, b), "hem_right": (r, b),
            "flare": 1.0, "hem_ratio": 1.0, "length_ratio": 0.3,
        }
    return {
        "left_waist": (l, t), "right_waist": (r, t),
        "waist_center": ((l + r) // 2, t),
        "left_hip": (l, mid_y), "right_hip": (r, mid_y),
        "hem_left": (l, b), "hem_right": (r, b),
        "flare": 1.0, "hem_ratio": 1.0, "length_ratio": 0.3,
    }


METHODS = {
    "Resize": baseline_resize,
    "Affine": baseline_affine,
    "TPS": baseline_tps,
    "TPS+silhouette": baseline_tps_silhouette,
    "Proposed": proposed_method,
}
