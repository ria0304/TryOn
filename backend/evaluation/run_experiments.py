"""Run the baseline-comparison experiment.

Usage (from backend/evaluation/):
    python3 run_experiments.py

Outputs, under backend/evaluation/results/:
    per_garment_results.csv   - every (garment, method) metric row
    summary_table.md          - mean +/- std per method (Missing #1/#2 table)
    qualitative_grid.png      - visual comparison for 3 sample garments
"""
from __future__ import annotations

import sys
from pathlib import Path
import csv

import numpy as np
import cv2

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # backend/
sys.path.insert(0, str(Path(__file__).resolve().parent))          # evaluation/

from services.mannequin_manager import MannequinManager  # noqa: E402

from synthetic_garments import build_garment_set  # noqa: E402
from baselines import METHODS, detect_landmarks  # noqa: E402
import metrics as M  # noqa: E402

RESULTS_DIR = Path(__file__).resolve().parent / "results"
RESULTS_DIR.mkdir(exist_ok=True)

CANVAS_SIZE = (400, 550)  # matches MannequinManager's default canvas


class _StubBodyDetector:
    """Real-photo body-pose detection is out of scope here -- see baselines.py
    docstring for why. The mannequin's fixed reference landmarks are the
    target in every case."""
    def detect_body_landmarks(self, image):
        return {}


def run() -> None:
    body_lms = MannequinManager(_StubBodyDetector()).get_target_landmarks(None)
    garments = build_garment_set()

    rows = []
    for g in garments:
        garment_lms = detect_landmarks(g.rgba, g.category)
        for method_name, fn in METHODS.items():
            output = fn(g.rgba, garment_lms, body_lms, g.category, CANVAS_SIZE)
            m = M.evaluate(output, garment_lms, body_lms, g.category)
            rows.append({"garment": g.name, "category": g.category, "method": method_name, **m})

    # --- raw CSV ---
    fieldnames = ["garment", "category", "method", "shoulder_error_px",
                  "waist_error_px", "hip_error_px", "hem_error_px", "silhouette_iou",
                  "flare_distortion"]
    with open(RESULTS_DIR / "per_garment_results.csv", "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow(r)

    # --- summary table (mean +/- std per method, metric) ---
    metric_keys = ["shoulder_error_px", "waist_error_px", "hip_error_px",
                   "hem_error_px", "silhouette_iou", "flare_distortion"]
    summary = {}
    for method_name in METHODS:
        summary[method_name] = {}
        for k in metric_keys:
            vals = [r[k] for r in rows if r["method"] == method_name and r[k] is not None]
            if vals:
                summary[method_name][k] = (float(np.mean(vals)), float(np.std(vals)), len(vals))
            else:
                summary[method_name][k] = None

    lines = []
    lines.append("# Baseline comparison\n")
    lines.append(f"Synthetic benchmark: {len(garments)} procedurally generated garments "
                  f"({sum(1 for g in garments if g.category == 'top')} tops, "
                  f"{sum(1 for g in garments if g.category == 'dress')} dresses, "
                  f"{sum(1 for g in garments if g.category == 'bottom')} bottoms). "
                  "See README.md for methodology and limitations.\n")
    lines.append("| Method | Shoulder err (px) | Waist err (px) | Hip err (px) | Hem err (px) | Silhouette IoU | Flare distortion |")
    lines.append("|---|---|---|---|---|---|---|")
    ratio_metrics = {"silhouette_iou", "flare_distortion"}
    for method_name in METHODS:
        cells = [method_name]
        for k in metric_keys:
            s = summary[method_name][k]
            if s is None:
                cells.append("n/a")
            else:
                mean, std, n = s
                if k in ratio_metrics:
                    cells.append(f"{mean:.2f} ± {std:.2f} (n={n})")
                else:
                    cells.append(f"{mean:.1f} ± {std:.1f} (n={n})")
        lines.append("| " + " | ".join(cells) + " |")
    (RESULTS_DIR / "summary_table.md").write_text("\n".join(lines) + "\n")
    print("\n".join(lines))

    # --- qualitative grid for 3 representative garments ---
    sample_names = ["top_1", "dress_0", "bottom_1"]
    samples = [g for g in garments if g.name in sample_names]
    _render_qualitative_grid(samples, body_lms)

    print(f"\nWrote results to {RESULTS_DIR}")


def _composite_on_gray(rgba: np.ndarray, size=CANVAS_SIZE) -> np.ndarray:
    w, h = size
    bg = np.full((h, w, 3), 235, dtype=np.uint8)
    alpha = rgba[:, :, 3:4].astype(np.float32) / 255.0
    rgb = rgba[:, :, :3].astype(np.float32)
    out = bg.astype(np.float32) * (1 - alpha) + rgb * alpha
    return out.astype(np.uint8)


def _render_qualitative_grid(samples, body_lms) -> None:
    method_names = list(METHODS.keys())
    tw, th = CANVAS_SIZE
    scale = 0.55
    cw, ch = int(tw * scale), int(th * scale)
    pad = 10
    label_h = 22
    grid_w = pad + len(method_names) * (cw + pad)
    grid_h = pad + label_h + len(samples) * (ch + pad + label_h)
    grid = np.full((grid_h, grid_w, 3), 255, dtype=np.uint8)

    for col, name in enumerate(method_names):
        x = pad + col * (cw + pad)
        cv2.putText(grid, name, (x, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (20, 20, 20), 1, cv2.LINE_AA)

    for row, g in enumerate(samples):
        garment_lms = detect_landmarks(g.rgba, g.category)
        y_label = pad + label_h + row * (ch + pad + label_h)
        cv2.putText(grid, f"{g.name}", (pad, y_label - 4), cv2.FONT_HERSHEY_SIMPLEX,
                    0.42, (20, 20, 20), 1, cv2.LINE_AA)
        for col, name in enumerate(method_names):
            fn = METHODS[name]
            out = fn(g.rgba, garment_lms, body_lms, g.category, CANVAS_SIZE)
            img = _composite_on_gray(out)
            img_small = cv2.resize(img, (cw, ch), interpolation=cv2.INTER_AREA)
            x = pad + col * (cw + pad)
            y = y_label
            grid[y:y + ch, x:x + cw] = img_small

    cv2.imwrite(str(RESULTS_DIR / "qualitative_grid.png"), cv2.cvtColor(grid, cv2.COLOR_RGB2BGR))


if __name__ == "__main__":
    run()
