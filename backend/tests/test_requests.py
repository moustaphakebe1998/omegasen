"""Demandes d'ouverture de restaurant et activation des comptes créés par l'admin."""

from tests.conftest import login

REQUEST = {
    "restaurant_name": "Chez Fatou",
    "contact_name": "Fatou Ba",
    "email": "Fatou@Example.com",
    "phone": "+221 77 000 00 00",
    "city": "Thiès",
    "cuisine": "Sénégalaise",
    "message": "Nous voulons proposer la commande par QR Code.",
}


def _token(url: str) -> str:
    return url.rsplit("/activate/", 1)[1]


async def test_request_approve_and_activate(client, admin):
    r = await client.post("/api/public/restaurant-requests", json=REQUEST)
    assert r.status_code == 201, r.text
    rid = r.json()["id"]
    assert r.json()["status"] == "PENDING"

    # Doublon en attente refusé.
    assert (await client.post("/api/public/restaurant-requests", json=REQUEST)).status_code == 409

    page = (await admin.get("/api/admin/restaurant-requests", params={"status": "PENDING"})).json()
    assert page["pending"] == 1 and page["items"][0]["email"] == "fatou@example.com"
    assert (await admin.get("/api/admin/stats")).json()["pending_requests"] == 1

    r = await admin.post(f"/api/admin/restaurant-requests/{rid}/approve", json={"currency": "XOF"})
    assert r.status_code == 200, r.text
    out = r.json()
    assert out["request"]["status"] == "APPROVED" and out["restaurant_slug"] == "chez-fatou"
    assert out["activation_url"].startswith("https://omegasen.test/activate/")

    # Déjà traitée.
    assert (await admin.post(f"/api/admin/restaurant-requests/{rid}/approve", json={})).status_code == 409

    # Le compte n'est pas utilisable avant activation.
    r = await client.post("/api/auth/login", json={"email": "fatou@example.com", "password": "Password!123"})
    assert r.status_code == 401

    token = _token(out["activation_url"])
    info = (await client.get(f"/api/auth/activation/{token}")).json()
    assert info == {"email": "fatou@example.com", "full_name": "Fatou Ba"}

    r = await client.post("/api/auth/activate", json={"token": token, "password": "Password!123"})
    assert r.status_code == 200, r.text
    memberships = r.json()["user"]["memberships"]
    assert memberships[0]["role"] == "OWNER" and memberships[0]["restaurant_id"] == out["restaurant_id"]

    # Lien à usage unique.
    assert (
        await client.post("/api/auth/activate", json={"token": token, "password": "Password!456"})
    ).status_code == 404
    await login(client, "fatou@example.com")


async def test_request_reject_and_permissions(client, owner, admin):
    rid = (await client.post("/api/public/restaurant-requests", json=REQUEST)).json()["id"]
    assert (await owner.get("/api/admin/restaurant-requests")).status_code == 403
    assert (
        await owner.post(f"/api/admin/restaurant-requests/{rid}/reject", json={"review_note": "Non"})
    ).status_code == 403

    r = await admin.post(f"/api/admin/restaurant-requests/{rid}/reject", json={"review_note": "Zone non couverte"})
    assert r.status_code == 200 and r.json()["status"] == "REJECTED"
    # Une nouvelle demande est possible après un refus.
    assert (await client.post("/api/public/restaurant-requests", json=REQUEST)).status_code == 201


async def test_request_validation(client):
    r = await client.post("/api/public/restaurant-requests", json={**REQUEST, "email": "pas-un-email"})
    assert r.status_code == 422


async def test_admin_create_restaurant_for_new_owner_gives_activation_link(client, admin):
    r = await admin.post(
        "/api/admin/restaurants",
        json={"name": "Le Lagon", "owner_email": "lagon@example.com", "owner_full_name": "Awa Ndiaye"},
    )
    assert r.status_code == 201, r.text
    url = r.json()["activation_url"]
    assert url and (await client.get(f"/api/auth/activation/{_token(url)}")).status_code == 200
    assert (await client.get("/api/auth/activation/inconnu-inconnu")).status_code == 404
