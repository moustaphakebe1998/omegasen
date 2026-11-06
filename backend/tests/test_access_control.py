"""Contrôle d'accès : statut des restaurants, hiérarchie des rôles, permissions, isolation, super admin.

Scénarios A (suspension), B (permissions), C (isolation), D (super admin) et non-régressions de sécurité.
"""

import uuid

from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.core.access import SUSPENDED_MESSAGE
from app.core.db import SessionLocal
from app.main import app
from app.models import Membership, RefreshToken, User
from tests.conftest import Api, add_member, login, make_user

ROLES = ["ADMIN", "MANAGER", "CASHIER", "WAITER", "KITCHEN", "STAFF"]


async def _team(owner: Api, client, rid: str, prefix: str = "m") -> dict[str, Api]:
    """Un collaborateur par rôle (invitation + activation)."""
    return {role: await add_member(owner, client, rid, f"{prefix}-{role.lower()}@example.com", role) for role in ROLES}


async def _status(admin: Api, rid: str, status: str, reason: str | None = "Contrôle"):
    r = await admin.post(f"/api/admin/restaurants/{rid}/status", json={"status": status, "reason": reason})
    assert r.status_code == 200, r.text
    return r.json()


async def _session_client(email: str, password: str = "Password!123") -> tuple[AsyncClient, Api]:
    """Client séparé (son propre cookie de rafraîchissement) : une « session » réelle sur un appareil."""
    c = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    return c, await login(c, email, password)


def pos_order(menu: dict) -> dict:
    return {
        "service_mode": "TAKEAWAY",
        "items": [{"product_id": menu["bissap"]["id"], "quantity": 1}],
    }


# ── Scénario A : suspension ─────────────────────────────


async def test_scenario_a_suspension_blocks_every_account_then_reactivation_restores(
    client, admin, owner, restaurant, menu
):
    rid = restaurant["id"]
    team = await _team(owner, client, rid)
    everyone = {"OWNER": owner, **team}
    for role, api in everyone.items():
        assert (await api.get(f"/api/restaurants/{rid}")).status_code == 200, role
    perms_before = {
        role: (await api.get("/api/auth/me")).json()["memberships"][0]["permissions"] for role, api in everyone.items()
    }
    # Deux sessions réelles (cookies de rafraîchissement distincts).
    owner_device, _ = await _session_client(owner.user["email"])
    cashier_device, _ = await _session_client("m-cashier@example.com")

    await _status(admin, rid, "SUSPENDED", "Impayés")

    for role, api in everyone.items():
        # Anciennes sessions : jeton d'accès encore signé, mais inutilisable.
        r = await api.get(f"/api/restaurants/{rid}/orders" if role != "STAFF" else f"/api/restaurants/{rid}")
        assert r.status_code == 403 and r.json()["error"]["code"] == "restaurant_suspended", role
        assert r.json()["error"]["message"] == SUSPENDED_MESSAGE
        # Même hors du restaurant : notifications, espace client…
        assert (await api.get("/api/notifications")).json()["error"]["code"] == "restaurant_suspended", role
        # Le profil reste lisible pour afficher le motif.
        me = (await api.get("/api/auth/me")).json()
        assert me["memberships"][0]["access_blocked"] == "restaurant_suspended", role
        assert me["memberships"][0]["access_message"] == SUSPENDED_MESSAGE
        # Nouvelle connexion refusée avec le message explicite.
        r = await client.post("/api/auth/login", json={"email": api.user["email"], "password": "Password!123"})
        assert r.status_code == 403 and r.json()["error"]["message"] == SUSPENDED_MESSAGE, role
    # Écriture refusée (API du restaurant) et renouvellement de session impossible.
    assert (await owner.post(f"/api/restaurants/{rid}/orders", json=pos_order(menu))).status_code == 403
    for device in (owner_device, cashier_device):
        assert (await device.post("/api/auth/refresh")).status_code in (401, 403)
    async with SessionLocal() as s:
        ids = [uuid.UUID(a.user["id"]) for a in everyone.values()]
        live = await s.scalar(
            select(RefreshToken.id).where(RefreshToken.user_id.in_(ids), RefreshToken.revoked_at.is_(None)).limit(1)
        )
        assert live is None  # toutes les sessions révoquées
        # Aucun compte ni rattachement modifié : le blocage vient uniquement du statut du restaurant.
        assert all(u.is_active for u in await s.scalars(select(User).where(User.id.in_(ids))))
        assert all(m.is_active for m in await s.scalars(select(Membership).where(Membership.restaurant_id == rid)))
    # Public : menu et QR indisponibles.
    assert (await client.get(f"/api/public/restaurants/{restaurant['slug']}")).status_code == 404

    # Un compte bloqué individuellement pendant la suspension doit le rester après.
    await admin.patch(f"/api/admin/users/{team['WAITER'].user['id']}", json={"is_active": False})

    await _status(admin, rid, "ACTIVE", None)
    for role, api in everyone.items():
        if role == "WAITER":
            continue
        again = await login(client, api.user["email"])
        assert (await again.get(f"/api/restaurants/{rid}")).status_code == 200, role
        me = (await again.get("/api/auth/me")).json()["memberships"][0]
        assert me["permissions"] == perms_before[role] and me["access_blocked"] is None, role
    r = await client.post("/api/auth/login", json={"email": "m-waiter@example.com", "password": "Password!123"})
    assert r.status_code == 401
    await owner_device.aclose()
    await cashier_device.aclose()


