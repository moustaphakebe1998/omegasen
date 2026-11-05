"""Super Admin OmegaSen : administration globale de la plateforme."""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Query
from pydantic import EmailStr, Field
from sqlalchemy import func, or_, select

from app.core.audit import audit
from app.core.deps import Session, SuperAdmin
from app.core.errors import NotFound, Unprocessable
from app.core.schema import Schema
from app.models import AuditLog, Membership, Order, QrCode, Restaurant, RestaurantRequest, User
from app.models.enums import MemberRole, OrderStatus, PaymentStatus, RequestStatus, RestaurantStatus
from app.modules.auth import ensure_account
from app.modules.restaurants import RestaurantCreate, create_restaurant

router = APIRouter(prefix="/api/admin", tags=["admin"])


class PlatformStats(Schema):
    restaurants: int
    active_restaurants: int
    users: int
    orders_today: int
    orders_30d: int
    revenue_30d_by_currency: dict[str, int]
    qr_scans_total: int
    pending_requests: int


class AdminRestaurant(Schema):
    id: uuid.UUID
    slug: str
    name: str
    city: str | None
    currency: str
    status: RestaurantStatus
    accepting_orders: bool
    created_at: datetime
    qr_code: str | None
    qr_active: bool | None
    owners: list[str]
    orders_30d: int
    # Renseigné uniquement à la création, si le propriétaire n'avait pas de compte : à lui transmettre.
    activation_url: str | None = None


class AdminRestaurantCreate(RestaurantCreate):
    owner_email: EmailStr
    owner_full_name: str | None = Field(default=None, min_length=2, max_length=120)
    owner_password: str | None = Field(default=None, min_length=10, max_length=200)


class StatusIn(Schema):
    status: RestaurantStatus


class AdminUser(Schema):
    id: uuid.UUID
    email: str
    full_name: str
    is_superadmin: bool
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime
    restaurants: int


class AdminUserUpdate(Schema):
    is_active: bool | None = None
    is_superadmin: bool | None = None


class AuditOut(Schema):
    id: uuid.UUID
    created_at: datetime
    action: str
    actor_email: str | None
    restaurant_name: str | None
    entity: str | None
    entity_id: str | None
    data: dict
    ip_address: str | None


class Page[T](Schema):
    items: list[T]
    total: int


@router.get("/stats", response_model=PlatformStats)
async def platform_stats(_: SuperAdmin, session: Session):
    now = datetime.now(UTC)
    since = now - timedelta(days=30)
    rev = await session.execute(
        select(Order.currency, func.sum(Order.total))
        .where(
            Order.created_at >= since, Order.payment_status == PaymentStatus.PAID, Order.status != OrderStatus.CANCELLED
        )
        .group_by(Order.currency)
    )
    return PlatformStats(
        restaurants=await session.scalar(
            select(func.count()).select_from(Restaurant).where(Restaurant.deleted_at.is_(None))
        )
        or 0,
        active_restaurants=await session.scalar(
            select(func.count())
            .select_from(Restaurant)
            .where(Restaurant.deleted_at.is_(None), Restaurant.status == RestaurantStatus.ACTIVE)
        )
        or 0,
        users=await session.scalar(select(func.count()).select_from(User)) or 0,
        orders_today=await session.scalar(
            select(func.count()).select_from(Order).where(Order.created_at >= now - timedelta(days=1))
        )
        or 0,
        orders_30d=await session.scalar(select(func.count()).select_from(Order).where(Order.created_at >= since)) or 0,
        revenue_30d_by_currency={c: int(v) for c, v in rev},
        qr_scans_total=await session.scalar(select(func.coalesce(func.sum(QrCode.scan_count), 0))) or 0,
        pending_requests=await session.scalar(
            select(func.count()).select_from(RestaurantRequest).where(RestaurantRequest.status == RequestStatus.PENDING)
        )
        or 0,
    )


async def _admin_restaurant(session, r: Restaurant) -> AdminRestaurant:
    qr = await session.scalar(select(QrCode).where(QrCode.restaurant_id == r.id))
    owners = await session.scalars(
        select(User.email)
        .join(Membership, Membership.user_id == User.id)
        .where(Membership.restaurant_id == r.id, Membership.role == MemberRole.OWNER)
    )
    n = await session.scalar(
        select(func.count())
        .select_from(Order)
        .where(Order.restaurant_id == r.id, Order.created_at >= datetime.now(UTC) - timedelta(days=30))
    )
    return AdminRestaurant(
        id=r.id,
        slug=r.slug,
        name=r.name,
        city=r.city,
        currency=r.currency,
        status=r.status,
        accepting_orders=r.accepting_orders,
        created_at=r.created_at,
        qr_code=qr.code if qr else None,
        qr_active=qr.is_active if qr else None,
        owners=list(owners),
        orders_30d=n or 0,
    )


