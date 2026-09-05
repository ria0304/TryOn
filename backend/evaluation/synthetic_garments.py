"""Procedural synthetic garment generator for offline evaluation.

The repo ships no sample photos and no labeled dataset, so real-photo
evaluation isn't possible without one. Instead this module generates
parametric RGBA garment cutouts (tops, dresses, bottoms) with known,
varied proportions -- solid-fill polygons that stand in for a background-
removed garment photo the way `garment_segmentation.py`'s output would
look. This lets every downstream stage (landmark detection, placement,
warping) run on realistic *silhouette shapes* end-to-end, exactly as it
would on a real cutout, without needing photographic textures.

This is explicitly a synthetic-geometry benchmark, not a substitute for
real-photo evaluation -- see backend/evaluation/README.md for that caveat
and for what it does and doesn't establish.
"""
from __future__ import annotations

import numpy as np
import cv2
from dataclasses import dataclass
from typing import List, Tuple

Point = Tuple[float, float]


@dataclass
class SyntheticGarment:
    name: str
    category: str
    rgba: np.ndarray  # HxWx4 uint8


def _canvas(w: int, h: int) -> np.ndarray:
    return np.zeros((h, w, 4), dtype=np.uint8)


def _fill_color(seed: int) -> Tuple[int, int, int]:
    """Deterministic, visually distinct fabric colors per garment."""
    rng = np.random.default_rng(seed)
    return tuple(int(v) for v in rng.integers(60, 220, size=3))


def _draw_polygon(canvas: np.ndarray, pts: List[Point], color: Tuple[int, int, int]) -> None:
    poly = np.array(pts, dtype=np.int32).reshape((-1, 1, 2))
    cv2.fillPoly(canvas, [poly], (*color, 255))


def make_top(
    seed: int,
    canvas_w: int = 260,
    canvas_h: int = 300,
    shoulder_w: float = 150,
    hem_w: float = 130,
    torso_w: float = 100,
    sleeve_len: float = 55,
    sleeve_w: float = 40,
    length: float = 220,
    neckline_depth: float = 22,
) -> np.ndarray:
    """A short-sleeve top: shoulder plateau with sleeves, tapered torso, hem."""
    cx = canvas_w / 2
    top_y = 15
    shoulder_y = top_y + 18
    sleeve_end_y = shoulder_y + sleeve_len
    waist_y = top_y + length * 0.55
    hem_y = top_y + length
    canvas = _canvas(canvas_w, int(hem_y + 15))
    color = _fill_color(seed)

    # Torso body (neckline notch cut via two triangles at the collar).
    torso_pts = [
        (cx - shoulder_w / 2, shoulder_y),
        (cx - torso_w / 2, sleeve_end_y),
        (cx - hem_w / 2, hem_y),
        (cx + hem_w / 2, hem_y),
        (cx + torso_w / 2, sleeve_end_y),
        (cx + shoulder_w / 2, shoulder_y),
        (cx + neckline_depth * 0.9, top_y),
        (cx, top_y + neckline_depth),
        (cx - neckline_depth * 0.9, top_y),
    ]
    _draw_polygon(canvas, torso_pts, color)

    # Sleeves (rectangles hanging off each shoulder).
    for side in (-1, 1):
        sx = cx + side * shoulder_w / 2
        sleeve_pts = [
            (sx, shoulder_y),
            (sx + side * sleeve_w, shoulder_y + 4),
            (sx + side * (sleeve_w * 0.8), sleeve_end_y),
            (sx - side * (torso_w * 0.05), sleeve_end_y),
        ]
        _draw_polygon(canvas, sleeve_pts, color)

    return canvas


def make_dress(
    seed: int,
    canvas_w: int = 300,
    canvas_h: int = 420,
    shoulder_w: float = 130,
    bust_w: float = 120,
    waist_w: float = 95,
    hip_w: float = 115,
    hem_w: float = 220,
    length: float = 380,
    neckline_depth: float = 20,
) -> np.ndarray:
    """An A-line dress: fitted bodice, flared hem below the hips."""
    cx = canvas_w / 2
    top_y = 15
    shoulder_y = top_y + 20
    bust_y = shoulder_y + length * 0.14
    waist_y = shoulder_y + length * 0.35
    hip_y = shoulder_y + length * 0.50
    hem_y = top_y + length
    canvas = _canvas(canvas_w, int(hem_y + 15))
    color = _fill_color(seed)

    pts = [
        (cx - shoulder_w / 2, shoulder_y),
        (cx - bust_w / 2, bust_y),
        (cx - waist_w / 2, waist_y),
        (cx - hip_w / 2, hip_y),
        (cx - hem_w / 2, hem_y),
        (cx + hem_w / 2, hem_y),
        (cx + hip_w / 2, hip_y),
        (cx + waist_w / 2, waist_y),
        (cx + bust_w / 2, bust_y),
        (cx + shoulder_w / 2, shoulder_y),
        (cx + neckline_depth * 0.9, top_y),
        (cx, top_y + neckline_depth),
        (cx - neckline_depth * 0.9, top_y),
    ]
    _draw_polygon(canvas, pts, color)
    return canvas


