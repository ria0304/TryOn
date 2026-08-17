"""Shared pytest fixtures for the TryOn backend test suite.

Each test gets a fresh, isolated SQLite file (not the real backend/tryon.db)
so tests never touch real data and can run in any order.
"""
import io
import sys
from pathlib import Path

import pytest
from PIL import Image

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """A TestClient wired to a throwaway SQLite DB per test."""
    db_path = tmp_path / "test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path}")

    # config.py / database.py read env vars at import time, and modules like
    # auth.py do `from database.database import get_db` at import time too
    # -- so ANY previously-imported backend module (not just database/main)
    # can hold a stale reference to the previous test's SQLite engine.
    # Evict every module whose source file lives under backend/ so each
    # test gets a fully fresh import graph bound to its own tmp DB.
    for mod_name, mod in list(sys.modules.items()):
        mod_file = getattr(mod, "__file__", None)
        if mod_file and mod_file.startswith(str(BACKEND_DIR)):
            del sys.modules[mod_name]

    import main as main_module
    from database.database import init_db

    init_db()

    from fastapi.testclient import TestClient
    with TestClient(main_module.app) as c:
        yield c


@pytest.fixture()
def user_headers(client):
    """Register a guest user and return the X-User-Id header dict for it."""
    resp = client.post("/api/users")
    assert resp.status_code == 201
    user_id = resp.json()["id"]
    return {"X-User-Id": user_id}


@pytest.fixture()
def sample_png_bytes():
    """A tiny in-memory RGBA PNG, valid enough for upload endpoint tests."""
    img = Image.new("RGBA", (64, 64), (220, 20, 60, 255))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