async def test_closed_and_pending_rules(client, admin, owner, restaurant):
    rid = restaurant["id"]
    team = await _team(owner, client, rid)
    # En attente d'activation : seuls propriétaire et administrateur préparent le restaurant.
    await _status(admin, rid, "PENDING", None)
    assert (await owner.get(f"/api/restaurants/{rid}/menu")).status_code == 200
    assert (await team["ADMIN"].get(f"/api/restaurants/{rid}/menu")).status_code == 200
    for role in ("MANAGER", "CASHIER", "KITCHEN"):
        r = await team[role].get(f"/api/restaurants/{rid}")
        assert r.json()["error"]["code"] == "restaurant_pending", role
    # Fermé : tout le monde est bloqué ; le super admin consulte toujours.
    await _status(admin, rid, "CLOSED", "Fin d'activité")
    for api in (owner, *team.values()):
        assert (await api.get(f"/api/restaurants/{rid}")).json()["error"]["code"] == "restaurant_closed"
    assert (await admin.get(f"/api/restaurants/{rid}/orders")).status_code == 200
    detail = (await admin.get(f"/api/admin/restaurants/{rid}")).json()
    assert detail["status"] == "CLOSED" and len(detail["staff"]) == 7


async def test_multi_restaurant_member_keeps_access_to_active_restaurant(client, admin, owner, restaurant):
    rid = restaurant["id"]
    cook = await add_member(owner, client, rid, "double@example.com", "KITCHEN")
    other = (
        await admin.post(
            "/api/admin/restaurants", json={"name": "Autre", "currency": "EUR", "owner_email": "double@example.com"}
        )
    ).json()["id"]
    await _status(admin, rid, "SUSPENDED")
    r = await cook.get(f"/api/restaurants/{rid}")
    assert r.json()["error"]["code"] == "restaurant_suspended"
    assert (await cook.get(f"/api/restaurants/{other}")).status_code == 200
    again = await login(client, "double@example.com")  # connexion permise : un restaurant reste accessible
    blocked = {m["restaurant_id"]: m["access_blocked"] for m in again.user["memberships"]}
    assert blocked == {rid: "restaurant_suspended", other: None}


# ── Scénario B : permissions individuelles ──────────────


