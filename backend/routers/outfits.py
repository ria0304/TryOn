import secrets
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from categories import EXCLUSIVE_WITH
from database import models
from database.database import get_db
from database.schemas import OutfitCreate, OutfitOut

router = APIRouter(prefix="/api/outfits", tags=["outfits"])


def _expand(outfit: models.Outfit, db: Session, owner_id: str) -> dict:
    garment_ids = outfit.garment_ids or {}
    garments = {}
    if garment_ids:
        rows = (
            db.query(models.Garment)
            .filter(models.Garment.owner_id == owner_id, models.Garment.id.in_(garment_ids.values()))
            .all()
        )
        by_id = {g.id: g for g in rows}
        for cat, gid in garment_ids.items():
            if gid in by_id:
                garments[cat] = by_id[gid]

    return {
        "id": outfit.id,
        "name": outfit.name,
        "avatar": outfit.avatar,
        "garment_ids": garment_ids,
        "garments": garments,
        "placements": outfit.placements or {},
        "created_at": outfit.created_at,
    }


@router.get("", response_model=List[OutfitOut])
def list_outfits(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    outfits = (
        db.query(models.Outfit)
        .filter(models.Outfit.owner_id == user.id)
        .order_by(models.Outfit.created_at.desc())
        .all()
    )
    return [_expand(o, db, user.id) for o in outfits]


@router.get("/{outfit_id}", response_model=OutfitOut)
def get_outfit(
    outfit_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    outfit = (
        db.query(models.Outfit)
        .filter(models.Outfit.id == outfit_id, models.Outfit.owner_id == user.id)
        .first()
    )
    if not outfit:
        raise HTTPException(status_code=404, detail="Outfit not found")
    return _expand(outfit, db, user.id)


@router.post("", response_model=OutfitOut, status_code=201)
def create_outfit(
    payload: OutfitCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    garment_ids = payload.garment_ids or {}

    # Dress/top/bottom exclusivity
    for exclusive_cat, conflicts_with in EXCLUSIVE_WITH.items():
        if exclusive_cat in garment_ids:
            overlap = [c for c in conflicts_with if c in garment_ids]
            if overlap:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"'{exclusive_cat}' can't be combined with {', '.join(overlap)} — "
                        f"a {exclusive_cat} replaces both."
                    ),
                )

    # Every referenced garment must belong to this user
    if garment_ids:
        owned_count = (
            db.query(models.Garment)
            .filter(models.Garment.owner_id == user.id, models.Garment.id.in_(garment_ids.values()))
            .count()
        )
        if owned_count != len(set(garment_ids.values())):
            raise HTTPException(status_code=400, detail="One or more garment ids are unknown")

    outfit_id = payload.id or f"outfit-{secrets.token_hex(6)}"
    if db.query(models.Outfit).filter(models.Outfit.id == outfit_id).first():
        raise HTTPException(status_code=409, detail="Outfit with this id already exists")

    outfit = models.Outfit(
        id=outfit_id,
        owner_id=user.id,
        name=payload.name,
        avatar=payload.avatar,
        garment_ids=garment_ids,
        placements=payload.placements or {},
    )
    db.add(outfit)
    db.commit()
    db.refresh(outfit)
    return _expand(outfit, db, user.id)


@router.delete("/{outfit_id}")
def delete_outfit(
    outfit_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    outfit = (
        db.query(models.Outfit)
        .filter(models.Outfit.id == outfit_id, models.Outfit.owner_id == user.id)
        .first()
    )
    if not outfit:
        raise HTTPException(status_code=404, detail="Outfit not found")
    db.delete(outfit)
    db.commit()
    return {"deleted": outfit_id}
