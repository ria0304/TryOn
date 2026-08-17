"""Metrics for the garment-fitting evaluation harness.

All metrics compare a warped garment's OUTPUT silhouette against the target
anchor points/region defined by the mannequin's own body model
(services/mannequin_manager.py's reference landmarks), using the SAME
target-selection logic the real pipeline uses (services/landmark_detector.py's
map_garment_to_body / _add_flared_hem). Nothing here invents a separate
notion of "correct" -- it measures how close each method's output lands to
the targets the app itself defines.

Landmark-based metrics re-run the app's own garment-landmark detector
(garment_landmarks_from_mask) on each method's OUTPUT alpha mask, i.e. "if
you handed this warped result back to the app, where would it think the
shoulders/waist/hips/hem are, and how far is that from the mannequin's
actual shoulders/waist/hips/hem?" This is meaningful for every baseline
here (none of them are landmark re-detection itself) and is not circular
for the proposed method either: the proposed method's PLACEMENT stage
targets these points, but the silhouette-conform + warp can still leave
detectable drift, which this metric would catch.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Dict, Optional, Tuple

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/

from services.landmark_detector import (  # noqa: E402
    garment_landmarks_from_mask, TOP_CATEGORIES, BOTTOM_CATEGORIES, _add_flared_hem,
)
from services.warping import WarpingEngine  # noqa: E402
from services.fitting_service import _robust_span  # noqa: E402

WARP = WarpingEngine()


def _dist(a: Optional[Tuple[float, float]], b: Optional[Tuple[float, float]]) -> Optional[float]:
    if a is None or b is None:
        return None
    return float(np.hypot(a[0] - b[0], a[1] - b[1]))


def _pair_error(det: Dict, body: Dict, gl: str, gr: str, bl: str, br: str) -> Optional[float]:
    if gl not in det or gr not in det or bl not in body or br not in body:
        return None
    d1 = _dist(det[gl], body[bl])
    d2 = _dist(det[gr], body[br])
    vals = [v for v in (d1, d2) if v is not None]
    return float(np.mean(vals)) if vals else None


def expected_hem_targets(
    garment_lms: Dict, body_lms: Dict, category: str
) -> Optional[Tuple[Tuple[float, float], Tuple[float, float]]]:
    """The hem target points the real pipeline itself would map to, reusing
    its own target-selection rules (same anchor logic as
    services.landmark_detector.map_garment_to_body)."""
    if category in BOTTOM_CATEGORIES:
        if "LEFT_ANKLE" in body_lms and "RIGHT_ANKLE" in body_lms:
            return body_lms["LEFT_ANKLE"], body_lms["RIGHT_ANKLE"]
        return None
    if category in TOP_CATEGORIES:
        anchor = "HIP" if garment_lms.get("hem_ratio", 0) > 0.55 else "WAIST"
        kl, kr = f"LEFT_{anchor}", f"RIGHT_{anchor}"
        if kl in body_lms and kr in body_lms:
            return body_lms[kl], body_lms[kr]
        return None
    if category in ("dress", "skirt"):
        mapping = []
        _add_flared_hem(mapping, garment_lms, body_lms)
        if len(mapping) == 2:
            return mapping[0][1], mapping[1][1]
        return None
    return None


def silhouette_iou(output_alpha: np.ndarray, body_lms: Dict, canvas_w: int) -> Optional[float]:
    """IoU between the garment's actual footprint and the mannequin's ideal
    per-row body-width profile (services.warping.WarpingEngine's own
    `_body_width_profile`, the exact function the proposed method's
    silhouette-conform stage targets), over the garment's own top->hem row
    span so we compare like-for-like vertical extent."""
    mask = output_alpha > 0
    if not mask.any():
        return None
    top_row, hem_row = _robust_span(output_alpha)
    if hem_row <= top_row:
        return None
    h = output_alpha.shape[0]
    body_w = WARP._body_width_profile(body_lms, h)
    bx = canvas_w / 2.0
    target = np.zeros_like(mask)
    xs = np.arange(canvas_w)
    for y in range(top_row, hem_row + 1):
        half = body_w[y] / 2.0
        target[y] = np.abs(xs - bx) <= half
    region = np.zeros_like(mask)
    region[top_row:hem_row + 1] = True
    a = mask & region
    b = target & region
    inter = np.logical_and(a, b).sum()
    union = np.logical_or(a, b).sum()
    if union == 0:
        return None
    return float(inter) / float(union)


def flare_distortion(garment_lms_original: Dict, garment_lms_output: Dict) -> Optional[float]:
    """How much the garment's own hem/hip flare ratio changed after warping,
    relative to its original cut (both values come straight from
    garment_landmarks_from_mask's own `flare` field -- hem width / hip width
    -- computed identically pre- and post-warp).

    A method that forces every garment onto the SAME fixed target proportions
    (e.g. exact multi-point TPS onto the mannequin's landmarks) can drive
    landmark error near zero while still distorting a wide-flare maxi dress
    and a narrow pencil skirt onto the same silhouette shape. This metric
    catches that: 0 = the garment's original flare was fully preserved.
    """
    pre = garment_lms_original.get("flare")
    post = garment_lms_output.get("flare")
    if pre is None or post is None or pre <= 1e-6:
        return None
    return float(abs(post - pre) / pre)


def evaluate(
    output_rgba: np.ndarray,
    garment_lms_original: Dict,
    body_lms: Dict,
    category: str,
) -> Dict[str, Optional[float]]:
    """Compute the full metric set for one warped output."""
    alpha = output_rgba[:, :, 3]
    result: Dict[str, Optional[float]] = {
        "shoulder_error_px": None,
        "waist_error_px": None,
        "hip_error_px": None,
        "hem_error_px": None,
        "silhouette_iou": None,
        "flare_distortion": None,
    }
    if not alpha.any():
        return result

    det = garment_landmarks_from_mask(alpha, category)

    if category in TOP_CATEGORIES or category == "dress":
        result["shoulder_error_px"] = _pair_error(
            det, body_lms, "left_shoulder", "right_shoulder", "LEFT_SHOULDER", "RIGHT_SHOULDER"
        )
    result["waist_error_px"] = _pair_error(
        det, body_lms, "left_waist", "right_waist", "LEFT_WAIST", "RIGHT_WAIST"
    )
    if category in BOTTOM_CATEGORIES or category == "dress":
        result["hip_error_px"] = _pair_error(
            det, body_lms, "left_hip", "right_hip", "LEFT_HIP", "RIGHT_HIP"
        )

    hem_target = expected_hem_targets(garment_lms_original, body_lms, category)
    if hem_target is not None and "hem_left" in det and "hem_right" in det:
        d1 = _dist(det["hem_left"], hem_target[0])
        d2 = _dist(det["hem_right"], hem_target[1])
        vals = [v for v in (d1, d2) if v is not None]
        result["hem_error_px"] = float(np.mean(vals)) if vals else None

    result["silhouette_iou"] = silhouette_iou(alpha, body_lms, output_rgba.shape[1])
    result["flare_distortion"] = flare_distortion(garment_lms_original, det)
    return result
