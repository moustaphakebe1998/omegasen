"""Environnement de test complet « Restaurant Baobab » (voir docs/BAOBAB_TEST_ENVIRONMENT.md).

    python -m app.cli seed-baobab [--no-images]   # crée ou complète (idempotent)
    python -m app.cli reset-baobab [--no-images]  # supprime UNIQUEMENT Baobab puis le recrée
    python -m app.cli delete-baobab               # supprime UNIQUEMENT Baobab
    python -m app.cli baobab-accounts             # comptes, rôles, liens utiles

Principes :
- un seul restaurant (`slug = baobab`, `is_demo = true`), tous les comptes en `@baobab.test` ;
- identifiants stables (UUID v5) pour le restaurant, les comptes, le menu et les options ; QR Code fixe ;
- commandes créées par le VRAI moteur (`place_order`, `change_status`, `record_payment`) : prix, TVA,
  numéros, historique des statuts, notifications et journal d'activité sont donc cohérents ;
- mots de passe hachés par `hash_password` (Argon2id), jamais stockés en clair ;
- refus en production, et refus de toucher un restaurant `baobab` qui ne serait pas marqué `is_demo`.
"""

import random
import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.audit import audit
from app.core.config import get_settings
from app.core.deps import RestaurantContext
from app.core.permissions import Perm, effective_permissions, normalize_overrides
from app.core.security import hash_password, new_refresh_token
from app.models import (
    AuditLog,
    KitchenStation,
    Media,
    Membership,
    MenuCategory,
    Notification,
    OpeningHours,
    Option,
    OptionGroup,
    Order,
    OrderCounter,
    OrderStatusEvent,
    Payment,
    Product,
    QrCode,
    Reservation,
    Restaurant,
    User,
)
from app.models.enums import (
    AccountType,
    MemberRole,
    OrderChannel,
    OrderStatus,
    PaymentMethod,
    PaymentPreference,
    ReservationStatus,
    RestaurantStatus,
    ServiceMode,
    TransactionStatus,
)
from app.modules.notifications import PENDING_KEY
from app.modules.orders import ItemIn, PlaceOrderIn, StatusIn, change_status, notify_new_order, place_order

# ── Identité de l'environnement ─────────────────────────

SLUG = "baobab"
NAME = "Restaurant Baobab"
DESCRIPTION = "Restaurant de démonstration OmegaSen"
PASSWORD = "BaobabTest2026!"
DOMAIN = "baobab.test"
QR_CODE = "baobab26"  # code permanent fixe : les QR imprimés restent valables après un reset
TABLES = [f"T{i}" for i in range(1, 11)]

_NS = uuid.UUID("6f1c2b8e-4a5d-4c3e-9b7a-0d2e5f6a7b8c")


def sid(*parts: str) -> uuid.UUID:
    """Identifiant stable (UUID v5) : le même à chaque initialisation."""
    return uuid.uuid5(_NS, ":".join(parts))


RESTAURANT_ID = sid("restaurant", SLUG)


class DemoEnvironmentError(RuntimeError):
    """Opération refusée pour protéger des données réelles."""


# ── Comptes ─────────────────────────────────────────────


@dataclass(frozen=True)
class StaffProfile:
    key: str
    email: str
    full_name: str
    profile: str  # profil demandé (OWNER, ADMIN, MANAGER, CASHIER, WAITER, KITCHEN, STAFF)
    role: MemberRole  # rôle réellement pris en charge par OmegaSen
    # Permissions voulues ; None = préréglage du rôle. Converties en ajustements (`permission_overrides`).
    permissions: frozenset[Perm] | None = None
    station: str | None = None
    phone: str | None = None
    summary: str = ""


# Un compte par rôle de restaurant (préréglages de app/core/permissions.py, sans ajustement).
STAFF: list[StaffProfile] = [
    StaffProfile(
        "owner",
        f"owner@{DOMAIN}",
        "Awa Diallo",
        "OWNER",
        MemberRole.OWNER,
        phone="+221 77 100 00 01",
        summary="Accès complet à son restaurant, seul à nommer un propriétaire",
    ),
    StaffProfile(
        "admin",
        f"admin@{DOMAIN}",
        "Cheikh Ba",
        "ADMIN",
        MemberRole.ADMIN,
        phone="+221 77 100 00 02",
        summary="Administrateur : toutes les permissions, gère l'équipe sous son rang",
    ),
    StaffProfile(
        "manager",
        f"manager@{DOMAIN}",
        "Mariama Sarr",
        "MANAGER",
        MemberRole.MANAGER,
        phone="+221 77 100 00 03",
        summary="Gestion quotidienne : sans paramètres, prix, suppressions, images, QR ni remboursements",
    ),
    StaffProfile(
        "cashier",
        f"cashier@{DOMAIN}",
        "Fatou Ndiaye",
        "CASHIER",
        MemberRole.CASHIER,
        phone="+221 77 100 00 04",
        summary="Caisse : commandes au guichet, encaissement, annulation, réservations",
    ),
    StaffProfile(
        "waiter",
        f"waiter@{DOMAIN}",
        "Ousmane Faye",
        "WAITER",
        MemberRole.WAITER,
        phone="+221 77 100 00 05",
        summary="Service en salle : prise de commande par table, suivi, service ; ni encaissement ni annulation",
    ),
    StaffProfile(
        "kitchen",
        f"kitchen@{DOMAIN}",
        "Ibrahima Gueye",
        "KITCHEN",
        MemberRole.KITCHEN,
        station="Grill",
        phone="+221 77 100 00 06",
        summary="Écran cuisine (poste Grill) et ruptures de stock",
    ),
    StaffProfile(
        "user",
        f"user@{DOMAIN}",
        "Seynabou Kane",
        "STAFF",
        MemberRole.STAFF,
        phone="+221 77 100 00 07",
        summary="Personnel : consultation du restaurant et du menu (droits à accorder individuellement)",
    ),
]

