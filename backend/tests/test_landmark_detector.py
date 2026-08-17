import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.landmark_detector import garment_landmarks_from_mask, map_garment_to_body
from services.garment_segmentation import compute_flare, compute_top_ratio
from services.mannequin_manager import MannequinManager


class _StubDetector:
    def detect_body_landmarks(self, image):
        return {}


def _fill(mask, y0, y1, l, r):
    for y in range(int(y0), int(y1)):
        mask[y, int(l):int(r) + 1] = 255


def _a_line_dress_mask(height=220, width=140):
    """Shoulders (90px) -> bust (80px) -> waist (56px) -> hips (84px) ->
    flared hem (130px)."""
    mask = np.zeros((height, width), dtype=np.uint8)
    _fill(mask, 0, 30, 25, 115)   # shoulders
    _fill(mask, 30, 70, 30, 110)  # bust
    _fill(mask, 70, 90, 42, 98)   # waist
    _fill(mask, 90, 125, 28, 112)  # hips
    _fill(mask, 125, 220, 5, 135)  # flared hem
    return mask


def _tee_mask(height=100, width=140):
    """Sleeved top: wide sleeve band that narrows to a straight torso."""
    mask = np.zeros((height, width), dtype=np.uint8)
    _fill(mask, 0, 19, 20, 120)  # shoulders + sleeves
    _fill(mask, 19, 80, 35, 105)  # torso
    return mask


def _waist_width(lm):
    return abs(lm["right_waist"][0] - lm["left_waist"][0])


def _hip_width(lm):
    return abs(lm["right_hip"][0] - lm["left_hip"][0])


def test_a_line_dress_landmarks_ordered_top_to_bottom():
    lm = garment_landmarks_from_mask(_a_line_dress_mask(), "dress")
    assert lm["neck"][1] < lm["left_shoulder"][1]
    assert lm["left_shoulder"][1] < lm["left_bust"][1]
    assert lm["left_bust"][1] < lm["left_waist"][1]
    assert lm["left_waist"][1] < lm["left_hip"][1]
    assert lm["left_hip"][1] < lm["hem_left"][1]


def test_a_line_dress_waist_narrower_than_bust_and_hips():
    lm = garment_landmarks_from_mask(_a_line_dress_mask(), "dress")
    assert _waist_width(lm) < _hip_width(lm)
    assert _waist_width(lm) < abs(lm["right_bust"][0] - lm["left_bust"][0])


def test_a_line_dress_detects_flare_and_length():
    lm = garment_landmarks_from_mask(_a_line_dress_mask(), "dress")
    assert lm["flare"] > 1.3
    assert lm["length_ratio"] > 0.45  # long enough to read as a maxi dress


def test_a_line_dress_not_sleeved():
    lm = garment_landmarks_from_mask(_a_line_dress_mask(), "dress")
    assert lm["sleeved"] is False


def test_tee_is_sleeved():
    lm = garment_landmarks_from_mask(_tee_mask(), "top")
    assert lm["sleeved"] is True


def test_landmarks_symmetric_around_centreline():
    lm = garment_landmarks_from_mask(_a_line_dress_mask(), "dress")
    for left_key, right_key in [
        ("left_shoulder", "right_shoulder"),
        ("left_bust", "right_bust"),
        ("left_waist", "right_waist"),
        ("left_hip", "right_hip"),
        ("hem_left", "hem_right"),
    ]:
        mid_l = (lm[left_key][0] + lm[right_key][0]) / 2.0
        assert abs(mid_l - 70) < 4, f"{left_key}/{right_key} not centred"


def test_empty_mask_returns_no_landmarks():
    assert garment_landmarks_from_mask(np.zeros((10, 10), dtype=np.uint8), "dress") == {}


def test_dress_mapping_uses_waist_and_hips_not_only_shoulders():
    mgr = MannequinManager(_StubDetector())
    body = mgr.get_target_landmarks()
    lm = garment_landmarks_from_mask(_a_line_dress_mask(), "dress")
    mapping = map_garment_to_body(lm, body, "dress")

    sources = {p[0] for p in mapping}
    targets = {p[1] for p in mapping}
    # The dress must be constrained at the shoulders, bust, waist AND hips so
    # it conforms to the body instead of being a flat paste.
    assert body["LEFT_SHOULDER"] in targets
    assert body["LEFT_BUST"] in targets
    assert body["LEFT_WAIST"] in targets
    assert body["LEFT_HIP"] in targets
    assert len(mapping) >= 10


