import io
import numpy as np
import cv2
from PIL import Image
from .landmark_detector import LandmarkDetector
from .warping import WarpingEngine, TOP_CATEGORIES, BOTTOM_CATEGORIES
from .mannequin_manager import MannequinManager
from typing import Dict, Optional, Tuple


def _hom(M: np.ndarray, p: Tuple[int, int]) -> Tuple[int, int]:
    """Apply a 3x3 homogeneous affine matrix to a 2D point."""
    v = M @ (float(p[0]), float(p[1]), 1.0)
    return (int(round(v[0])), int(round(v[1])))


def _similarity_from_segment(
    p1: Tuple[int, int], p2: Tuple[int, int],
    q1: Tuple[int, int], q2: Tuple[int, int],
) -> Optional[np.ndarray]:
    """Return the 3x3 similarity (uniform scale + rotation + translation)
    mapping segment p1->p2 onto q1->q2, or None if the source segment is
    degenerate. Uniform scale is the key: vertical and horizontal are scaled
    by the SAME factor, so a dress keeps its real proportions instead of being
    stretched to a target height."""
    p1 = np.asarray(p1, dtype=np.float64)
    p2 = np.asarray(p2, dtype=np.float64)
    q1 = np.asarray(q1, dtype=np.float64)
    q2 = np.asarray(q2, dtype=np.float64)
    d = p2 - p1
    e = q2 - q1
    dp = float(np.hypot(d[0], d[1]))
    if dp < 1e-6:
        return None

    s = float(np.hypot(e[0], e[1])) / dp
    s = min(max(s, 0.2), 3.0)  # clamp pathological scales

    a = np.arctan2(d[1], d[0])
    b = np.arctan2(e[1], e[0])
    c, si = np.cos(b - a), np.sin(b - a)
    lin = s * np.array([[c, -si], [si, c]], dtype=np.float64)
    t = q1 - lin @ p1
    return np.array(
        [[lin[0, 0], lin[0, 1], t[0]],
         [lin[1, 0], lin[1, 1], t[1]],
         [0.0, 0.0, 1.0]],
        dtype=np.float64,
    )


def compute_placement(
    garment_lms: Dict[str, Tuple[int, int]],
    body_lms: Dict[str, Tuple[int, int]],
    category: str,
) -> Optional[np.ndarray]:
    """Category-aware similarity placement.

    Each category anchors on a different body line:
      - tops / dresses: the shoulder line (fit shoulders, then length follows
        naturally from the garment's own proportions).
      - bottoms / skirts: the waist line.
    The returned transform preserves the garment's aspect ratio, so the hem
    lands wherever the garment's own length says it should — a mini dress
    stays short, a maxi stays long. Returns None when the anchor is missing
    (e.g. small accessories), in which case the caller falls back.
    """
    if category in TOP_CATEGORIES or category == "dress":
        gl, gr = "left_shoulder_edge", "right_shoulder_edge"
        bl, br = "LEFT_SHOULDER", "RIGHT_SHOULDER"
    elif category in BOTTOM_CATEGORIES or category == "skirt":
        gl, gr = "left_waist", "right_waist"
        bl, br = "LEFT_WAIST", "RIGHT_WAIST"
    else:
        return None

    if not all(k in garment_lms for k in (gl, gr)):
        return None
    if not all(k in body_lms for k in (bl, br)):
        return None
    return _similarity_from_segment(
        garment_lms[gl], garment_lms[gr], body_lms[bl], body_lms[br]
    )


def _robust_span(alpha: np.ndarray) -> Tuple[int, int]:
    """Top and hem rows of a garment's alpha, ignoring 1-2px feathering
    specks that can trail below the true hem."""
    ys, xs = np.nonzero(alpha > 0)
    if len(ys) == 0:
        return 0, 0
    top = int(ys.min())
    bottom = int(ys.max())

    def row_width(y: int) -> int:
        row = np.nonzero(alpha[y] > 0)[0]
        return (row.max() - row.min() + 1) if len(row) else 0

    max_w = max((row_width(y) for y in range(top, bottom + 1)), default=1)
    hem = max((y for y in range(top, bottom + 1) if row_width(y) > max_w * 0.5),
              default=bottom)
    return top, hem