# Invitation en attente (compte non activé : ne peut pas se connecter, visible dans « Équipe »).
INVITED = StaffProfile(
    "invited", f"invite@{DOMAIN}", "Lamine Diouf", "CASHIER (invitation)", MemberRole.CASHIER, summary=""
)


@dataclass(frozen=True)
class Customer:
    key: str
    email: str
    full_name: str
    phone: str


CUSTOMERS: list[Customer] = [
    Customer("aminata", f"client.aminata@{DOMAIN}", "Aminata Touré", "+221 76 200 00 01"),
    Customer("moussa", f"client.moussa@{DOMAIN}", "Moussa Camara", "+221 76 200 00 02"),
    Customer("khadija", f"client.khadija@{DOMAIN}", "Khadija Mbaye", "+221 76 200 00 03"),
    Customer("pierre", f"client.pierre@{DOMAIN}", "Pierre Martin", "+33 6 00 00 00 04"),
]

# ── Menu ────────────────────────────────────────────────

ACCOMP = ("Accompagnement", 1, 1, [("Riz blanc", 0, True), ("Frites", 500, True), ("Attiéké", 300, False)])
EXTRAS = ("Suppléments", 0, 3, [("Oignons confits", 200, True), ("Piment", 0, True), ("Œuf", 300, True)])
CUISSON = ("Cuisson", 1, 1, [("À point", 0, True), ("Bien cuit", 0, True)])
TAILLE = ("Taille", 1, 1, [("33 cl", 0, True), ("50 cl", 500, True)])
SUCRE = ("Sucre", 0, 1, [("Sans sucre", 0, True), ("Peu sucré", 0, True)])


@dataclass(frozen=True)
class Dish:
    key: str
    name: str
    price: int
    description: str
    station: str | None = None
    groups: tuple = ()
    available: bool = True
    visible: bool = True
    featured: bool = False
    allergens: tuple[str, ...] = ()
    tags: tuple[str, ...] = ()
    preparation_minutes: int | None = None
    promo: tuple[int, int, int] | None = None  # (prix promo, début J+x, fin J+y) relatifs à aujourd'hui
    image: str | None = None


MENU: list[tuple[str, str, list[Dish]]] = [
    (
        "Entrées",
        "Pour commencer",
        [
            Dish("pastels", "Pastels au thon", 1500, "Chaussons frits farcis au thon, sauce tomate pimentée", "Froid"),
            Dish(
                "accras",
                "Accras de niébé",
                1200,
                "Beignets de haricots niébé, sauce oignon",
                "Froid",
                tags=("végétarien",),
            ),
            Dish("fataya", "Fataya à la viande", 1500, "Chaussons à la viande hachée épicée", "Froid"),
            Dish(
                "salade",
                "Salade Baobab",
                2000,
                "Crudités, avocat, mangue et vinaigrette au bissap",
                "Froid",
                tags=("végétarien",),
                promo=(1500, -1, 30),
            ),
            Dish(
                "soupe",
                "Soupe kandja",
                2500,
                "Soupe de gombo et poisson fumé",
                "Grill",
                available=False,
                allergens=("poisson",),
            ),
        ],
    ),
    (
        "Plats",
        "Cuisine sénégalaise maison",
        [
            Dish(
                "yassa",
                "Yassa poulet",
                3500,
                "Poulet mariné au citron et oignons",
                "Grill",
                (ACCOMP, EXTRAS),
                featured=True,
                preparation_minutes=15,
                image="yassa-poulet.jpg",
            ),
            Dish(
                "thieb",
                "Thiéboudienne",
                4000,
                "Riz au poisson et légumes, le plat national",
                "Grill",
                (EXTRAS,),
                featured=True,
                allergens=("poisson",),
                preparation_minutes=20,
                image="thieboudienne.jpg",
            ),
            Dish(
                "mafe",
                "Mafé bœuf",
                3800,
                "Ragoût de bœuf à la pâte d'arachide",
                "Grill",
                (ACCOMP,),
                allergens=("arachide",),
                image="mafe-boeuf.jpg",
            ),
            Dish(
                "dibi",
                "Dibi agneau",
                5000,
                "Agneau grillé, moutarde et oignons",
                "Grill",
                (CUISSON, ACCOMP, EXTRAS),
                image="dibi-agneau.jpg",
            ),
            Dish("thiou", "Thiou poisson", 4500, "Poisson mijoté en sauce tomate", "Grill", available=False),
            Dish(
                "special",
                "Plat du chef (bientôt)",
                6000,
                "Nouveauté en préparation, masquée aux clients",
                "Grill",
                visible=False,
            ),
        ],
    ),
    (
        "Desserts",
        "Douceurs",
        [
            Dish(
                "thiakry", "Thiakry", 1500, "Couscous de mil au lait caillé", allergens=("lait",), image="thiakry.jpg"
            ),
            Dish("beignets", "Beignets", 1000, "Beignets maison au sucre", image="beignets.jpg"),
            Dish(
                "ngalakh", "Ngalakh", 1800, "Bouillie de mil, pâte d'arachide et pain de singe", allergens=("arachide",)
            ),
            Dish("fruits", "Salade de fruits", 1500, "Mangue, papaye, ananas de saison", tags=("végétarien",)),
            Dish("glace", "Glace au bissap", 1200, "Sorbet maison à l'hibiscus", available=False),
        ],
    ),
    (
        "Boissons",
        "Jus maison et boissons fraîches",
        [
            Dish(
                "bissap",
                "Bissap",
                1000,
                "Jus d'hibiscus maison",
                "Bar",
                (TAILLE, SUCRE),
                image="bissap.jpg",
                promo=(800, 0, 7),
            ),
            Dish(
                "bouye", "Bouye", 1200, "Jus de pain de singe", "Bar", (TAILLE,), allergens=("lait",), image="bouye.jpg"
            ),
            Dish("gingembre", "Gingembre", 1000, "Jus de gingembre frais", "Bar", (TAILLE,), image="gingembre.jpg"),
            Dish("eau", "Eau minérale", 500, "50 cl", "Bar", image="eau-minerale.jpg"),
            Dish("touba", "Café Touba", 700, "Café épicé au poivre de Guinée", "Bar"),
            Dish("soda", "Soda", 800, "Canette 33 cl", "Bar", promo=(600, 10, 20)),
        ],
    ),
]

