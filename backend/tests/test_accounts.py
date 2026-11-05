"""Comptes : invitation d'équipe, activation par email, mot de passe oublié, profil, sessions, clients."""

from app.core.mailer import OUTBOX
from tests.conftest import Api, add_member, login, make_user


def _token_from_email(kind: str = "/activate/") -> str:
    mail = OUTBOX[-1]
    link = next(w for w in mail.text.split() if kind in w)
    return link.rsplit(kind, 1)[1]


async def test_member_invitation_email_and_first_password(client, owner, restaurant):
    rid = restaurant["id"]
    r = await owner.post(
        f"/api/restaurants/{rid}/members",
        json={"email": "Caisse@Example.com", "full_name": "Fatou Caisse", "role": "CASHIER"},
    )
    assert r.status_code == 201, r.text
    member = r.json()
    assert member["activated"] is False and member["email_sent"] is True
    # L'email contient le lien, jamais de mot de passe.
    mail = OUTBOX[-1]
    assert mail.to == "caisse@example.com" and "/activate/" in mail.text and "Chez Awa" in mail.text
    token = _token_from_email()

    # Pas de connexion possible avant activation.
    r = await client.post("/api/auth/login", json={"email": "caisse@example.com", "password": "Password!123"})
    assert r.status_code == 401

    # Mot de passe trop court refusé, puis activation.
    assert (await client.post("/api/auth/activate", json={"token": token, "password": "court"})).status_code == 422
    r = await client.post("/api/auth/activate", json={"token": token, "password": "MonMotDePasse!1"})
    assert r.status_code == 200
    assert r.json()["user"]["memberships"][0]["role"] == "CASHIER"
    # Réutilisation du lien refusée.
    assert (
        await client.post("/api/auth/activate", json={"token": token, "password": "Autre!Pass123"})
    ).status_code == 404
    await login(client, "caisse@example.com", "MonMotDePasse!1")

    members = (await owner.get(f"/api/restaurants/{rid}/members")).json()
    assert next(m for m in members if m["email"] == "caisse@example.com")["activated"] is True


async def test_resend_invite_invalidates_previous_link(client, owner, restaurant):
    rid = restaurant["id"]
    member = (
        await owner.post(
            f"/api/restaurants/{rid}/members", json={"email": "k@example.com", "full_name": "Cuisto", "role": "KITCHEN"}
        )
    ).json()
    first = member["activation_url"].rsplit("/activate/", 1)[1]
    r = await owner.post(f"/api/restaurants/{rid}/members/{member['id']}/resend-invite")
    assert r.status_code == 200
    second = r.json()["activation_url"].rsplit("/activate/", 1)[1]
    assert first != second
    assert (await client.get(f"/api/auth/activation/{first}")).status_code == 404
    assert (await client.get(f"/api/auth/activation/{second}")).status_code == 200


async def test_forgot_and_reset_password(client):
    await make_user(client, "oubli@example.com")
    # Adresse inconnue : même réponse, aucun email.
    assert (await client.post("/api/auth/forgot-password", json={"email": "inconnu@example.com"})).status_code == 202
    assert OUTBOX == []
    assert (await client.post("/api/auth/forgot-password", json={"email": "oubli@example.com"})).status_code == 202
    assert OUTBOX[-1].to == "oubli@example.com"
    token = _token_from_email("/reset-password/")
    assert (await client.get(f"/api/auth/reset/{token}")).json()["email"] == "oubli@example.com"
    # Un lien de réinitialisation ne sert pas d'activation.
    assert (await client.get(f"/api/auth/activation/{token}")).status_code == 404

    r = await client.post("/api/auth/reset-password", json={"token": token, "password": "NouveauPass!2026"})
    assert r.status_code == 204
    assert (
        await client.post("/api/auth/reset-password", json={"token": token, "password": "Encore!2026xx"})
    ).status_code == 404
    r = await client.post("/api/auth/login", json={"email": "oubli@example.com", "password": "Password!123"})
    assert r.status_code == 401
    await login(client, "oubli@example.com", "NouveauPass!2026")


async def test_reset_revokes_sessions(client):
    await make_user(client, "sess@example.com")
    assert (await client.post("/api/auth/refresh")).status_code == 200
    await client.post("/api/auth/forgot-password", json={"email": "sess@example.com"})
    token = _token_from_email("/reset-password/")
    await client.post("/api/auth/reset-password", json={"token": token, "password": "NouveauPass!2026"})
    assert (await client.post("/api/auth/refresh")).status_code == 401


async def test_profile_sessions_and_change_password(client):
    api = await make_user(client, "profil@example.com")
    r = await api.patch("/api/auth/me", json={"full_name": "Awa Ndiaye", "phone": "+221770000000"})
    assert r.status_code == 200 and r.json()["full_name"] == "Awa Ndiaye"
    sessions = (await api.get("/api/auth/sessions")).json()
    assert len(sessions) == 1 and sessions[0]["current"] is True
    assert (await api.delete(f"/api/auth/sessions/{sessions[0]['id']}")).status_code == 204
    assert (await api.get("/api/auth/sessions")).json() == []

    r = await api.post("/api/auth/change-password", json={"current_password": "faux", "new_password": "Nouveau!2026x"})
    assert r.status_code == 422
    r = await api.post(
        "/api/auth/change-password", json={"current_password": "Password!123", "new_password": "Nouveau!2026x"}
    )
    assert r.status_code == 204
    await login(client, "profil@example.com", "Nouveau!2026x")


async def test_customer_signup_and_order_history(client, restaurant, menu):
    r = await client.post("/api/auth/signup", json={"email": "client@example.com", "full_name": "Moussa Client"})
    assert r.status_code == 202
    token = _token_from_email()
    r = await client.post("/api/auth/activate", json={"token": token, "password": "ClientPass!2026"})
    assert r.status_code == 200
    me = r.json()["user"]
    assert me["account_type"] == "CUSTOMER" and me["memberships"] == []
    customer = Api(client, r.json()["access_token"], me)

    # Double inscription refusée une fois le compte activé.
    r = await client.post("/api/auth/signup", json={"email": "client@example.com", "full_name": "Moussa Client"})
    assert r.status_code == 409

    # Commande en étant connecté → visible dans « Mes commandes ».
    body = {
        "service_mode": "TAKEAWAY",
        "customer_name": "Moussa",
        "items": [{"product_id": menu["bissap"]["id"], "quantity": 1}],
    }
    r = await customer.post(f"/api/public/restaurants/{restaurant['slug']}/orders", json=body)
    assert r.status_code == 201, r.text
    mine = (await customer.get("/api/me/orders")).json()
    assert len(mine) == 1 and mine[0]["restaurant_slug"] == restaurant["slug"]
    # Une commande anonyme n'y apparaît pas.
    await client.post(f"/api/public/restaurants/{restaurant['slug']}/orders", json=body)
    assert len((await customer.get("/api/me/orders")).json()) == 1


async def test_me_exposes_permissions(client, owner, restaurant):
    rid = restaurant["id"]
    cook = await add_member(owner, client, rid, "cuisto@example.com", "KITCHEN")
    perms = (await cook.get("/api/auth/me")).json()["memberships"][0]["permissions"]
    assert "orders.prepare" in perms and "menu.manage" not in perms and "team.manage" not in perms
    owner_perms = (await owner.get("/api/auth/me")).json()["memberships"][0]["permissions"]
    assert {"menu.manage", "team.manage", "stats.view"} <= set(owner_perms)
