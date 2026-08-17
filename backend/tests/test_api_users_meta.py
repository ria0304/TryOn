def test_create_user_returns_id_and_prefix(client):
    resp = client.post("/api/users")
    assert resp.status_code == 201
    body = resp.json()
    assert body["id"].startswith("user-")
    assert "createdAt" in body


def test_two_users_get_different_ids(client):
    a = client.post("/api/users").json()["id"]
    b = client.post("/api/users").json()["id"]
    assert a != b


def test_meta_categories_lists_all_8(client):
    resp = client.get("/api/meta/categories")
    assert resp.status_code == 200
    cats = {c["category"] for c in resp.json()}
    assert cats == {"top", "bottom", "dress", "jacket", "shoes", "bag", "jewellery", "accessories"}


def test_health_check(client):
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_garments_endpoint_requires_auth(client):
    resp = client.get("/api/garments")
    assert resp.status_code == 401


def test_stale_user_id_is_401_not_404(client):
    resp = client.get("/api/garments", headers={"X-User-Id": "user-doesnotexist"})
    assert resp.status_code == 401