STATIONS = ["Grill", "Froid", "Bar"]

# ── Commandes ───────────────────────────────────────────

Line = tuple[str, int, tuple[tuple[str, str], ...]]  # (plat, quantité, ((groupe, option), …))


@dataclass
class OrderSpec:
    key: str
    channel: OrderChannel
    mode: ServiceMode
    lines: list[Line]
    status: OrderStatus
    name: str | None = None
    customer: str | None = None  # clé d'un client (compte) : historique « Mes commandes »
    table: str | None = None
    by: str | None = None  # employé qui saisit (canal POS)
    payments: list[tuple[PaymentMethod, int | None]] = field(default_factory=list)  # None = reste à payer
    refund: bool = False
    cancel_from: OrderStatus = OrderStatus.NEW
    cancel_reason: str = "Client parti avant la préparation"
    preference: PaymentPreference | None = PaymentPreference.AT_COUNTER
    note: str | None = None
    at: datetime | None = None  # None = maintenant (commandes du jour, visibles en cuisine)


S = OrderStatus
M = PaymentMethod
Q, POS, ONLINE, KIOSK = OrderChannel.QR, OrderChannel.POS, OrderChannel.ONLINE, OrderChannel.KIOSK
DINE, TAKE = ServiceMode.DINE_IN, ServiceMode.TAKEAWAY


def todays_orders() -> list[OrderSpec]:
    """Commandes du jour dans tous les états, sur tous les canaux (écran cuisine, caisse, suivi)."""
    frites = (("Accompagnement", "Frites"), ("Suppléments", "Oignons confits"))
    return [
        OrderSpec(
            "live-01",
            Q,
            DINE,
            [("yassa", 2, frites), ("bissap", 2, (("Taille", "50 cl"),))],
            S.NEW,
            customer="aminata",
            table="T3",
            note="Sans piment pour un des plats",
        ),
        OrderSpec(
            "live-02", KIOSK, TAKE, [("thieb", 1, ()), ("bouye", 1, (("Taille", "33 cl"),))], S.NEW, name="Moussa"
        ),
        OrderSpec(
            "live-03",
            POS,
            DINE,
            [("mafe", 2, (("Accompagnement", "Riz blanc"),)), ("eau", 2, ())],
            S.NEW,
            name="Table 7",
            table="T7",
            by="waiter",
        ),
        OrderSpec(
            "live-04",
            Q,
            DINE,
            [("dibi", 1, (("Cuisson", "Bien cuit"), ("Accompagnement", "Frites"))), ("thiakry", 1, ())],
            S.PREPARING,
            name="Bineta",
            table="T5",
        ),
        OrderSpec(
            "live-05",
            POS,
            TAKE,
            [("pastels", 3, ()), ("gingembre", 1, (("Taille", "50 cl"),))],
            S.PREPARING,
            name="Comptoir",
            by="cashier",
            payments=[(M.CASH, None)],
        ),
        OrderSpec(
            "live-06",
            ONLINE,
            TAKE,
            [("thieb", 2, ()), ("beignets", 2, ())],
            S.READY,
            customer="khadija",
            preference=PaymentPreference.AT_COUNTER,
        ),
        OrderSpec(
            "live-07",
            Q,
            DINE,
            [("yassa", 1, (("Accompagnement", "Riz blanc"),)), ("salade", 1, ())],
            S.READY,
            name="Jean",
            table="T1",
            payments=[(M.CARD, None)],
        ),
        OrderSpec(
            "live-08",
            POS,
            DINE,
            [("dibi", 2, (("Cuisson", "À point"), ("Accompagnement", "Riz blanc"))), ("touba", 2, ())],
            S.READY,
            name="Table 4",
            table="T4",
            by="cashier",
            payments=[(M.CASH, 5000)],
        ),  # partiellement payée
        OrderSpec(
            "live-09",
            Q,
            DINE,
            [("accras", 2, ()), ("bissap", 2, (("Taille", "33 cl"),))],
            S.COMPLETED,
            name="Awa",
            table="T2",
            payments=[(M.MOBILE_MONEY, None)],
        ),
        OrderSpec(
            "live-10",
            ONLINE,
            TAKE,
            [("mafe", 1, (("Accompagnement", "Frites"),))],
            S.CANCELLED,
            customer="moussa",
            cancel_reason="Client injoignable",
        ),
        OrderSpec(
            "live-11",
            POS,
            TAKE,
            [("fataya", 2, ()), ("soda", 2, ())],
            S.COMPLETED,
            name="Comptoir",
            by="cashier",
            payments=[(M.CARD, None)],
            refund=True,
        ),
        OrderSpec(
            "live-12",
            KIOSK,
            DINE,
            [("thieb", 1, ()), ("fruits", 1, ())],
            S.CANCELLED,
            name="Paul",
            cancel_from=S.PREPARING,
            cancel_reason="Erreur de saisie à la borne",
        ),
    ]


