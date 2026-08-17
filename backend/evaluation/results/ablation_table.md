# Ablation study

Toggles the proposed pipeline's own stages on/off; see run_ablation.py docstring for what each arm removes and why 'curved wrapping' is N/A here.

| Arm | Shoulder err | Waist err | Hip err | Hem err | Silhouette IoU | Flare distortion | Edge darkening |
|---|---|---|---|---|---|---|---|
| Full system | 5.6 ± 3.0 (n=7) | 45.5 ± 33.8 (n=10) | 39.6 ± 39.1 (n=6) | 73.1 ± 17.1 (n=10) | 0.81 ± 0.09 (n=10) | 0.15 ± 0.12 (n=10) | 41.9 ± 8.6 (n=10) |
| Remove similarity transform | 101.4 ± 13.1 (n=7) | 165.8 ± 51.3 (n=10) | 186.4 ± 70.8 (n=6) | 178.2 ± 70.7 (n=10) | 0.76 ± 0.06 (n=10) | 0.12 ± 0.09 (n=10) | 40.0 ± 8.4 (n=10) |
| Remove garment landmarks | 15.5 ± 6.1 (n=7) | 43.8 ± 30.2 (n=10) | 41.3 ± 37.0 (n=6) | 73.5 ± 20.2 (n=10) | 0.84 ± 0.04 (n=10) | 0.22 ± 0.13 (n=10) | 42.2 ± 8.3 (n=10) |
| Remove silhouette conform | 10.0 ± 0.0 (n=7) | 35.9 ± 33.1 (n=10) | 30.3 ± 12.2 (n=6) | 72.9 ± 17.0 (n=10) | 0.73 ± 0.08 (n=10) | 0.01 ± 0.01 (n=10) | 41.4 ± 8.6 (n=10) |
| Remove depth shading | 5.6 ± 3.0 (n=7) | 45.5 ± 33.8 (n=10) | 39.6 ± 39.1 (n=6) | 73.1 ± 17.1 (n=10) | 0.81 ± 0.09 (n=10) | 0.15 ± 0.12 (n=10) | 40.0 ± 7.8 (n=10) |
| Remove curved wrapping | N/A (3D-only, three.js frontend feature -- not part of this 2D backend harness) |||||||
