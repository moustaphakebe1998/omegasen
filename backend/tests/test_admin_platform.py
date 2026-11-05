"""Super admin : utilisateurs, rattachements, statuts, chiffre d'affaires ; notifications ; réservations."""

from datetime import UTC, datetime, timedelta

from app.core.mailer import OUTBOX
from tests.conftest import Api, add_member, login
from tests.test_orders import qr_order


def _activation_token(url: str) -> str:
    return url.rsplit("/activate/", 1)[1]


async def test_admin_creates_user_with_membership(client, admin, owner, restaurant):
    rid = restaurant["id"]
    r = await admin.post(
        "/api/admin/users",
        json={"email": "gerant@example.com", "full_name": "Gérant Test", "restaurant_id": rid, "role": "MANAGER"},
    )
    assert r.status_code == 201, r.text
    u = r.json()
    assert u["status"] == "PENDING" and u["memberships"][0]["role"] == "MANAGER" and u["email_sent"] is True
    assert OUTBOX[-1].to == "gerant@example.com"
    assert (
        await admin.post("/api/admin/users", json={"email": "gerant@example.com", "full_name": "X Y"})
    ).status_code == 409

    # Liste filtrée par statut / restaurant.
    pending = (await admin.get("/api/admin/users", params={"status": "PENDING"})).json()
    assert [x["email"] for x in pending["items"]] == ["gerant@example.com"]
    in_resto = (await admin.get("/api/admin/users", params={"restaurant_id": rid})).json()
    assert {x["email"] for x in in_resto["items"]} == {owner.user["email"], "gerant@example.com"}

    # Activation puis le gérant gère son restaurant (ajout d'un plat).
    r = await client.post(
        "/api/auth/activate", json={"token": _activation_token(u["activation_url"]), "password": "Gerant!2026xx"}
    )
    assert r.status_code == 200
    gerant = Api(client, r.json()["access_token"], r.json()["user"])
    cat = (await gerant.post(f"/api/restaurants/{rid}/menu/categories", json={"name": "Entrées"})).json()
    r = await gerant.post(
        f"/api/restaurants/{rid}/menu/products", json={"category_id": cat["id"], "name": "Pastels", "price": 1500}
    )
    assert r.status_code == 201
    assert (await admin.get(f"/api/admin/users/{u['id']}")).json()["status"] == "ACTIVE"


async def test_admin_update_disable_and_memberships(client, admin, owner, restaurant):
    rid = restaurant["id"]
    cook = await add_member(owner, client, rid, "cook2@example.com", "KITCHEN")
    uid = cook.user["id"]
    detail = (await admin.get(f"/api/admin/users/{uid}")).json()
    mid = detail["memberships"][0]["id"]

    r = await admin.patch(f"/api/admin/users/{uid}/memberships/{mid}", json={"role": "CASHIER"})
    assert r.json()["memberships"][0]["role"] == "CASHIER"
    r = await admin.patch(f"/api/admin/users/{uid}", json={"full_name": "Nouveau Nom", "is_active": False})
    assert r.json()["status"] == "DISABLED" and r.json()["full_name"] == "Nouveau Nom"
    assert (await cook.get("/api/auth/me")).status_code == 401  # compte désactivé
    assert (
        await client.post("/api/auth/login", json={"email": "cook2@example.com", "password": "Password!123"})
    ).status_code == 401
    await admin.patch(f"/api/admin/users/{uid}", json={"is_active": True})
    r = await admin.delete(f"/api/admin/users/{uid}/memberships/{mid}")
    assert r.json()["memberships"] == []

    # Le dernier propriétaire ne peut pas être retiré.
    o = (await admin.get(f"/api/admin/users/{owner.user['id']}")).json()
    r = await admin.delete(f"/api/admin/users/{owner.user['id']}/memberships/{o['memberships'][0]['id']}")
    assert r.status_code == 422 and r.json()["error"]["code"] == "last_owner"
    # Le super admin ne peut pas se désactiver lui-même.
    assert (await admin.patch(f"/api/admin/users/{admin.user['id']}", json={"is_active": False})).status_code == 422


async def test_non_admin_forbidden_on_platform_routes(owner, restaurant):
    for url in ("/api/admin/users", "/api/admin/revenue", f"/api/admin/restaurants/{restaurant['id']}"):
        assert (await owner.get(url)).status_code == 403, url
    assert (
        await owner.post("/api/admin/users", json={"email": "z@example.com", "full_name": "Z Z"})
    ).status_code == 403