def history_orders(today: date, tz: ZoneInfo, days: int = 14) -> list[OrderSpec]:
    """Historique déterministe des 14 derniers jours (statistiques, « Mes commandes » des clients)."""
    rng = random.Random(2026)
    orderable = [
        ("yassa", (("Accompagnement", "Riz blanc"),)),
        ("yassa", (("Accompagnement", "Frites"), ("Suppléments", "Œuf"))),
        ("thieb", ()),
        ("mafe", (("Accompagnement", "Riz blanc"),)),
        ("dibi", (("Cuisson", "À point"), ("Accompagnement", "Frites"))),
        ("pastels", ()),
        ("accras", ()),
        ("fataya", ()),
        ("thiakry", ()),
        ("beignets", ()),
        ("ngalakh", ()),
        ("bissap", (("Taille", "33 cl"),)),
        ("bouye", (("Taille", "50 cl"),)),
        ("gingembre", (("Taille", "33 cl"),)),
        ("eau", ()),
        ("touba", ()),
    ]
    specs: list[OrderSpec] = []
    for d in range(days, 0, -1):
        day = today - timedelta(days=d)
        for n in range(rng.randint(3, 6)):
            channel = rng.choice([Q, Q, POS, POS, ONLINE, KIOSK])
            mode = DINE if channel in (Q, KIOSK) or rng.random() < 0.5 else TAKE
            lines = [(k, rng.randint(1, 3), opts) for k, opts in rng.sample(orderable, rng.randint(1, 3))]
            customer = rng.choice([c.key for c in CUSTOMERS]) if channel in (Q, ONLINE) and rng.random() < 0.5 else None
            cancelled = rng.random() < 0.1
            local = datetime.combine(day, time(rng.choice([12, 13, 13, 14, 19, 20, 20, 21]), rng.randint(0, 59)), tz)
            specs.append(
                OrderSpec(
                    f"hist-{day:%Y%m%d}-{n}",
                    channel,
                    mode,
                    lines,
                    S.CANCELLED if cancelled else S.COMPLETED,
                    name=None if customer else rng.choice(["Ndeye", "Modou", "Aïssatou", "Babacar", "Sophie", "Omar"]),
                    customer=customer,
                    table=rng.choice(TABLES) if mode == DINE and channel != KIOSK else None,
                    by="cashier" if channel == POS else None,
                    payments=[] if cancelled else [(rng.choice([M.CASH, M.CASH, M.CARD, M.MOBILE_MONEY]), None)],
                    at=local.astimezone(UTC),
                )
            )
    return specs


# ── Garde-fous ──────────────────────────────────────────


def _ensure_not_production() -> None:
    if get_settings().is_production:
        raise DemoEnvironmentError("Les données de démonstration Baobab sont interdites en production.")


async def _demo_restaurant(session: AsyncSession) -> Restaurant | None:
    """Le restaurant Baobab de démo, ou None. Refuse un restaurant réel qui utiliserait le même slug / id."""
    r = await session.scalar(
        select(Restaurant)
        .where((Restaurant.slug == SLUG) | (Restaurant.id == RESTAURANT_ID))
        .options(selectinload(Restaurant.logo), selectinload(Restaurant.cover))
    )
    if r is not None and not r.is_demo:
        raise DemoEnvironmentError(
            f"Un restaurant réel utilise déjà l'adresse « {SLUG} » : il n'est pas marqué comme démo, "
            "rien n'est modifié."
        )
    return r


# ── Création ────────────────────────────────────────────


async def _upsert_user(
    session: AsyncSession, email: str, full_name: str, phone: str | None, account_type: AccountType
) -> User:
    """Crée le compte ou le remet en état de connexion (mot de passe de démo, déverrouillé, actif)."""
    user = await session.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(id=sid("user", email), email=email, full_name=full_name)
        session.add(user)
    if user.is_superadmin:
        raise DemoEnvironmentError(f"{email} est un super admin : compte non modifié.")
    user.full_name, user.phone, user.account_type = full_name, phone, account_type
    user.password_hash = hash_password(PASSWORD)
    user.is_active, user.failed_logins, user.locked_until = True, 0, None
    user.must_change_password = False
    user.activated_at = user.activated_at or datetime.now(UTC)
    return user