async def test_scenario_b_staff_with_individual_permissions(client, owner, restaurant, menu):
    rid = restaurant["id"]
    granted = ["restaurant.view", "menu.view", "menu.edit", "orders.history", "orders.create"]
    r = await owner.post(
        f"/api/restaurants/{rid}/members",
        json={"email": "staff@example.com", "full_name": "Staff Test", "role": "STAFF", "permissions": granted},
    )
    assert r.status_code == 201 and set(r.json()["permissions"]) == set(granted)
    mid = r.json()["id"]
    token = r.json()["activation_url"].rsplit("/", 1)[1]
    r = await client.post("/api/auth/activate", json={"token": token, "password": "Password!123"})
    staff = Api(client, r.json()["access_token"], r.json()["user"])
    yassa = menu["yassa"]

    allowed = [
        await staff.get(f"/api/restaurants/{rid}/orders"),
        await staff.post(f"/api/restaurants/{rid}/orders", json=pos_order(menu)),
        await staff.patch(f"/api/restaurants/{rid}/menu/products/{yassa['id']}", json={"name": "Yassa maison"}),
    ]
    assert [x.status_code for x in allowed] == [200, 201, 200]
    order_id = allowed[1].json()["id"]
    denied = [
        await staff.get(f"/api/restaurants/{rid}/stats"),
        await staff.post(f"/api/restaurants/{rid}/orders/{order_id}/payments", json={"method": "CASH"}),
        await staff.post(
            f"/api/restaurants/{rid}/orders/{order_id}/status", json={"status": "CANCELLED", "reason": "x y"}
        ),
        await staff.get(f"/api/restaurants/{rid}/members"),
        await staff.get(f"/api/restaurants/{rid}/orders/active"),
        await staff.delete(f"/api/restaurants/{rid}/menu/products/{yassa['id']}"),
    ]
    assert [x.status_code for x in denied] == [403] * len(denied)

    # Le propriétaire modifie les permissions sans changer le rôle : effet immédiat, même session.
    new = ["restaurant.view", "menu.view", "orders.history", "stats.view"]
    r = await owner.patch(f"/api/restaurants/{rid}/members/{mid}", json={"permissions": new})
    assert r.status_code == 200 and r.json()["role"] == "STAFF"
    assert (await staff.get(f"/api/restaurants/{rid}/stats")).status_code == 200
    assert (await staff.post(f"/api/restaurants/{rid}/orders", json=pos_order(menu))).status_code == 403
    me = (await staff.get("/api/auth/me")).json()["memberships"][0]["permissions"]
    assert set(me) == set(new)
    # Désactivation du collaborateur : accès coupé et sessions révoquées (plus aucun restaurant).
    r = await owner.patch(f"/api/restaurants/{rid}/members/{mid}", json={"is_active": False})
    assert (await staff.get(f"/api/restaurants/{rid}")).status_code == 404
    async with SessionLocal() as s:
        uid = uuid.UUID(staff.user["id"])
        assert not await s.scalar(
            select(RefreshToken.id).where(RefreshToken.user_id == uid, RefreshToken.revoked_at.is_(None))
        )


async def test_role_hierarchy(client, owner, restaurant):
    rid = restaurant["id"]
    team = await _team(owner, client, rid)
    members = {m["email"]: m["id"] for m in (await owner.get(f"/api/restaurants/{rid}/members")).json()}
    mid = {role: members[f"m-{role.lower()}@example.com"] for role in ROLES}
    adm, mgr = team["ADMIN"], team["MANAGER"]

    def new(role: str, n: str) -> dict:
        return {"email": f"{n}@example.com", "full_name": "Nouveau Membre", "role": role}

    # L'administrateur gère responsables et personnel, mais ni propriétaire ni autre administrateur.
    assert (await adm.post(f"/api/restaurants/{rid}/members", json=new("MANAGER", "a1"))).status_code == 201
    r = await adm.post(f"/api/restaurants/{rid}/members", json=new("OWNER", "a2"))
    assert r.json()["error"]["code"] == "owner_only"
    r = await adm.post(f"/api/restaurants/{rid}/members", json=new("ADMIN", "a3"))
    assert r.json()["error"]["code"] == "role_too_high"
    r = await adm.patch(f"/api/restaurants/{rid}/members/{mid['MANAGER']}", json={"role": "CASHIER"})
    assert r.status_code == 200
    # Le responsable ne touche ni un administrateur ni un autre responsable, et n'en crée pas.
    await owner.patch(f"/api/restaurants/{rid}/members/{mid['MANAGER']}", json={"role": "MANAGER"})
    r = await mgr.patch(f"/api/restaurants/{rid}/members/{mid['ADMIN']}", json={"is_active": False})
    assert r.json()["error"]["code"] == "role_too_high"
    r = await mgr.post(f"/api/restaurants/{rid}/members", json=new("MANAGER", "m1"))
    assert r.json()["error"]["code"] == "role_too_high"
    assert (await mgr.delete(f"/api/restaurants/{rid}/members/{mid['ADMIN']}")).status_code == 403
    r = await mgr.patch(f"/api/restaurants/{rid}/members/{mid['KITCHEN']}", json={"role": "WAITER"})
    assert r.status_code == 200
    catalog = (await mgr.get(f"/api/restaurants/{rid}/permissions/catalog")).json()
    assert catalog["assignable_roles"] == ["CASHIER", "WAITER", "KITCHEN", "STAFF"]
    # Personne ne modifie ses propres droits.
    r = await adm.patch(f"/api/restaurants/{rid}/members/{mid['ADMIN']}", json={"role": "OWNER"})
    assert r.json()["error"]["code"] == "self_edit"