async def test_restaurant_status_lifecycle_and_notification(client, admin, owner, restaurant, menu):
    rid, slug = restaurant["id"], restaurant["slug"]
    r = await admin.post(f"/api/admin/restaurants/{rid}/status", json={"status": "PENDING"})
    assert r.status_code == 200 and r.json()["status"] == "PENDING"
    # En préparation : l'équipe y accède, le public non.
    assert (await owner.get(f"/api/restaurants/{rid}")).status_code == 200
    assert (await client.get(f"/api/public/restaurants/{slug}")).status_code == 404
    notes = (await owner.get("/api/notifications")).json()
    assert notes["unread"] == 1 and notes["items"][0]["type"] == "restaurant.status_changed"

    await admin.post(f"/api/admin/restaurants/{rid}/status", json={"status": "CLOSED"})
    r = await owner.get(f"/api/restaurants/{rid}")
    assert r.status_code == 403 and r.json()["error"]["code"] == "restaurant_closed"
    await admin.post(f"/api/admin/restaurants/{rid}/status", json={"status": "ACTIVE"})
    assert (await client.get(f"/api/public/restaurants/{slug}")).status_code == 200

    detail = (await admin.get(f"/api/admin/restaurants/{rid}")).json()
    assert detail["products"] == 2 and detail["categories"] == 2 and detail["staff"][0]["role"] == "OWNER"


async def test_revenue_report(client, admin, owner, restaurant, menu):
    rid = restaurant["id"]
    placed = (await client.post(f"/api/public/restaurants/{restaurant['slug']}/orders", json=qr_order(menu))).json()
    orders = (await owner.get(f"/api/restaurants/{rid}/orders")).json()["items"]
    oid = orders[0]["id"]
    total = orders[0]["total"]
    r = await owner.post(f"/api/restaurants/{rid}/orders/{oid}/payments", json={"method": "CASH", "amount": total})
    assert r.status_code == 201, r.text
    rep = (await admin.get("/api/admin/revenue", params={"days": 7})).json()
    assert rep["totals_by_currency"] == {"XOF": total}
    assert rep["by_restaurant"][0]["restaurant_id"] == rid and rep["by_restaurant"][0]["orders"] == 1
    assert placed["tracking_token"]


async def test_notifications_orders_and_isolation(client, owner, restaurant, menu):
    rid = restaurant["id"]
    cashier = await add_member(owner, client, rid, "caisse3@example.com", "CASHIER")
    cook = await add_member(owner, client, rid, "cook3@example.com", "KITCHEN")
    await client.post(f"/api/public/restaurants/{restaurant['slug']}/orders", json=qr_order(menu))

    owner_notes = (await owner.get("/api/notifications")).json()
    assert owner_notes["items"][0]["type"] == "order.created"
    # Nouvelle commande : responsables seulement.
    assert (await cashier.get("/api/notifications")).json()["unread"] == 0

    oid = (await cook.get(f"/api/restaurants/{rid}/orders/active")).json()[0]["id"]
    await cook.post(f"/api/restaurants/{rid}/orders/{oid}/status", json={"status": "READY"})
    cash_notes = (await cashier.get("/api/notifications")).json()
    assert cash_notes["unread"] == 1 and cash_notes["items"][0]["type"] == "order.ready"
    assert (await cook.get("/api/notifications")).json()["unread"] == 0

    # Lecture : uniquement ses propres notifications.
    nid = cash_notes["items"][0]["id"]
    assert (await owner.post(f"/api/notifications/{nid}/read")).status_code == 404
    assert (await cashier.post(f"/api/notifications/{nid}/read")).json()["read_at"]
    await owner.post("/api/notifications/read-all")
    assert (await owner.get("/api/notifications")).json()["unread"] == 0


async def test_request_notifies_superadmins(client, admin):
    body = {"restaurant_name": "Le Lagon", "contact_name": "Awa Diop", "email": "lagon@example.com"}
    assert (await client.post("/api/public/restaurant-requests", json=body)).status_code == 201
    notes = (await admin.get("/api/notifications")).json()
    assert notes["items"][0]["type"] == "request.submitted" and notes["items"][0]["link"] == "/admin/requests"