async def _clear_login_limits() -> None:
    """Efface les compteurs de connexion (limitation de débit) des seuls comptes @baobab.test."""
    from app.core.redis import get_redis

    try:
        r = get_redis()
        keys = [k async for k in r.scan_iter(match=f"rl:login:*@{DOMAIN}")]
        if keys:
            await r.delete(*keys)
    except Exception as e:  # Redis indisponible : sans conséquence pour les données
        print(f"Limites de connexion non réinitialisées ({type(e).__name__}).")


async def _ensure_restaurant(session: AsyncSession, owner: User) -> tuple[Restaurant, bool]:
    r = await _demo_restaurant(session)
    if r is not None:
        return r, False
    if await session.scalar(select(QrCode.id).where(QrCode.code == QR_CODE)):
        raise DemoEnvironmentError(f"Le code QR « {QR_CODE} » est déjà utilisé par un autre restaurant.")
    r = Restaurant(
        id=RESTAURANT_ID,
        slug=SLUG,
        name=NAME,
        description=DESCRIPTION,
        cuisine="Sénégalaise",
        phone="+221 33 800 00 00",
        email=f"contact@{DOMAIN}",
        address_line="25 rue Carnot, Plateau",
        city="Dakar",
        country="SN",
        currency="XOF",
        timezone="Africa/Dakar",
        vat_rate_bp=1800,
        status=RestaurantStatus.ACTIVE,
        is_demo=True,
    )
    session.add(r)
    await session.flush()
    session.add(QrCode(id=sid("qr"), restaurant_id=r.id, code=QR_CODE))
    # Ouvert en continu : les commandes publiques peuvent être testées à toute heure.
    for d in range(7):
        session.add(OpeningHours(restaurant_id=r.id, day_of_week=d, opens_at=time(0, 0), closes_at=time(23, 59)))
    audit(
        session,
        "restaurant.created",
        actor_id=owner.id,
        restaurant_id=r.id,
        entity="Restaurant",
        entity_id=r.id,
        data={"name": NAME, "demo": True},
    )
    return r, True


async def _ensure_stations(session: AsyncSession, r: Restaurant) -> dict[str, KitchenStation]:
    out = {}
    for i, name in enumerate(STATIONS):
        st = await session.get(KitchenStation, sid("station", name))
        if st is None:
            st = KitchenStation(id=sid("station", name), restaurant_id=r.id, name=name, sort_order=i)
            session.add(st)
        out[name] = st
    await session.flush()
    return out


async def _ensure_staff(session: AsyncSession, r: Restaurant, stations: dict[str, KitchenStation]) -> dict[str, User]:
    users: dict[str, User] = {}
    owner_id = None
    for p in STAFF:
        user = await _upsert_user(session, p.email, p.full_name, p.phone, AccountType.STAFF)
        await session.flush()
        users[p.key] = user
        m = await session.scalar(
            select(Membership).where(Membership.user_id == user.id, Membership.restaurant_id == r.id)
        )
        if m is None:
            m = Membership(id=sid("membership", p.key), user_id=user.id, restaurant_id=r.id)
            session.add(m)
        m.role, m.is_active = p.role, True
        m.permission_overrides = normalize_overrides(p.role, set(p.permissions)) if p.permissions is not None else {}
        m.station_id = stations[p.station].id if p.station else None
        m.invited_by_id = owner_id
        owner_id = owner_id or user.id
    # Invitation en attente : compte créé sans mot de passe utilisable, lien d'activation à renvoyer.
    inv = await session.scalar(select(User).where(User.email == INVITED.email))
    if inv is None:
        inv = User(
            id=sid("user", INVITED.email),
            email=INVITED.email,
            full_name=INVITED.full_name,
            password_hash=hash_password(new_refresh_token()),
        )
        session.add(inv)
        await session.flush()
    if not await session.scalar(
        select(Membership.id).where(Membership.user_id == inv.id, Membership.restaurant_id == r.id)
    ):
        session.add(
            Membership(
                id=sid("membership", INVITED.key),
                user_id=inv.id,
                restaurant_id=r.id,
                role=INVITED.role,
                invited_by_id=owner_id,
            )
        )
    return users


async def _ensure_customers(session: AsyncSession) -> dict[str, User]:
    out = {}
    for c in CUSTOMERS:
        out[c.key] = await _upsert_user(session, c.email, c.full_name, c.phone, AccountType.CUSTOMER)
    await session.flush()
    return out


async def _ensure_menu(session: AsyncSession, r: Restaurant, stations: dict[str, KitchenStation]) -> dict[str, Product]:
    today = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    products: dict[str, Product] = {}
    for ci, (cat_name, cat_desc, dishes) in enumerate(MENU):
        cat = await session.get(MenuCategory, sid("category", cat_name))
        if cat is None:
            cat = MenuCategory(
                id=sid("category", cat_name), restaurant_id=r.id, name=cat_name, description=cat_desc, sort_order=ci
            )
            session.add(cat)
            await session.flush()
        for pi, d in enumerate(dishes):
            p = await session.get(Product, sid("product", d.key))
            if p is None:
                p = Product(
                    id=sid("product", d.key),
                    restaurant_id=r.id,
                    category_id=cat.id,
                    name=d.name,
                    description=d.description,
                    price=d.price,
                    is_available=d.available,
                    is_visible=d.visible,
                    is_featured=d.featured,
                    allergens=list(d.allergens),
                    tags=list(d.tags),
                    preparation_minutes=d.preparation_minutes,
                    sort_order=pi,
                    station_id=stations[d.station].id if d.station else None,
                )
                if d.promo:
                    p.promo_price = d.promo[0]
                    p.promo_starts_at = today + timedelta(days=d.promo[1])
                    p.promo_ends_at = today + timedelta(days=d.promo[2])
                p.option_groups = [
                    OptionGroup(
                        id=sid("group", d.key, g),
                        restaurant_id=r.id,
                        name=g,
                        min_choices=mn,
                        max_choices=mx,
                        sort_order=gi,
                        options=[
                            Option(
                                id=sid("option", d.key, g, o), name=o, price_delta=delta, is_available=ok, sort_order=oi
                            )
                            for oi, (o, delta, ok) in enumerate(opts)
                        ],
                    )
                    for gi, (g, mn, mx, opts) in enumerate(d.groups)
                ]
                session.add(p)
            products[d.key] = p
    await session.flush()
    return products


