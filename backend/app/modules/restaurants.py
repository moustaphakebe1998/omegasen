"""Espace restaurateur : établissement, horaires, employés, postes de cuisine."""

import re
import unicodedata
import uuid
from datetime import UTC, datetime, time
from zoneinfo import ZoneInfo, available_timezones

from fastapi import APIRouter
from pydantic import EmailStr, Field, field_validator, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.audit import audit
from app.core.deps import AnyMember, Manager, Session, SuperAdmin
from app.core.errors import Conflict, Forbidden, NotFound, Unprocessable
from app.core.money import SUPPORTED_CURRENCIES
from app.core.schema import Schema
from app.core.security import hash_password, random_code
from app.core.storage import public_url
from app.models import KitchenStation, Media, Membership, OpeningHours, QrCode, Restaurant, User
from app.models.enums import MemberRole, RestaurantStatus

router = APIRouter(prefix="/api/restaurants", tags=["restaurants"])

DEFAULT_VAT = {"EUR": 1000, "XOF": 1800}
DEFAULT_TZ = {"EUR": "Europe/Paris", "XOF": "Africa/Dakar"}
DEFAULT_COUNTRY = {"EUR": "FR", "XOF": "SN"}


# ── Utilitaires ─────────────────────────────────────────


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value[:60] or "restaurant"


async def unique_slug(session: AsyncSession, name: str, exclude_id: uuid.UUID | None = None) -> str:
    base = slugify(name)
    slug = base
    i = 2
    while True:
        q = select(Restaurant.id).where(Restaurant.slug == slug)
        if exclude_id:
            q = q.where(Restaurant.id != exclude_id)
        if not await session.scalar(q):
            return slug
        slug = f"{base}-{i}"
        i += 1


def is_open_at(restaurant: Restaurant, at: datetime) -> bool:
    """Ouvert à l'instant `at` ? Sans horaires définis, le restaurant est considéré ouvert."""
    hours = restaurant.opening_hours
    if not hours:
        return True
    local = at.astimezone(ZoneInfo(restaurant.timezone))
    today, now_t = local.weekday(), local.time()
    yesterday = (today - 1) % 7
    for h in hours:
        overnight = h.closes_at <= h.opens_at
        if h.day_of_week == today:
            if overnight and now_t >= h.opens_at:
                return True
            if not overnight and h.opens_at <= now_t < h.closes_at:
                return True
        if h.day_of_week == yesterday and overnight and now_t < h.closes_at:
            return True
    return False


# ── Schémas ─────────────────────────────────────────────


def _validate_tz(v: str | None) -> str | None:
    if v is not None and v not in available_timezones():
        raise ValueError("Fuseau horaire inconnu")
    return v


class HoursSlot(Schema):
    day_of_week: int = Field(ge=0, le=6)
    opens_at: time
    closes_at: time

    @model_validator(mode="after")
    def _distinct(self):
        if self.opens_at == self.closes_at:
            raise ValueError("L'heure d'ouverture et de fermeture doivent différer")
        return self


class RestaurantBase(Schema):
    description: str | None = Field(default=None, max_length=2000)
    cuisine: str | None = Field(default=None, max_length=80)
    phone: str | None = Field(default=None, max_length=32)
    email: EmailStr | None = None
    website: str | None = Field(default=None, max_length=255)
    address_line: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=120)
    postal_code: str | None = Field(default=None, max_length=20)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)


class RestaurantCreate(RestaurantBase):
    name: str = Field(min_length=2, max_length=120)
    currency: str = "EUR"
    country: str | None = Field(default=None, min_length=2, max_length=2)
    timezone: str | None = None
    vat_rate_bp: int | None = Field(default=None, ge=0, le=5000)

    @field_validator("currency")
    @classmethod
    def _currency(cls, v: str) -> str:
        v = v.upper()
        if v not in SUPPORTED_CURRENCIES:
            raise ValueError(f"Devise non supportée ({', '.join(SUPPORTED_CURRENCIES)})")
        return v

    _tz = field_validator("timezone")(_validate_tz)


