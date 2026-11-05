"""Commandes d'administration.

python -m app.cli bootstrap   # crée le super admin défini par SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD
python -m app.cli seed-demo   # restaurant de démonstration + menu + comptes employés
"""

import asyncio
import sys
from datetime import time

from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import KitchenStation, Membership, MenuCategory, OpeningHours, Option, OptionGroup, Product, User
from app.models.enums import MemberRole
from app.modules.restaurants import RestaurantCreate, create_restaurant

DEMO_PASSWORD = "Demo!2026pass"


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
            )
        )
        await session.commit()
        print(f"Super admin créé : {email}")


async def _user(session, email: str, name: str) -> User:
    u = await session.scalar(select(User).where(User.email == email))
    if not u:
        u = User(email=email, full_name=name, password_hash=hash_password(DEMO_PASSWORD))
        session.add(u)
        await session.flush()
    return u


async def seed_demo() -> None:
    async with SessionLocal() as session:
        owner = await _user(session, "owner@demo.example.com", "Awa Diop")
        if await session.scalar(select(Membership.id).where(Membership.user_id == owner.id)):
            print("Démo déjà présente.")
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
        print(f"Démo créée : /r/{r.slug} — comptes *@demo.example.com, mot de passe {DEMO_PASSWORD}")


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
    elif len(sys.argv) == 2 and sys.argv[1] in COMMANDS:
        asyncio.run(COMMANDS[sys.argv[1]]())
    else:
        print(__doc__)
        sys.exit(1)
