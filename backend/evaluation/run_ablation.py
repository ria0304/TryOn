"""Ablation study: toggle each stage of the proposed fit_garment pipeline.

Usage (from backend/evaluation/):
    python3 run_ablation.py

Covers the 2D backend stages that can actually be toggled and measured here:
    - similarity-transform placement    (vs. naive centered resize)
    - silhouette-derived garment landmarks (vs. a crude bounding-box proxy)
    - silhouette conformity              (vs. off)
    - depth shading                      (photometric only -- see note below)

"Curved wrapping" (the frontend's cylindrical 3D garment shell in
src/components/ThreeMannequin.tsx) is a three.js/WebGL feature with no
backend Python equivalent, so it genuinely cannot be ablated by this harness
-- it is reported as N/A rather than a fabricated number.

Depth shading only changes pixel color/brightness, not geometry, so the
geometric metrics (landmark/IoU/flare) are identical with it on or off by
construction. Instead we report a photometric "edge darkening" measure: the
mean brightness drop from the garment's center to its silhouette edge, which
is what add_depth_shading is actually supposed to produce.
"""
from __future__ import annotations

import sys
from pathlib import Path
import csv

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from services.mannequin_manager import MannequinManager  # noqa: E402

from synthetic_garments import build_garment_set  # noqa: E402
from baselines import detect_landmarks, proposed_method  # noqa: E402
import metrics as M  # noqa: E402

RESULTS_DIR = Path(__file__).resolve().parent / "results"
RESULTS_DIR.mkdir(exist_ok=True)
CANVAS_SIZE = (400, 550)


class _StubBodyDetector:
    def detect_body_landmarks(self, image):
        return {}


ARMS = {
    "Full system":                dict(use_similarity=True,  use_conform=True,  use_depth_shading=True,  use_real_landmarks=True),
    "Remove similarity transform": dict(use_similarity=False, use_conform=True,  use_depth_shading=True,  use_real_landmarks=True),
    "Remove garment landmarks":   dict(use_similarity=True,  use_conform=True,  use_depth_shading=True,  use_real_landmarks=False),
    "Remove silhouette conform":  dict(use_similarity=True,  use_conform=False, use_depth_shading=True,  use_real_landmarks=True),
    "Remove depth shading":       dict(use_similarity=True,  use_conform=True,  use_depth_shading=False, use_real_landmarks=True),
}


def _edge_darkening(rgba: np.ndarray) -> float:
    """Mean brightness of interior pixels minus mean brightness near the
    silhouette edge -- a positive value means depth shading is doing what it
    claims (darker near the edges, suggesting the fabric wrapping around the
    body)."""
    alpha = rgba[:, :, 3]
    mask = alpha > 0
    if mask.sum() < 50:
        return float("nan")
    gray = rgba[:, :, :3].astype(np.float32).mean(axis=2)
    import cv2
    interior = cv2.erode(mask.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
    edge = mask & ~interior
    if interior.sum() < 20 or edge.sum() < 20:
        return float("nan")
    return float(gray[interior].mean() - gray[edge].mean())


def run() -> None:
    body_lms = MannequinManager(_StubBodyDetector()).get_target_landmarks(None)
    garments = build_garment_set()

    rows = []
    for g in garments:
        garment_lms = detect_landmarks(g.rgba, g.category)
        for arm_name, kwargs in ARMS.items():
            out = proposed_method(g.rgba, garment_lms, body_lms, g.category, CANVAS_SIZE, **kwargs)
            m = M.evaluate(out, garment_lms, body_lms, g.category)
            m["edge_darkening"] = _edge_darkening(out)
            rows.append({"garment": g.name, "category": g.category, "arm": arm_name, **m})

    fieldnames = ["garment", "category", "arm", "shoulder_error_px", "waist_error_px",
                  "hip_error_px", "hem_error_px", "silhouette_iou", "flare_distortion",
                  "edge_darkening"]
    with open(RESULTS_DIR / "ablation_per_garment.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(r)

    metric_keys = ["shoulder_error_px", "waist_error_px", "hip_error_px",
                   "hem_error_px", "silhouette_iou", "flare_distortion", "edge_darkening"]
    ratio_metrics = {"silhouette_iou", "flare_distortion"}

    def fmt(mean, std, n, k):
        if k in ratio_metrics:
            return f"{mean:.2f} ± {std:.2f} (n={n})"
        return f"{mean:.1f} ± {std:.1f} (n={n})"

    lines = ["# Ablation study\n",
             "Toggles the proposed pipeline's own stages on/off; see run_ablation.py "
             "docstring for what each arm removes and why 'curved wrapping' is N/A here.\n",
             "| Arm | Shoulder err | Waist err | Hip err | Hem err | Silhouette IoU | Flare distortion | Edge darkening |",
             "|---|---|---|---|---|---|---|---|"]
    for arm_name in ARMS:
        cells = [arm_name]
        for k in metric_keys:
            vals = [r[k] for r in rows if r["arm"] == arm_name and r[k] is not None and not (isinstance(r[k], float) and np.isnan(r[k]))]
            if vals:
                cells.append(fmt(float(np.mean(vals)), float(np.std(vals)), len(vals), k))
            else:
                cells.append("n/a")
        lines.append("| " + " | ".join(cells) + " |")
    lines.append("| Remove curved wrapping | N/A (3D-only, three.js frontend feature -- not part of this 2D backend harness) |||||||")

    (RESULTS_DIR / "ablation_table.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))
    print(f"\nWrote results to {RESULTS_DIR}")


if __name__ == "__main__":
    run()