# ── Scénario C : isolation ──────────────────────────────


async def test_scenario_c_isolation_between_restaurants(client, admin, owner, restaurant, menu):
    rid_a = restaurant["id"]
    team_a = await _team(owner, client, rid_a, "a")
    owner_b = await make_user(client, "owner-b@example.com")
    rid_b = (
        await admin.post(
            "/api/admin/restaurants",
            json={"name": "Resto B", "currency": "XOF", "owner_email": "owner-b@example.com"},
        )
    ).json()["id"]
    cat_b = (await owner_b.post(f"/api/restaurants/{rid_b}/menu/categories", json={"name": "Plats"})).json()
    prod_b = (
        await owner_b.post(
            f"/api/restaurants/{rid_b}/menu/products", json={"category_id": cat_b["id"], "name": "Thieb", "price": 4000}
        )
    ).json()
    order_b = (
        await owner_b.post(
            f"/api/restaurants/{rid_b}/orders",
            json={"service_mode": "TAKEAWAY", "items": [{"product_id": prod_b["id"], "quantity": 1}]},
        )
    ).json()
    member_b = (await owner_b.get(f"/api/restaurants/{rid_b}/members")).json()[0]["id"]

    attempts = [
        ("GET", f"/api/restaurants/{rid_b}"),
        ("GET", f"/api/restaurants/{rid_b}/orders"),
        ("GET", f"/api/restaurants/{rid_b}/orders/{order_b['id']}"),
        ("GET", f"/api/restaurants/{rid_b}/members"),
        ("GET", f"/api/restaurants/{rid_b}/stats"),
        ("GET", f"/api/restaurants/{rid_b}/activity"),
        ("GET", f"/api/restaurants/{rid_b}/qr"),
        ("PATCH", f"/api/restaurants/{rid_b}"),
        # Ressource de B sous l'URL de A : changer l'identifiant ne suffit pas.
        ("GET", f"/api/restaurants/{rid_a}/orders/{order_b['id']}"),
        ("PATCH", f"/api/restaurants/{rid_a}/menu/products/{prod_b['id']}"),
        ("POST", f"/api/restaurants/{rid_a}/orders/{order_b['id']}/payments"),
        ("POST", f"/api/restaurants/{rid_a}/orders/{order_b['id']}/status"),
        ("PATCH", f"/api/restaurants/{rid_a}/members/{member_b}"),
        ("DELETE", f"/api/restaurants/{rid_a}/members/{member_b}"),
    ]
    bodies = {"PATCH": {"name": "Piraté"}, "POST": {"method": "CASH", "status": "CANCELLED", "reason": "pirate"}}
    for who, api in {"OWNER": owner, **team_a}.items():
        for method, url in attempts:
            r = await api.client.request(method, url, headers=api.h, json=bodies.get(method))
            assert r.status_code in (403, 404), (who, method, url, r.status_code)
            if url.startswith(f"/api/restaurants/{rid_b}"):
                assert r.status_code == 404, (who, url)  # existence de B non révélée
    # Rien n'a changé chez B.
    assert (await owner_b.get(f"/api/restaurants/{rid_b}/orders/{order_b['id']}")).json()["status"] == "NEW"
    assert (await owner_b.get(f"/api/restaurants/{rid_b}/menu")).json()[0]["products"][0]["name"] == "Thieb"


# ── Scénario D : super admin ────────────────────────────