class FittingService:
    def __init__(self):
        self.landmarks = LandmarkDetector()
        self.warping = WarpingEngine()
        self.mannequin = MannequinManager(self.landmarks)

    def fit_garment(self, image_bytes: bytes, category: str) -> np.ndarray:
        """
        Fit a garment onto the target mannequin.

        1. Detect the garment's own landmarks (neckline, shoulders, bust,
           waist, hips, hem) from the cutout silhouette.
        2. Place it with a proportion-preserving similarity transform anchored
           on the category's body line (shoulders for tops/dresses, waist for
           bottoms/skirts) — the garment's length then follows its own
           proportions, so nothing is stretched vertically to fill a target
           height.
        3. Conform the fitted region (shoulders, bust, waist, hips) to the
           mannequin's silhouette -- horizontally only, so the fabric hugs the
           body while the hem keeps its natural flared cut.
        4. Feather the edges and add depth shading.
        """
        pil_image = Image.open(io.BytesIO(image_bytes)).convert("RGBA")
        rgba = np.array(pil_image)
        mask = rgba[:, :, 3]
        tw, th = self.mannequin.width, self.mannequin.height
        target_size = (tw, th)

        if not mask.any():
            return self._fallback_fit(rgba, target_size, category)

        # 1. Garment landmarks + mannequin body landmarks
        garment_lms = self.landmarks.detect_garment_landmarks(mask, category)
        body_lms = self.mannequin.get_target_landmarks()

        # 2. Preferred path: proportion-preserving placement + body-conforming
        # silhouette warp. The placement fixes scale/rotation/position with a
        # uniform transform (no vertical stretch); the warp then pulls the
        # fitted rows onto the mannequin's silhouette without ever moving a row
        # vertically, so the hem stays where the garment's own length puts it.
        M = compute_placement(garment_lms, body_lms, category)
        if M is not None:
            base = self.warping.warp_affine_matrix(rgba, M, (tw, th))
            if base[:, :, 3].mean() > 1e-4:
                top_row, hem_row = _robust_span(base[:, :, 3])
                sleeve_end_row = None
                if garment_lms.get("sleeved") and "sleeve_end" in garment_lms:
                    sleeve_end_row = _hom(M, (0, int(garment_lms["sleeve_end"])))[1]
                warped_rgba = self.warping.conform_to_body_silhouette(
                    base, body_lms, category, top_row, hem_row,
                    sleeve_end_row=sleeve_end_row,
                )
                warped_rgba = self.warping.feather_edges(warped_rgba)
                warped_rgba = self.warping.add_depth_shading(
                    warped_rgba, category=category, body_lms=body_lms
                )
                return warped_rgba

        # 3. Legacy path: full direct TPS from garment landmarks to body
        # landmarks (kept for small accessories and degenerate landmark cases).
        mapping = self.landmarks.map_garment_to_body(garment_lms, body_lms, category)
        if len(mapping) >= 6:
            warped_rgba = self.warping.process_garment(rgba, mapping, target_size)
            warped_rgba = self.warping.feather_edges(warped_rgba)
            warped_rgba = self.warping.add_depth_shading(
                warped_rgba, category=category, body_lms=body_lms
            )
            return warped_rgba

        # 4. Last resort: simple centered placement.
        return self._fallback_fit(rgba, target_size, category)

    def _fallback_fit(self, rgba: np.ndarray, target_size: Tuple[int, int], category: str) -> np.ndarray:
        """Simple fallback to place the garment in a reasonable default position
        and scale, anchored per category against the mannequin's torso. Small
        accessories (shoes, jewellery, bags) are anchored to the body part they
        are worn on instead of floating mid-torso."""
        h, w = rgba.shape[:2]
        tw, th = target_size

        result = np.zeros((th, tw, 4), dtype=np.uint8)

        if category == "shoes":
            scale = min((tw * 0.22) / w, (th * 0.12) / h)
            y_offset = int(th * 0.82)
        elif category == "jewellery":
            scale = min((tw * 0.2) / w, (th * 0.1) / h)
            y_offset = int(th * 0.24)
        elif category == "bag":
            scale = min((tw * 0.28) / w, (th * 0.18) / h)
            y_offset = int(th * 0.5)
        elif category in TOP_CATEGORIES:
            scale = (tw * 0.42) / w
            y_offset = int(th * 0.28)
        elif category in BOTTOM_CATEGORIES:
            scale = (tw * 0.42) / w
            y_offset = int(th * 0.42)
        elif category == "dress":
            scale = (tw * 0.5) / w
            y_offset = int(th * 0.28)
        else:
            scale = min((tw * 0.4) / w, (th * 0.25) / h)
            y_offset = int(th * 0.5)

        nw, nh = max(1, int(w * scale)), max(1, int(h * scale))
        resized = cv2.resize(rgba, (nw, nh), interpolation=cv2.INTER_LINEAR)

        x_offset = (tw - nw) // 2
        y1, y2 = y_offset, min(y_offset + nh, th)
        x1, x2 = x_offset, min(x_offset + nw, tw)
        if y2 > y1 and x2 > x1:
            result[y1:y2, x1:x2] = resized[0:y2 - y1, 0:x2 - x1]

        return result
