"""Fixtures de test : PostgreSQL réel (base dédiée *_test), Redis réel (db 15), S3 simulé (moto).

Jamais de base de production ici : l'URL est forcée vers la base locale de test.
"""

import os
import uuid
from datetime import UTC, datetime

os.environ.update(
    ENVIRONMENT="test",
    DATABASE_URL=os.environ.get(
        "TEST_DATABASE_URL", "postgresql+asyncpg://omegasen:omegasen@localhost:54330/omegasen_test"
    ),
    REDIS_URL=os.environ.get("TEST_REDIS_URL", "redis://localhost:63790/15"),
    S3_ENDPOINT_URL="",
    S3_BUCKET="test-bucket",
    S3_PUBLIC_BASE_URL="https://cdn.test/test-bucket",
    S3_ACCESS_KEY="test",
    S3_SECRET_KEY="test",
    PUBLIC_APP_URL="https://omegasen.test",
    JWT_SECRET="test-secret-test-secret-test-secret-1234",
)

import asyncpg  # noqa: E402
import pytest  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from moto import mock_aws  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.core import storage  # noqa: E402
from app.core.db import Base, engine  # noqa: E402
from app.core.redis import get_redis  # noqa: E402
from app.main import app  # noqa: E402

assert "_test" in os.environ["DATABASE_URL"], "Les tests doivent viser une base *_test"


async def _ensure_database() -> None:
    url = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
    base, dbname = url.rsplit("/", 1)
    conn = await asyncpg.connect(f"{base}/postgres")
    try:
        if not await conn.fetchval("SELECT 1 FROM pg_database WHERE datname=$1", dbname):
            await conn.execute(f'CREATE DATABASE "{dbname}"')
    finally:
        await conn.close()


@pytest.fixture(scope="session", autouse=True)
async def _schema():
    await _ensure_database()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


@pytest.fixture(autouse=True)
async def _clean():
    tables = ", ".join(f'"{t.name}"' for t in Base.metadata.sorted_tables)
    async with engine.begin() as conn:
        await conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
    await get_redis().flushdb()
    yield


@pytest.fixture(autouse=True)
def s3():
    with mock_aws():
        storage.reset_client_cache()
        storage.ensure_bucket()
        yield storage._client()
    storage.reset_client_cache()


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


# ── Helpers ─────────────────────────────────────────────


class Api:
    def __init__(self, client: AsyncClient, token: str, user: dict):
        self.client, self.token, self.user = client, token, user

    @property
    def h(self) -> dict:
        return {"Authorization": f"Bearer {self.token}"}

    async def get(self, url, **kw):
        return await self.client.get(url, headers=self.h, **kw)

    async def post(self, url, **kw):
        return await self.client.post(url, headers=self.h, **kw)

    async def patch(self, url, **kw):
        return await self.client.patch(url, headers=self.h, **kw)

    async def put(self, url, **kw):
        return await self.client.put(url, headers=self.h, **kw)

    async def delete(self, url, **kw):
        return await self.client.delete(url, headers=self.h, **kw)


async def make_user(
    client: AsyncClient, email: str | None = None, password: str = "Password!123", *, superadmin: bool = False
) -> Api:
    """Crée un compte directement en base (pas d'inscription publique) puis se connecte."""
    from app.core.db import SessionLocal
    from app.core.security import hash_password
    from app.models import User

    email = email or f"user-{uuid.uuid4().hex[:8]}@example.com"
    async with SessionLocal() as s:
        s.add(
            User(
                email=email.lower(),
                full_name="Test User",
                password_hash=hash_password(password),
                is_superadmin=superadmin,
                activated_at=datetime.now(UTC),
            )
        )
        await s.commit()
    return await login(client, email, password)


async def login(client: AsyncClient, email: str, password: str = "Password!123") -> Api:
    r = await client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return Api(client, r.json()["access_token"], r.json()["user"])


async def add_member(
    manager: Api, client: AsyncClient, rid: str, email: str, role: str, password: str = "Password!123"
) -> Api:
    """Le gérant ajoute un employé (invitation), qui active son compte via le lien reçu."""
    r = await manager.post(
        f"/api/restaurants/{rid}/members", json={"email": email, "full_name": "Employé Test", "role": role}
    )
    assert r.status_code == 201, r.text
    token = r.json()["activation_url"].rsplit("/activate/", 1)[1]
    r = await client.post("/api/auth/activate", json={"token": token, "password": password})
    assert r.status_code == 200, r.text
    return Api(client, r.json()["access_token"], r.json()["user"])


@pytest.fixture(autouse=True)
def _clear_outbox():
    from app.core.mailer import OUTBOX

    OUTBOX.clear()
    yield
    OUTBOX.clear()


@pytest.fixture
async def owner(client) -> Api:
    return await make_user(client)


@pytest.fixture
async def admin(client) -> Api:
    return await make_user(client, superadmin=True)


@pytest.fixture
async def restaurant(owner, admin) -> dict:
    """Seul le super admin crée un restaurant ; `owner` en devient propriétaire."""
    r = await admin.post(
        "/api/admin/restaurants",
        json={"name": "Chez Awa", "currency": "XOF", "city": "Dakar", "owner_email": owner.user["email"]},
    )
    assert r.status_code == 201, r.text
    assert r.json()["activation_url"] is None  # compte déjà existant
    r = await owner.get(f"/api/restaurants/{r.json()['id']}")
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture
async def menu(owner, restaurant) -> dict:
    """Menu de démo : Plats (Yassa avec groupe obligatoire + suppléments) et Boissons."""
    rid = restaurant["id"]
    plats = (await owner.post(f"/api/restaurants/{rid}/menu/categories", json={"name": "Plats"})).json()
    boissons = (await owner.post(f"/api/restaurants/{rid}/menu/categories", json={"name": "Boissons"})).json()
    yassa = await owner.post(
        f"/api/restaurants/{rid}/menu/products",
        json={
            "category_id": plats["id"],
            "name": "Yassa poulet",
            "price": 3500,
            "option_groups": [
                {
                    "name": "Accompagnement",
                    "min_choices": 1,
                    "max_choices": 1,
                    "options": [{"name": "Riz"}, {"name": "Frites", "price_delta": 500}],
                },
                {
                    "name": "Suppléments",
                    "min_choices": 0,
                    "max_choices": 3,
                    "options": [{"name": "Oignons", "price_delta": 200}, {"name": "Piment", "price_delta": 0}],
                },
            ],
        },
    )
    assert yassa.status_code == 201, yassa.text
    bissap = await owner.post(
        f"/api/restaurants/{rid}/menu/products",
        json={"category_id": boissons["id"], "name": "Bissap", "price": 1000},
    )
    assert bissap.status_code == 201, bissap.text
    return {"plats": plats, "boissons": boissons, "yassa": yassa.json(), "bissap": bissap.json()}


def opt(product: dict, group: str, option: str) -> str:
    g = next(g for g in product["option_groups"] if g["name"] == group)
    return next(o["id"] for o in g["options"] if o["name"] == option)