async def _ctx(session: AsyncSession, r: Restaurant, user: User) -> RestaurantContext:
    m = await session.scalar(select(Membership).where(Membership.user_id == user.id, Membership.restaurant_id == r.id))
    return RestaurantContext(user, r, m.role, effective_permissions(m.role, m.permission_overrides), m)


async def _place(
    session: AsyncSession,
    r: Restaurant,
    spec: OrderSpec,
    staff: dict[str, User],
    customers: dict[str, User],
    ctxs: dict[str, RestaurantContext],
) -> Order | None:
    """Passe la commande par le moteur réel puis la fait avancer jusqu'à l'état voulu."""
    from app.modules.payments import record_payment  # import local (cycle orders ↔ payments)

    key = f"baobab-seed-{spec.key}"
    if await session.scalar(select(Order.id).where(Order.restaurant_id == r.id, Order.idempotency_key == key)):
        return None  # déjà présente : rien à refaire
    customer = customers.get(spec.customer) if spec.customer else None
    items = []
    for dish, qty, opts in spec.lines:
        option_ids = [sid("option", dish, g, o) for g, o in opts]
        items.append(ItemIn(product_id=sid("product", dish), quantity=qty, option_ids=option_ids))
    body = PlaceOrderIn(
        service_mode=spec.mode,
        items=items,
        customer_name=customer.full_name.split()[0] if customer else spec.name,
        customer_phone=customer.phone if customer else None,
        table_label=spec.table,
        note=spec.note,
        payment_preference=spec.preference if spec.channel != POS else None,
        idempotency_key=key,
    )
    actor = staff[spec.by] if spec.by else None
    order, _ = await place_order(session, r, body, channel=spec.channel, actor=actor)
    order.customer_user_id = customer.id if customer else None
    live = spec.at is None
    if live and spec.channel != POS:
        await notify_new_order(session, order, r)

    cashier, kitchen, owner = ctxs["cashier"], ctxs["kitchen"], ctxs["owner"]
    pos_ctx = ctxs.get(spec.by or "", cashier)

    async def move(ctx: RestaurantContext, to: OrderStatus, reason: str | None = None) -> None:
        await change_status(session, ctx, order, StatusIn(status=to, reason=reason))

    async def pay() -> None:
        for method, amount in spec.payments:
            await record_payment(
                session, cashier, order, method=method, amount=amount or order.total - order.amount_paid
            )

    if spec.channel == POS and spec.payments:  # encaissée au guichet dès la saisie
        await pay()
    path = {
        S.NEW: [],
        S.PREPARING: [S.PREPARING],
        S.READY: [S.PREPARING, S.READY],
        S.COMPLETED: [S.PREPARING, S.READY, S.COMPLETED],
        S.CANCELLED: [S.PREPARING] if spec.cancel_from == S.PREPARING else [],
    }[spec.status]
    for to in path:
        if to == S.COMPLETED:
            if spec.channel != POS:
                await pay()
            await move(pos_ctx if spec.by else cashier, S.COMPLETED)
        else:
            await move(kitchen, to)
    if spec.status == S.READY and spec.channel != POS:
        await pay()
    if spec.status == S.CANCELLED:
        await move(ctxs["manager"], S.CANCELLED, spec.cancel_reason)
    if spec.refund:
        await session.flush()
        payment = order.payments[0]
        from app.modules.payments import recompute_payment_status

        payment.status = TransactionStatus.REFUNDED
        payment.refunded_at = datetime.now(UTC)
        payment.meta = {"refund_reason": "Plat refusé par le client (démo)"}
        recompute_payment_status(order)
        audit(
            session,
            "payment.refunded",
            actor_id=owner.user.id,
            restaurant_id=r.id,
            entity="Payment",
            entity_id=payment.id,
            data={"amount": payment.amount, "reason": "Plat refusé par le client (démo)"},
        )
    await session.flush()
    if not live:
        await _backdate(session, r, order, spec.at)
    return order


