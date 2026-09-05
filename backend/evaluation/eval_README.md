# Evaluation harness

Addresses "What's currently missing" items #1–#3 (experimental evaluation,
baseline comparison, ablation study) for the fitting pipeline in
`services/fitting_service.py`, `services/warping.py`,
`services/landmark_detector.py`.

## Run it

```bash
cd backend/evaluation
python3 run_experiments.py   # baseline comparison -> results/summary_table.md, qualitative_grid.png
python3 run_ablation.py      # ablation study -> results/ablation_table.md
```

No extra dependencies beyond what's already in `requirements.txt`
(numpy/opencv/scipy/pillow). Doesn't need MediaPipe/torch — see
"Why no MediaPipe" below.

## Methodology

**There's no labeled dataset or sample photos in this repo**, so real-photo
evaluation isn't possible without collecting one first. `synthetic_garments.py`
instead procedurally generates 10 RGBA garment cutouts (4 tops, 3 dresses,
3 bottoms) as solid-fill polygon silhouettes with varied proportions (crop
top, oversized hoodie, long-sleeve, A-line midi/mini/maxi dress, skinny/
straight/wide-leg pants). These stand in for background-removed garment
photos structurally, not photographically — every stage downstream
(landmark detection, placement, warping) runs on the real, unmodified
production code, on genuine (if synthetic) silhouette shapes.

**This is a synthetic-geometry benchmark.** It tells you how well each
method aligns a garment silhouette's shoulders/waist/hips/hem to the
mannequin's body model, and how much it distorts the garment's own cut. It
does **not** tell you how the pipeline performs on real photos (occlusion,
imperfect segmentation, fabric texture, lighting) — that would need a
labeled photo dataset, which is a separate, larger effort.

**Baselines** (`baselines.py`) are built only from the app's own real
functions — different (weaker) *compositions* of the same
`services/warping.py` / `services/landmark_detector.py` code the app
already ships, not reimplementations:
- **Resize**: `cv2.resize` + centered paste, no landmarks.
- **Affine**: `WarpingEngine.warp_affine` on 3 landmark correspondences.
- **TPS**: the app's own legacy fallback path — `map_garment_to_body` +
  `WarpingEngine.process_garment` (full multi-point thin-plate-spline).
- **TPS+silhouette**: TPS above, then also run through
  `conform_to_body_silhouette`.
- **Proposed**: `FittingService.fit_garment`'s primary path — similarity
  transform (`compute_placement`) + `conform_to_body_silhouette` +
  `feather_edges` + `add_depth_shading`.

**Metrics** (`metrics.py`) re-run the app's own `garment_landmarks_from_mask`
detector on each method's *output*, and compare against the mannequin's
own reference body landmarks / hem-target rules
(`services/mannequin_manager.py`, `map_garment_to_body`'s anchor logic) —
the same targets the app itself already defines, not an invented ground
truth. Silhouette IoU compares the output's footprint against
`WarpingEngine._body_width_profile`, the exact profile the silhouette-conform
stage targets. **Flare distortion** is new: it compares the garment's own
`flare` field (hem width / hip width, already computed by
`garment_landmarks_from_mask`) before and after warping — a method that
forces every garment onto identical target proportions can hit near-zero
landmark error while still crushing a maxi dress and a pencil skirt into
the same silhouette; this metric catches that.

### Why no MediaPipe
`LandmarkDetector.__init__` builds a MediaPipe pose model purely for
real-photo body-pose detection (`detect_body_landmarks`), which this
benchmark never calls — the target is always the mannequin's fixed
reference landmark set (exactly how `backend/tests/test_fitting.py`
already tests placement logic, via a stub body detector). Garment-landmark
detection and every warping function are plain NumPy/OpenCV, imported and
run directly with no stub involved.

## Results (this run)

See `results/summary_table.md` and `results/ablation_table.md` for the
actual numbers (regenerate with the commands above — nothing here is
hand-typed).

**Headline finding, stated honestly**: raw multi-point TPS baseline
achieves *lower* waist/hip/hem landmark error than the proposed method —
because it warps every garment point exactly onto the mannequin's fixed
target coordinates, by construction. The proposed method's similarity
transform deliberately does *not* do this (it preserves the garment's own
proportions instead of stretching everything to fixed points — see the
docstring in `compute_placement`). What the proposed method actually wins
on is **silhouette IoU** (best body-hugging fit) and **flare distortion**
(least warping of the garment's original cut) — i.e., it's a different
trade-off, not a strict win on every axis. The ablation confirms
`conform_to_body_silhouette` is exactly what trades flare-distortion for
IoU: removing it drops IoU (0.81→0.73) but flare distortion collapses to
~0 (0.15→0.01).

**Also found, not designed for**: the Affine baseline produces an empty
output on pants — `cv2.getAffineTransform` on 3 near-collinear
waist/waist-center points is numerically degenerate. Visible directly in
`results/qualitative_grid.png`.

**Also found**: "Remove depth shading" still shows non-trivial edge
darkening in the ablation table, close to the full system's value. That
darkening is coming from somewhere other than `add_depth_shading` —
likely RGB/alpha interpolation at the silhouette edge during
`cv2.warpAffine`/`remap` without premultiplied alpha (a classic
dark-fringe artifact). Worth a closer look in `warping.py`, but fixing it
is out of scope for this evaluation harness.

## Limitations of this harness

- Synthetic silhouettes, not real photos — see above.
- One body preset (the backend's single 400×550 reference mannequin);
  the frontend's masculine/feminine/neutral 3D avatar variants aren't
  evaluated here.
- "Curved wrapping" (`src/components/ThreeMannequin.tsx`'s 3D cylindrical
  garment shell) and its shading are a three.js/WebGL frontend feature
  with no Python backend equivalent — genuinely not ablatable by this
  harness, reported as N/A rather than invented.
- `apply_folds()` (procedural sinusoidal distortion) isn't evaluated here
  either — it's a photometric/textural effect, not a placement-accuracy
  one, and multi-pose support doesn't exist yet in the backend to evaluate
  against (single standing-mannequin target only).
