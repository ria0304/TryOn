import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.fitting_service import (
    FittingService,
    compute_placement,
    _hom,
)
from services.mannequin_manager import MannequinManager


class _StubDetector:
    def detect_body_landmarks(self, image):
        return {}


def _body():
    return MannequinManager(_StubDetector()).get_target_landmarks(None)


def _dress_lms():
    """A short A-line dress's landmarks in cutout coordinates."""
    return {
        "neck": (90, 20),
        "left_shoulder": (65, 40),
        "right_shoulder": (135, 40),
        "left_shoulder_edge": (50, 40),
        "right_shoulder_edge": (150, 40),
        "left_bust": (60, 90),
        "right_bust": (140, 90),
        "chest_center": (100, 90),
        "left_waist": (75, 160),
        "right_waist": (125, 160),
        "waist_center": (100, 160),
        "left_hip": (65, 210),
        "right_hip": (135, 210),
        "hem_left": (30, 280),
        "hem_right": (170, 280),
    }


def _lin(M):
    return M[0, 0], M[0, 1], M[1, 0], M[1, 1]


def test_dress_placement_is_uniform_scale():
    """The placement must scale x and y by the SAME factor (no shear), sized
    from the garment's outer shoulder width, not its bounding box height."""
    M = compute_placement(_dress_lms(), _body(), "dress")
    assert M is not None
    a, b, c, d = _lin(M)
    assert abs((a * a + b * b) - (c * c + d * d)) < 1e-9  # isotropic
    assert abs(a * c + b * d) < 1e-9                      # no shear
    # mannequin shoulders (96px) / garment outer shoulders (100px)
    assert abs((a * a + b * b) ** 0.5 - 0.96) < 1e-6


def test_dress_placement_maps_shoulders_onto_mannequin_shoulders():
    body = _body()
    M = compute_placement(_dress_lms(), body, "dress")
    p = _hom(M, _dress_lms()["left_shoulder_edge"])
    assert abs(p[0] - body["LEFT_SHOULDER"][0]) <= 1
    assert abs(p[1] - body["LEFT_SHOULDER"][1]) <= 1


def test_bottom_placement_anchors_waist_not_shoulders():
    body = _body()
    M = compute_placement(_dress_lms(), body, "pants")
    assert M is not None
    p = _hom(M, _dress_lms()["left_waist"])
    assert abs(p[0] - body["LEFT_WAIST"][0]) <= 1
    assert abs(p[1] - body["LEFT_WAIST"][1]) <= 1


def test_skirt_placement_anchors_waist():
    body = _body()
    M = compute_placement(_dress_lms(), body, "skirt")
    assert M is not None
    p = _hom(M, _dress_lms()["left_waist"])
    assert abs(p[0] - body["LEFT_WAIST"][0]) <= 1


def test_placement_returns_none_for_small_categories():
    assert compute_placement(_dress_lms(), _body(), "jewellery") is None
    assert compute_placement(_dress_lms(), _body(), "shoes") is None


# ---------------------------------------------------------------------------
# End-to-end: fit_garment must place a dress naturally, not stretch it.
# ---------------------------------------------------------------------------

def _a_line_dress_rgba():
    """Short A-line dress: outer shoulders 100px -> waist 40px -> hem 160px
    on a transparent 200x300 canvas. Shoulder-to-hem height is 200px."""
    img = np.zeros((300, 200, 4), dtype=np.uint8)
    for y in range(30, 91):                      # bodice trapezoid
        t = (y - 30) / 60.0
        l = int(50 + (80 - 50) * t)
        r = int(150 + (120 - 150) * t)
        img[y, l:r + 1] = (200, 60, 80, 255)
    for y in range(90, 231):                     # flared skirt trapezoid
        t = (y - 90) / 140.0
        l = int(80 + (20 - 80) * t)
        r = int(120 + (180 - 120) * t)
        img[y, l:r + 1] = (200, 60, 80, 255)
    return img


def _dress_bytes():
    buf = io.BytesIO()
    Image.fromarray(_a_line_dress_rgba()).save(buf, format="PNG")
    return buf.getvalue()


def test_fit_garment_dress_preserves_proportions_no_vertical_stretch():
    out = FittingService().fit_garment(_dress_bytes(), "dress")
    assert out.shape == (550, 400, 4)

    alpha = out[:, :, 3]
    ys, xs = np.nonzero(alpha > 0)
    assert len(ys) > 0

    top = ys.min()

    def row_width(y):
        row = np.nonzero(alpha[y] > 0)[0]
        return (row.max() - row.min() + 1) if len(row) else 0

    # Robust hem: the lowest row that still holds substantial fabric (ignores
    # 1-2px feathering specks that can trail below the true edge).
    max_w = max((row_width(y) for y in range(top, 550)), default=0)
    hem_y = max(y for y in range(top, 550) if row_width(y) > max_w * 0.5)

    # Shoulder line sits on the mannequin's torso, not the top of the canvas.
    assert 120 <= top <= 185

    # Widest row in the top band is the fitted shoulder line.
    sh = max(range(top, min(top + 40, 550)), key=lambda y: row_width(y))
    sh_w = row_width(sh)
    assert 80 <= sh_w <= 115

    # Uniform-scale check: fitted shoulder->hem distance must match the
    # source's (200px) scaled by the fitted width ratio. If the code instead
    # stretched to the ankle the hem would land ~372px below the shoulders.
    expected_hem = sh + (230 - 30) * (sh_w / 100.0)
    assert abs(hem_y - expected_hem) < 70, (
        f"hem at {hem_y}, expected ~{expected_hem:.0f} (ankle would be ~530)"
    )
    assert hem_y < 470  # a short dress must not reach the ankles

    # Waist pinches in to the body, then flares back out at the hem.
    mid = (top + hem_y) // 2
    waist = min(range(max(sh + 30, mid - 50), min(mid + 60, 550)),
                key=lambda y: row_width(y))
    assert row_width(waist) < sh_w * 0.9
    assert row_width(hem_y) > row_width(waist) * 1.2
