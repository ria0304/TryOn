import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from services.layering import LayeringService


def test_composite_fully_opaque_foreground_fully_replaces_background():
    svc = LayeringService()
    bg = np.full((10, 10, 3), 255, dtype=np.uint8)  # white
    fg = np.zeros((10, 10, 4), dtype=np.uint8)
    fg[:, :, :3] = 0  # black
    fg[:, :, 3] = 255  # fully opaque
    out = svc.composite(bg.copy(), fg)
    assert np.all(out == 0)


def test_composite_fully_transparent_foreground_leaves_background_unchanged():
    svc = LayeringService()
    bg = np.full((10, 10, 3), 128, dtype=np.uint8)
    fg = np.zeros((10, 10, 4), dtype=np.uint8)
    fg[:, :, 3] = 0  # fully transparent
    out = svc.composite(bg.copy(), fg)
    assert np.all(out == 128)


def test_composite_half_alpha_blends_50_50():
    svc = LayeringService()
    bg = np.zeros((5, 5, 3), dtype=np.uint8)  # black
    fg = np.zeros((5, 5, 4), dtype=np.uint8)
    fg[:, :, :3] = 200
    fg[:, :, 3] = 127  # ~50% alpha
    out = svc.composite(bg.copy(), fg)
    # 0 * 0.502 + 200 * 0.498 ~= 99.6
    assert np.all(np.abs(out.astype(int) - 99) <= 3)


def test_render_outfit_layers_multiple_garments_in_order():
    svc = LayeringService()
    mannequin = np.full((10, 10, 3), 255, dtype=np.uint8)  # white base

    red_layer = np.zeros((10, 10, 4), dtype=np.uint8)
    red_layer[:, :, 0] = 255
    red_layer[:, :, 3] = 255  # opaque red covers everything

    blue_layer = np.zeros((10, 10, 4), dtype=np.uint8)
    blue_layer[:5, :, 2] = 255
    blue_layer[:5, :, 3] = 255  # opaque blue on top half only

    out = svc.render_outfit(mannequin, [red_layer, blue_layer])
    # Bottom half: only red was composited (blue transparent there) -> stays red
    assert out[7, 5, 0] == 255 and out[7, 5, 2] == 0
    # Top half: blue composited last, fully opaque -> blue wins
    assert out[2, 5, 2] == 255 and out[2, 5, 0] == 0