def test_flared_hem_maps_wider_than_the_mannequin_hips():
    mgr = MannequinManager(_StubDetector())
    body = mgr.get_target_landmarks()
    lm = garment_landmarks_from_mask(_a_line_dress_mask(), "dress")
    mapping = map_garment_to_body(lm, body, "dress")

    hem_targets = [p[1] for p in mapping if p[0] in (lm["hem_left"], lm["hem_right"])]
    assert len(hem_targets) == 2
    width = abs(hem_targets[1][0] - hem_targets[0][0])
    hip_width = abs(body["RIGHT_HIP"][0] - body["LEFT_HIP"][0])
    assert width > hip_width  # the A-line flare is preserved


def test_top_mapping_targets_shoulders_for_sleeved_garments():
    """Sleeved tops anchor their shoulders between the shoulder joint and the
    elbow so the sleeve wraps the upper arm instead of hanging off it."""
    mgr = MannequinManager(_StubDetector())
    body = mgr.get_target_landmarks()
    lm = garment_landmarks_from_mask(_tee_mask(), "top")
    mapping = map_garment_to_body(lm, body, "top")

    target_l = dict(mapping)[lm["left_shoulder"]]
    elbow = body["LEFT_ELBOW"]
    shoulder = body["LEFT_SHOULDER"]
    # The midpoint between the shoulder joint and the elbow sits left of the
    # shoulder (toward the outer arm), which is where the sleeve should go.
    assert elbow[0] <= target_l[0] <= shoulder[0]
    assert shoulder[1] <= target_l[1] <= elbow[1]


def test_a_line_dress_geometry_flares_and_has_bodice():
    mask = _a_line_dress_mask()
    assert compute_flare(mask) is True
    # Shoulders (90px) above the waist (56px) => a dress, not a skirt.
    assert compute_top_ratio(mask) >= 1.15


def test_skirt_geometry_flares_without_bodice():
    mask = np.zeros((200, 120), dtype=np.uint8)
    _fill(mask, 0, 12, 40, 80)     # waist band
    _fill(mask, 12, 100, 25, 95)   # hips
    _fill(mask, 100, 200, 5, 115)  # flare to hem
    assert compute_flare(mask) is True
    assert compute_top_ratio(mask) < 1.15


def test_empty_mask_geometry_is_neutral():
    mask = np.zeros((10, 10), dtype=np.uint8)
    assert compute_flare(mask) is False
    assert compute_top_ratio(mask) == 1.0


def _pants_mask(height=220, width=160):
    """Realistic straight-leg pants: waistband at the top, wider hips below,
    then legs narrowing to the hem."""
    mask = np.zeros((height, width), dtype=np.uint8)
    _fill(mask, 0, 30, 55, 105)     # waistband (50px)
    _fill(mask, 30, 100, 45, 115)   # hips (70px)
    _fill(mask, 100, 220, 55, 105)  # legs (50px -> 36px taper)
    return mask


def test_pants_waist_is_the_waistband_not_the_legs():
    """Bottoms start at the waistband: the 'waist' landmark must sit at the
    garment's TOP edge, never mid-leg (a torso-style detector would pick the
    narrowest leg span and anchor the pants far too high)."""
    lm = garment_landmarks_from_mask(_pants_mask(), "pants")
    assert lm["left_waist"][1] <= 15
    assert lm["right_waist"][1] <= 15
    assert lm["left_waist"][1] < lm["left_hip"][1]
    assert lm["left_hip"][1] < lm["hem_left"][1]
    assert lm["left_waist"][0] < lm["right_waist"][0]


def test_pants_bottom_mapping_anchors_only_waist_and_hips():
    mgr = MannequinManager(_StubDetector())
    body = mgr.get_target_landmarks()
    lm = garment_landmarks_from_mask(_pants_mask(), "pants")
    mapping = map_garment_to_body(lm, body, "pants")
    targets = {p[1] for p in mapping}
    assert body["LEFT_WAIST"] in targets
    assert body["RIGHT_HIP"] in targets
    # No torso (shoulder/bust) controls for bottoms.
    assert body["LEFT_SHOULDER"] not in targets
    assert body["LEFT_BUST"] not in targets


def test_skirt_waist_is_top_edge():
    mask = np.zeros((200, 120), dtype=np.uint8)
    _fill(mask, 0, 12, 40, 80)     # waist band
    _fill(mask, 12, 100, 25, 95)   # hips
    _fill(mask, 100, 200, 5, 115)  # flare
    lm = garment_landmarks_from_mask(mask, "skirt")
    assert lm["left_waist"][1] <= 12
    assert lm["left_hip"][1] > lm["left_waist"][1]
    assert lm["flare"] > 1.3
