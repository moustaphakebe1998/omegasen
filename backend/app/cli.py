"""Commandes d'administration.

python -m app.cli bootstrap   # crée le super admin défini par SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD
python -m app.cli seed-demo   # restaurant de démonstration + menu + comptes employés
python -m app.cli purge-e2e [--since ISO] [--emails MOTIF]   # nettoie les données des tests e2e (hors production)
"""

import asyncio
import sys
from datetime import UTC, datetime, time
from pathlib import Path

from botocore.exceptions import ClientError
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.core.storage import _client, ensure_bucket
from app.models import (
    KitchenStation,
    Media,
    Membership,
    MenuCategory,
    OpeningHours,
    Option,
    OptionGroup,
    Product,
    Restaurant,
    User,
)
from app.models.enums import MediaKind, MemberRole
from app.modules.media import put_variants, store_image
from app.modules.restaurants import RestaurantCreate, create_restaurant

DEMO_PASSWORD = "Demo!2026pass"
DEMO_SLUG = "le-baobab-demo"

# Photos de démonstration (voir app/demo_assets/CREDITS.md).
ASSETS = Path(__file__).parent / "demo_assets"
PRODUCT_IMAGES = {
    "Yassa poulet": "yassa-poulet.jpg",
    "Thiéboudienne": "thieboudienne.jpg",
    "Mafé bœuf": "mafe-boeuf.jpg",
    "Dibi agneau": "dibi-agneau.jpg",
    "Bissap": "bissap.jpg",
    "Bouye": "bouye.jpg",
    "Gingembre": "gingembre.jpg",
    "Eau minérale": "eau-minerale.jpg",
    "Thiakry": "thiakry.jpg",
    "Beignets": "beignets.jpg",
}
GALLERY = [
    ("gallery-1.jpg", "Ambiance du restaurant"),
    ("gallery-2.jpg", "Nos plats"),
    ("gallery-3.jpg", "La terrasse"),
]


async def bootstrap() -> None:
    s = get_settings()
    if not s.superadmin_email or not s.superadmin_password:
        print("SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD non définis : rien à faire.")
        return
    async with SessionLocal() as session:
        email = s.superadmin_email.lower()
        user = await session.scalar(select(User).where(User.email == email))
        if user:
            if not user.is_superadmin:
                user.is_superadmin = True
                await session.commit()
            print(f"Super admin présent : {email}")
            return
        session.add(
            User(
                email=email,
                full_name="Super Admin",
                is_superadmin=True,
                password_hash=hash_password(s.superadmin_password),
                activated_at=datetime.now(UTC),
            )
        )
        await session.commit()
        print(f"Super admin créé : {email}")


async def _user(session, email: str, name: str) -> User:
    u = await session.scalar(select(User).where(User.email == email))
    if not u:
        u = User(
            email=email, full_name=name, password_hash=hash_password(DEMO_PASSWORD), activated_at=datetime.now(UTC)
        )
        session.add(u)
        await session.flush()
    return u


