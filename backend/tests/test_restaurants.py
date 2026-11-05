from tests.conftest import add_member, make_user


async def test_create_restaurant_defaults_and_owner(owner, restaurant):
    assert restaurant["slug"] == "chez-awa"
    assert restaurant["currency"] == "XOF"
    assert restaurant["vat_rate_bp"] == 1800
    assert restaurant["timezone"] == "Africa/Dakar"
    me = (await owner.get("/api/auth/me")).json()
    assert me["memberships"][0]["role"] == "OWNER"


async def test_slug_unique(admin, restaurant):
    r = await admin.post("/api/restaurants", json={"name": "Chez Awa"})
    assert r.json()["slug"] == "chez-awa-2"


async def test_only_superadmin_creates_restaurants(owner, restaurant):
    assert (await owner.post("/api/restaurants", json={"name": "Mon resto"})).status_code == 403
    r = await owner.post("/api/admin/restaurants", json={"name": "Mon resto", "owner_email": "x@example.com"})
    assert r.status_code == 403


async def test_tenant_isolation(client, owner, restaurant):
    stranger = await make_user(client)
    rid = restaurant["id"]
    for url in (f"/api/restaurants/{rid}", f"/api/restaurants/{rid}/menu", f"/api/restaurants/{rid}/orders"):
        assert (await stranger.get(url)).status_code == 404, url
    r = await stranger.patch(f"/api/restaurants/{rid}", json={"name": "Piraté"})
    assert r.status_code == 404


async def test_roles(client, owner, restaurant):
    rid = restaurant["id"]
    cook = await add_member(owner, client, rid, "cook@example.com", "KITCHEN")
    assert (await cook.get(f"/api/restaurants/{rid}/menu")).status_code == 200
    assert (await cook.patch(f"/api/restaurants/{rid}", json={"name": "Piraté"})).status_code == 403
    assert (await cook.post(f"/api/restaurants/{rid}/menu/categories", json={"name": "X"})).status_code == 403
    assert (await cook.get(f"/api/restaurants/{rid}/orders/active")).status_code == 200
    assert (await cook.get(f"/api/restaurants/{rid}/orders")).status_code == 403  # historique : caisse+


async def test_manager_cannot_create_owner_and_last_owner_protected(client, owner, restaurant):
    rid = restaurant["id"]
    mgr = await add_member(owner, client, rid, "mgr@example.com", "MANAGER")
    r = await mgr.post(
        f"/api/restaurants/{rid}/members",
        json={"email": "x@example.com", "full_name": "X X", "role": "OWNER"},
    )
    assert r.status_code == 403
    members = (await owner.get(f"/api/restaurants/{rid}/members")).json()
    owner_member = next(m for m in members if m["role"] == "OWNER")
    r = await owner.delete(f"/api/restaurants/{rid}/members/{owner_member['id']}")
    assert r.status_code == 403 and r.json()["error"]["code"] == "self_edit"
    # Le gérant ne peut ni retirer ni rétrograder le propriétaire.
    r = await mgr.patch(f"/api/restaurants/{rid}/members/{owner_member['id']}", json={"role": "MANAGER"})
    assert r.status_code == 403


async def test_opening_hours_and_validation(owner, restaurant):
    rid = restaurant["id"]
    slots = [{"day_of_week": d, "opens_at": "11:00", "closes_at": "23:00"} for d in range(7)]
    r = await owner.put(f"/api/restaurants/{rid}/opening-hours", json=slots)
    assert r.status_code == 200
    detail = (await owner.get(f"/api/restaurants/{rid}")).json()
    assert len(detail["opening_hours"]) == 7

    r = await owner.patch(f"/api/restaurants/{rid}", json={"email": "pas-un-email"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "validation_error"
