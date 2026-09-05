"""Guest-library auth model.

There's no password login. A client calls POST /api/users once, gets back
an opaque id, and sends it as the X-User-Id header on every request after
that. get_current_user() is the single place that turns that header into a
User row — swap this one function for real JWT/session auth later and no
router needs to change.
"""
from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from database import models
from database.database import get_db


def get_current_user(
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
    db: Session = Depends(get_db),
) -> models.User:
    if not x_user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="X-User-Id header is required",
        )
    user = db.query(models.User).filter(models.User.id == x_user_id).first()
    if not user:
        # 401, not 404: a stale/unknown guest id is an auth problem, not a
        # missing-resource problem — and api.ts only auto-clears localStorage
        # and re-registers on 401. Returning 404 here left users permanently
        # stuck once their guest id fell out of the DB (e.g. fresh clone,
        # DB reset) since nothing ever cleared the stale id client-side.
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user
