from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String
from sqlalchemy.orm import relationship
from sqlalchemy.types import JSON

from database.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, index=True)
    label = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    garments = relationship("Garment", back_populates="owner", cascade="all, delete-orphan")
    outfits = relationship("Outfit", back_populates="owner", cascade="all, delete-orphan")


class Garment(Base):
    __tablename__ = "garments"

    id = Column(String, primary_key=True, index=True)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    category = Column(String, nullable=False, index=True)
    color = Column(String, nullable=False, default="#000000")
    style = Column(String, nullable=False, default="custom")
    is_custom = Column(Boolean, nullable=False, default=True)
    image_url = Column(String, nullable=True)
    cutout_url = Column(String, nullable=True)
    warped_url = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    owner = relationship("User", back_populates="garments")


class Outfit(Base):
    __tablename__ = "outfits"

    id = Column(String, primary_key=True, index=True)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    avatar = Column(String, nullable=False, default="feminine")
    # {category: garment_id}
    garment_ids = Column(JSON, nullable=False, default=dict)
    # {category: {x, y, scale, locked, rotation, zIndex, flipX}}
    placements = Column(JSON, nullable=True, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    owner = relationship("User", back_populates="outfits")
