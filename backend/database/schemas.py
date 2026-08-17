from datetime import datetime
from typing import Dict, Optional

from pydantic import BaseModel, ConfigDict


def to_camel(snake: str) -> str:
    first, *rest = snake.split("_")
    return first + "".join(word.capitalize() for word in rest)


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# --- Users ---

class UserOut(CamelModel):
    id: str
    label: Optional[str] = None
    created_at: datetime


# --- Garments ---

class GarmentCreate(CamelModel):
    id: Optional[str] = None
    name: str
    category: str
    color: str = "#000000"
    style: str = "custom"
    is_custom: bool = True
    image_url: Optional[str] = None
    cutout_url: Optional[str] = None
    warped_url: Optional[str] = None


class GarmentUpdate(CamelModel):
    name: Optional[str] = None
    category: Optional[str] = None
    color: Optional[str] = None
    style: Optional[str] = None
    is_custom: Optional[bool] = None
    image_url: Optional[str] = None
    cutout_url: Optional[str] = None
    warped_url: Optional[str] = None


class GarmentOut(CamelModel):
    id: str
    name: str
    category: str
    color: str
    style: str
    is_custom: bool
    image_url: Optional[str] = None
    cutout_url: Optional[str] = None
    warped_url: Optional[str] = None
    created_at: datetime

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


# --- Outfits ---

class OutfitCreate(CamelModel):
    id: Optional[str] = None
    name: str
    avatar: str = "feminine"
    garment_ids: Dict[str, str] = {}
    placements: Optional[Dict[str, dict]] = None


class OutfitOut(CamelModel):
    id: str
    name: str
    avatar: str
    garment_ids: Dict[str, str] = {}
    garments: Dict[str, GarmentOut] = {}
    placements: Dict[str, dict] = {}
    created_at: datetime


# --- Meta ---

class CategoryMeta(CamelModel):
    category: str
    layer_order: int


# --- Uploads ---

class UploadResult(CamelModel):
    url: str
    cutout_url: Optional[str] = None
    warped_url: Optional[str] = None
    filename: str
    content_type: str
    width: Optional[int] = None
    height: Optional[int] = None
    suggested_category: Optional[str] = None
    suggestion_confidence: Optional[float] = None
    suggested_color_hex: Optional[str] = None
    suggested_color_name: Optional[str] = None
    suggested_name: Optional[str] = None


# --- Photorealistic try-on ---
# No person photo in this request model on purpose: the pipeline dresses a
# bundled stand-in photo picked by avatar, not anything the user uploads.

class TryOnRequest(CamelModel):
    avatar: str = "feminine"
    garment_image_url: str
    category: str = "top"


class TryOnResult(CamelModel):
    url: str


class TryOnStatus(CamelModel):
    ready: bool
    repo_cloned: bool
    standin_photos_present: bool
    weights_cached: bool