async def seed_demo() -> None:
    async with SessionLocal() as session:
        owner = await _user(session, "owner@demo.example.com", "Awa Diop")
        if await session.scalar(select(Membership.id).where(Membership.user_id == owner.id)):
            print("Démo déjà présente.")
            await sync_demo_media()
            return
        r = await create_restaurant(
            session,
            RestaurantCreate(
                name="Le Baobab Démo",
                currency="XOF",
                city="Dakar",
                cuisine="Sénégalaise",
                address_line="12 avenue Cheikh Anta Diop",
                phone="+221 33 000 00 00",
                description="Cuisine sénégalaise maison, sur place ou à emporter.",
            ),
            owner,
        )
        for email, name, role in (
            ("manager@demo.example.com", "Moussa Ndiaye", MemberRole.MANAGER),
            ("caisse@demo.example.com", "Fatou Sow", MemberRole.CASHIER),
            ("cuisine@demo.example.com", "Ibrahima Fall", MemberRole.KITCHEN),
        ):
            session.add(Membership(user_id=(await _user(session, email, name)).id, restaurant_id=r.id, role=role))
        for d in range(7):
            session.add(OpeningHours(restaurant_id=r.id, day_of_week=d, opens_at=time(0, 0), closes_at=time(23, 59)))
        grill = KitchenStation(restaurant_id=r.id, name="Grill")
        bar = KitchenStation(restaurant_id=r.id, name="Bar")
        session.add_all([grill, bar])
        await session.flush()

        def cat(name: str, order: int) -> MenuCategory:
            c = MenuCategory(restaurant_id=r.id, name=name, sort_order=order)
            session.add(c)
            return c

        plats, boissons, desserts = cat("Plats", 1), cat("Boissons", 2), cat("Desserts", 3)
        await session.flush()

        def product(c, name, price, desc=None, station=None, groups=(), **kw):
            p = Product(
                restaurant_id=r.id,
                category_id=c.id,
                name=name,
                price=price,
                description=desc,
                station_id=station.id if station else None,
                **kw,
            )
            p.option_groups = [
                OptionGroup(
                    restaurant_id=r.id,
                    name=g,
                    min_choices=mn,
                    max_choices=mx,
                    sort_order=i,
                    options=[Option(name=n, price_delta=d, sort_order=j) for j, (n, d) in enumerate(opts)],
                )
                for i, (g, mn, mx, opts) in enumerate(groups)
            ]
            session.add(p)

        accomp = ("Accompagnement", 1, 1, [("Riz blanc", 0), ("Frites", 500), ("Attiéké", 300)])
        extras = ("Suppléments", 0, 3, [("Oignons confits", 200), ("Piment", 0), ("Œuf", 300)])
        product(
            plats,
            "Yassa poulet",
            3500,
            "Poulet mariné au citron et oignons",
            grill,
            [accomp, extras],
            is_featured=True,
            preparation_minutes=15,
        )
        product(plats, "Thiéboudienne", 4000, "Riz au poisson, légumes", grill, [extras], preparation_minutes=20)
        product(plats, "Mafé bœuf", 3800, "Ragoût à la pâte d'arachide", grill, [accomp], allergens=["arachide"])
        product(plats, "Dibi agneau", 5000, "Agneau grillé, moutarde et oignons", grill, [accomp, extras])
        product(
            boissons, "Bissap", 1000, "Jus d'hibiscus maison", bar, [("Taille", 1, 1, [("33 cl", 0), ("50 cl", 500)])]
        )
        product(boissons, "Bouye", 1200, "Jus de pain de singe", bar)
        product(boissons, "Gingembre", 1000, "Jus de gingembre frais", bar)
        product(boissons, "Eau minérale", 500, None, bar)
        product(desserts, "Thiakry", 1500, "Couscous de mil au lait caillé", allergens=["lait"])
        product(desserts, "Beignets", 1000, "Beignets maison au sucre")
        await session.commit()
    await sync_demo_media()
    print(f"Démo créée : /r/{r.slug} — comptes *@demo.example.com, mot de passe {DEMO_PASSWORD}")


async def _object_exists(key: str) -> bool:
    try:
        await run_in_threadpool(_client().head_object, Bucket=get_settings().s3_bucket, Key=key)
        return True
    except ClientError:
        return False


async def _demo_image(session, restaurant_id, kind: MediaKind, current: Media | None, filename: str, alt=None):
    """Garantit qu'une image de démo existe en base ET sur le stockage.

    Le S3 de développement (moto) est en mémoire : après un redémarrage, les fichiers ont disparu alors
    que les lignes Media existent encore. On les redépose alors sous les mêmes clés.
    """
    path = ASSETS / filename
    if not path.is_file():
        return current
    if current is not None:
        if not await _object_exists(current.variants["original"]):
            await put_variants(current.storage_key.rsplit("/", 1)[0], path.read_bytes())
        return current
    media, _ = await store_image(session, restaurant_id, kind, path.read_bytes(), alt=alt)
    return media


async def sync_demo_media() -> None:
    """Ajoute (ou restaure) logo, couverture, galerie et photos produits du restaurant de démo."""
    await run_in_threadpool(ensure_bucket)
    async with SessionLocal() as session:
        r = await session.scalar(
            select(Restaurant)
            .where(Restaurant.slug == DEMO_SLUG)
            .options(selectinload(Restaurant.logo), selectinload(Restaurant.cover))
        )
        if r is None:
            return
        logo = await _demo_image(session, r.id, MediaKind.LOGO, r.logo, "logo.png", f"Logo {r.name}")
        cover = await _demo_image(session, r.id, MediaKind.COVER, r.cover, "cover.jpg")
        r.logo_media_id = logo.id if logo else None
        r.cover_media_id = cover.id if cover else None

        gallery = list(
            await session.scalars(
                select(Media)
                .where(Media.restaurant_id == r.id, Media.kind == MediaKind.GALLERY)
                .order_by(Media.sort_order, Media.created_at)
            )
        )
        for i, (filename, alt) in enumerate(GALLERY):
            m = await _demo_image(
                session, r.id, MediaKind.GALLERY, gallery[i] if i < len(gallery) else None, filename, alt
            )
            if m is not None:
                m.sort_order = i

        products = await session.scalars(
            select(Product).where(Product.restaurant_id == r.id).options(selectinload(Product.image))
        )
        for p in products:
            filename = PRODUCT_IMAGES.get(p.name)
            if filename:
                m = await _demo_image(session, r.id, MediaKind.PRODUCT, p.image, filename, p.name)
                p.image_media_id = m.id if m else None
        await session.commit()