async def _backdate(session: AsyncSession, r: Restaurant, order: Order, at: datetime) -> None:
    """Replace une commande d'historique à sa date (numéro du jour, horodatages, paiements)."""
    from app.modules.orders import _next_number, business_date

    day = business_date(r, at)
    order.business_date = day
    order.number = await _next_number(session, r.id, day)
    order.reference = f"{day:%y%m%d}-{order.number:03d}-{order.reference.rsplit('-', 1)[1]}"
    prep = timedelta(minutes=random.Random(order.reference).randint(8, 25))
    stamps = {S.NEW: at}
    order.created_at = order.updated_at = at
    order.sent_to_kitchen_at = at
    if order.preparing_at:
        order.preparing_at = stamps[S.PREPARING] = at + timedelta(minutes=2)
    if order.ready_at:
        order.ready_at = stamps[S.READY] = at + prep
    if order.completed_at:
        order.completed_at = stamps[S.COMPLETED] = at + prep + timedelta(minutes=10)
    if order.cancelled_at:
        order.cancelled_at = stamps[S.CANCELLED] = at + timedelta(minutes=4)
    for ev in await session.scalars(select(OrderStatusEvent).where(OrderStatusEvent.order_id == order.id)):
        ev.created_at = stamps.get(ev.to_status, at)
    for p in order.payments:
        p.paid_at = p.created_at = p.updated_at = order.completed_at or order.ready_at or at


async def _ensure_orders(
    session: AsyncSession, r: Restaurant, staff: dict[str, User], customers: dict[str, User]
) -> int:
    ctxs = {k: await _ctx(session, r, u) for k, u in staff.items()}
    tz = ZoneInfo(r.timezone)
    today = datetime.now(UTC).astimezone(tz).date()
    created = 0
    # 1) historique (sans notifications : elles concerneraient des commandes passées)
    started = datetime.now(UTC)
    for spec in history_orders(today, tz):
        if await _place(session, r, spec, staff, customers, ctxs):
            created += 1
    await session.flush()
    await session.execute(
        delete(Notification).where(Notification.restaurant_id == r.id, Notification.created_at >= started)
    )
    session.info.pop(PENDING_KEY, None)
    # Le moteur a consommé des numéros du jour pour l'historique : on recale le compteur du jour.
    last_today = await session.scalar(
        select(func.max(Order.number)).where(Order.restaurant_id == r.id, Order.business_date == today)
    )
    await session.execute(
        update(OrderCounter)
        .where(OrderCounter.restaurant_id == r.id, OrderCounter.business_date == today)
        .values(last_number=last_today or 0)
    )
    # 2) commandes du jour (notifications réelles : nouvelle commande, commande prête)
    for spec in todays_orders():
        if await _place(session, r, spec, staff, customers, ctxs):
            created += 1
    return created


async def _ensure_reservations(session: AsyncSession, r: Restaurant, customers: dict[str, User]) -> None:
    tz = ZoneInfo(r.timezone)
    today = datetime.now(UTC).astimezone(tz).date()

    def at(days: int, hour: int, minute: int = 0) -> datetime:
        return datetime.combine(today + timedelta(days=days), time(hour, minute), tz).astimezone(UTC)

    rows = [
        ("r1", at(0, 20), 4, "aminata", ReservationStatus.CONFIRMED, "Anniversaire, gâteau apporté", None),
        ("r2", at(1, 13), 2, "pierre", ReservationStatus.PENDING, "Table en terrasse si possible", None),
        ("r3", at(2, 20, 30), 6, None, ReservationStatus.PENDING, None, None),
        ("r4", at(0, 12, 30), 3, "moussa", ReservationStatus.SEATED, None, None),
        ("r5", at(-1, 21), 2, None, ReservationStatus.NO_SHOW, None, None),
        ("r6", at(3, 19), 10, "khadija", ReservationStatus.DECLINED, "Groupe", "Complet ce soir-là, désolé"),
        ("r7", at(5, 20), 2, None, ReservationStatus.CANCELLED, None, None),
    ]
    for key, starts, size, cust, status, note, staff_note in rows:
        if await session.get(Reservation, sid("reservation", key)):
            continue
        c = next((x for x in CUSTOMERS if x.key == cust), None)
        session.add(
            Reservation(
                id=sid("reservation", key),
                restaurant_id=r.id,
                customer_user_id=customers[cust].id if cust else None,
                starts_at=starts,
                party_size=size,
                customer_name=c.full_name if c else "Réservation téléphone",
                customer_phone=c.phone if c else "+221 70 000 00 99",
                customer_email=c.email if c else None,
                note=note,
                status=status,
                staff_note=staff_note,
                tracking_token=new_refresh_token(),
            )
        )


async def sync_images(session: AsyncSession, r: Restaurant) -> int:
    """Logo, couverture, galerie et photos des plats (photos de app/demo_assets, voir CREDITS.md)."""
    from starlette.concurrency import run_in_threadpool

    from app.cli import GALLERY, _demo_image
    from app.core.storage import ensure_bucket
    from app.models.enums import MediaKind

    await run_in_threadpool(ensure_bucket)
    await session.refresh(r, ["logo", "cover"])
    logo = await _demo_image(session, r.id, MediaKind.LOGO, r.logo, "logo.png", f"Logo {r.name}")
    cover = await _demo_image(session, r.id, MediaKind.COVER, r.cover, "cover.jpg")
    r.logo_media_id = logo.id if logo else None
    r.cover_media_id = cover.id if cover else None
    gallery = list(
        await session.scalars(
            select(Media).where(Media.restaurant_id == r.id, Media.kind == MediaKind.GALLERY).order_by(Media.sort_order)
        )
    )
    for i, (filename, alt) in enumerate(GALLERY):
        m = await _demo_image(session, r.id, MediaKind.GALLERY, gallery[i] if i < len(gallery) else None, filename, alt)
        if m is not None:
            m.sort_order = i
    n = 0
    for _, _, dishes in MENU:
        for d in dishes:
            if not d.image:
                continue
            p = await session.scalar(
                select(Product).where(Product.id == sid("product", d.key)).options(selectinload(Product.image))
            )
            if p is None:
                continue
            m = await _demo_image(session, r.id, MediaKind.PRODUCT, p.image, d.image, p.name)
            p.image_media_id = m.id if m else None
            n += 1
    return n