async def test_scenario_d_superadmin_global_control(client, admin, owner, restaurant, menu):
    rid = restaurant["id"]
    team = await _team(owner, client, rid)
    other = (
        await admin.post(
            "/api/admin/restaurants",
            json={
                "name": "Second",
                "currency": "EUR",
                "owner_email": "second@example.com",
                "owner_full_name": "Second Owner",
            },
        )
    ).json()
    # 1. Tous les restaurants, filtrés par statut ; compteurs du tableau de bord.
    await _status(admin, other["id"], "SUSPENDED", "Test")
    assert (await admin.get("/api/admin/restaurants")).json()["total"] == 2
    susp = (await admin.get("/api/admin/restaurants", params={"status": "SUSPENDED"})).json()["items"]
    assert [x["id"] for x in susp] == [other["id"]]
    stats = (await admin.get("/api/admin/stats")).json()
    assert stats["restaurants_by_status"] == {"PENDING": 0, "ACTIVE": 1, "SUSPENDED": 1, "CLOSED": 0}
    assert stats["superadmins"] == 1 and stats["users"] >= 9
    # 2 + 5. Suspension : le super admin garde l'accès complet au restaurant (mode administration).
    await _status(admin, rid, "SUSPENDED")
    assert (await admin.get(f"/api/restaurants/{rid}/orders")).status_code == 200
    r = await admin.patch(f"/api/restaurants/{rid}", json={"description": "Modifié par OmegaSen"})
    assert r.status_code == 200
    assert (await admin.get("/api/admin/audit-logs", params={"restaurant_id": rid})).json()["total"] > 0
    await _status(admin, rid, "ACTIVE", None)
    # 3. Gestion des utilisateurs : désactivation, réinitialisation, suppression.
    cashier_id = team["CASHIER"].user["id"]
    r = await admin.patch(f"/api/admin/users/{cashier_id}", json={"is_active": False})
    assert r.json()["status"] == "DISABLED"
    assert (await team["CASHIER"].get(f"/api/restaurants/{rid}")).status_code == 401  # session coupée
    await admin.patch(f"/api/admin/users/{cashier_id}", json={"is_active": True})
    r = await admin.post(f"/api/admin/users/{team['KITCHEN'].user['id']}/password-reset")
    assert r.status_code == 200 and "/reset-password/" in r.json()["activation_url"]
    r = await client.request(
        "DELETE", f"/api/admin/users/{team['STAFF'].user['id']}", headers=admin.h, json={"confirm_email": "faux@x.fr"}
    )
    assert r.json()["error"]["code"] == "confirmation_mismatch"
    r = await client.request(
        "DELETE",
        f"/api/admin/users/{team['STAFF'].user['id']}",
        headers=admin.h,
        json={"confirm_email": "m-staff@example.com"},
    )
    assert r.status_code == 204
    assert (await team["STAFF"].get("/api/auth/me")).status_code == 401
    # Le dernier propriétaire ne peut pas être supprimé.
    r = await client.request(
        "DELETE", f"/api/admin/users/{owner.user['id']}", headers=admin.h, json={"confirm_email": owner.user["email"]}
    )
    assert r.json()["error"]["code"] == "last_owner"
    # 4. Permissions modifiées par le super admin : effet immédiat.
    waiter = team["WAITER"]
    membership = (await admin.get(f"/api/admin/users/{waiter.user['id']}")).json()["memberships"][0]
    assert (await waiter.get(f"/api/restaurants/{rid}/stats")).status_code == 403
    r = await admin.patch(
        f"/api/admin/users/{waiter.user['id']}/memberships/{membership['id']}",
        json={"permissions": [*membership["permissions"], "stats.view"]},
    )
    assert "stats.view" in r.json()["memberships"][0]["permissions"]
    assert (await waiter.get(f"/api/restaurants/{rid}/stats")).status_code == 200
    # Fermeture puis suppression sécurisée (adresse à saisir, restaurant fermé d'abord).
    body = {"confirm_slug": other["slug"], "reason": "Doublon"}
    r = await client.request("DELETE", f"/api/admin/restaurants/{other['id']}", headers=admin.h, json=body)
    assert r.json()["error"]["code"] == "must_be_closed"
    await _status(admin, other["id"], "CLOSED", "Doublon")
    r = await client.request(
        "DELETE", f"/api/admin/restaurants/{other['id']}", headers=admin.h, json={**body, "confirm_slug": "x"}
    )
    assert r.json()["error"]["code"] == "confirmation_mismatch"
    r = await client.request("DELETE", f"/api/admin/restaurants/{other['id']}", headers=admin.h, json=body)
    assert r.status_code == 204
    assert (await admin.get("/api/admin/restaurants")).json()["total"] == 1
    actions = {a["action"] for a in (await admin.get("/api/admin/audit-logs")).json()["items"]}
    assert {
        "admin.restaurant_status",
        "admin.restaurant_deleted",
        "admin.user_updated",
        "admin.user_deleted",
        "admin.password_reset",
        "admin.membership_updated",
    } <= actions


