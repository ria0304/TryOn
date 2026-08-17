import io
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from color_detection import detect_dominant_color, _map_rgb_to_color_name, COLOR_DICTIONARY


def _solid_rgba_png(rgb, size=(120, 120)):
    img = Image.new("RGBA", size, (*rgb, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def test_solid_red_garment_detected_as_red_family():
    png = _solid_rgba_png((190, 30, 45))  # exact "Red" reference point
    hex_color, name = detect_dominant_color(png)
    assert hex_color is not None
    assert name in ("Red", "Brick Red", "Maroon", "Burgundy")


def test_solid_black_garment_detected_as_black():
    # A solid black swatch fails the "quality" pixel filter (too dark),
    # but the function is designed to fall back to the full unfiltered
    # pixel set rather than give up -- so this should still resolve to
    # a real black-ish color, not None.
    png = _solid_rgba_png((25, 25, 25))
    hex_color, name = detect_dominant_color(png)
    assert hex_color == "#191919"
    assert name == "Black"


def test_too_small_image_returns_none():
    png = _solid_rgba_png((190, 30, 45), size=(10, 10))  # 100px < 200px floor
    hex_color, name = detect_dominant_color(png)
    assert hex_color is None
    assert name is None


def test_garbage_bytes_do_not_raise():
    hex_color, name = detect_dominant_color(b"not a real image")
    assert hex_color is None
    assert name is None


def test_map_rgb_to_color_name_exact_match():
    for name, rgb in COLOR_DICTIONARY.items():
        assert _map_rgb_to_color_name(*rgb) == name


def test_hex_color_is_valid_format():
    png = _solid_rgba_png((190, 30, 45))
    hex_color, _ = detect_dominant_color(png)
    assert hex_color.startswith("#")
    assert len(hex_color) == 7
    int(hex_color[1:], 16)  # raises if not valid hex