class RestaurantUpdate(RestaurantBase):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    slug: str | None = Field(default=None, min_length=2, max_length=80, pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$")
    timezone: str | None = None
    vat_rate_bp: int | None = Field(default=None, ge=0, le=5000)
    accepting_orders: bool | None = None
    dine_in_enabled: bool | None = None
    takeaway_enabled: bool | None = None
    require_prepayment: bool | None = None
    late_after_minutes: int | None = Field(default=None, ge=1, le=240)
    logo_media_id: uuid.UUID | None = None
    cover_media_id: uuid.UUID | None = None

    _tz = field_validator("timezone")(_validate_tz)


class RestaurantOut(Schema):
    id: uuid.UUID
    slug: str
    name: str
    description: str | None
    cuisine: str | None
    phone: str | None
    email: str | None
    website: str | None
    address_line: str | None
    city: str | None
    postal_code: str | None
    country: str
    latitude: float | None
    longitude: float | None
    currency: str
    timezone: str
    vat_rate_bp: int
    status: RestaurantStatus
    accepting_orders: bool
    dine_in_enabled: bool
    takeaway_enabled: bool
    require_prepayment: bool
    late_after_minutes: int
    logo_media_id: uuid.UUID | None
    cover_media_id: uuid.UUID | None
    logo_url: str | None
    cover_url: str | None
    opening_hours: list[HoursSlot]
    is_open_now: bool
    created_at: datetime


def restaurant_out(r: Restaurant) -> RestaurantOut:
    return RestaurantOut(
        **{
            k: getattr(r, k)
            for k in RestaurantOut.model_fields
            if hasattr(r, k) and k not in ("opening_hours", "logo_url", "cover_url", "is_open_now")
        },
        logo_url=public_url(r.logo.variants.get("medium")) if r.logo else None,
        cover_url=public_url(r.cover.variants.get("original")) if r.cover else None,
        opening_hours=[
            HoursSlot(day_of_week=h.day_of_week, opens_at=h.opens_at, closes_at=h.closes_at) for h in r.opening_hours
        ],
        is_open_now=is_open_at(r, datetime.now(UTC)),
    )


RESTAURANT_LOADS = (
    selectinload(Restaurant.opening_hours),
    selectinload(Restaurant.logo),
    selectinload(Restaurant.cover),
)


async def load_restaurant(session: AsyncSession, restaurant_id: uuid.UUID) -> Restaurant:
    r = await session.scalar(
        select(Restaurant)
        .where(Restaurant.id == restaurant_id)
        .options(*RESTAURANT_LOADS)
        .execution_options(populate_existing=True)
    )
    if not r:
        raise NotFound("Restaurant introuvable")
    return r


async def create_restaurant(session: AsyncSession, data: RestaurantCreate, owner: User) -> Restaurant:
    """Crée le restaurant, rattache le propriétaire et génère son QR Code permanent."""
    restaurant = Restaurant(
        **data.model_dump(exclude={"currency", "country", "timezone", "vat_rate_bp"}),
        slug=await unique_slug(session, data.name),
        currency=data.currency,
        country=(data.country or DEFAULT_COUNTRY[data.currency]).upper(),
        timezone=data.timezone or DEFAULT_TZ[data.currency],
        vat_rate_bp=data.vat_rate_bp if data.vat_rate_bp is not None else DEFAULT_VAT[data.currency],
    )
    session.add(restaurant)
    await session.flush()
    session.add(Membership(user_id=owner.id, restaurant_id=restaurant.id, role=MemberRole.OWNER))
    session.add(QrCode(restaurant_id=restaurant.id, code=await unique_qr_code(session)))
    audit(
        session,
        "restaurant.created",
        actor_id=owner.id,
        restaurant_id=restaurant.id,
        entity="Restaurant",
        entity_id=restaurant.id,
        data={"name": restaurant.name},
    )
    return restaurant


async def unique_qr_code(session: AsyncSession) -> str:
    while True:
        code = random_code(8)
        if not await session.scalar(select(QrCode.id).where(QrCode.code == code)):
            return code


# ── Restaurant ──────────────────────────────────────────


@router.post("", response_model=RestaurantOut, status_code=201)
async def create(body: RestaurantCreate, admin: SuperAdmin, session: Session):
    """Création réservée au super admin (le super admin devient propriétaire).

    Pour créer un restaurant au nom d'un restaurateur : POST /api/admin/restaurants ou approbation d'une
    demande d'ouverture (POST /api/admin/restaurant-requests/{id}/approve).
    """
    restaurant = await create_restaurant(session, body, admin)
    await session.commit()
    return restaurant_out(await load_restaurant(session, restaurant.id))


@router.get("/{restaurant_id}", response_model=RestaurantOut)
async def get_one(ctx: AnyMember, session: Session):
    return restaurant_out(await load_restaurant(session, ctx.restaurant.id))


@router.patch("/{restaurant_id}", response_model=RestaurantOut)
async def update_one(body: RestaurantUpdate, ctx: Manager, session: Session):
    r = ctx.restaurant
    data = body.model_dump(exclude_unset=True)
    if "slug" in data and data["slug"] != r.slug:
        if await session.scalar(select(Restaurant.id).where(Restaurant.slug == data["slug"], Restaurant.id != r.id)):
            raise Conflict("Cette adresse est déjà utilisée", code="slug_taken")
    for field in ("logo_media_id", "cover_media_id"):
        if data.get(field):
            media = await session.get(Media, data[field])
            if not media or media.restaurant_id != r.id:
                raise Unprocessable("Image introuvable pour ce restaurant")
    for k, v in data.items():
        setattr(r, k, v)
    audit(
        session,
        "restaurant.updated",
        actor_id=ctx.user.id,
        restaurant_id=r.id,
        entity="Restaurant",
        entity_id=r.id,
        data={"fields": sorted(data)},
    )
    await session.commit()
    return restaurant_out(await load_restaurant(session, r.id))


@router.put("/{restaurant_id}/opening-hours", response_model=list[HoursSlot])
async def set_hours(body: list[HoursSlot], ctx: Manager, session: Session):
    if len(body) > 28:
        raise Unprocessable("Trop de plages horaires")
    r = await load_restaurant(session, ctx.restaurant.id)
    r.opening_hours = [OpeningHours(**s.model_dump()) for s in body]
    audit(session, "restaurant.hours_updated", actor_id=ctx.user.id, restaurant_id=r.id)
    await session.commit()
    return body


# ── Employés ────────────────────────────────────────────


class MemberOut(Schema):
    id: uuid.UUID
    user_id: uuid.UUID
    email: str
    full_name: str
    phone: str | None
    role: MemberRole
    is_active: bool
    created_at: datetime


class MemberCreate(Schema):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    role: MemberRole
    password: str | None = Field(default=None, min_length=10, max_length=200)
    phone: str | None = Field(default=None, max_length=32)


class MemberUpdate(Schema):
    role: MemberRole | None = None
    is_active: bool | None = None


def _member_out(m: Membership) -> MemberOut:
    return MemberOut(
        id=m.id,
        user_id=m.user_id,
        email=m.user.email,
        full_name=m.user.full_name,
        phone=m.user.phone,
        role=m.role,
        is_active=m.is_active,
        created_at=m.created_at,
    )


def _check_role_grant(ctx, role: MemberRole) -> None:
    if role == MemberRole.OWNER and not ctx.has(MemberRole.OWNER):
        raise Forbidden("Seul un propriétaire peut nommer un propriétaire")


@router.get("/{restaurant_id}/members", response_model=list[MemberOut])
async def list_members(ctx: Manager, session: Session):
    rows = await session.scalars(
        select(Membership)
        .where(Membership.restaurant_id == ctx.restaurant.id)
        .options(selectinload(Membership.user))
        .order_by(Membership.created_at)
    )
    return [_member_out(m) for m in rows]


@router.post("/{restaurant_id}/members", response_model=MemberOut, status_code=201)
async def add_member(body: MemberCreate, ctx: Manager, session: Session):
    _check_role_grant(ctx, body.role)
    email = body.email.lower()
    user = await session.scalar(select(User).where(User.email == email))
    if not user:
        if not body.password:
            raise Unprocessable("Mot de passe requis pour créer un nouveau compte", code="password_required")
        user = User(email=email, full_name=body.full_name, phone=body.phone, password_hash=hash_password(body.password))
        session.add(user)
        await session.flush()
    existing = await session.scalar(
        select(Membership).where(Membership.user_id == user.id, Membership.restaurant_id == ctx.restaurant.id)
    )
    if existing:
        raise Conflict("Cette personne fait déjà partie de l'équipe", code="already_member")
    m = Membership(user_id=user.id, restaurant_id=ctx.restaurant.id, role=body.role)
    session.add(m)
    audit(
        session,
        "member.added",
        actor_id=ctx.user.id,
        restaurant_id=ctx.restaurant.id,
        entity="User",
        entity_id=user.id,
        data={"role": body.role},
    )
    await session.commit()
    await session.refresh(m, ["user"])
    return _member_out(m)


async def _get_member(session, ctx, member_id: uuid.UUID) -> Membership:
    m = await session.scalar(
        select(Membership)
        .where(Membership.id == member_id, Membership.restaurant_id == ctx.restaurant.id)
        .options(selectinload(Membership.user))
    )
    if not m:
        raise NotFound("Employé introuvable")
    return m


async def _ensure_other_owner(session, ctx, m: Membership) -> None:
    if m.role != MemberRole.OWNER:
        return
    owners = await session.scalar(
        select(func.count())
        .select_from(Membership)
        .where(
            Membership.restaurant_id == ctx.restaurant.id,
            Membership.role == MemberRole.OWNER,
            Membership.is_active.is_(True),
        )
    )
    if owners <= 1:
        raise Unprocessable("Le restaurant doit garder au moins un propriétaire actif", code="last_owner")


@router.patch("/{restaurant_id}/members/{member_id}", response_model=MemberOut)
async def update_member(member_id: uuid.UUID, body: MemberUpdate, ctx: Manager, session: Session):
    m = await _get_member(session, ctx, member_id)
    if m.role == MemberRole.OWNER and not ctx.has(MemberRole.OWNER):
        raise Forbidden("Seul un propriétaire peut modifier un propriétaire")
    if body.role is not None:
        _check_role_grant(ctx, body.role)
        if body.role != MemberRole.OWNER:
            await _ensure_other_owner(session, ctx, m)
        m.role = body.role
    if body.is_active is not None:
        if not body.is_active:
            await _ensure_other_owner(session, ctx, m)
        m.is_active = body.is_active
    audit(
        session,
        "member.updated",
        actor_id=ctx.user.id,
        restaurant_id=ctx.restaurant.id,
        entity="Membership",
        entity_id=m.id,
        data=body.model_dump(exclude_unset=True),
    )
    await session.commit()
    return _member_out(m)


@router.delete("/{restaurant_id}/members/{member_id}", status_code=204)
async def remove_member(member_id: uuid.UUID, ctx: Manager, session: Session):
    m = await _get_member(session, ctx, member_id)
    if m.role == MemberRole.OWNER and not ctx.has(MemberRole.OWNER):
        raise Forbidden("Seul un propriétaire peut retirer un propriétaire")
    await _ensure_other_owner(session, ctx, m)
    await session.delete(m)
    audit(
        session,
        "member.removed",
        actor_id=ctx.user.id,
        restaurant_id=ctx.restaurant.id,
        entity="User",
        entity_id=m.user_id,
    )
    await session.commit()


# ── Postes de cuisine ───────────────────────────────────


class StationIn(Schema):
    name: str = Field(min_length=1, max_length=60)
    sort_order: int = 0


class StationOut(StationIn):
    id: uuid.UUID


@router.get("/{restaurant_id}/stations", response_model=list[StationOut])
async def list_stations(ctx: AnyMember, session: Session):
    rows = await session.scalars(
        select(KitchenStation)
        .where(KitchenStation.restaurant_id == ctx.restaurant.id)
        .order_by(KitchenStation.sort_order, KitchenStation.name)
    )
    return [StationOut(id=s.id, name=s.name, sort_order=s.sort_order) for s in rows]


@router.post("/{restaurant_id}/stations", response_model=StationOut, status_code=201)
async def create_station(body: StationIn, ctx: Manager, session: Session):
    s = KitchenStation(restaurant_id=ctx.restaurant.id, **body.model_dump())
    session.add(s)
    await session.commit()
    return StationOut(id=s.id, name=s.name, sort_order=s.sort_order)


@router.delete("/{restaurant_id}/stations/{station_id}", status_code=204)
async def delete_station(station_id: uuid.UUID, ctx: Manager, session: Session):
    s = await session.get(KitchenStation, station_id)
    if not s or s.restaurant_id != ctx.restaurant.id:
        raise NotFound("Poste introuvable")
    await session.delete(s)
    await session.commit()
