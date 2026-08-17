import secrets

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from database import models
from database.database import get_db
from database.schemas import UserOut

router = APIRouter(prefix="/api/users", tags=["users"])


def _new_user_id() -> str:
    return f"user-{secrets.token_hex(8)}"


@router.post("", response_model=UserOut, status_code=201)
def create_user(db: Session = Depends(get_db)):
    user = models.User(id=_new_user_id())
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