def make_bottom(
    seed: int,
    canvas_w: int = 260,
    canvas_h: int = 380,
    waist_w: float = 110,
    hip_w: float = 120,
    leg_w: float = 46,
    inseam_gap: float = 14,
    length: float = 340,
    taper: float = 0.85,
) -> np.ndarray:
    """A pair of pants: waistband, hips, two tapered legs."""
    cx = canvas_w / 2
    top_y = 15
    hip_y = top_y + length * 0.18
    crotch_y = top_y + length * 0.32
    hem_y = top_y + length
    canvas = _canvas(canvas_w, int(hem_y + 15))
    color = _fill_color(seed)

    waistband = [
        (cx - waist_w / 2, top_y),
        (cx - hip_w / 2, hip_y),
        (cx + hip_w / 2, hip_y),
        (cx + waist_w / 2, top_y),
    ]
    _draw_polygon(canvas, waistband, color)

    ankle_w = leg_w * taper
    for side in (-1, 1):
        outer_hip = cx + side * hip_w / 2
        outer_hem = cx + side * (inseam_gap / 2 + ankle_w) if side > 0 else cx - (inseam_gap / 2 + ankle_w)
        inner_hem = cx + side * inseam_gap / 2
        leg_pts = [
            (outer_hip, hip_y),
            (cx + side * inseam_gap / 2, crotch_y),
            (inner_hem, hem_y),
            (outer_hem, hem_y),
            (outer_hip - side * leg_w * 0.15, crotch_y),
        ]
        _draw_polygon(canvas, leg_pts, color)

    return canvas


def build_garment_set() -> List[SyntheticGarment]:
    """A varied benchmark set: several size/proportion variants per category."""
    garments: List[SyntheticGarment] = []

    top_variants = [
        dict(shoulder_w=150, hem_w=130, torso_w=100, length=220, seed=1),   # regular tee
        dict(shoulder_w=175, hem_w=175, torso_w=140, length=240, seed=2),   # oversized hoodie
        dict(shoulder_w=135, hem_w=110, torso_w=90, length=170, seed=3),    # crop top
        dict(shoulder_w=150, hem_w=120, torso_w=95, sleeve_len=90, length=250, seed=4),  # long-sleeve
    ]
    for i, params in enumerate(top_variants):
        seed = params.pop("seed")
        garments.append(SyntheticGarment(f"top_{i}", "top", make_top(seed, **params)))

    dress_variants = [
        dict(shoulder_w=130, bust_w=120, waist_w=95, hip_w=115, hem_w=220, length=380, seed=11),  # A-line midi
        dict(shoulder_w=125, bust_w=118, waist_w=100, hip_w=108, hem_w=140, length=230, seed=12),  # mini, less flare
        dict(shoulder_w=135, bust_w=128, waist_w=90, hip_w=122, hem_w=300, length=460, seed=13),   # maxi, very flared
    ]
    for i, params in enumerate(dress_variants):
        seed = params.pop("seed")
        garments.append(SyntheticGarment(f"dress_{i}", "dress", make_dress(seed, **params)))

    bottom_variants = [
        dict(waist_w=110, hip_w=120, leg_w=46, length=340, seed=21),   # straight jeans
        dict(waist_w=100, hip_w=112, leg_w=30, length=340, taper=0.7, seed=22),  # skinny
        dict(waist_w=120, hip_w=132, leg_w=60, length=340, taper=1.05, seed=23),  # wide leg
    ]
    for i, params in enumerate(bottom_variants):
        seed = params.pop("seed")
        garments.append(SyntheticGarment(f"bottom_{i}", "bottom", make_bottom(seed, **params)))

    return garments
