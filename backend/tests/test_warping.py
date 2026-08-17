import sys
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.warping import WarpingEngine


def _checkerboard_rgba(size=64):
    img = np.zeros((size, size, 4), dtype=np.uint8)
    img[:, :, 3] = 255
    img[: size // 2, : size // 2, 0] = 255  # red top-left quadrant
    img[size // 2 :, size // 2 :, 2] = 255  # blue bottom-right quadrant
    return img


def test_warp_affine_identity_preserves_image():
    engine = WarpingEngine()
    img = _checkerboard_rgba()
    pts = np.array([[0, 0], [63, 0], [0, 63]], dtype=np.float32)
    warped = engine.warp_affine(img, pts, pts)  # source == target -> identity
    assert warped.shape == img.shape
    # Should be very close to the original (allow for interpolation noise)
    diff = np.abs(warped.astype(int) - img.astype(int))
    assert diff.mean() < 5


def test_warp_affine_with_fewer_than_3_points_returns_original():
    engine = WarpingEngine()
    img = _checkerboard_rgba()
    pts = np.array([[0, 0], [10, 10]], dtype=np.float32)
    warped = engine.warp_affine(img, pts, pts)
    assert np.array_equal(warped, img)


def test_warp_tps_falls_back_to_affine_below_5_points():
    engine = WarpingEngine()
    img = _checkerboard_rgba()
    pts = np.array([[0, 0], [63, 0], [0, 63]], dtype=np.float32)
    warped = engine.warp_tps(img, pts, pts)
    assert warped.shape == img.shape


def test_warp_tps_with_5_identity_points_preserves_shape():
    engine = WarpingEngine()
    img = _checkerboard_rgba()
    pts = np.array(
        [[0, 0], [63, 0], [0, 63], [63, 63], [32, 32]], dtype=np.float32
    )
    warped = engine.warp_tps(img, pts, pts)
    assert warped.shape == img.shape
    diff = np.abs(warped.astype(int) - img.astype(int))
    assert diff.mean() < 10  # identity mapping should reproduce the image closely


def test_apply_folds_preserves_shape_and_stays_in_valid_range():
    engine = WarpingEngine()
    img = _checkerboard_rgba()
    folded = engine.apply_folds(img, intensity=0.03)
    assert folded.shape == img.shape
    assert folded.dtype == img.dtype


def test_process_garment_with_no_mapping_just_resizes():
    engine = WarpingEngine()
    img = _checkerboard_rgba(size=64)
    out = engine.process_garment(img, mapping=[], target_size=(32, 32))
    assert out.shape[:2] == (32, 32)


def test_process_garment_full_pipeline_produces_target_size():
    engine = WarpingEngine()
    img = _checkerboard_rgba(size=64)
    mapping = [
        ((0, 0), (0, 0)),
        ((63, 0), (63, 0)),
        ((0, 63), (0, 63)),
        ((63, 63), (63, 63)),
        ((32, 32), (32, 32)),
    ]
    out = engine.process_garment(img, mapping, target_size=(80, 100))
    assert out.shape[:2] == (100, 80)  # cv2.resize is (w, h) -> array is (h, w, ...)


def test_warp_tps_renders_directly_onto_target_canvas():
    """The destination points must land at their true coordinates -- the whole
    point of inverse-mapped TPS is that the result is NOT rescaled afterwards,
    which is what previously shrank a dress's waist onto the mannequin."""
    engine = WarpingEngine()
    img = _checkerboard_rgba(size=64)
    # Source points spread across the image map to a region in a 100x80 canvas.
    src = np.array([[8, 8], [55, 8], [8, 55], [55, 55], [32, 32]], dtype=np.float32)
    dst = np.array([[30, 20], [70, 20], [30, 60], [70, 60], [50, 40]], dtype=np.float32)
    out = engine.warp_tps(img, src, dst, output_size=(100, 80))
    assert out.shape == (80, 100, 4)

    mask = out[:, :, 3] > 0
    ys, xs = np.nonzero(mask)
    assert len(ys) > 0
    # Content should sit around the destination region, not the whole canvas.
    assert xs.min() >= 20 and xs.max() <= 80
    assert ys.min() >= 10 and ys.max() <= 70


def test_add_depth_shading_preserves_shape_alpha_and_dtype():
    engine = WarpingEngine()
    img = _checkerboard_rgba(size=64)
    body_lms = {"NECK": (32, 10), "WAIST": (32, 40)}
    shaded = engine.add_depth_shading(img, body_lms=body_lms)
    assert shaded.shape == img.shape
    assert shaded.dtype == img.dtype
    assert np.array_equal(shaded[:, :, 3], img[:, :, 3])  # alpha untouched


def test_add_depth_shading_darkens_silhouette_edges():
    engine = WarpingEngine()
    img = np.zeros((64, 64, 4), dtype=np.uint8)
    img[8:56, 8:56, :3] = 200  # solid grey square
    img[8:56, 8:56, 3] = 255
    shaded = engine.add_depth_shading(img, body_lms={})

    def mean_band(r0, r1, c0, c1):
        region = shaded[r0:r1, c0:c1]
        px = region[region[..., 3] > 0][:, :3].astype(int)
        return px.mean() if len(px) else 0.0

    edge_mean = mean_band(8, 56, 8, 16)
    centre_mean = mean_band(24, 40, 24, 40)
    assert edge_mean < centre_mean


def test_feather_edges_softens_the_alpha_boundary():
    engine = WarpingEngine()
    img = np.zeros((64, 64, 4), dtype=np.uint8)
    img[16:48, 16:48, 3] = 255  # hard-edged alpha
    feathered = engine.feather_edges(img, sigma=1.5)
    alpha = feathered[:, :, 3]
    # Interior stays opaque, the boundary has soft intermediate values.
    assert alpha[32, 32] == 255
    assert np.any((alpha > 0) & (alpha < 255))


def _body_lms():
    return {
        "NECK": (200, 150),
        "LEFT_SHOULDER": (152, 158),
        "RIGHT_SHOULDER": (248, 158),
        "LEFT_ARMPIT": (170, 188),
        "RIGHT_ARMPIT": (230, 188),
        "LEFT_BUST": (160, 210),
        "RIGHT_BUST": (240, 210),
        "WAIST": (200, 258),
        "LEFT_WAIST": (168, 258),
        "RIGHT_WAIST": (232, 258),
        "LEFT_HIP": (162, 305),
        "RIGHT_HIP": (238, 305),
        "LEFT_KNEE": (176, 470),
        "RIGHT_KNEE": (224, 470),
        "LEFT_ANKLE": (178, 530),
        "RIGHT_ANKLE": (222, 530),
    }


def _dress_rgba(h=300, w=200):
    """A-line dress: shoulders -> narrow waist -> flared hem."""
    img = np.zeros((h, w, 4), dtype=np.uint8)
    for y in range(30, 91):
        t = (y - 30) / 60.0
        l = int(50 + (80 - 50) * t)
        r = int(150 + (120 - 150) * t)
        img[y, l:r + 1] = (200, 60, 80, 255)
    for y in range(90, 231):
        t = (y - 90) / 140.0
        l = int(80 + (20 - 80) * t)
        r = int(120 + (180 - 120) * t)
        img[y, l:r + 1] = (200, 60, 80, 255)
    return img


def _row_width(alpha, y):
    row = np.nonzero(alpha[y] > 0)[0]
    return (row.max() - row.min() + 1) if len(row) else 0


def test_conform_to_body_silhouette_pinches_waist_and_preserves_flare():
    """The core adaptive warp: rows are rescaled horizontally toward the body
    silhouette (waist pinches, hips fill) while the hem keeps its flared cut.
    Critically, no row ever moves vertically, so the dress cannot stretch."""
    engine = WarpingEngine()
    rgba = _dress_rgba()
    body = _body_lms()
    # Place the dress the way fit_garment does (proportion-preserving, shoulder
    # anchored) so the conform stage runs in mannequin-canvas coordinates.
    from services.fitting_service import compute_placement
    from services.landmark_detector import garment_landmarks_from_mask
    M = compute_placement(
        garment_landmarks_from_mask(rgba[:, :, 3], "dress"), body, "dress"
    )
    placed = cv2.warpAffine(
        rgba, M[:2].astype(np.float32), (400, 550),
        flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0),
    )
    top, hem = 149, 359
    out = engine.conform_to_body_silhouette(placed, body, "dress", top, hem)
    alpha = out[:, :, 3]

    ys, xs = np.nonzero(alpha > 0)
    assert len(ys) > 0
    # Vertical span is unchanged -- no vertical stretch.
    assert ys.min() == top and ys.max() == hem

    def w(y):
        return _row_width(alpha, y)

    sh = max(range(top, top + 40), key=w)
    sh_w = w(sh)
    waist = min(range(sh + 30, min(sh + 110, hem)), key=w)
    waist_w = w(waist)
    hem_w = w(hem)
    assert waist_w < sh_w * 0.85          # pinched to the body waist
    assert hem_w > waist_w * 1.3          # the flared hem is preserved


def test_conform_never_grows_silhouette_beyond_body_width():
    """The fitted region must not be wider than the body silhouette the warp
    is conforming to (guards against the inverted-remap bug that inflated
    rows to ~2x the intended width)."""
    engine = WarpingEngine()
    rgba = _dress_rgba()
    body = _body_lms()
    from services.fitting_service import compute_placement
    from services.landmark_detector import garment_landmarks_from_mask
    M = compute_placement(
        garment_landmarks_from_mask(rgba[:, :, 3], "dress"), body, "dress"
    )
    placed = cv2.warpAffine(
        rgba, M[:2].astype(np.float32), (400, 550),
        flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0, 0),
    )
    out = engine.conform_to_body_silhouette(placed, body, "dress", 149, 359)
    alpha = out[:, :, 3]
    bw = engine._body_width_profile(body, 550)
    strength = engine._fit_strength("dress", body, 149, 359, 550)
    ys, xs = np.nonzero(alpha > 0)
    for y in range(int(ys.min()), int(ys.max()) + 1):
        w = _row_width(alpha, y)
        # Only the strongly conformed region must hug the body; below the hips
        # the flared hem is intentionally preserved (strength fades to 0).
        if w and strength[y] >= 0.75:
            assert w <= max(bw[y] * 1.35, 20), f"row {y}: {w}px"
