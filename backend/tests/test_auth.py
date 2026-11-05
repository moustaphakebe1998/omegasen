from datetime import timedelta

from tests.conftest import login, register


async def test_register_login_me(client):
    api = await register(client, "awa@example.com")
    assert api.user["email"] == "awa@example.com"
    assert "omegasen_refresh" in client.cookies

    me = await api.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["memberships"] == []

    logged = await login(client, "AWA@example.com")
    assert logged.user["id"] == api.user["id"]


async def test_duplicate_email_rejected(client):
    await register(client, "dup@example.com")
    r = await client.post(
        "/api/auth/register", json={"email": "dup@example.com", "password": "Password!123", "full_name": "X Y"}
    )
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "email_taken"


async def test_wrong_password_and_lockout(client):
    await register(client, "lock@example.com")
    for _ in range(5):
        r = await client.post("/api/auth/login", json={"email": "lock@example.com", "password": "nope"})
        assert r.status_code == 401
    r = await client.post("/api/auth/login", json={"email": "lock@example.com", "password": "Password!123"})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "account_locked"


async def test_refresh_rotation_and_reuse_detection(client):
    await register(client, "rot@example.com")
    first = client.cookies.get("omegasen_refresh")

    r = await client.post("/api/auth/refresh")
    assert r.status_code == 200
    second = client.cookies.get("omegasen_refresh")
    assert second and second != first

    # Rejeu immédiat (onglets concurrents) : toléré pendant la période de grâce.
    client.cookies.clear()
    client.cookies.set("omegasen_refresh", first, path="/api/auth")
    r = await client.post("/api/auth/refresh")
    assert r.status_code == 200
    second = r.cookies.get("omegasen_refresh")

    # Rejeu après la période de grâce : vol probable → toute la famille est révoquée.
    from sqlalchemy import update

    from app.core.db import SessionLocal
    from app.core.security import hash_token
    from app.models import RefreshToken

    async with SessionLocal() as s:
        await s.execute(
            update(RefreshToken)
            .where(RefreshToken.token_hash == hash_token(first))
            .values(revoked_at=RefreshToken.revoked_at - timedelta(minutes=5))
        )
        await s.commit()
    client.cookies.clear()
    client.cookies.set("omegasen_refresh", first, path="/api/auth")
    r = await client.post("/api/auth/refresh")
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "session_revoked"
    client.cookies.clear()
    client.cookies.set("omegasen_refresh", second, path="/api/auth")
    r = await client.post("/api/auth/refresh")
    assert r.status_code == 401


async def test_protected_route_requires_token(client):
    r = await client.get("/api/auth/me")
    assert r.status_code == 401
    r = await client.get("/api/auth/me", headers={"Authorization": "Bearer garbage"})
    assert r.status_code == 401


async def test_logout_revokes_refresh(client):
    await register(client, "out@example.com")
    assert (await client.post("/api/auth/logout")).status_code == 204
    assert (await client.post("/api/auth/refresh")).status_code == 401
