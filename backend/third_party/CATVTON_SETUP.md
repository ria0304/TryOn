# Photorealistic try-on: one-time setup

This feature dresses a **bundled stand-in model photo** — never a photo of
the app's user — in whatever garment is equipped on the mannequin, using
[CatVTON](https://github.com/Zheng-Chong/CatVTON), an open-source diffusion
try-on model. Everything runs on your own machine: no API key, no
per-request network call, once the one-time setup below is done.

This is optional. If you skip it, the rest of the app works exactly as
before — the "Photorealistic Try-On" button will just show a "not set up"
message instead of a result.

## Why a git submodule instead of just `pip install`

CatVTON isn't published as a pip package, so it can't be pulled in via
`requirements.txt` alone. Its code is tracked in this repo as a **git
submodule** at `backend/third_party/catvton` (see `.gitmodules`), so cloning
this repo brings along a pinned reference to CatVTON's code — you just need
to check it out.

Note this only covers CatVTON's *code*. Its pretrained *weights* (a few GB)
are never part of the git history anywhere — they download once from
Hugging Face on first use and get cached locally, per step 4 below.

## Steps

### 1. Check out the CatVTON submodule

If you cloned this repo fresh:

```bash
git clone --recurse-submodules <this-repo-url>
```

If you already have the repo cloned without submodules:

```bash
git submodule update --init --recursive
```

### 2. Install the Python dependencies

These are already listed in `backend/requirements.txt` (see the
"Photorealistic try-on" section there), so a normal:

```bash
pip install -r backend/requirements.txt
```

pulls in `diffusers`, `accelerate`, and `huggingface_hub` alongside
everything else. If you'd rather skip this feature entirely and keep the
install lighter, comment out that section before installing (and you can
skip step 1 too).

### 3. Add the bundled stand-in model photos

The pipeline needs exactly three photos, one per mannequin avatar type,
placed at:

```
backend/third_party/standin_models/standin_feminine.jpg
backend/third_party/standin_models/standin_masculine.jpg
backend/third_party/standin_models/standin_neutral.jpg
```

CatVTON's own repo ships example person photos for its demo (under its
`resource/demo/example/person/` folder, roughly). Pick one photo per gender
presentation from there, front-facing and full- or upper-body, and copy
each to the filenames above:

```bash
mkdir -p backend/third_party/standin_models
cp backend/third_party/catvton/resource/demo/example/person/<some_woman_photo>.jpg \
   backend/third_party/standin_models/standin_feminine.jpg
cp backend/third_party/catvton/resource/demo/example/person/<some_man_photo>.jpg \
   backend/third_party/standin_models/standin_masculine.jpg
cp backend/third_party/catvton/resource/demo/example/person/<some_photo>.jpg \
   backend/third_party/standin_models/standin_neutral.jpg
```

(Exact filenames in CatVTON's repo may have changed since this was written —
browse that folder and pick whichever three look right for your three
avatar types. Unlike the downloaded weights, these three photos are small
and meant to be committed to this project once you've picked them, so
teammates don't have to repeat this step — see the `.gitignore` exception
for `backend/third_party/standin_models/`.)

These photos are never sent anywhere except through your own local diffusion
pipeline. No user of the app is ever asked for their own photo.

### 4. First real generation call

The first time you click "Generate Photorealistic Try-On", CatVTON's
pretrained weights (a few GB) download once from Hugging Face and get
cached locally (`~/.cache/huggingface` by default). After that first
download, generation runs fully offline.

### 5. Restart the backend

```bash
cd backend && uvicorn main:app --reload
```

`GET /api/tryon/status` reports whether the submodule and stand-in photos
are both in place; the frontend polls this to decide whether to show the
feature as usable.

## Performance

| Hardware | Rough time per image |
|---|---|
| NVIDIA GPU (8GB+ VRAM) | ~5–15 seconds |
| Apple Silicon (`TRYON_DEVICE=mps`) | ~30–90 seconds |
| CPU only (default) | 2–10+ minutes |

Set `TRYON_DEVICE` in `backend/.env` (`cpu`, `cuda`, or `mps`) to match your
hardware.

## Why the mask-free variant

CatVTON ships two variants: a masked one that needs `detectron2`/DensePose
compiled from source (a real pain cross-platform, especially on macOS/
Windows), and a mask-free one that doesn't. This project uses the mask-free
path specifically to avoid that dependency. If you want the higher-quality
masked variant later, see CatVTON's own README for the extra setup, then
adjust `services/tryon_service.py` accordingly.

## License note

CatVTON's code and weights are released under **CC BY-NC-SA 4.0** —
non-commercial use only, share-alike, with attribution. Fine for a
college/research project like this one; would need a second look if this
app were ever monetized. The submodule pulls in CatVTON's own `LICENSE`
file along with its code, so attribution stays intact automatically.