E2E_EMAILS = "e2e-%@example.com"


async def purge_e2e(since: str | None = None, emails: str = E2E_EMAILS) -> None:
    """Supprime les données laissées par les tests de bout en bout (jamais en production).

    - restaurants, demandes et comptes créés avec une adresse correspondant à `emails` (motif SQL LIKE) ;
    - commandes du restaurant de démo créées depuis `since` (date ISO du début de la série de tests).
    """
    from datetime import datetime

    from sqlalchemy import delete

    from app.models import Notification, Order, Payment, Reservation, RestaurantRequest

    if get_settings().is_production:
        raise SystemExit("purge-e2e est interdit en production")
    async with SessionLocal() as session:
        user_ids = list(await session.scalars(select(User.id).where(User.email.like(emails))))
        restaurant_ids = set(
            await session.scalars(
                select(RestaurantRequest.restaurant_id).where(
                    RestaurantRequest.email.like(emails), RestaurantRequest.restaurant_id.is_not(None)
                )
            )
        )
        if user_ids:
            restaurant_ids |= set(
                await session.scalars(
                    select(Membership.restaurant_id).where(
                        Membership.user_id.in_(user_ids), Membership.role == MemberRole.OWNER
                    )
                )
            )
        demo_id = await session.scalar(select(Restaurant.id).where(Restaurant.slug == DEMO_SLUG))
        restaurant_ids.discard(demo_id)  # le restaurant de démo n'est jamais supprimé

        order_filter = [Order.restaurant_id.in_(restaurant_ids)] if restaurant_ids else []
        if since and demo_id:
            order_filter.append((Order.restaurant_id == demo_id) & (Order.created_at >= datetime.fromisoformat(since)))
        n_orders = 0
        for cond in order_filter:
            order_ids = list(await session.scalars(select(Order.id).where(cond)))
            if order_ids:
                await session.execute(delete(Payment).where(Payment.order_id.in_(order_ids)))
                await session.execute(delete(Order).where(Order.id.in_(order_ids)))
                n_orders += len(order_ids)
        n_res = 0
        if since and demo_id:
            res = await session.execute(
                delete(Reservation).where(
                    Reservation.restaurant_id == demo_id, Reservation.created_at >= datetime.fromisoformat(since)
                )
            )
            n_res = res.rowcount or 0
        if since:
            # Notifications produites par l'activité de test (commandes, demandes, réservations…).
            await session.execute(delete(Notification).where(Notification.created_at >= datetime.fromisoformat(since)))
        await session.execute(delete(RestaurantRequest).where(RestaurantRequest.email.like(emails)))
        if restaurant_ids:
            await session.execute(delete(Restaurant).where(Restaurant.id.in_(restaurant_ids)))
        if user_ids:
            await session.execute(delete(User).where(User.id.in_(user_ids)))
        await session.commit()
    print(
        f"purge-e2e : {len(restaurant_ids)} restaurant(s), {len(user_ids)} compte(s), "
        f"{n_orders} commande(s), {n_res} réservation(s)"
    )


def backup_media(target: str) -> None:
    """Copie incrémentale du bucket (fichiers nouveaux ou modifiés uniquement)."""
    from pathlib import Path

    from app.core.storage import _client

    s = get_settings()
    client = _client()
    root = Path(target).resolve()
    copied = skipped = 0
    for page in client.get_paginator("list_objects_v2").paginate(Bucket=s.s3_bucket):
        for obj in page.get("Contents", []):
            dest = (root / obj["Key"]).resolve()
            if root not in dest.parents:  # protection contre les clés malveillantes (../)
                continue
            if dest.exists() and dest.stat().st_size == obj["Size"]:
                skipped += 1
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            client.download_file(s.s3_bucket, obj["Key"], str(dest))
            copied += 1
    print(f"backup-media : {copied} copiés, {skipped} inchangés → {root}")


COMMANDS = {"bootstrap": bootstrap, "seed-demo": seed_demo}

if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "backup-media":
        backup_media(sys.argv[2])
    elif len(sys.argv) >= 2 and sys.argv[1] == "purge-e2e":
        # python -m app.cli purge-e2e [--since ISO] [--emails MOTIF_LIKE]
        opts = dict(zip(sys.argv[2::2], sys.argv[3::2], strict=False))
        asyncio.run(purge_e2e(opts.get("--since"), opts.get("--emails", E2E_EMAILS)))
    elif len(sys.argv) == 2 and sys.argv[1] in COMMANDS:
        asyncio.run(COMMANDS[sys.argv[1]]())
    else:
        print(__doc__)
        sys.exit(1)