@dataclass
class SeedReport:
    restaurant_id: uuid.UUID
    created_restaurant: bool
    orders_created: int
    images: int | None
    image_error: str | None = None


async def seed(session: AsyncSession, *, images: bool = True) -> SeedReport:
    """Crée ou complète l'environnement Baobab (idempotent : aucun doublon)."""
    _ensure_not_production()
    owner_profile = STAFF[0]
    owner = await _upsert_user(
        session, owner_profile.email, owner_profile.full_name, owner_profile.phone, AccountType.STAFF
    )
    await session.flush()
    r, created = await _ensure_restaurant(session, owner)
    stations = await _ensure_stations(session, r)
    staff = await _ensure_staff(session, r, stations)
    customers = await _ensure_customers(session)
    await _ensure_menu(session, r, stations)
    await session.flush()
    n_orders = await _ensure_orders(session, r, staff, customers)
    await _ensure_reservations(session, r, customers)
    if created:
        audit(
            session,
            "demo.seeded",
            actor_id=owner.id,
            restaurant_id=r.id,
            entity="Restaurant",
            entity_id=r.id,
            data={"orders": n_orders},
        )
    await session.commit()
    await _clear_login_limits()

    n_images, error = None, None
    if images:
        try:
            n_images = await sync_images(session, r)
            await session.commit()
        except Exception as e:  # stockage indisponible : les données restent utilisables sans photos
            await session.rollback()
            error = f"{type(e).__name__}: {e}"
    return SeedReport(r.id, created, n_orders, n_images, error)


async def delete_demo(session: AsyncSession) -> dict[str, int]:
    """Supprime UNIQUEMENT le restaurant Baobab de démo et les comptes @baobab.test qui ne servent qu'à lui."""
    from app.core.storage import delete_objects

    _ensure_not_production()
    r = await _demo_restaurant(session)
    counts = {"restaurants": 0, "orders": 0, "users": 0, "media": 0}
    if r is not None:
        keys = [
            k
            for m in await session.scalars(select(Media).where(Media.restaurant_id == r.id))
            for k in (m.variants or {}).values()
        ]
        counts["media"] = len(keys)
        order_ids = select(Order.id).where(Order.restaurant_id == r.id)
        await session.execute(delete(Payment).where(Payment.order_id.in_(order_ids)))
        res = await session.execute(delete(Order).where(Order.restaurant_id == r.id))
        counts["orders"] = res.rowcount or 0
        await session.execute(delete(AuditLog).where(AuditLog.restaurant_id == r.id))
        r.logo_media_id = r.cover_media_id = None
        await session.flush()
        await session.execute(delete(Restaurant).where(Restaurant.id == r.id, Restaurant.is_demo.is_(True)))
        counts["restaurants"] = 1
    else:
        keys = []
    # Comptes de démo devenus orphelins (jamais un super admin ni un compte membre d'un autre restaurant).
    demo_users = select(User.id).where(
        User.email.like(f"%@{DOMAIN}"),
        User.is_superadmin.is_(False),
        ~select(Membership.id).where(Membership.user_id == User.id).exists(),
    )
    res = await session.execute(delete(User).where(User.id.in_(demo_users)))
    counts["users"] = res.rowcount or 0
    await session.commit()
    if keys:
        try:
            await delete_objects(keys)
        except Exception as e:  # stockage indisponible : fichiers orphelins sans conséquence
            counts["media_error"] = 1
            print(f"Images non supprimées du stockage ({type(e).__name__}) : sans conséquence.")
    return counts


async def reset(session: AsyncSession, *, images: bool = True) -> tuple[dict[str, int], SeedReport]:
    deleted = await delete_demo(session)
    return deleted, await seed(session, images=images)


def accounts_table() -> str:
    url = get_settings().public_app_url.rstrip("/")
    rows = [f"{'Profil':<10} {'Rôle OmegaSen':<14} {'Identifiant':<28} Accès"]
    rows += [f"{p.profile:<10} {p.role.value:<14} {p.email:<28} {p.summary}" for p in STAFF]
    rows += [f"{'CLIENT':<10} {'(compte client)':<14} {c.email:<28} {c.full_name}" for c in CUSTOMERS]
    rows.append(f"{'INVITÉ':<10} {INVITED.role.value:<14} {INVITED.email:<28} invitation en attente (pas de connexion)")
    return "\n".join(
        [
            f"{NAME} — environnement de test (slug « {SLUG} », id {RESTAURANT_ID})",
            f"Mot de passe commun : {PASSWORD}",
            "",
            *rows,
            "",
            f"Connexion        {url}/login",
            f"Menu client      {url}/r/{SLUG}",
            f"QR Code          {url}/q/{QR_CODE}",
            f"QR d'une table   {url}/q/{QR_CODE}?table=T5   (tables {TABLES[0]} à {TABLES[-1]})",
            f"Borne            {url}/r/{SLUG}?mode=kiosk",
            f"Espace gestion   {url}/manage/{RESTAURANT_ID}",
            f"Écran cuisine    {url}/kitchen/{RESTAURANT_ID}",
            f"Caisse           {url}/pos/{RESTAURANT_ID}",
        ]
    )
