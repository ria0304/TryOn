import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.mannequin_manager import MannequinManager


class _StubDetector:
    """Avoids constructing a real MediaPipe LandmarkDetector for this unit."""
    def detect_body_landmarks(self, image):
        return {"HEAD": (1, 1)}


def test_default_landmarks_cover_full_body():
    mgr = MannequinManager(_StubDetector())
    landmarks = mgr.get_target_landmarks(None)
    expected_keys = {
        "HEAD", "NECK", "LEFT_SHOULDER", "RIGHT_SHOULDER",
        "LEFT_ARMPIT", "RIGHT_ARMPIT",
        "CHEST", "LEFT_BUST", "RIGHT_BUST",
        "WAIST", "LEFT_WAIST", "RIGHT_WAIST",
        "LEFT_HIP", "RIGHT_HIP",
        "LEFT_ELBOW", "RIGHT_ELBOW", "LEFT_WRIST", "RIGHT_WRIST",
        "LEFT_KNEE", "RIGHT_KNEE", "LEFT_ANKLE", "RIGHT_ANKLE",
    }
    assert set(landmarks.keys()) == expected_keys


def test_default_landmarks_are_within_svg_viewbox():
    mgr = MannequinManager(_StubDetector())
    landmarks = mgr.get_target_landmarks(None)
    for name, (x, y) in landmarks.items():
        assert 0 <= x <= mgr.width, f"{name} x={x} out of [0,{mgr.width}]"
        assert 0 <= y <= mgr.height, f"{name} y={y} out of [0,{mgr.height}]"


def test_default_landmarks_are_top_to_bottom_ordered():
    """Head should be above neck, which should be above waist, which
    should be above ankles -- a basic sanity check that the coordinate
    system wasn't flipped."""
    mgr = MannequinManager(_StubDetector())
    lm = mgr.get_target_landmarks(None)
    assert lm["HEAD"][1] < lm["NECK"][1] < lm["CHEST"][1] < lm["WAIST"][1]
    assert lm["WAIST"][1] < lm["LEFT_KNEE"][1] < lm["LEFT_ANKLE"][1]
    assert lm["LEFT_ARMPIT"][1] < lm["LEFT_BUST"][1] < lm["LEFT_WAIST"][1] < lm["LEFT_HIP"][1]


def test_waist_is_narrower_than_bust_and_hips():
    """The mannequin must have a real silhouette: a narrower waist than the
    bust and hips, so garments pulled in at the waist fit convincingly."""
    mgr = MannequinManager(_StubDetector())
    lm = mgr.get_target_landmarks(None)
    def width(left_key, right_key):
        return abs(lm[right_key][0] - lm[left_key][0])
    assert width("LEFT_BUST", "RIGHT_BUST") > width("LEFT_WAIST", "RIGHT_WAIST")
    assert width("LEFT_HIP", "RIGHT_HIP") > width("LEFT_WAIST", "RIGHT_WAIST")


def test_left_right_symmetry_around_vertical_centerline():
    mgr = MannequinManager(_StubDetector())
    lm = mgr.get_target_landmarks(None)
    center_x = mgr.width / 2
    for pair in [
        ("LEFT_SHOULDER", "RIGHT_SHOULDER"),
        ("LEFT_ARMPIT", "RIGHT_ARMPIT"),
        ("LEFT_BUST", "RIGHT_BUST"),
        ("LEFT_WAIST", "RIGHT_WAIST"),
        ("LEFT_HIP", "RIGHT_HIP"),
        ("LEFT_KNEE", "RIGHT_KNEE"),
        ("LEFT_ANKLE", "RIGHT_ANKLE"),
    ]:
        left_x = lm[pair[0]][0]
        right_x = lm[pair[1]][0]
        assert abs((center_x - left_x) - (right_x - center_x)) < 1, (
            f"{pair} not symmetric around centerline x={center_x}"
        )


def test_passing_an_image_delegates_to_the_detector():
    mgr = MannequinManager(_StubDetector())
    result = mgr.get_target_landmarks(mannequin_image=object())
    assert result == {"HEAD": (1, 1)}
