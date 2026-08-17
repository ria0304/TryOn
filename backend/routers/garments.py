import secrets
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth import get_current_user
from database import models
from database.database import get_db
from database.schemas import GarmentCreate, GarmentOut, GarmentUpdate

router = APIRouter(prefix="/api/garments", tags=["garments"])


@router.get("", response_model=List[GarmentOut])
def list_garments(
    category: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    query = db.query(models.Garment).filter(models.Garment.owner_id == user.id)
    if category:
        query = query.filter(models.Garment.category == category)
    if search:
        query = query.filter(models.Garment.name.ilike(f"%{search}%"))
    return query.order_by(models.Garment.created_at.desc()).all()


@router.get("/by-categories", response_model=Dict[str, List[GarmentOut]])
def list_garments_by_categories(
    categories: str = "",
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    cats = [c.strip() for c in categories.split(",") if c.strip()]
    grouped: Dict[str, List[GarmentOut]] = {c: [] for c in cats}

    if cats:
        items = (
            db.query(models.Garment)
            .filter(models.Garment.owner_id == user.id, models.Garment.category.in_(cats))
            .order_by(models.Garment.created_at.desc())
            .all()
        )
        for g in items:
            grouped.setdefault(g.category, []).append(g)

    return grouped


@router.get("/{garment_id}", response_model=GarmentOut)
def get_garment(
    garment_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    garment = (
        db.query(models.Garment)
        .filter(models.Garment.id == garment_id, models.Garment.owner_id == user.id)
        .first()
    )
    if not garment:
        raise HTTPException(status_code=404, detail="Garment not found")
    return garment


@router.post("", response_model=GarmentOut, status_code=201)
def create_garment(
    payload: GarmentCreate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    garment_id = payload.id or f"custom-{secrets.token_hex(6)}"

    existing = db.query(models.Garment).filter(models.Garment.id == garment_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Garment with this id already exists")

    garment = models.Garment(
        id=garment_id,
        owner_id=user.id,
        name=payload.name,
        category=payload.category,
        color=payload.color,
        style=payload.style,
        is_custom=payload.is_custom,
        image_url=payload.image_url,
        cutout_url=payload.cutout_url,
        warped_url=payload.warped_url,
    )
    db.add(garment)
    db.commit()
    db.refresh(garment)
    return garment


@router.patch("/{garment_id}", response_model=GarmentOut)
def update_garment(
    garment_id: str,
    payload: GarmentUpdate,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    garment = (
        db.query(models.Garment)
        .filter(models.Garment.id == garment_id, models.Garment.owner_id == user.id)
        .first()
    )
    if not garment:
        raise HTTPException(status_code=404, detail="Garment not found")

    updates = payload.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(garment, field, value)

    db.commit()
    db.refresh(garment)
    return garment


@router.delete("/{garment_id}")
def delete_garment(
    garment_id: str,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user),
):
    garment = (
        db.query(models.Garment)
        .filter(models.Garment.id == garment_id, models.Garment.owner_id == user.id)
        .first()
    )
    if not garment:
        raise HTTPException(status_code=404, detail="Garment not found")

    # Strip this garment from any of the user's outfits that reference it.
    outfits = db.query(models.Outfit).filter(models.Outfit.owner_id == user.id).all()
    for outfit in outfits:
        gids = dict(outfit.garment_ids or {})
        changed = False
        for cat, gid in list(gids.items()):
            if gid == garment_id:
                del gids[cat]
                changed = True
        if changed:
            outfit.garment_ids = gids
            if outfit.placements and garment.category in outfit.placements:
                placements = dict(outfit.placements)
                del placements[garment.category]
                outfit.placements = placements

    db.delete(garment)
    db.commit()
    return {"deleted": garment_id}
