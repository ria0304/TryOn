"""Photorealistic try-on endpoint.

Deliberately takes NO person photo. The whole feature is "dress the app's
own stand-in body, photorealistically" — same concept as the 3D mannequin,
just rendered by a diffusion model instead of Three.js. The only inputs are
the mannequin's avatar setting (to pick which bundled stand-in photo to
dress) and the garment image that's already equipped in the outfit builder.
"""
import io

from fastapi import APIRouter, Depends, HTTPException
from PIL import Image

from auth import get_current_user
from config import TRYON_RESULTS_DIR
from database import models
from database.schemas import TryOnRequest, TryOnResult, TryOnStatus
from services.tryon_service import TryOnNotReadyError, generate_tryon, pipeline_status

router = APIRouter(prefix="/api/tryon", tags=["tryon"])

# Mirrors the mannequin's own top/dress → upper-body garment convention.
_CATEGORY_TO_CLOTH_TYPE = {
    "top": "upper",
    "dress": "overall",
    "jacket": "outer",
    "bottom": "lower",
}


@router.get("/status", response_model=TryOnStatus)
def get_status():
    return TryOnStatus(**pipeline_status())


@router.post("", response_model=TryOnResult)
async def create_tryon(
    payload: TryOnRequest,
    user: models.User = Depends(get_current_user),
):
    if payload.garment_image_url is None:
        raise HTTPException(status_code=400, detail="garmentImageUrl is required")

    garment_bytes = await _load_local_or_remote(payload.garment_image_url)
    try:
        garment_image = Image.open(io.BytesIO(garment_bytes))
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read the garment image")

    cloth_type = _CATEGORY_TO_CLOTH_TYPE.get(payload.category, "upper")

    try:
        result_path = generate_tryon(payload.avatar, garment_image, category=cloth_type)
    except TryOnNotReadyError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Try-on generation failed: {e}")

    return TryOnResult(url=f"/static/tryon_results/{result_path.name}")


async def _load_local_or_remote(url: str) -> bytes:
    """Garment images live under our own /static mounts; resolve those from
    disk directly instead of round-tripping through HTTP to ourselves."""
    from config import CUTOUTS_DIR, UPLOADS_DIR, WARPED_DIR

    static_map = {
        "/static/cutouts/": CUTOUTS_DIR,
        "/static/uploads/": UPLOADS_DIR,
        "/static/warped/": WARPED_DIR,
    }
    for prefix, directory in static_map.items():
        if prefix in url:
            filename = url.split(prefix, 1)[1]
            path = directory / filename
            if not path.exists():
                raise HTTPException(status_code=404, detail="Garment image not found")
            return path.read_bytes()

    raise HTTPException(status_code=400, detail="Unrecognized garment image URL")
