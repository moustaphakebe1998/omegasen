"""Environnement de test « Restaurant Baobab » (app/seeds/baobab.py, docs/BAOBAB_TEST_ENVIRONMENT.md).

Vérifie le seed (idempotence, hachage, isolation), la connexion de chaque compte, la matrice des
permissions côté API, le parcours complet d'une commande, les cas d'erreur, les QR de table et le reset.
"""

import pytest
from sqlalchemy import func, select

from app.core.db import SessionLocal
from app.models import Membership, Order, Product, Restaurant, User
from app.seeds import baobab as demo
from tests.conftest import Api, login, make_user

RID = str(demo.RESTAURANT_ID)
BASE = f"/api/restaurants/{RID}"


async def _seed(images: bool = False) -> demo.SeedReport:
    async with SessionLocal() as s:
        return await demo.seed(s, images=images)


async def _as(client, key: str) -> Api:
    email = next(p.email for p in [*demo.STAFF, *demo.CUSTOMERS] if p.key == key)
    return await login(client, email, demo.PASSWORD)


async def _order_id(key: str) -> str:
    async with SessionLocal() as s:
        return str(await s.scalar(select(Order.id).where(Order.idempotency_key == f"baobab-seed-{key}")))


def pid(key: str) -> str:
    return str(demo.sid("product", key))


def oid(dish: str, group: str, option: str) -> str:
    return str(demo.sid("option", dish, group, option))


# ── Seed ────────────────────────────────────────────────


async def _counts() -> dict[str, int]:
    async with SessionLocal() as s:
        return {
            "restaurants": await s.scalar(select(func.count()).select_from(Restaurant)),
            "users": await s.scalar(select(func.count()).select_from(User)),
            "products": await s.scalar(select(func.count()).select_from(Product)),
            "orders": await s.scalar(select(func.count()).select_from(Order)),
        }


async def test_seed_is_idempotent_with_stable_ids():
    first = await _seed()
    assert first.created_restaurant and first.orders_created > 40
    before = await _counts()
    second = await _seed()
    assert not second.created_restaurant and second.orders_created == 0
    assert (
        await _counts()
        == before
        == {
            "restaurants": 1,
            "users": len(demo.STAFF) + len(demo.CUSTOMERS) + 1,
            "products": sum(len(d) for _, _, d in demo.MENU),
            "orders": before["orders"],
        }
    )
    async with SessionLocal() as s:
        r = await s.get(Restaurant, demo.RESTAURANT_ID)
        assert (r.slug, r.name, r.description, r.status, r.is_demo) == (
            "baobab",
            "Restaurant Baobab",
            "Restaurant de démonstration OmegaSen",
            "ACTIVE",
            True,
        )
        # Mots de passe hachés (Argon2id), jamais en clair.
        for u in await s.scalars(select(User)):
            assert u.password_hash.startswith("$argon2id$") and demo.PASSWORD not in u.password_hash
        # Tous les membres appartiennent à Baobab, et à lui seul.
        assert set(await s.scalars(select(Membership.restaurant_id))) == {demo.RESTAURANT_ID}
        # Numéros du jour consécutifs (le compteur est recalé après l'historique).
        numbers = sorted(await s.scalars(select(Order.number).where(Order.business_date == func.current_date())))
        assert numbers == list(range(1, len(numbers) + 1))


async def test_seed_with_images():
    report = await _seed(images=True)
    assert report.image_error is None and report.images == sum(1 for _, _, ds in demo.MENU for d in ds if d.image)
    async with SessionLocal() as s:
        r = await s.get(Restaurant, demo.RESTAURANT_ID)
        assert r.logo_media_id and r.cover_media_id
        assert (await s.get(Product, demo.sid("product", "yassa"))).image_media_id
    assert (await _seed(images=True)).images == report.images  # pas de doublon d'images


