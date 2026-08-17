"""Central configuration: filesystem paths, CORS origins, upload limits.

Everything here is read from the environment (see .env.example) so the
same code runs unmodified in dev, CI, or a container.
"""
import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent

# --- Storage ---
STORAGE_DIR = BACKEND_DIR / "storage"
UPLOADS_DIR = STORAGE_DIR / "uploads"
CUTOUTS_DIR = STORAGE_DIR / "cutouts"
WARPED_DIR = STORAGE_DIR / "warped"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
CUTOUTS_DIR.mkdir(parents=True, exist_ok=True)
WARPED_DIR.mkdir(parents=True, exist_ok=True)

# --- Database ---
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{BACKEND_DIR / 'tryon.db'}")

# --- CORS ---
_default_origins = "http://localhost:3002,http://127.0.0.1:3002"
CORS_ORIGINS = [
    origin.strip()
    for origin in os.environ.get("CORS_ORIGINS", _default_origins).split(",")
    if origin.strip()
]

# --- Uploads ---
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", 5 * 1024 * 1024))  # 5MB
ALLOWED_UPLOAD_CONTENT_TYPES = {"image/png", "image/jpeg", "image/jpg", "image/webp"}

# --- Server ---
PORT = int(os.environ.get("PORT", 8000))

# --- Photorealistic try-on (local, no external API) ---
# Renders a photorealistic version of the mannequin's outfit using a locally
# run diffusion model (CatVTON). No user photo is involved — the pipeline
# dresses one of a small set of bundled stand-in model photos, picked to
# match the mannequin's avatar setting (feminine/masculine/neutral), the same
# way the mannequin itself is picked today. See backend/third_party/CATVTON_SETUP.md.
THIRD_PARTY_DIR = BACKEND_DIR / "third_party"
CATVTON_REPO_DIR = THIRD_PARTY_DIR / "catvton"
TRYON_RESULTS_DIR = STORAGE_DIR / "tryon_results"
TRYON_RESULTS_DIR.mkdir(parents=True, exist_ok=True)

# "cpu" works everywhere but is slow (minutes/image); set to "cuda" if you
# have an NVIDIA GPU with enough VRAM, or "mps" on Apple Silicon.
TRYON_DEVICE = os.environ.get("TRYON_DEVICE", "cpu")

# Base inpainting checkpoint CatVTON's attention module is applied on top of.
# The original "runwayml/stable-diffusion-inpainting" repo was taken down from
# HF, so upstream CatVTON's own app.py/inference.py now default to this
# re-upload instead. Override via env var if you have your own local copy.
CATVTON_BASE_CKPT = os.environ.get(
    "CATVTON_BASE_CKPT", "booksforcharlie/stable-diffusion-inpainting"
)
