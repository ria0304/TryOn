def _create_garment(client, headers, **overrides):
    payload = {
        "name": "Test Tee",
        "category": "top",
        "color": "#ffffff",
        "style": "casual",
        **overrides,
    }
    return client.post("/api/garments", json=payload, headers=headers)


def test_create_and_list_garment(client, user_headers):
    resp = _create_garment(client, user_headers)
    assert resp.status_code == 201
    garment = resp.json()
    assert garment["name"] == "Test Tee"
    assert garment["category"] == "top"

    listed = client.get("/api/garments", headers=user_headers)
    assert listed.status_code == 200
    assert len(listed.json()) == 1


def test_get_single_garment(client, user_headers):
    created = _create_garment(client, user_headers).json()
    resp = client.get(f"/api/garments/{created['id']}", headers=user_headers)
    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


def test_get_nonexistent_garment_is_404(client, user_headers):
    resp = client.get("/api/garments/does-not-exist", headers=user_headers)
    assert resp.status_code == 404


def test_users_cannot_see_each_others_garments(client, user_headers):
    _create_garment(client, user_headers)
    other_user = client.post("/api/users").json()
    other_headers = {"X-User-Id": other_user["id"]}
    resp = client.get("/api/garments", headers=other_headers)
    assert resp.status_code == 200
    assert resp.json() == []


def test_filter_garments_by_category(client, user_headers):
    _create_garment(client, user_headers, id="g-top", category="top", name="Top A")
    _create_garment(client, user_headers, id="g-bottom", category="bottom", name="Bottom A")

    resp = client.get("/api/garments?category=bottom", headers=user_headers)
    assert resp.status_code == 200
    cats = {g["category"] for g in resp.json()}
    assert cats == {"bottom"}


def test_search_garments_by_name(client, user_headers):
    _create_garment(client, user_headers, id="g1", name="Blue Silk Blouse")
    _create_garment(client, user_headers, id="g2", name="Red Cotton Tee")

    resp = client.get("/api/garments?search=silk", headers=user_headers)
    assert len(resp.json()) == 1
    assert resp.json()[0]["name"] == "Blue Silk Blouse"


def test_by_categories_groups_results(client, user_headers):
    _create_garment(client, user_headers, id="g-top", category="top", name="Top A")
    _create_garment(client, user_headers, id="g-bag", category="bag", name="Bag A")

    resp = client.get("/api/garments/by-categories?categories=top,bag,shoes", headers=user_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["top"]) == 1
    assert len(body["bag"]) == 1
    assert body["shoes"] == []


def test_update_garment(client, user_headers):
    created = _create_garment(client, user_headers).json()
    resp = client.patch(
        f"/api/garments/{created['id']}", json={"name": "Renamed"}, headers=user_headers
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Renamed"


def test_delete_garment(client, user_headers):
    created = _create_garment(client, user_headers).json()
    resp = client.delete(f"/api/garments/{created['id']}", headers=user_headers)
    assert resp.status_code == 200

    followup = client.get(f"/api/garments/{created['id']}", headers=user_headers)
    assert followup.status_code == 404


def test_creating_garment_with_duplicate_id_conflicts(client, user_headers):
    _create_garment(client, user_headers, id="dup-1")
    resp = _create_garment(client, user_headers, id="dup-1")
    assert resp.status_code == 409


def test_deleting_garment_strips_it_from_outfits_referencing_it(client, user_headers):
    top = _create_garment(client, user_headers, id="g-top", category="top").json()
    bottom = _create_garment(client, user_headers, id="g-bottom", category="bottom").json()

    outfit = client.post(
        "/api/outfits",
        json={
            "name": "Everyday",
            "garmentIds": {"top": top["id"], "bottom": bottom["id"]},
        },
        headers=user_headers,
    ).json()

    client.delete(f"/api/garments/{top['id']}", headers=user_headers)

    refreshed = client.get(f"/api/outfits/{outfit['id']}", headers=user_headers).json()
    assert "top" not in refreshed["garmentIds"]
    assert refreshed["garmentIds"]["bottom"] == bottom["id"]