@router.get("/restaurants", response_model=Page[AdminRestaurant])
async def list_restaurants(
    _: SuperAdmin,
    session: Session,
    q: str | None = Query(default=None, max_length=80),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    cond = [Restaurant.deleted_at.is_(None)]
    if q:
        like = f"%{q}%"
        cond.append(or_(Restaurant.name.ilike(like), Restaurant.slug.ilike(like), Restaurant.city.ilike(like)))
    total = await session.scalar(select(func.count()).select_from(Restaurant).where(*cond))
    rows = (
        await session.scalars(
            select(Restaurant)
            .where(*cond)
            .order_by(Restaurant.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).all()
    return Page[AdminRestaurant](items=[await _admin_restaurant(session, r) for r in rows], total=total or 0)


@router.post("/restaurants", response_model=AdminRestaurant, status_code=201)
async def create(body: AdminRestaurantCreate, admin: SuperAdmin, session: Session):
    email = body.owner_email.lower()
    owner, activation_url = await ensure_account(session, email, body.owner_full_name, password=body.owner_password)
    data = RestaurantCreate(**body.model_dump(exclude={"owner_email", "owner_full_name", "owner_password"}))
    r = await create_restaurant(session, data, owner)
    audit(
        session,
        "admin.restaurant_created",
        actor_id=admin.id,
        restaurant_id=r.id,
        entity="Restaurant",
        entity_id=r.id,
        data={"owner": email},
    )
    await session.commit()
    out = await _admin_restaurant(session, r)
    out.activation_url = activation_url
    return out


@router.post("/restaurants/{restaurant_id}/status", response_model=AdminRestaurant)
async def set_status(restaurant_id: uuid.UUID, body: StatusIn, admin: SuperAdmin, session: Session):
    r = await session.get(Restaurant, restaurant_id)
    if not r or r.deleted_at:
        raise NotFound("Restaurant introuvable")
    r.status = body.status
    audit(
        session,
        "admin.restaurant_status",
        actor_id=admin.id,
        restaurant_id=r.id,
        entity="Restaurant",
        entity_id=r.id,
        data={"status": body.status},
    )
    await session.commit()
    return await _admin_restaurant(session, r)


@router.get("/users", response_model=Page[AdminUser])
async def list_users(
    _: SuperAdmin,
    session: Session,
    q: str | None = Query(default=None, max_length=80),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    cond = []
    if q:
        like = f"%{q}%"
        cond.append(or_(User.email.ilike(like), User.full_name.ilike(like)))
    total = await session.scalar(select(func.count()).select_from(User).where(*cond))
    counts = select(Membership.user_id, func.count().label("n")).group_by(Membership.user_id).subquery()
    rows = await session.execute(
        select(User, func.coalesce(counts.c.n, 0))
        .outerjoin(counts, counts.c.user_id == User.id)
        .where(*cond)
        .order_by(User.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return Page[AdminUser](
        items=[
            AdminUser(
                id=u.id,
                email=u.email,
                full_name=u.full_name,
                is_superadmin=u.is_superadmin,
                is_active=u.is_active,
                last_login_at=u.last_login_at,
                created_at=u.created_at,
                restaurants=n,
            )
            for u, n in rows
        ],
        total=total or 0,
    )


@router.patch("/users/{user_id}", response_model=AdminUser)
async def update_user(user_id: uuid.UUID, body: AdminUserUpdate, admin: SuperAdmin, session: Session):
    u = await session.get(User, user_id)
    if not u:
        raise NotFound("Utilisateur introuvable")
    if u.id == admin.id and (body.is_active is False or body.is_superadmin is False):
        raise Unprocessable("Vous ne pouvez pas retirer vos propres droits", code="self_demotion")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(u, k, v)
    audit(
        session,
        "admin.user_updated",
        actor_id=admin.id,
        entity="User",
        entity_id=u.id,
        data=body.model_dump(exclude_unset=True),
    )
    await session.commit()
    n = await session.scalar(select(func.count()).select_from(Membership).where(Membership.user_id == u.id))
    return AdminUser(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        is_superadmin=u.is_superadmin,
        is_active=u.is_active,
        last_login_at=u.last_login_at,
        created_at=u.created_at,
        restaurants=n or 0,
    )


@router.get("/audit-logs", response_model=Page[AuditOut])
async def audit_logs(
    _: SuperAdmin,
    session: Session,
    action: str | None = Query(default=None, max_length=64),
    restaurant_id: uuid.UUID | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    cond = []
    if action:
        cond.append(AuditLog.action.ilike(f"{action}%"))
    if restaurant_id:
        cond.append(AuditLog.restaurant_id == restaurant_id)
    total = await session.scalar(select(func.count()).select_from(AuditLog).where(*cond))
    rows = await session.execute(
        select(AuditLog, User.email, Restaurant.name)
        .outerjoin(User, User.id == AuditLog.actor_id)
        .outerjoin(Restaurant, Restaurant.id == AuditLog.restaurant_id)
        .where(*cond)
        .order_by(AuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return Page[AuditOut](
        items=[
            AuditOut(
                id=a.id,
                created_at=a.created_at,
                action=a.action,
                actor_email=email,
                restaurant_name=rname,
                entity=a.entity,
                entity_id=a.entity_id,
                data=a.data or {},
                ip_address=a.ip_address,
            )
            for a, email, rname in rows
        ],
        total=total or 0,
    )
