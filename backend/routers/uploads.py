import io
import secrets
from pathlib import Path
import numpy as np

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile
from PIL import Image, ImageOps

from auth import get_current_user
from classification import classify_garment_detail, resolve_category_with_geometry
from color_detection import detect_dominant_color
from config import ALLOWED_UPLOAD_CONTENT_TYPES, CUTOUTS_DIR, MAX_UPLOAD_BYTES, UPLOADS_DIR, WARPED_DIR
from database import models
from database.schemas import UploadResult
from services.fitting_service import FittingService
from services.garment_segmentation import compute_flare, compute_top_ratio, extract_garment
from services.naming import build_garment_name

router = APIRouter(prefix="/api/uploads", tags=["uploads"])
fitting_service = FittingService()

_EXT_BY_CONTENT_TYPE = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/webp": ".webp",
}

def _crop_to_content(image: Image.Image) -> Image.Image:
    """Crop the image to the non-transparent area."""
    if image.mode != 'RGBA':
        return image
    
    # Get the alpha channel
    alpha = image.split()[-1]
    bbox = alpha.getbbox()
    
    if bbox:
        # Add a small padding
        padding = 20
        w, h = image.size
        bbox = (
            max(0, bbox[0] - padding),
            max(0, bbox[1] - padding),
            min(w, bbox[2] + padding),
            min(h, bbox[3] + padding)
        )
        return image.crop(bbox)
    return image

def _remove_background(image: Image.Image) -> Image.Image:
    """Robust background removal with centering and cropping."""
    try:
        from rembg import remove
        
        # 1. Initial background removal
        buf = io.BytesIO()
        image.save(buf, format="PNG")
        result_bytes = remove(buf.getvalue())
        cutout = Image.open(io.BytesIO(result_bytes)).convert("RGBA")
        
        # 2. Crop to the actual garment content
        cutout = _crop_to_content(cutout)
        
        return cutout
    except Exception as e:
        print(f"Background removal failed: {e}")
        return image.convert("RGBA")

@router.post("/garment", response_model=UploadResult, status_code=201)
async def upload_garment(
    file: UploadFile,
    skip_background_removal: bool = Query(default=False),
    user: models.User = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_UPLOAD_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported content type: {file.content_type}")

    raw = await file.read()
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=400, detail="File exceeds 5MB limit")

    ext = _EXT_BY_CONTENT_TYPE.get(file.content_type, ".png")
    stem = secrets.token_hex(16)
    filename = f"{stem}{ext}"

    upload_path: Path = UPLOADS_DIR / filename
    upload_path.write_bytes(raw)

    width = height = None
    suggested_category = "accessories"
    suggestion_confidence = 0.2
    suggested_color_hex = None
    suggested_color_name = None
    suggested_name = None
    cutout_url = None
    warped_url = None

    try:
        image = Image.open(io.BytesIO(raw))
        # Handle orientation from EXIF
        image = ImageOps.exif_transpose(image)
        width, height = image.size

        classification_source = raw
        aspect_ratio = None
        top_label = None
        flare = False
        flare_at_classify = None
        top_ratio_at_classify = None
        person_cutout_np = None

        if not skip_background_removal:
            # 1. Background Removal (removes the whole person)
            cutout_image = _remove_background(image)
            person_cutout_np = np.array(cutout_image)

            # 1b. Garment-Only Extraction (provisional, used only to produce a
            # clean classification source): strip the person's skin so CLIP
            # classifies the garment, not the person.
            garment_only = extract_garment(person_cutout_np, category="dress")
            garment_only_image = Image.fromarray(garment_only, mode="RGBA")
            flare_at_classify = compute_flare(garment_only[:, :, 3])
            top_ratio_at_classify = compute_top_ratio(garment_only[:, :, 3])

            cutout_buf = io.BytesIO()
            garment_only_image.save(cutout_buf, format="PNG")
            classification_source = cutout_buf.getvalue()

        # 2. Vision-based Classification (category + confidence + top label + aspect ratio)
        detail = classify_garment_detail(classification_source)
        suggested_category = detail["category"]
        suggestion_confidence = detail["confidence"]
        top_label = detail.get("top_label")
        aspect_ratio = detail.get("aspect_ratio")

        # 2b. Silhouette-geometry override: an obviously torso-sized, flared
        # garment must not stay bucketed as a small accessory, or the fitting
        # stage will "fit" a dress like a necklace.
        suggested_category = resolve_category_with_geometry(
            suggested_category,
            suggestion_confidence,
            aspect_ratio,
            flare_at_classify,
            top_ratio_at_classify,
        )

        if not skip_background_removal:
            # 1c. Final Garment-Only Extraction with the true category (enables
            # category-appropriate reconstruction, e.g. symmetry for dresses).
            garment_only = extract_garment(person_cutout_np, category=suggested_category)
            garment_only_image = Image.fromarray(garment_only, mode="RGBA")
            flare = compute_flare(garment_only[:, :, 3])

            cutout_filename = f"cutout-{stem}.png"
            cutout_path = CUTOUTS_DIR / cutout_filename
            garment_only_image.save(cutout_path, format="PNG")
            cutout_url = f"/static/cutouts/{cutout_filename}"

            # Use the final garment-only cutout for color detection and fitting
            cutout_buf = io.BytesIO()
            garment_only_image.save(cutout_buf, format="PNG")
            classification_source = cutout_buf.getvalue()

        # 3. Dominant Color Detection
        suggested_color_hex, suggested_color_name = detect_dominant_color(classification_source)

        # 3b. Auto-name: colour + style/length + category
        suggested_name = build_garment_name(
            suggested_category,
            suggested_color_name,
            top_label,
            aspect_ratio,
            flare=flare,
        )

        if not skip_background_removal:
            # 4. Intelligent Fitting
            try:
                # We use the cutout for fitting as it's cleaner than the raw screenshot
                warped_rgba = fitting_service.fit_garment(classification_source, suggested_category)
                warped_filename = f"warped-{stem}.png"
                warped_path = WARPED_DIR / warped_filename
                Image.fromarray(warped_rgba).save(warped_path, format="PNG")
                warped_url = f"/static/warped/{warped_filename}"
            except Exception as e:
                print(f"Fitting failed: {e}")
                pass
                
    except Exception as e:
        print(f"Processing failed: {e}")
        pass

    return UploadResult(
        url=f"/static/uploads/{filename}",
        cutout_url=cutout_url,
        warped_url=warped_url,
        filename=filename,
        content_type=file.content_type,
        width=width,
        height=height,
        suggested_category=suggested_category,
        suggestion_confidence=suggestion_confidence,
        suggested_color_hex=suggested_color_hex,
        suggested_color_name=suggested_color_name,
        suggested_name=suggested_name,
    )
