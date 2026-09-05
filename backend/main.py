"""TryOn FastAPI app: wires up CORS, static file serving, DB init, and every
router (users, garments, outfits, uploads, meta, tryon).

NOTE: this file was overwritten during the mannequin-swap merge with the
`3d-mannequin-garment-viewer` project's standalone strap-analysis backend,
which dropped every route below except /api/health. The routers themselves
(routers/*.py) were untouched and still work — they just weren't being
included anywhere. Restored here; the strap-analysis endpoints from that
merge are preserved as routers/strap_analysis.py and included alongside
the original routers rather than being dropped.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import CORS_ORIGINS, STORAGE_DIR
from database.database import init_db
from routers import garments, meta, outfits, strap_analysis, tryon, uploads, users

app = FastAPI(
    title="TryOn Backend",
    description=(
        "FastAPI backend for TryOn: garment upload/cutout/classification, "
        "outfit building, and (optional) local photorealistic try-on."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


# Serves everything written under backend/storage/ (uploads/, cutouts/,
# warped/, tryon_results/) at /static/<subdir>/<filename>, matching the
# URLs routers/uploads.py and routers/tryon.py hand back to the client.
app.mount("/static", StaticFiles(directory=str(STORAGE_DIR)), name="static")

app.include_router(users.router)
app.include_router(garments.router)
app.include_router(outfits.router)
app.include_router(uploads.router)
app.include_router(meta.router)
app.include_router(tryon.router)
app.include_router(strap_analysis.router)


@app.get("/api/health")
def health():
    return {"status": "healthy", "backend": "python_fastapi"}


if __name__ == "__main__":
    import os

    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8000)))
