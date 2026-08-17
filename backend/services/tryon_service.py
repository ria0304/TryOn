"""Local, API-free photorealistic try-on.

Important design choice: unlike a normal virtual-try-on tool, this service
never asks for a photo of the actual user. The whole point of "TryOn" is a
stand-in body (today: the low-poly 3D mannequin) that gets dressed — this
just renders that same concept photorealistically. So instead of a person
photo, we dress one of a small set of bundled stand-in model photos, picked
by avatar type (feminine/masculine/neutral) to match whatever the user
already picked for their mannequin.

Engine: CatVTON (https://github.com/Zheng-Chong/CatVTON), the mask-free
variant, run fully locally via diffusers. No API key, no per-request network
call once weights are cached. This is genuinely slow on CPU (minutes per
image) — there's no way around that without a GPU or a hosted API, which is
exactly the trade-off that was chosen here on purpose.

Setup is NOT automatic: see backend/third_party/CATVTON_SETUP.md. This
module fails soft (raises TryOnNotReadyError) if that setup hasn't been
done yet, so the rest of the app keeps working either way.
"""
from __future__ import annotations

import secrets
import threading
from pathlib import Path
from typing import Optional

from PIL import Image

from config import (
    CATVTON_BASE_CKPT,
    CATVTON_REPO_DIR,
    THIRD_PARTY_DIR,
    TRYON_DEVICE,
    TRYON_RESULTS_DIR,
)

# Bundled stand-in model photos, one per avatar type. These are meant to be
# copied out of CatVTON's own repo (it ships demo person photos) during
# setup — see CATVTON_SETUP.md step 3. Nothing here is a photo of any real
# app user.
STANDIN_MODELS_DIR = THIRD_PARTY_DIR / "standin_models"
STANDIN_FILENAMES = {
    "feminine": "standin_feminine.jpg",
    "masculine": "standin_masculine.jpg",
    "neutral": "standin_neutral.jpg",
}


class TryOnNotReadyError(RuntimeError):
    """Raised when the local pipeline (repo clone, weights, stand-in photos) isn't set up yet."""


def get_standin_photo_path(avatar: str) -> Path:
    filename = STANDIN_FILENAMES.get(avatar, STANDIN_FILENAMES["neutral"])
    path = STANDIN_MODELS_DIR / filename
    if not path.exists():
        raise TryOnNotReadyError(
            f"No bundled stand-in photo for avatar '{avatar}' at {path}. "
            "Follow backend/third_party/CATVTON_SETUP.md step 3."
        )
    return path


def pipeline_status() -> dict:
    """Cheap, import-free readiness check the frontend polls before showing the button as usable."""
    repo_ready = (CATVTON_REPO_DIR / "model").exists() or (CATVTON_REPO_DIR / "inference.py").exists()
    standins_ready = all((STANDIN_MODELS_DIR / f).exists() for f in STANDIN_FILENAMES.values())
    weights_cached = _weights_cached()
    ready = repo_ready and standins_ready
    return {
        "ready": ready,
        "repoCloned": repo_ready,
        "standinPhotosPresent": standins_ready,
        "weightsCached": weights_cached,
    }


def _weights_cached() -> bool:
    try:
        from huggingface_hub import scan_cache_dir
        cache = scan_cache_dir()
        return any("catvton" in repo.repo_id.lower() or "cat-vton" in repo.repo_id.lower() for repo in cache.repos)
    except Exception:
        # Not knowing isn't a failure — first real call will surface a clear error if weights are missing.
        return False


_pipeline_lock = threading.Lock()
_pipeline_instance: Optional["_CatVTONWrapper"] = None


class _CatVTONWrapper:
    """Lazy-loaded singleton around the CatVTON diffusion pipeline.

    Loading the model is expensive (weights + VRAM/RAM), so this is built
    once on first real generation request and reused after that, not
    per-request.
    """

    def __init__(self):
        import sys
        if str(CATVTON_REPO_DIR) not in sys.path:
            sys.path.insert(0, str(CATVTON_REPO_DIR))

        try:
            from model.pipeline import CatVTONPipeline  # type: ignore
        except ImportError as e:
            raise TryOnNotReadyError(
                "CatVTON repo not found or incomplete at backend/third_party/catvton. "
                "Follow backend/third_party/CATVTON_SETUP.md."
            ) from e

        self.pipeline = CatVTONPipeline(
            base_ckpt=CATVTON_BASE_CKPT,
            attn_ckpt_version="mix",
            attn_ckpt="zhengchong/CatVTON",
            weight_dtype="float32" if TRYON_DEVICE == "cpu" else "float16",
            device=TRYON_DEVICE,
            skip_safety_check=True,
        )


def _get_pipeline() -> _CatVTONWrapper:
    global _pipeline_instance
    with _pipeline_lock:
        if _pipeline_instance is None:
            _pipeline_instance = _CatVTONWrapper()
        return _pipeline_instance


def generate_tryon(avatar: str, garment_image: Image.Image, category: str = "upper") -> Path:
    """Dress the bundled stand-in model (matched to `avatar`) in `garment_image`.

    Returns the path of the saved result PNG under TRYON_RESULTS_DIR.
    Raises TryOnNotReadyError if setup is incomplete.
    """
    standin_path = get_standin_photo_path(avatar)
    person_image = Image.open(standin_path).convert("RGB")
    garment_image = garment_image.convert("RGB")

    wrapper = _get_pipeline()
    result_image = wrapper.pipeline(
        image=person_image,
        condition_image=garment_image,
        cloth_type=category,
    )

    if isinstance(result_image, list):
        result_image = result_image[0]

    filename = f"tryon-{secrets.token_hex(12)}.png"
    out_path = TRYON_RESULTS_DIR / filename
    result_image.save(out_path, format="PNG")
    return out_path
