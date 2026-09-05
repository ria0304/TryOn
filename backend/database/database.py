from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

from config import DATABASE_URL

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    # Import models so they're registered on Base.metadata before create_all
    from database import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    # The app uses SQLite without a migration runner. Add this Phase 1 column
    # for existing local wardrobes while keeping fresh databases create_all-only.
    if engine.dialect.name == "sqlite":
        columns = {column["name"] for column in inspect(engine).get_columns("garments")}
        if "canonical_asset" not in columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE garments ADD COLUMN canonical_asset JSON"))
