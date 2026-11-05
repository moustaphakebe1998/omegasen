"""Gestion de l'équipe par le propriétaire : création directe, permissions granulaires, affectation, retrait."""

from app.core.mailer import OUTBOX
from tests.conftest import Api, add_member, login


async def _direct(owner: Api, rid: str, email: str, role: str = "CASHIER", **extra) -> dict:
    r = await owner.post(
        f"/api/restaurants/{rid}/members",
        json={
            "email": email,
            "full_name": "Direct Test",
            "role": role,
            "mode": "password",
            "password": "Initial!2026x",
            **extra,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def test_direct_creation_forces_password_change(client, owner, restaurant):
    rid = restaurant["id"]
    member = await _direct(owner, rid, "direct@example.com")
    assert member["activated"] is True and member["must_change_password"] is True
    assert member["activation_url"] is None
    assert OUTBOX == []  # aucun mot de passe (ni lien) envoyé par email

    api = await login(client, "direct@example.com", "Initial!2026x")
    assert api.user["must_change_password"] is True
    # Tout est bloqué tant que le mot de passe initial n'est pas changé.
    r = await api.get(f"/api/restaurants/{rid}/orders/active")
    assert r.status_code == 403 and r.json()["error"]["code"] == "password_change_required"
    assert (await api.get("/api/auth/me")).status_code == 200
    same = {"current_password": "Initial!2026x", "new_password": "Initial!2026x"}
    assert (await api.post("/api/auth/change-password", json=same)).json()["error"]["code"] == "same_password"
    new = {"current_password": "Initial!2026x", "new_password": "MonPropre!2026"}
    assert (await api.post("/api/auth/change-password", json=new)).status_code == 204
    assert (await api.get(f"/api/restaurants/{rid}/orders/active")).status_code == 200
    assert (await api.get("/api/auth/me")).json()["must_change_password"] is False


async def test_create_modes_validation(owner, restaurant):
    rid = restaurant["id"]
    base = {"email": "v@example.com", "full_name": "Val Idation", "role": "KITCHEN"}
    assert (await owner.post(f"/api/restaurants/{rid}/members", json={**base, "mode": "password"})).status_code == 422
    r = await owner.post(f"/api/restaurants/{rid}/members", json={**base, "password": "Initial!2026x"})
    assert r.status_code == 422  # pas de mot de passe en mode invitation


async def test_granular_permissions(client, owner, restaurant, menu):
    rid = restaurant["id"]
    # Responsable sans droit sur les prix ni sur la suppression.
    manager_perms = ["restaurant.view", "menu.view", "menu.create", "menu.edit", "stock.manage", "team.view"]
    mgr_member = await _direct(owner, rid, "resp@example.com", "MANAGER", permissions=manager_perms)
    assert set(mgr_member["permissions"]) == set(manager_perms)
    assert mgr_member["permission_overrides"]["prices.edit"] is False
    api = await login(client, "resp@example.com", "Initial!2026x")
    await api.post(
        "/api/auth/change-password", json={"current_password": "Initial!2026x", "new_password": "Resp!2026xyz"}
    )
    yassa = menu["yassa"]
    # Modifier le nom : autorisé ; modifier le prix : refusé ; supprimer : refusé.
    r = await api.patch(f"/api/restaurants/{rid}/menu/products/{yassa['id']}", json={"name": "Yassa du chef"})
    assert r.status_code == 200
    r = await api.patch(f"/api/restaurants/{rid}/menu/products/{yassa['id']}", json={"price": 1})
    assert r.status_code == 403 and r.json()["error"]["code"] == "permission_denied"
    # Même prix renvoyé tel quel : pas une modification de prix.
    r = await api.patch(f"/api/restaurants/{rid}/menu/products/{yassa['id']}", json={"price": yassa["price"]})
    assert r.status_code == 200
    assert (await api.delete(f"/api/restaurants/{rid}/menu/products/{yassa['id']}")).status_code == 403
    # Statistiques, réglages, équipe : refusés ; consultation de l'équipe : autorisée.
    assert (await api.get(f"/api/restaurants/{rid}/stats")).status_code in (403, 404)
    assert (await api.patch(f"/api/restaurants/{rid}", json={"accepting_orders": False})).status_code == 403
    assert (await api.get(f"/api/restaurants/{rid}/members")).status_code == 200
    r = await api.post(
        f"/api/restaurants/{rid}/members", json={"email": "z@example.com", "full_name": "Zz Zz", "role": "KITCHEN"}
    )
    assert r.status_code == 403
    me = (await api.get("/api/auth/me")).json()["memberships"][0]["permissions"]
    assert "prices.edit" not in me and "menu.edit" in me

    # Le propriétaire rétablit les permissions du rôle.
    r = await owner.patch(f"/api/restaurants/{rid}/members/{mgr_member['id']}", json={"reset_permissions": True})
    assert r.json()["permission_overrides"] == {}
    r = await api.patch(f"/api/restaurants/{rid}/menu/products/{yassa['id']}", json={"price": 4200})
    assert r.status_code == 200


async def test_manager_cannot_grant_more_than_own(client, owner, restaurant):
    rid = restaurant["id"]
    limited = ["restaurant.view", "menu.view", "team.view", "team.manage", "orders.prepare"]
    mgr_member = await _direct(owner, rid, "lim@example.com", "MANAGER", permissions=limited)
    api = await login(client, "lim@example.com", "Initial!2026x")
    await api.post(
        "/api/auth/change-password", json={"current_password": "Initial!2026x", "new_password": "Lim!2026xyzz"}
    )
    # Inviter une caisse (préréglage avec encaissement) : refusé, il n'a pas ces droits.
    r = await api.post(
        f"/api/restaurants/{rid}/members", json={"email": "c@example.com", "full_name": "Cc Cc", "role": "CASHIER"}
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "grant_exceeds"
    # Une cuisine limitée à ses propres droits : autorisé.
    r = await api.post(
        f"/api/restaurants/{rid}/members",
        json={
            "email": "k@example.com",
            "full_name": "Kk Kk",
            "role": "KITCHEN",
            "permissions": ["restaurant.view", "menu.view", "orders.prepare"],
        },
    )
    assert r.status_code == 201, r.text
    # Il ne peut pas modifier ses propres permissions.
    r = await api.patch(
        f"/api/restaurants/{rid}/members/{mgr_member['id']}", json={"permissions": limited + ["stats.view"]}
    )
    assert r.status_code == 403 and r.json()["error"]["code"] == "self_edit"


async def test_profile_station_deactivate_and_remove(client, owner, restaurant):
    rid = restaurant["id"]
    station = (await owner.post(f"/api/restaurants/{rid}/stations", json={"name": "Grill"})).json()
    cook = await add_member(owner, client, rid, "cook9@example.com", "KITCHEN")
    mid = next(
        m for m in (await owner.get(f"/api/restaurants/{rid}/members")).json() if m["email"] == "cook9@example.com"
    )["id"]
    r = await owner.patch(
        f"/api/restaurants/{rid}/members/{mid}",
        json={"full_name": "Chef Grill", "phone": "+221770000001", "station_id": station["id"]},
    )
    assert r.status_code == 200 and r.json()["station_name"] == "Grill" and r.json()["full_name"] == "Chef Grill"
    assert (await cook.get("/api/auth/me")).json()["memberships"][0]["station_id"] == station["id"]

    # Désactivation dans le restaurant : plus d'accès ; réactivation : accès rétabli.
    await owner.patch(f"/api/restaurants/{rid}/members/{mid}", json={"is_active": False})
    assert (await cook.get(f"/api/restaurants/{rid}/orders/active")).status_code == 404
    await owner.patch(f"/api/restaurants/{rid}/members/{mid}", json={"is_active": True})
    assert (await cook.get(f"/api/restaurants/{rid}/orders/active")).status_code == 200

    # Retrait d'un compte activé : l'appartenance disparaît, le compte reste.
    assert (await owner.delete(f"/api/restaurants/{rid}/members/{mid}")).status_code == 204
    assert (
        await client.post("/api/auth/login", json={"email": "cook9@example.com", "password": "Password!123"})
    ).status_code == 200

    # Retrait d'une invitation jamais activée : le compte est supprimé.
    inv = (
        await owner.post(
            f"/api/restaurants/{rid}/members",
            json={"email": "jamais@example.com", "full_name": "Ja Mais", "role": "KITCHEN"},
        )
    ).json()
    assert inv["invite_status"] == "PENDING" and inv["invite_expires_at"]
    assert (await owner.delete(f"/api/restaurants/{rid}/members/{inv['id']}")).status_code == 204
    r = await owner.post(
        f"/api/restaurants/{rid}/members",
        json={"email": "jamais@example.com", "full_name": "Ja Mais", "role": "KITCHEN"},
    )
    assert r.status_code == 201  # recréable : l'ancien compte n'existe plus


async def test_shared_account_profile_protected(client, admin, owner, restaurant):
    rid = restaurant["id"]
    cook = await add_member(owner, client, rid, "partage@example.com", "KITCHEN")
    other = (
        await admin.post(
            "/api/admin/restaurants",
            json={"name": "Autre Resto", "owner_email": "autre.owner@example.com", "owner_full_name": "Au Tre"},
        )
    ).json()
    await admin.post(
        f"/api/admin/users/{cook.user['id']}/memberships", json={"restaurant_id": other["id"], "role": "KITCHEN"}
    )
    members = (await owner.get(f"/api/restaurants/{rid}/members")).json()
    m = next(x for x in members if x["email"] == "partage@example.com")
    assert m["editable_profile"] is False
    r = await owner.patch(f"/api/restaurants/{rid}/members/{m['id']}", json={"full_name": "Renommé"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "shared_account"
    # Le rôle dans CE restaurant reste modifiable.
    assert (await owner.patch(f"/api/restaurants/{rid}/members/{m['id']}", json={"role": "CASHIER"})).status_code == 200


async def test_expired_invitation_status(client, owner, restaurant):
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import update

    from app.core.db import SessionLocal
    from app.models import ActivationToken

    rid = restaurant["id"]
    inv = (
        await owner.post(
            f"/api/restaurants/{rid}/members",
            json={"email": "exp@example.com", "full_name": "Ex Pire", "role": "CASHIER"},
        )
    ).json()
    async with SessionLocal() as s:
        await s.execute(update(ActivationToken).values(expires_at=datetime.now(UTC) - timedelta(hours=1)))
        await s.commit()
    m = next(x for x in (await owner.get(f"/api/restaurants/{rid}/members")).json() if x["email"] == "exp@example.com")
    assert m["invite_status"] == "EXPIRED"
    token = inv["activation_url"].rsplit("/activate/", 1)[1]
    assert (await client.get(f"/api/auth/activation/{token}")).status_code == 404
    # Renvoi : nouveau lien valide.
    r = await owner.post(f"/api/restaurants/{rid}/members/{m['id']}/resend-invite")
    assert r.json()["invite_status"] == "PENDING"


async def test_permission_catalog_and_audit(admin, owner, restaurant):
    rid = restaurant["id"]
    cat = (await owner.get(f"/api/restaurants/{rid}/permissions/catalog")).json()
    keys = {i["key"] for g in cat["groups"] for i in g["items"]}
    assert {"prices.edit", "team.manage", "menu.delete"} <= keys
    assert "orders.prepare" in cat["role_defaults"]["KITCHEN"] and "stats.view" not in cat["role_defaults"]["KITCHEN"]
    await owner.patch(f"/api/restaurants/{rid}", json={"name": "Chez Awa 2"})
    logs = (await admin.get("/api/admin/audit-logs", params={"action": "restaurant.updated"})).json()["items"]
    assert logs[0]["data"]["changes"]["name"] == ["Chez Awa", "Chez Awa 2"]


async def test_info_vs_settings_permissions(client, owner, restaurant):
    rid = restaurant["id"]
    member = await _direct(
        owner, rid, "info@example.com", "MANAGER", permissions=["restaurant.view", "restaurant.edit", "menu.view"]
    )
    api = await login(client, "info@example.com", "Initial!2026x")
    await api.post(
        "/api/auth/change-password", json={"current_password": "Initial!2026x", "new_password": "Info!2026xyz"}
    )
    assert (await api.patch(f"/api/restaurants/{rid}", json={"description": "Nouvelle description"})).status_code == 200
    r = await api.patch(f"/api/restaurants/{rid}", json={"reservations_enabled": False})
    assert r.status_code == 403
    slots = [{"day_of_week": 0, "opens_at": "10:00", "closes_at": "22:00"}]
    assert (await api.put(f"/api/restaurants/{rid}/opening-hours", json=slots)).status_code == 200
    assert member["role"] == "MANAGER"


async def test_fine_grained_order_and_reservation_rules(client, owner, restaurant, menu):
    from tests.test_orders import qr_order

    rid, slug = restaurant["id"], restaurant["slug"]
    # Caisse sans encaissement ni préparation, mais avec l'annulation ; réservations en lecture seule.
    perms = ["restaurant.view", "orders.history", "orders.create", "orders.cancel", "reservations.view"]
    await _direct(owner, rid, "fine@example.com", "CASHIER", permissions=perms)
    api = await login(client, "fine@example.com", "Initial!2026x")
    await api.post(
        "/api/auth/change-password", json={"current_password": "Initial!2026x", "new_password": "Fine!2026xyzz"}
    )

    assert (await api.get(f"/api/restaurants/{rid}/menu")).status_code == 403  # pas de menu.view
    item = {"product_id": menu["bissap"]["id"], "quantity": 1}
    pos = {"service_mode": "TAKEAWAY", "items": [item]}
    r = await api.post(f"/api/restaurants/{rid}/orders", json={**pos, "payment": {"method": "CASH"}})
    assert r.status_code == 403  # encaissement sans payments.record
    oid = (await api.post(f"/api/restaurants/{rid}/orders", json=pos)).json()["id"]
    r = await api.post(f"/api/restaurants/{rid}/orders/{oid}/status", json={"status": "PREPARING"})
    assert r.status_code == 403  # pas orders.prepare
    r = await api.post(f"/api/restaurants/{rid}/orders/{oid}/status", json={"status": "CANCELLED", "reason": "Erreur"})
    assert r.status_code == 200  # orders.cancel suffit

    await client.post(f"/api/public/restaurants/{slug}/orders", json=qr_order(menu))
    from tests.test_admin_platform import _slot

    await client.post(
        f"/api/public/restaurants/{slug}/reservations",
        json={"starts_at": _slot(), "party_size": 2, "customer_name": "Aa Bb", "customer_phone": "+221770000000"},
    )
    res = (await api.get(f"/api/restaurants/{rid}/reservations")).json()
    assert res and res[0]["allowed_transitions"] == []
    assert (await owner.get(f"/api/restaurants/{rid}/reservations")).json()[0]["allowed_transitions"]