async def test_owner_can_never_obtain_platform_powers(client, admin, owner, restaurant):
    rid = restaurant["id"]
    for method, url in [
        ("GET", "/api/admin/stats"),
        ("GET", "/api/admin/restaurants"),
        ("GET", "/api/admin/users"),
        ("GET", "/api/admin/audit-logs"),
        ("POST", f"/api/admin/restaurants/{rid}/status"),
        ("DELETE", f"/api/admin/restaurants/{rid}"),
        ("PATCH", f"/api/admin/users/{owner.user['id']}"),
        ("POST", "/api/admin/users"),
    ]:
        r = await client.request(method, url, headers=owner.h, json={"status": "ACTIVE", "is_superadmin": True})
        assert r.status_code in (403, 422) and r.status_code != 200, (method, url)
        assert r.status_code == 403 or method != "GET"
    # Champs de plateforme ignorés partout ailleurs.
    await owner.patch("/api/me", json={"full_name": "Owner", "is_superadmin": True})
    await owner.patch(f"/api/restaurants/{rid}", json={"status": "SUSPENDED", "is_demo": True})
    r = await owner.post(
        f"/api/restaurants/{rid}/members",
        json={"email": "boss@example.com", "full_name": "Boss Boss", "role": "ADMIN", "is_superadmin": True},
    )
    assert r.status_code == 201
    async with SessionLocal() as s:
        assert not any(u.is_superadmin for u in await s.scalars(select(User).where(User.email != admin.user["email"])))
    assert (await admin.get(f"/api/admin/restaurants/{rid}")).json()["status"] == "ACTIVE"
    # Un compte super admin n'est jamais ajouté ni modifié depuis une équipe.
    r = await owner.post(
        f"/api/restaurants/{rid}/members",
        json={"email": admin.user["email"], "full_name": "Admin", "role": "STAFF"},
    )
    assert r.json()["error"]["code"] == "superadmin_protected"


# ── Non-régressions de sécurité ─────────────────────────


