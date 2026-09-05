import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services import garment_segmentation


def _no_pose(_rgb):
    return np.zeros((80, 100), dtype=np.uint8), False


def test_canonical_asset_preserves_holes_and_disconnected_garment_parts(monkeypatch):
    """Phase 1 must keep photographed alpha exactly: no hole filling, no
    largest-component filtering, and no symmetry reconstruction."""
    monkeypatch.setattr(garment_segmentation, "_pose_exclusion_mask", _no_pose)
    rgba = np.zeros((80, 100, 4), dtype=np.uint8)
    rgba[20:65, 25:75] = (30, 80, 220, 255)       # garment body
    rgba[34:44, 42:58, 3] = 0                     # real neckline/opening
    rgba[16:22, 18:25] = (30, 80, 220, 255)       # disconnected strap

    out, alpha, metadata = garment_segmentation.extract_canonical_garment(rgba, "dress")

    assert out[35, 45, 3] == 0                    # negative space stays open
    assert alpha[18, 20] == 255                   # disconnected strap survives
    assert alpha[30, 30] == 255                   # garment pixels survive
    assert metadata.bounding_box == {"x": 18, "y": 16, "width": 57, "height": 49}
    assert len(metadata.contours) >= 2            # outer contour plus opening/component
    assert metadata.extraction_warnings


def test_canonical_asset_removes_pose_identified_body_pixels(monkeypatch):
    pose_mask = np.zeros((80, 100), dtype=np.uint8)
    pose_mask[0:20, :] = 255                      # detected head/hair region
    monkeypatch.setattr(garment_segmentation, "_pose_exclusion_mask", lambda _rgb: (pose_mask, True))
    rgba = np.zeros((80, 100, 4), dtype=np.uint8)
    rgba[0:20, 40:60] = (40, 40, 40, 255)         # person pixels
    rgba[20:65, 25:75] = (30, 80, 220, 255)       # garment pixels

    out, alpha, metadata = garment_segmentation.extract_canonical_garment(rgba, "dress")

    assert not alpha[:20].any()
    assert alpha[30, 30] == 255
    assert metadata.extraction_confidence > 0.8
