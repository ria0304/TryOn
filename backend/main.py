from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from config import CORS_ORIGINS, CUTOUTS_DIR, TRYON_RESULTS_DIR, UPLOADS_DIR, WARPED_DIR
from database.database import init_db
from routers import garments, meta, outfits, tryon, uploads, users

app = FastAPI(title="TryOn API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-User-Id"],
)


@app.on_event("startup")
def on_startup():
    init_db()


app.mount("/static/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")
app.mount("/static/cutouts", StaticFiles(directory=str(CUTOUTS_DIR)), name="cutouts")
app.mount("/static/warped", StaticFiles(directory=str(WARPED_DIR)), name="warped")
app.mount("/static/tryon_results", StaticFiles(directory=str(TRYON_RESULTS_DIR)), name="tryon_results")

app.include_router(users.router)
app.include_router(meta.router)
app.include_router(garments.router)
app.include_router(outfits.router)
app.include_router(uploads.router)
app.include_router(tryon.router)


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