async def test_direct_creation_never_sets_password_of_existing_account(client, admin, owner, restaurant):
    """Faille corrigée : la création directe fixait le mot de passe d'un compte existant non activé."""
    rid = restaurant["id"]
    # Super admin créé par la plateforme, pas encore activé.
    r = await admin.post(
        "/api/admin/users", json={"email": "root2@example.com", "full_name": "Root Two", "is_superadmin": True}
    )
    assert r.status_code == 201
    attack = {"full_name": "Pirate", "role": "STAFF", "mode": "password", "password": "Pirate!2026xx"}
    r = await owner.post(f"/api/restaurants/{rid}/members", json={**attack, "email": "root2@example.com"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "superadmin_protected"
    # Compte invité par un autre restaurant, pas encore activé.
    other = await make_user(client, "other-owner@example.com")
    rid2 = (
        await admin.post(
            "/api/admin/restaurants",
            json={"name": "Resto Bis", "currency": "EUR", "owner_email": "other-owner@example.com"},
        )
    ).json()["id"]
    await other.post(
        f"/api/restaurants/{rid2}/members",
        json={"email": "victim@example.com", "full_name": "Victime", "role": "CASHIER"},
    )
    r = await owner.post(f"/api/restaurants/{rid}/members", json={**attack, "email": "victim@example.com"})
    assert r.status_code == 409 and r.json()["error"]["code"] == "account_exists_use_invite"
    for email in ("root2@example.com", "victim@example.com"):
        r = await client.post("/api/auth/login", json={"email": email, "password": "Pirate!2026xx"})
        assert r.status_code == 401, email


async def test_superadmin_is_never_a_restaurant_member(client, admin, restaurant):
    r = await admin.post(
        "/api/admin/users",
        json={
            "email": "sa@example.com",
            "full_name": "Super Deux",
            "is_superadmin": True,
            "restaurant_id": restaurant["id"],
            "role": "OWNER",
        },
    )
    assert r.json()["error"]["code"] == "superadmin_no_membership"
    r = await admin.post(
        f"/api/admin/users/{admin.user['id']}/memberships", json={"restaurant_id": restaurant["id"], "role": "OWNER"}
    )
    assert r.json()["error"]["code"] == "superadmin_no_membership"
    r = await admin.patch(f"/api/admin/users/{admin.user['id']}", json={"is_superadmin": False})
    assert r.json()["error"]["code"] == "self_demotion"


async def test_restaurant_activity_log(client, admin, owner, restaurant):
    rid = restaurant["id"]
    cashier = await add_member(owner, client, rid, "c@example.com", "CASHIER")
    await _status(admin, rid, "SUSPENDED", "Contrôle")
    await _status(admin, rid, "ACTIVE", None)
    log = (await owner.get(f"/api/restaurants/{rid}/activity")).json()
    status_events = [x for x in log["items"] if x["action"] == "admin.restaurant_status"]
    assert len(status_events) == 2 and status_events[0]["actor_name"] == "Équipe OmegaSen"
    assert status_events[1]["data"]["before"] == "ACTIVE" and status_events[1]["data"]["after"] == "SUSPENDED"
    assert any(x["action"] == "member.added" for x in log["items"])
    assert (await cashier.get(f"/api/restaurants/{rid}/activity")).status_code == 403


async def test_realtime_access_rules(client, admin, owner, restaurant):
    from app.core.permissions import Perm
    from app.modules.ws import event_allowed, restaurant_access

    rid = restaurant["id"]
    staff = await add_member(owner, client, rid, "s@example.com", "STAFF")
    cook = await add_member(owner, client, rid, "k@example.com", "KITCHEN")
    staff_id, cook_id = uuid.UUID(staff.user["id"]), uuid.UUID(cook.user["id"])
    # Le personnel sans droit sur les commandes ne reçoit pas le flux des commandes.
    ctx = await restaurant_access(staff_id, uuid.UUID(rid))
    assert not event_allowed("order.created", ctx.perms) and event_allowed("menu.updated", ctx.perms)
    assert event_allowed("order.created", (await restaurant_access(cook_id, uuid.UUID(rid))).perms)
    assert not event_allowed("reservation.created", frozenset({Perm.ORDERS_PREPARE}))
    # Suspension : la revérification des WebSockets échoue → fermeture.
    await _status(admin, rid, "SUSPENDED")
    assert await restaurant_access(cook_id, uuid.UUID(rid)) is None
    assert await restaurant_access(uuid.UUID(admin.user["id"]), uuid.UUID(rid)) is not None
    await _status(admin, rid, "ACTIVE", None)
    assert await restaurant_access(cook_id, uuid.UUID(rid)) is not None
    # Collaborateur désactivé : plus d'accès temps réel.
    mid = next(
        m["id"] for m in (await owner.get(f"/api/restaurants/{rid}/members")).json() if m["email"] == "k@example.com"
    )
    await owner.patch(f"/api/restaurants/{rid}/members/{mid}", json={"is_active": False})
    assert await restaurant_access(cook_id, uuid.UUID(rid)) is None


async def test_activation_link_does_not_open_a_session_in_a_suspended_restaurant(client, admin, owner, restaurant):
    rid = restaurant["id"]
    r = await owner.post(
        f"/api/restaurants/{rid}/members",
        json={"email": "late@example.com", "full_name": "En Retard", "role": "CASHIER"},
    )
    token = r.json()["activation_url"].rsplit("/", 1)[1]
    await _status(admin, rid, "SUSPENDED")
    r = await client.post("/api/auth/activate", json={"token": token, "password": "Password!123"})
    assert r.status_code == 403 and r.json()["error"]["code"] == "restaurant_suspended"
    await _status(admin, rid, "ACTIVE", None)
    await login(client, "late@example.com")  # mot de passe bien enregistré
