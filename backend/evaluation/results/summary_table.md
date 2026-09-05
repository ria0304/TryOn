# Baseline comparison

Synthetic benchmark: 10 procedurally generated garments (4 tops, 3 dresses, 3 bottoms). See README.md for methodology and limitations.

| Method | Shoulder err (px) | Waist err (px) | Hip err (px) | Hem err (px) | Silhouette IoU | Flare distortion |
|---|---|---|---|---|---|---|
| Resize | 110.3 ± 3.0 (n=7) | 173.9 ± 30.1 (n=10) | 191.5 ± 45.9 (n=6) | 179.6 ± 71.0 (n=10) | 0.67 ± 0.05 (n=10) | 0.01 ± 0.01 (n=10) |
| Affine | 22.1 ± 19.1 (n=7) | 60.7 ± 25.7 (n=7) | 75.4 ± 19.4 (n=3) | 181.4 ± 64.0 (n=7) | 0.56 ± 0.05 (n=7) | 0.03 ± 0.02 (n=7) |
| TPS | 24.5 ± 7.3 (n=7) | 15.5 ± 19.9 (n=10) | 0.8 ± 0.7 (n=6) | 0.1 ± 0.2 (n=10) | 0.74 ± 0.07 (n=10) | 0.25 ± 0.10 (n=10) |
| TPS+silhouette | 22.8 ± 10.8 (n=7) | 20.8 ± 21.4 (n=10) | 1.5 ± 1.7 (n=6) | 0.1 ± 0.2 (n=10) | 0.77 ± 0.08 (n=10) | 0.21 ± 0.10 (n=10) |
| Proposed | 5.6 ± 3.0 (n=7) | 45.5 ± 33.8 (n=10) | 39.6 ± 39.1 (n=6) | 73.1 ± 17.1 (n=10) | 0.81 ± 0.09 (n=10) | 0.15 ± 0.12 (n=10) |
