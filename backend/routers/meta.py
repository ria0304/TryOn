from fastapi import APIRouter
from typing import List

from categories import CATEGORIES, LAYER_ORDER
from database.schemas import CategoryMeta

router = APIRouter(prefix="/api/meta", tags=["meta"])


@router.get("/categories", response_model=List[CategoryMeta])
def list_categories():
    return [
        CategoryMeta(category=c, layer_order=LAYER_ORDER.get(c, 30))
        for c in CATEGORIES
    ]