async def test_seed_refused_in_production(monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setattr(get_settings(), "environment", "production")
    with pytest.raises(demo.DemoEnvironmentError):
        await _seed()
    async with SessionLocal() as s:
        with pytest.raises(demo.DemoEnvironmentError):
            await demo.delete_demo(s)


async def test_seed_never_touches_a_real_restaurant_named_baobab(admin):
    r = await admin.post(
        "/api/admin/restaurants", json={"name": "Baobab", "currency": "XOF", "owner_email": admin.user["email"]}
    )
    assert r.status_code == 201 and r.json()["slug"] == "baobab"
    with pytest.raises(demo.DemoEnvironmentError):
        await _seed()
    async with SessionLocal() as s:
        with pytest.raises(demo.DemoEnvironmentError):
            await demo.delete_demo(s)
    assert (await admin.get(f"/api/admin/restaurants/{r.json()['id']}")).status_code == 200


# ── Comptes ─────────────────────────────────────────────


async def test_every_account_logs_in_and_belongs_to_baobab(client):
    await _seed()
    for p in demo.STAFF:
        api = await _as(client, p.key)
        ms = api.user["memberships"]
        assert [(m["restaurant_id"], m["role"]) for m in ms] == [(RID, p.role.value)], p.key
        assert api.user["must_change_password"] is False
        if p.permissions is not None:
            assert set(ms[0]["permissions"]) == {x.value for x in p.permissions}, p.key
    for c in demo.CUSTOMERS:
        api = await _as(client, c.key)
        assert api.user["memberships"] == [] and api.user["account_type"] == "CUSTOMER"
        assert (await api.get(BASE)).status_code == 404  # un client n'accède pas à l'espace restaurant
    # Invitation en attente : pas de mot de passe utilisable.
    r = await client.post("/api/auth/login", json={"email": demo.INVITED.email, "password": demo.PASSWORD})
    assert r.status_code == 401


async def test_reseed_restores_a_locked_account(client):
    await _seed()
    for _ in range(5):
        await client.post("/api/auth/login", json={"email": "cashier@baobab.test", "password": "mauvais"})
    r = await client.post("/api/auth/login", json={"email": "cashier@baobab.test", "password": demo.PASSWORD})
    assert r.status_code in (401, 423, 429)
    await _seed()  # remet le compte en état de connexion (verrou et limitation de débit)
    await _as(client, "cashier")


# ── Permissions (backend) ───────────────────────────────

ACTIONS = [
    "restaurant",
    "menu",
    "history",
    "kitchen",
    "stats",
    "team",
    "reservations",
    "edit_info",
    "edit_settings",
    "edit_qr",
    "edit_price",
    "stock",
    "pos_order",
    "pay",
    "cancel",
    "refund",
    "add_member",
]
Y, N = True, False
# Attendu par profil, dans l'ordre de ACTIONS.
MATRIX = {
    "owner": [Y] * len(ACTIONS),
    "admin": [Y] * len(ACTIONS),
    "manager": [Y, Y, Y, Y, Y, Y, Y, N, N, N, N, Y, Y, Y, Y, N, Y],
    "cashier": [Y, Y, Y, Y, N, N, Y, N, N, N, N, Y, Y, Y, Y, N, N],
    "waiter": [Y, Y, Y, Y, N, N, Y, N, N, N, N, N, Y, N, N, N, N],
    "kitchen": [Y, Y, N, Y, N, N, N, N, N, N, N, Y, N, N, N, N, N],
    "user": [Y, Y, N, N, N, N, N, N, N, N, N, N, N, N, N, N, N],
}


async def _attempt(api: Api, action: str, n: int):
    pos = {"service_mode": "TAKEAWAY", "items": [{"product_id": pid("eau"), "quantity": 1}], "customer_name": "Test"}
    if action == "restaurant":
        return await api.get(BASE)
    if action == "menu":
        return await api.get(f"{BASE}/menu")
    if action == "history":
        return await api.get(f"{BASE}/orders")
    if action == "kitchen":
        return await api.get(f"{BASE}/orders/active")
    if action == "stats":
        return await api.get(f"{BASE}/stats")
    if action == "team":
        return await api.get(f"{BASE}/members")
    if action == "reservations":
        return await api.get(f"{BASE}/reservations")
    if action == "edit_info":
        return await api.patch(BASE, json={"description": f"Restaurant de démonstration OmegaSen ({n})"})
    if action == "edit_settings":
        return await api.patch(BASE, json={"late_after_minutes": 15 + n})
    if action == "edit_qr":
        return await api.patch(f"{BASE}/qr", json={"foreground_color": "#111827"})
    if action == "edit_price":
        return await api.patch(f"{BASE}/menu/products/{pid('touba')}", json={"price": 700 + n})
    if action == "stock":
        return await api.post(f"{BASE}/menu/products/{pid('soda')}/availability", json={"is_available": True})
    if action == "pos_order":
        return await api.post(f"{BASE}/orders", json=pos)
    if action == "pay":
        return await api.post(
            f"{BASE}/orders/{await _order_id('live-06')}/payments", json={"method": "CASH", "amount": 100}
        )
    if action == "cancel":
        r = await api.post(f"{BASE}/orders", json=pos) if "orders.create" in api.perms else None
        target = r.json()["id"] if r is not None and r.status_code == 201 else await _order_id("live-02")
        return await api.post(f"{BASE}/orders/{target}/status", json={"status": "CANCELLED", "reason": "Test droits"})
    if action == "refund":
        o = await _owner_view(api, "live-09")
        return await api.post(
            f"{BASE}/orders/{o['id']}/payments/{o['payments'][0]['id']}/refund", json={"reason": "Test droits"}
        )
    if action == "add_member":
        body = {"email": f"recrue-{n}@example.com", "full_name": "Nouvelle Recrue", "role": "KITCHEN"}
        return await api.post(f"{BASE}/members", json=body)
    raise AssertionError(action)


_OWNER: dict = {}


async def _owner_view(api: Api, key: str) -> dict:
    owner = _OWNER["api"]
    return (await owner.get(f"{BASE}/orders/{await _order_id(key)}")).json()


async def test_permission_matrix_is_enforced_by_the_api(client):
    await _seed()
    _OWNER["api"] = await _as(client, "owner")
    for n, (key, expected) in enumerate(MATRIX.items()):
        api = await _as(client, key)
        api.perms = set(api.user["memberships"][0]["permissions"])
        for action, allowed in zip(ACTIONS, expected, strict=True):
            r = await _attempt(api, action, n)
            if allowed:
                assert r.status_code < 400 or (action == "refund" and r.status_code == 422), (key, action, r.text)
            else:
                assert r.status_code == 403, (key, action, r.status_code, r.text)
                assert r.json()["error"]["code"] in ("permission_denied", "forbidden"), (key, action, r.text)
    _OWNER.clear()


async def test_manager_cannot_grant_permissions_it_does_not_have(client):
    await _seed()
    manager = await _as(client, "manager")
    body = {
        "email": "escalade@example.com",
        "full_name": "Escalade Test",
        "role": "CASHIER",
        "permissions": ["restaurant.view", "prices.edit"],
    }
    r = await manager.post(f"{BASE}/members", json=body)
    assert r.status_code == 403, r.text
    body["role"] = "OWNER"
    body.pop("permissions")
    assert (await manager.post(f"{BASE}/members", json=body)).status_code == 403


async def test_unauthenticated_requests_are_rejected(client):
    await _seed()
    for url in (BASE, f"{BASE}/orders", f"{BASE}/orders/active", f"{BASE}/stats", "/api/me/orders"):
        r = await client.get(url)
        assert r.status_code == 401, url


async def test_data_isolation_between_restaurants(client, admin):
    await _seed()
    other_owner = await make_user(client, "autre@example.com")
    r = await admin.post(
        "/api/admin/restaurants", json={"name": "Autre resto", "currency": "EUR", "owner_email": "autre@example.com"}
    )
    other = r.json()["id"]
    baobab_owner = await _as(client, "owner")
    for url in ("", "/orders", "/menu", "/stats", "/members", "/qr"):
        assert (await baobab_owner.get(f"/api/restaurants/{other}{url}")).status_code == 404, url
        assert (await other_owner.get(f"{BASE}{url}")).status_code == 404, url
    # Une commande de Baobab n'est pas lisible via l'URL d'un autre restaurant.
    live = await _order_id("live-01")
    assert (await other_owner.get(f"/api/restaurants/{other}/orders/{live}")).status_code == 404
    assert (await other_owner.get(f"/api/restaurants/{other}/orders")).json()["total"] == 0


# ── Parcours complet d'une commande ─────────────────────


async def test_full_order_journey_from_table_qr_to_payment(client):
    await _seed()
    owner = await _as(client, "owner")
    stats_before = (await owner.get(f"{BASE}/stats")).json()

    # 1. Scan du QR de la table T6 → restaurant Baobab
    r = await client.get(f"/api/public/qr/{demo.QR_CODE}")
    assert r.json() == {"active": True, "restaurant_slug": "baobab", "restaurant_name": "Restaurant Baobab"}
    # 2. Menu public : catégories, plats indisponibles signalés, plat masqué absent
    menu = (await client.get("/api/public/restaurants/baobab")).json()["menu"]
    assert [c["name"] for c in menu] == ["Entrées", "Plats", "Desserts", "Boissons"]
    products = {p["name"]: p for c in menu for p in c["products"]}
    assert all(len(c["products"]) >= 5 for c in menu)
    assert products["Thiou poisson"]["is_available"] is False
    assert "Plat du chef (bientôt)" not in products
    # 3-5. Client connecté : panier avec options, commande QR rattachée à la table
    customer = await _as(client, "aminata")
    body = {
        "channel": "QR",
        "service_mode": "DINE_IN",
        "table_label": "T6",
        "customer_name": "Aminata",
        "items": [
            {
                "product_id": pid("dibi"),
                "quantity": 1,
                "option_ids": [
                    oid("dibi", "Cuisson", "Bien cuit"),
                    oid("dibi", "Accompagnement", "Frites"),
                    oid("dibi", "Suppléments", "Œuf"),
                ],
            },
            {"product_id": pid("bissap"), "quantity": 2, "option_ids": [oid("bissap", "Taille", "50 cl")]},
        ],
    }
    r = await customer.post("/api/public/restaurants/baobab/orders", json=body)
    assert r.status_code == 201, r.text
    placed = r.json()
    # Prix recalculés côté serveur : 5000 + 500 + 300, et Bissap en promotion (800) + 50 cl (500)
    assert placed["total"] == 5800 + 2 * 1300
    token = placed["tracking_token"]

    # 6. Visible dans l'espace d'administration, avec la table et le canal
    page = (await owner.get(f"{BASE}/orders", params={"q": placed["reference"]})).json()
    order = page["items"][0]
    assert (order["table_label"], order["channel"], order["status"]) == ("T6", "QR", "NEW")
    oid_ = order["id"]
    # 7-9. Écran cuisine : visible, passage en préparation puis prête
    kitchen = await _as(client, "kitchen")
    assert oid_ in [o["id"] for o in (await kitchen.get(f"{BASE}/orders/active")).json()]
    for status in ("PREPARING", "READY"):
        r = await kitchen.post(f"{BASE}/orders/{oid_}/status", json={"status": status})
        assert r.status_code == 200 and r.json()["status"] == status
    # La cuisine ne peut ni encaisser ni annuler
    assert (await kitchen.post(f"{BASE}/orders/{oid_}/payments", json={"method": "CASH"})).status_code == 403
    r = await kitchen.post(f"{BASE}/orders/{oid_}/status", json={"status": "CANCELLED", "reason": "x"})
    assert r.status_code == 403
    # 10. Côté serveur : la commande prête est visible, mais il ne peut pas encaisser
    waiter = await _as(client, "waiter")
    ready = (await waiter.get(f"{BASE}/orders", params={"status": "READY"})).json()["items"]
    assert oid_ in [o["id"] for o in ready]
    assert (await waiter.post(f"{BASE}/orders/{oid_}/payments", json={"method": "CARD"})).status_code == 403
    # 11. Caisse : paiement refusé si espèces insuffisantes, puis accepté avec rendu monnaie
    cashier = await _as(client, "cashier")
    total = order["total"]
    r = await cashier.post(f"{BASE}/orders/{oid_}/payments", json={"method": "CASH", "amount_tendered": 1000})
    assert r.status_code == 422 and r.json()["error"]["code"] == "insufficient_cash"
    r = await cashier.post(f"{BASE}/orders/{oid_}/payments", json={"method": "CASH", "amount_tendered": total + 1600})
    assert r.status_code == 201 and r.json()["payment_status"] == "PAID"
    assert (await cashier.post(f"{BASE}/orders/{oid_}/payments", json={"method": "CARD"})).json()["error"][
        "code"
    ] == "already_paid"
    # 12. Le serveur termine la commande (servie)
    r = await waiter.post(f"{BASE}/orders/{oid_}/status", json={"status": "COMPLETED"})
    assert r.status_code == 200 and r.json()["status"] == "COMPLETED"
    # 13. Historique, suivi client, statistiques et notifications à jour
    assert (await client.get(f"/api/public/orders/{token}")).json()["status"] == "COMPLETED"
    mine = (await customer.get("/api/me/orders")).json()
    assert placed["reference"] in [o["reference"] for o in mine]
    stats_after = (await owner.get(f"{BASE}/stats")).json()
    assert stats_after["orders"] == stats_before["orders"] + 1
    assert stats_after["revenue"] == stats_before["revenue"] + total
    notes = (await customer.get("/api/notifications")).json()["items"]
    assert any(n["type"] == "order.ready" for n in notes)
    owner_notes = (await owner.get("/api/notifications")).json()["items"]
    assert any(n["data"].get("order_id") == oid_ for n in owner_notes)


async def test_order_error_cases(client):
    await _seed()
    url = "/api/public/restaurants/baobab/orders"
    base = {"channel": "QR", "service_mode": "DINE_IN", "table_label": "T2", "customer_name": "Test"}

    async def place(items):
        return await client.post(url, json={**base, "items": items})

    # Produit indisponible
    r = await place([{"product_id": pid("thiou"), "quantity": 1}])
    assert r.status_code == 422 and r.json()["error"]["code"] == "product_unavailable"
    # Produit masqué aux clients
    r = await place([{"product_id": pid("special"), "quantity": 1}])
    assert r.status_code == 422 and r.json()["error"]["code"] == "product_unavailable"
    # Option indisponible (Attiéké) et choix obligatoire manquant
    r = await place(
        [{"product_id": pid("yassa"), "quantity": 1, "option_ids": [oid("yassa", "Accompagnement", "Attiéké")]}]
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_options"
    r = await place([{"product_id": pid("yassa"), "quantity": 1}])
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_options"
    # Livraison non disponible
    r = await client.post(
        url, json={**base, "service_mode": "DELIVERY", "items": [{"product_id": pid("eau"), "quantity": 1}]}
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "service_mode_unavailable"

    cashier = await _as(client, "cashier")
    # Commande annulée : ni paiement ni changement de statut
    cancelled = await _order_id("live-10")
    r = await cashier.post(f"{BASE}/orders/{cancelled}/payments", json={"method": "CASH"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "order_cancelled"
    r = await cashier.post(f"{BASE}/orders/{cancelled}/status", json={"status": "PREPARING"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_transition"
    # Annulation sans motif refusée
    r = await cashier.post(f"{BASE}/orders/{await _order_id('live-02')}/status", json={"status": "CANCELLED"})
    assert r.status_code == 422
    # Montant supérieur au reste à payer (commande partiellement payée)
    r = await cashier.post(
        f"{BASE}/orders/{await _order_id('live-08')}/payments", json={"method": "CARD", "amount": 999_999}
    )
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_amount"
    # Paiement en ligne : aucun prestataire configuré → 503 (jamais simulé)
    live = await client.get(f"/api/public/qr/{demo.QR_CODE}")
    assert live.status_code == 200
    async with SessionLocal() as s:
        token = await s.scalar(select(Order.tracking_token).where(Order.idempotency_key == "baobab-seed-live-06"))
    r = await client.post(
        f"/api/public/orders/{token}/checkout",
        json={"success_url": "https://x.test/ok", "cancel_url": "https://x.test/ko"},
    )
    assert r.status_code == 503 and r.json()["error"]["code"] == "online_payment_unavailable"
    # QR inconnu
    assert (await client.get("/api/public/qr/inconnu1")).status_code == 404


async def test_seeded_orders_cover_every_status_and_channel(client):
    await _seed()
    owner = await _as(client, "owner")
    items = (await owner.get(f"{BASE}/orders", params={"page_size": 100})).json()["items"]
    assert {o["status"] for o in items} == {"NEW", "PREPARING", "READY", "COMPLETED", "CANCELLED"}
    assert {o["channel"] for o in items} == {"QR", "POS", "ONLINE", "KIOSK"}
    assert {o["payment_status"] for o in items} >= {"UNPAID", "PAID", "PARTIALLY_PAID", "REFUNDED"}
    methods = {p["method"] for o in items for p in o["payments"]}
    assert methods >= {"CASH", "CARD", "MOBILE_MONEY"}
    tables = {o["table_label"] for o in items if o["channel"] == "QR" and o["service_mode"] == "DINE_IN"}
    assert tables <= set(demo.TABLES) and len(tables) >= 3
    reservations = (await owner.get(f"{BASE}/reservations", params={"scope": "all"})).json()
    assert reservations
    stats = (await owner.get(f"{BASE}/stats")).json()
    assert stats["orders"] > 40 and stats["revenue"] > 0 and len(stats["by_day"]) >= 10
    customer = await _as(client, "khadija")
    assert len((await customer.get("/api/me/orders")).json()) >= 1
    assert len((await customer.get("/api/me/reservations")).json()) >= 1


# ── QR Codes de table ───────────────────────────────────


async def test_table_qr_codes(client):
    await _seed()
    owner = await _as(client, "owner")
    qr = (await owner.get(f"{BASE}/qr")).json()
    assert qr["code"] == demo.QR_CODE and qr["url"].endswith(f"/q/{demo.QR_CODE}")
    r = await owner.get(f"{BASE}/qr/image.png", params={"table": "T5", "size": 256, "download": True})
    assert r.status_code == 200 and r.headers["content-type"] == "image/png"
    assert "qrcode-baobab-table-T5.png" in r.headers["content-disposition"]
    r = await owner.get(f"{BASE}/qr/print.pdf", params={"table": "T5", "page": "A6"})
    assert r.status_code == 200 and r.content.startswith(b"%PDF")
    r = await owner.get(f"{BASE}/qr/image.svg", params={"table": "T5"})
    assert r.status_code == 200 and b"<svg" in r.content
    assert (await owner.get(f"{BASE}/qr/image.png", params={"table": "T5?x=<script>"})).status_code == 422

    from app.modules.qrcodes import _matrix, qr_url

    assert qr_url(demo.QR_CODE, "T5") == f"https://omegasen.test/q/{demo.QR_CODE}?table=T5"
    assert _matrix(qr_url(demo.QR_CODE, "T5"), False) != _matrix(qr_url(demo.QR_CODE), False)


# ── Réinitialisation ────────────────────────────────────


async def test_reset_only_touches_baobab(client, admin, owner, restaurant):
    await _seed()
    # Un compte réel membre de Baobab ET d'un autre restaurant doit survivre au reset.
    async with SessionLocal() as s:
        real = await s.scalar(select(User).where(User.email == owner.user["email"]))
        s.add(Membership(user_id=real.id, restaurant_id=demo.RESTAURANT_ID, role="CASHIER"))
        await s.commit()
    tester = await _as(client, "owner")
    r = await client.post(
        "/api/public/restaurants/baobab/orders",
        json={
            "channel": "QR",
            "service_mode": "TAKEAWAY",
            "customer_name": "Test",
            "items": [{"product_id": pid("eau"), "quantity": 1}],
        },
    )
    assert r.status_code == 201
    assert (await tester.patch(BASE, json={"description": "Modifié pendant les tests"})).status_code == 200

    async with SessionLocal() as s:
        deleted, report = await demo.reset(s, images=False)
    assert deleted["restaurants"] == 1 and report.created_restaurant
    # L'autre restaurant, son propriétaire et le super admin sont intacts.
    assert (await owner.get(f"/api/restaurants/{restaurant['id']}")).status_code == 200
    assert (await admin.get("/api/admin/stats")).status_code == 200
    me = (await owner.get("/api/auth/me")).json()
    assert [m["restaurant_id"] for m in me["memberships"]] == [restaurant["id"]]
    # Baobab revient à l'état initial, avec les mêmes identifiants.
    tester = await _as(client, "owner")
    r = (await tester.get(BASE)).json()
    assert (r["id"], r["description"]) == (RID, demo.DESCRIPTION)
    assert (await tester.get(f"{BASE}/qr")).json()["code"] == demo.QR_CODE

    async with SessionLocal() as s:
        counts = await demo.delete_demo(s)
    assert counts["restaurants"] == 1 and counts["users"] == len(demo.STAFF) + len(demo.CUSTOMERS) + 1
    async with SessionLocal() as s:
        assert await s.scalar(select(func.count()).select_from(User).where(User.email.like("%@baobab.test"))) == 0
        assert await s.scalar(select(func.count()).select_from(Restaurant)) == 1