def _slot(days: int = 2, hour: int = 20) -> str:
    d = datetime.now(UTC) + timedelta(days=days)
    return d.replace(hour=hour, minute=0, second=0, microsecond=0).isoformat()


async def test_reservations_flow(client, owner, restaurant):
    rid, slug = restaurant["id"], restaurant["slug"]
    body = {
        "starts_at": _slot(),
        "party_size": 4,
        "customer_name": "Famille Sow",
        "customer_phone": "+221770001122",
        "customer_email": "sow@example.com",
    }
    r = await client.post(f"/api/public/restaurants/{slug}/reservations", json=body)
    assert r.status_code == 201, r.text
    token = r.json()["tracking_token"]
    assert r.json()["status"] == "PENDING" and OUTBOX[-1].to == "sow@example.com"
    assert (await owner.get("/api/notifications")).json()["items"][0]["type"] == "reservation.created"

    # Trop tôt / trop loin.
    too_soon = {**body, "starts_at": (datetime.now(UTC) + timedelta(minutes=5)).isoformat()}
    assert (await client.post(f"/api/public/restaurants/{slug}/reservations", json=too_soon)).status_code == 422

    listing = (await owner.get(f"/api/restaurants/{rid}/reservations", params={"upcoming": True})).json()
    res = listing[0]
    assert set(res["allowed_transitions"]) == {"CONFIRMED", "DECLINED", "CANCELLED"}
    # Refus sans motif interdit.
    r = await owner.post(f"/api/restaurants/{rid}/reservations/{res['id']}/status", json={"status": "DECLINED"})
    assert r.status_code == 422
    r = await owner.post(f"/api/restaurants/{rid}/reservations/{res['id']}/status", json={"status": "CONFIRMED"})
    assert r.json()["status"] == "CONFIRMED" and "confirmée" in OUTBOX[-1].subject.lower()

    pub = (await client.get(f"/api/public/reservations/{token}")).json()
    assert pub["status"] == "CONFIRMED" and pub["can_cancel"] is True
    assert (await client.post(f"/api/public/reservations/{token}/cancel")).json()["status"] == "CANCELLED"
    r = await owner.post(f"/api/restaurants/{rid}/reservations/{res['id']}/status", json={"status": "SEATED"})
    assert r.status_code == 422  # déjà annulée


async def test_reservation_permissions_and_settings(client, owner, restaurant):
    rid, slug = restaurant["id"], restaurant["slug"]
    cook = await add_member(owner, client, rid, "cook4@example.com", "KITCHEN")
    cashier = await add_member(owner, client, rid, "cash4@example.com", "CASHIER")
    assert (await cook.get(f"/api/restaurants/{rid}/reservations")).status_code == 403
    assert (await cashier.get(f"/api/restaurants/{rid}/reservations")).status_code == 200
    # Réservation téléphonique saisie par la caisse : confirmée d'office.
    r = await cashier.post(
        f"/api/restaurants/{rid}/reservations",
        json={
            "starts_at": _slot(3, 13),
            "party_size": 2,
            "customer_name": "M. Fall",
            "customer_phone": "+221770000000",
        },
    )
    assert r.status_code == 201 and r.json()["status"] == "CONFIRMED"

    await owner.patch(f"/api/restaurants/{rid}", json={"reservations_enabled": False})
    body = {"starts_at": _slot(), "party_size": 2, "customer_name": "X Y", "customer_phone": "+221770000000"}
    r = await client.post(f"/api/public/restaurants/{slug}/reservations", json=body)
    assert r.status_code == 422 and r.json()["error"]["code"] == "reservations_disabled"


async def test_tenant_isolation_new_modules(client, admin, owner, restaurant):
    other_owner_api = await login(client, owner.user["email"])  # même propriétaire, autre restaurant ci-dessous
    other = (
        await admin.post(
            "/api/admin/restaurants",
            json={"name": "Autre resto", "owner_email": "autre@example.com", "owner_full_name": "Autre Owner"},
        )
    ).json()
    # Le propriétaire du premier restaurant ne voit rien du second.
    assert (await other_owner_api.get(f"/api/restaurants/{other['id']}/reservations")).status_code == 404
    assert (await other_owner_api.get(f"/api/restaurants/{other['id']}/members")).status_code == 404
