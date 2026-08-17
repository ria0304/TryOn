def test_upload_requires_auth(client, sample_png_bytes):
    resp = client.post(
        "/api/uploads/garment",
        files={"file": ("garment.png", sample_png_bytes, "image/png")},
    )
    assert resp.status_code == 401


def test_upload_rejects_unsupported_content_type(client, user_headers, sample_png_bytes):
    resp = client.post(
        "/api/uploads/garment",
        files={"file": ("garment.txt", sample_png_bytes, "text/plain")},
        headers=user_headers,
    )
    assert resp.status_code == 400


def test_upload_with_background_removal_skipped_returns_original_dims(client, user_headers, sample_png_bytes):
    resp = client.post(
        "/api/uploads/garment?skip_background_removal=true",
        files={"file": ("garment.png", sample_png_bytes, "image/png")},
        headers=user_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["width"] == 64
    assert body["height"] == 64
    assert body["cutoutUrl"] is None  # skipped
    assert body["suggestedCategory"] in {
        "top", "bottom", "dress", "jacket", "shoes", "bag", "jewellery", "accessories",
    }


def test_upload_full_pipeline_produces_cutout_and_category(client, user_headers, sample_png_bytes):
    """End-to-end: real rembg background removal + real classification
    heuristic + real color detection, against an already-downloaded local
    rembg model (no network calls happen mid-test)."""
    resp = client.post(
        "/api/uploads/garment",
        files={"file": ("garment.png", sample_png_bytes, "image/png")},
        headers=user_headers,
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body["cutoutUrl"] is not None
    assert body["cutoutUrl"].startswith("/static/cutouts/")
    assert body["url"].startswith("/static/uploads/")
    assert body["suggestedCategory"] is not None
    assert 0 <= body["suggestionConfidence"] <= 1
    # The garment must actually be fitted onto the mannequin canvas.
    assert body["warpedUrl"] is not None
    assert body["warpedUrl"].startswith("/static/warped/")


def test_upload_over_size_limit_is_rejected(client, user_headers):
    huge = b"\x00" * (5 * 1024 * 1024 + 1)
    resp = client.post(
        "/api/uploads/garment",
        files={"file": ("garment.png", huge, "image/png")},
        headers=user_headers,
    )
    assert resp.status_code == 400
