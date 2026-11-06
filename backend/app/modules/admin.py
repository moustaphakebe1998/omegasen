"""Super Admin OmegaSen : administration globale de la plateforme.

Le super admin est le propriétaire de la plateforme : il administre tous les restaurants et tous les comptes
sans être membre d'aucun restaurant (il n'en devient jamais propriétaire). Toutes les routes exigent
`SuperAdmin` ; aucune n'est accessible à un propriétaire de restaurant. Chaque opération sensible est
tracée dans le journal d'activité avec l'état avant / après.
"""

import uuid
from datetime import UTC, date, datetime, timedelta
from enum import StrEnum

from fastapi import APIRouter, Query
from pydantic import EmailStr, Field
from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from app.core.access import broadcast_access_changed, revoke_blocked_members, revoke_if_no_access, revoke_sessions
from app.core.audit import audit
from app.core.deps import Session, SuperAdmin
from app.core.errors import Conflict, NotFound, Unprocessable
from app.core.permissions import Perm, effective_permissions, normalize_overrides
from app.core.schema import Schema
from app.core.storage import public_url
from app.models import (
    AuditLog,
    Membership,
    MenuCategory,
    Order,
    Product,
    QrCode,
    Reservation,
    Restaurant,
    RestaurantRequest,
    User,
)
from app.models.enums import (
    AccountType,
    MemberRole,
    OrderStatus,
    PaymentStatus,
    RequestStatus,
    ReservationStatus,
    RestaurantStatus,
    TokenPurpose,
)
from app.modules.accounts import ensure_account, issue_link, send_activation_email, send_reset_email
from app.modules.notifications import notify, publish_pending, restaurant_member_ids
from app.modules.restaurants import RestaurantCreate, create_restaurant

router = APIRouter(prefix="/api/admin", tags=["admin"])


class PlatformStats(Schema):
    restaurants: int
    active_restaurants: int
    restaurants_by_status: dict[RestaurantStatus, int]
    users: int
    users_active: int  # comptes actifs et activés
    users_disabled: int  # comptes bloqués sur toute la plateforme
    users_pending: int  # en attente d'activation
    superadmins: int
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
    email_sent: bool | None = None


class AdminRestaurantCreate(RestaurantCreate):
    owner_email: EmailStr
    owner_full_name: str | None = Field(default=None, min_length=2, max_length=120)
    status: RestaurantStatus = RestaurantStatus.ACTIVE


class StatusIn(Schema):
    status: RestaurantStatus
    # Motif (journal d'activité) : obligatoire pour suspendre ou fermer.
    reason: str | None = Field(default=None, max_length=500)


class DeleteRestaurantIn(Schema):
    # Confirmation explicite : l'adresse (slug) du restaurant, saisie à la main.
    confirm_slug: str = Field(min_length=1, max_length=80)
    reason: str = Field(min_length=3, max_length=500)


class DeleteUserIn(Schema):
    confirm_email: str = Field(min_length=3, max_length=254)


class UserStatus(StrEnum):
    PENDING = "PENDING"  # créé, en attente d'activation (mot de passe pas encore choisi)
    ACTIVE = "ACTIVE"
    DISABLED = "DISABLED"


def user_status(u: User) -> "UserStatus":
    if not u.is_active:
        return UserStatus.DISABLED
    return UserStatus.ACTIVE if u.activated_at else UserStatus.PENDING


class AdminMembership(Schema):
    id: uuid.UUID
    restaurant_id: uuid.UUID
    restaurant_name: str
    restaurant_status: RestaurantStatus | None = None
    role: MemberRole
    is_active: bool
    permissions: list[Perm] = []
    permission_overrides: dict[str, bool] = {}


class AdminUser(Schema):
    id: uuid.UUID
    email: str
    full_name: str
    phone: str | None
    account_type: AccountType
    status: UserStatus
    is_superadmin: bool
    is_active: bool
    last_login_at: datetime | None
    created_at: datetime
    restaurants: int
    memberships: list[AdminMembership] = []
    # Présent après création / renvoi d'activation : à transmettre si l'email n'a pas pu partir.
    activation_url: str | None = None
    email_sent: bool | None = None


class AdminUserCreate(Schema):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=32)
    is_superadmin: bool = False
    restaurant_id: uuid.UUID | None = None
    role: MemberRole | None = None


class AdminUserUpdate(Schema):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=32)
    is_active: bool | None = None
    is_superadmin: bool | None = None


class MembershipIn(Schema):
    restaurant_id: uuid.UUID
    role: MemberRole


class MembershipPatch(Schema):
    role: MemberRole | None = None
    is_active: bool | None = None
    permissions: list[Perm] | None = None  # ensemble complet souhaité (sinon : préréglage du rôle)
    reset_permissions: bool = False


class RevenuePoint(Schema):
    day: date
    currency: str
    revenue: int
    orders: int


class RevenueByRestaurant(Schema):
    restaurant_id: uuid.UUID
    restaurant_name: str
    currency: str
    revenue: int
    orders: int


class RevenueReport(Schema):
    days: int
    series: list[RevenuePoint]
    totals_by_currency: dict[str, int]
    by_restaurant: list[RevenueByRestaurant]


class StaffRow(Schema):
    user_id: uuid.UUID
    email: str
    full_name: str
    role: MemberRole
    status: UserStatus


class AdminRestaurantDetail(AdminRestaurant):
    cuisine: str | None
    phone: str | None
    email: str | None
    address_line: str | None
    logo_url: str | None
    cover_url: str | None
    members: list[AdminMembership]
    staff: list[StaffRow]
    products: int
    categories: int
    revenue_30d: int
    reservations_upcoming: int


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
    by_status = dict(
        (
            await session.execute(
                select(Restaurant.status, func.count())
                .where(Restaurant.deleted_at.is_(None))
                .group_by(Restaurant.status)
            )
        ).all()
    )

    async def count_users(*cond) -> int:
        return await session.scalar(select(func.count()).select_from(User).where(*cond)) or 0

    return PlatformStats(
        restaurants=sum(by_status.values()),
        active_restaurants=by_status.get(RestaurantStatus.ACTIVE, 0),
        restaurants_by_status={st: by_status.get(st, 0) for st in RestaurantStatus},
        users=await count_users(),
        users_active=await count_users(User.is_active.is_(True), User.activated_at.is_not(None)),
        users_disabled=await count_users(User.is_active.is_(False)),
        users_pending=await count_users(User.is_active.is_(True), User.activated_at.is_(None)),
        superadmins=await count_users(User.is_superadmin.is_(True)),
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
    status: RestaurantStatus | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    cond = [Restaurant.deleted_at.is_(None)]
    if status:
        cond.append(Restaurant.status == status)
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
    owner, needs_activation = await ensure_account(session, email, body.owner_full_name)
    data = RestaurantCreate(**body.model_dump(exclude={"owner_email", "owner_full_name", "status"}))
    r = await create_restaurant(session, data, owner)
    r.status = body.status
    activation_url = await issue_link(session, owner) if needs_activation else None
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
    if activation_url:
        out.email_sent = await send_activation_email(
            owner, activation_url, context=f"Votre restaurant « {r.name} » a été créé sur OmegaSen."
        )
    return out


@router.post("/restaurants/{restaurant_id}/status", response_model=AdminRestaurant)
async def set_status(restaurant_id: uuid.UUID, body: StatusIn, admin: SuperAdmin, session: Session):
    """Change le statut d'un restaurant (règle centrale d'accès, app/core/access.py).

    SUSPENDED / CLOSED / PENDING : tous les membres concernés perdent aussitôt leur accès (chaque requête relit
    le statut), leurs sessions sont révoquées s'ils n'ont plus aucun restaurant accessible et leurs WebSockets
    se ferment. Aucun compte n'est modifié : à la réactivation, chacun retrouve son rôle et ses permissions,
    sauf les comptes désactivés individuellement.
    """
    r = await session.get(Restaurant, restaurant_id)
    if not r or r.deleted_at:
        raise NotFound("Restaurant introuvable")
    reason = (body.reason or "").strip() or None
    if body.status in (RestaurantStatus.SUSPENDED, RestaurantStatus.CLOSED) and not reason:
        raise Unprocessable("Indiquez le motif de la suspension ou de la fermeture", code="reason_required")
    previous = r.status
    if previous == body.status:
        return await _admin_restaurant(session, r)
    r.status = body.status
    await session.flush()
    revoked = await revoke_blocked_members(session, r.id)
    notify(
        session,
        await restaurant_member_ids(session, r.id, (MemberRole.OWNER, MemberRole.ADMIN, MemberRole.MANAGER)),
        "restaurant.status_changed",
        f"{r.name} : {STATUS_LABEL[body.status]}",
        body="Le statut de votre restaurant a été modifié par l'équipe OmegaSen.",
        link=f"/manage/{r.id}",
        restaurant_id=r.id,
    )
    audit(
        session,
        "admin.restaurant_status",
        actor_id=admin.id,
        restaurant_id=r.id,
        entity="Restaurant",
        entity_id=r.id,
        data={"before": previous, "after": body.status, "reason": reason, "sessions_revoked": len(revoked)},
    )
    await session.commit()
    await publish_pending(session)
    members = await session.scalars(select(Membership.user_id).where(Membership.restaurant_id == r.id))
    await broadcast_access_changed(r.id, list(members))
    return await _admin_restaurant(session, r)


@router.delete("/restaurants/{restaurant_id}", status_code=204)
async def delete_restaurant(restaurant_id: uuid.UUID, body: DeleteRestaurantIn, admin: SuperAdmin, session: Session):
    """Suppression sécurisée : seulement un restaurant déjà FERMÉ, avec saisie de son adresse et un motif.

    Suppression logique (`deleted_at`) : commandes, paiements et journal sont conservés (obligations comptables
    et historique) ; le restaurant disparaît des listes et de l'espace public, ses membres perdent l'accès.
    """
    r = await session.get(Restaurant, restaurant_id)
    if not r or r.deleted_at:
        raise NotFound("Restaurant introuvable")
    if r.status != RestaurantStatus.CLOSED:
        raise Unprocessable("Fermez d'abord le restaurant avant de le supprimer", code="must_be_closed")
    if body.confirm_slug.strip() != r.slug:
        raise Unprocessable("L'adresse saisie ne correspond pas au restaurant", code="confirmation_mismatch")
    r.deleted_at = datetime.now(UTC)
    qr = await session.scalar(select(QrCode).where(QrCode.restaurant_id == r.id))
    if qr:
        qr.is_active = False
    await session.flush()
    revoked = await revoke_blocked_members(session, r.id)
    audit(
        session,
        "admin.restaurant_deleted",
        actor_id=admin.id,
        restaurant_id=r.id,
        entity="Restaurant",
        entity_id=r.id,
        data={"name": r.name, "slug": r.slug, "reason": body.reason.strip(), "sessions_revoked": len(revoked)},
    )
    await session.commit()
    await broadcast_access_changed(r.id, revoked)


def _admin_membership(m: Membership, r: Restaurant) -> AdminMembership:
    return AdminMembership(
        id=m.id,
        restaurant_id=r.id,
        restaurant_name=r.name,
        restaurant_status=r.status,
        role=m.role,
        is_active=m.is_active,
        permissions=sorted(effective_permissions(m.role, m.permission_overrides)),
        permission_overrides=m.permission_overrides or {},
    )


async def _memberships(session, user_id: uuid.UUID) -> list[AdminMembership]:
    rows = await session.execute(
        select(Membership, Restaurant)
        .join(Restaurant, Restaurant.id == Membership.restaurant_id)
        .where(Membership.user_id == user_id, Restaurant.deleted_at.is_(None))
        .order_by(Restaurant.name)
    )
    return [_admin_membership(m, r) for m, r in rows]


async def _admin_user(session, u: User, *, detail: bool = False) -> AdminUser:
    memberships = await _memberships(session, u.id)
    return AdminUser(
        id=u.id,
        email=u.email,
        full_name=u.full_name,
        phone=u.phone,
        account_type=u.account_type,
        status=user_status(u),
        is_superadmin=u.is_superadmin,
        is_active=u.is_active,
        last_login_at=u.last_login_at,
        created_at=u.created_at,
        restaurants=len(memberships),
        memberships=memberships if detail else [],
    )


async def _user_or_404(session, user_id: uuid.UUID) -> User:
    u = await session.get(User, user_id)
    if not u:
        raise NotFound("Utilisateur introuvable")
    return u


@router.get("/users", response_model=Page[AdminUser])
async def list_users(
    _: SuperAdmin,
    session: Session,
    q: str | None = Query(default=None, max_length=80),
    status: UserStatus | None = None,
    account_type: AccountType | None = None,
    restaurant_id: uuid.UUID | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    cond = []
    if q:
        like = f"%{q}%"
        cond.append(or_(User.email.ilike(like), User.full_name.ilike(like)))
    if status == UserStatus.DISABLED:
        cond.append(User.is_active.is_(False))
    elif status == UserStatus.ACTIVE:
        cond += [User.is_active.is_(True), User.activated_at.is_not(None)]
    elif status == UserStatus.PENDING:
        cond += [User.is_active.is_(True), User.activated_at.is_(None)]
    if account_type:
        cond.append(User.account_type == account_type)
    if restaurant_id:
        cond.append(User.id.in_(select(Membership.user_id).where(Membership.restaurant_id == restaurant_id)))
    total = await session.scalar(select(func.count()).select_from(User).where(*cond))
    rows = await session.scalars(
        select(User).where(*cond).order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    )
    return Page[AdminUser](items=[await _admin_user(session, u, detail=True) for u in rows], total=total or 0)


@router.get("/users/{user_id}", response_model=AdminUser)
async def get_user(user_id: uuid.UUID, _: SuperAdmin, session: Session):
    return await _admin_user(session, await _user_or_404(session, user_id), detail=True)


@router.post("/users", response_model=AdminUser, status_code=201)
async def create_user(body: AdminUserCreate, admin: SuperAdmin, session: Session):
    """Crée un compte (personnel ou super admin) : l'utilisateur reçoit un lien pour choisir son mot de passe."""
    email = body.email.lower()
    if await session.scalar(select(User.id).where(User.email == email)):
        raise Conflict("Un compte existe déjà avec cet email", code="email_taken")
    if (body.restaurant_id is None) != (body.role is None):
        raise Unprocessable("Indiquez à la fois le restaurant et le rôle", code="membership_incomplete")
    if body.is_superadmin and body.restaurant_id:
        raise Unprocessable(
            "Un super admin administre toute la plateforme : il n'est rattaché à aucun restaurant",
            code="superadmin_no_membership",
        )
    user, _ = await ensure_account(session, email, body.full_name, phone=body.phone)
    user.is_superadmin = body.is_superadmin
    restaurant = None
    if body.restaurant_id:
        restaurant = await session.get(Restaurant, body.restaurant_id)
        if not restaurant or restaurant.deleted_at:
            raise NotFound("Restaurant introuvable")
        session.add(Membership(user_id=user.id, restaurant_id=restaurant.id, role=body.role))
    url = await issue_link(session, user)
    audit(
        session,
        "admin.user_created",
        actor_id=admin.id,
        restaurant_id=restaurant.id if restaurant else None,
        entity="User",
        entity_id=user.id,
        data={"email": email, "role": body.role, "superadmin": body.is_superadmin},
    )
    await session.commit()
    context = (
        f"Vous avez été ajouté(e) à l'équipe du restaurant « {restaurant.name} » sur OmegaSen."
        if restaurant
        else "Un compte OmegaSen a été créé pour vous par l'équipe OmegaSen."
    )
    out = await _admin_user(session, user, detail=True)
    out.activation_url = url
    out.email_sent = await send_activation_email(user, url, context=context)
    return out


async def _other_superadmins(session, user_id: uuid.UUID) -> int:
    return (
        await session.scalar(
            select(func.count())
            .select_from(User)
            .where(User.is_superadmin.is_(True), User.is_active.is_(True), User.id != user_id)
        )
        or 0
    )


@router.patch("/users/{user_id}", response_model=AdminUser)
async def update_user(user_id: uuid.UUID, body: AdminUserUpdate, admin: SuperAdmin, session: Session):
    u = await _user_or_404(session, user_id)
    if u.id == admin.id and (body.is_active is False or body.is_superadmin is False):
        raise Unprocessable("Vous ne pouvez pas retirer vos propres droits", code="self_demotion")
    if u.is_superadmin and (body.is_active is False or body.is_superadmin is False):
        if not await _other_superadmins(session, u.id):
            raise Unprocessable("La plateforme doit garder au moins un super admin actif", code="last_superadmin")
    if body.is_superadmin and await session.scalar(select(Membership.id).where(Membership.user_id == u.id).limit(1)):
        raise Unprocessable(
            "Retirez d'abord ce compte de ses restaurants : un super admin n'est membre d'aucun restaurant",
            code="superadmin_no_membership",
        )
    data = body.model_dump(exclude_unset=True)
    changes = {}
    for k, v in data.items():
        v = v.strip() if isinstance(v, str) else v
        if getattr(u, k) != v:
            changes[k] = [getattr(u, k), v]
            setattr(u, k, v)
    revoked = 0
    if changes.get("is_active") == [True, False] or changes.get("is_superadmin") == [True, False]:
        # Blocage sur toute la plateforme ou retrait des droits : ferme immédiatement toutes ses sessions.
        revoked = await revoke_sessions(session, [u.id])
    if changes:
        audit(
            session,
            "admin.user_updated",
            actor_id=admin.id,
            entity="User",
            entity_id=u.id,
            data={"email": u.email, "changes": changes, "sessions_revoked": revoked},
        )
    await session.commit()
    if changes:
        await broadcast_access_changed(user_ids=[u.id])
    return await _admin_user(session, u, detail=True)


@router.post("/users/{user_id}/password-reset", response_model=AdminUser)
async def admin_password_reset(user_id: uuid.UUID, admin: SuperAdmin, session: Session):
    """Envoie un lien de réinitialisation (le super admin ne voit ni ne choisit jamais le mot de passe).

    Les sessions en cours sont fermées : le compte devra se reconnecter avec son nouveau mot de passe.
    """
    u = await _user_or_404(session, user_id)
    if u.activated_at is None:
        raise Conflict("Compte pas encore activé : renvoyez plutôt le lien d'activation", code="not_activated")
    url = await issue_link(session, u, TokenPurpose.RESET)
    revoked = await revoke_sessions(session, [u.id])
    audit(
        session,
        "admin.password_reset",
        actor_id=admin.id,
        entity="User",
        entity_id=u.id,
        data={"email": u.email, "sessions_revoked": revoked},
    )
    await session.commit()
    await broadcast_access_changed(user_ids=[u.id])
    out = await _admin_user(session, u, detail=True)
    out.activation_url = url
    out.email_sent = await send_reset_email(u, url)
    return out


@router.delete("/users/{user_id}", status_code=204)
async def delete_user(user_id: uuid.UUID, body: DeleteUserIn, admin: SuperAdmin, session: Session):
    """Supprime un compte (saisie de son email pour confirmer). Refusé pour soi-même, pour le dernier super
    admin et pour le dernier propriétaire actif d'un restaurant (désigner d'abord un autre propriétaire).

    Les commandes, paiements et journaux restent (l'auteur devient anonyme) ; les sessions disparaissent.
    """
    u = await _user_or_404(session, user_id)
    if u.id == admin.id:
        raise Unprocessable("Vous ne pouvez pas supprimer votre propre compte", code="self_delete")
    if body.confirm_email.strip().lower() != u.email:
        raise Unprocessable("L'email saisi ne correspond pas au compte", code="confirmation_mismatch")
    if u.is_superadmin and not await _other_superadmins(session, u.id):
        raise Unprocessable("La plateforme doit garder au moins un super admin actif", code="last_superadmin")
    for m in await session.scalars(
        select(Membership).where(Membership.user_id == u.id, Membership.role == MemberRole.OWNER)
    ):
        await _check_last_owner(session, m)
    memberships = await _memberships(session, u.id)
    await revoke_sessions(session, [u.id])
    audit(
        session,
        "admin.user_deleted",
        actor_id=admin.id,
        entity="User",
        entity_id=u.id,
        data={
            "email": u.email,
            "full_name": u.full_name,
            "superadmin": u.is_superadmin,
            "memberships": [{"restaurant": m.restaurant_name, "role": m.role} for m in memberships],
        },
    )
    await session.delete(u)
    await session.commit()
    await broadcast_access_changed(user_ids=[user_id])


@router.post("/users/{user_id}/resend-activation", response_model=AdminUser)
async def resend_activation(user_id: uuid.UUID, admin: SuperAdmin, session: Session):
    u = await _user_or_404(session, user_id)
    if u.activated_at is not None:
        raise Conflict("Ce compte est déjà activé", code="already_activated")
    url = await issue_link(session, u)
    audit(session, "admin.activation_resent", actor_id=admin.id, entity="User", entity_id=u.id)
    await session.commit()
    out = await _admin_user(session, u, detail=True)
    out.activation_url = url
    out.email_sent = await send_activation_email(u, url)
    return out


@router.post("/users/{user_id}/memberships", response_model=AdminUser, status_code=201)
async def add_membership(user_id: uuid.UUID, body: MembershipIn, admin: SuperAdmin, session: Session):
    u = await _user_or_404(session, user_id)
    r = await session.get(Restaurant, body.restaurant_id)
    if not r or r.deleted_at:
        raise NotFound("Restaurant introuvable")
    if u.is_superadmin:
        raise Unprocessable(
            "Un super admin administre déjà tous les restaurants : il n'en devient pas membre",
            code="superadmin_no_membership",
        )
    if await session.scalar(select(Membership.id).where(Membership.user_id == u.id, Membership.restaurant_id == r.id)):
        raise Conflict("Déjà rattaché à ce restaurant", code="already_member")
    if u.account_type == AccountType.CUSTOMER:
        u.account_type = AccountType.STAFF
    session.add(Membership(user_id=u.id, restaurant_id=r.id, role=body.role))
    audit(
        session,
        "admin.membership_added",
        actor_id=admin.id,
        restaurant_id=r.id,
        entity="User",
        entity_id=u.id,
        data={"role": body.role},
    )
    await session.commit()
    await broadcast_access_changed(r.id, [u.id])
    return await _admin_user(session, u, detail=True)


async def _membership_or_404(session, user_id: uuid.UUID, membership_id: uuid.UUID) -> Membership:
    m = await session.get(Membership, membership_id)
    if not m or m.user_id != user_id:
        raise NotFound("Rattachement introuvable")
    return m


async def _check_last_owner(session, m: Membership) -> None:
    owners = await session.scalar(
        select(func.count())
        .select_from(Membership)
        .where(
            Membership.restaurant_id == m.restaurant_id,
            Membership.role == MemberRole.OWNER,
            Membership.is_active.is_(True),
            Membership.id != m.id,
        )
    )
    if not owners:
        raise Unprocessable("Le restaurant doit garder au moins un propriétaire actif", code="last_owner")


@router.patch("/users/{user_id}/memberships/{membership_id}", response_model=AdminUser)
async def update_membership(
    user_id: uuid.UUID, membership_id: uuid.UUID, body: MembershipPatch, admin: SuperAdmin, session: Session
):
    """Rôle, permissions individuelles et statut d'un rattachement (le super admin n'est limité par aucune
    hiérarchie de restaurant ; seule la protection du dernier propriétaire actif s'applique)."""
    m = await _membership_or_404(session, user_id, membership_id)
    if m.role == MemberRole.OWNER and ((body.role and body.role != MemberRole.OWNER) or body.is_active is False):
        await _check_last_owner(session, m)
    new_role = body.role or m.role
    if body.reset_permissions or new_role == MemberRole.OWNER:
        overrides: dict[str, bool] = {}
    elif body.permissions is not None:
        overrides = normalize_overrides(new_role, set(body.permissions))
    elif new_role != m.role:
        overrides = {}
    else:
        overrides = m.permission_overrides or {}
    changes = {}
    if new_role != m.role:
        changes["role"] = [m.role, new_role]
    if overrides != (m.permission_overrides or {}):
        changes["permissions"] = [m.permission_overrides or {}, overrides]
    if body.is_active is not None and body.is_active != m.is_active:
        changes["is_active"] = [m.is_active, body.is_active]
        m.is_active = body.is_active
    m.role, m.permission_overrides = new_role, overrides
    if changes:
        audit(
            session,
            "admin.membership_updated",
            actor_id=admin.id,
            restaurant_id=m.restaurant_id,
            entity="User",
            entity_id=user_id,
            data={"changes": changes},
        )
    await session.flush()
    if changes.get("is_active") == [True, False]:
        await revoke_if_no_access(session, await _user_or_404(session, user_id))
    await session.commit()
    if changes:
        await broadcast_access_changed(m.restaurant_id, [user_id])
    return await _admin_user(session, await _user_or_404(session, user_id), detail=True)


@router.delete("/users/{user_id}/memberships/{membership_id}", response_model=AdminUser)
async def remove_membership(user_id: uuid.UUID, membership_id: uuid.UUID, admin: SuperAdmin, session: Session):
    m = await _membership_or_404(session, user_id, membership_id)
    if m.role == MemberRole.OWNER:
        await _check_last_owner(session, m)
    restaurant_id, role = m.restaurant_id, m.role
    await session.delete(m)
    audit(
        session,
        "admin.membership_removed",
        actor_id=admin.id,
        restaurant_id=restaurant_id,
        entity="User",
        entity_id=user_id,
        data={"role": role},
    )
    await session.flush()
    await revoke_if_no_access(session, await _user_or_404(session, user_id))
    await session.commit()
    await broadcast_access_changed(restaurant_id, [user_id])
    return await _admin_user(session, await _user_or_404(session, user_id), detail=True)


# ── Chiffre d'affaires de la plateforme ────────────────


@router.get("/revenue", response_model=RevenueReport)
async def revenue(_: SuperAdmin, session: Session, days: int = Query(30, ge=1, le=366)):
    """Chiffre d'affaires TTC encaissé (commandes payées, non annulées), par jour, devise et restaurant."""
    since = datetime.now(UTC) - timedelta(days=days)
    paid = (
        Order.created_at >= since,
        Order.payment_status == PaymentStatus.PAID,
        Order.status != OrderStatus.CANCELLED,
    )
    series = await session.execute(
        select(Order.business_date, Order.currency, func.sum(Order.total), func.count())
        .where(*paid)
        .group_by(Order.business_date, Order.currency)
        .order_by(Order.business_date)
    )
    by_restaurant = await session.execute(
        select(Restaurant.id, Restaurant.name, Order.currency, func.sum(Order.total), func.count())
        .join(Restaurant, Restaurant.id == Order.restaurant_id)
        .where(*paid)
        .group_by(Restaurant.id, Restaurant.name, Order.currency)
        .order_by(func.sum(Order.total).desc())
    )
    points = [RevenuePoint(day=d, currency=c, revenue=int(t), orders=n) for d, c, t, n in series]
    totals: dict[str, int] = {}
    for p in points:
        totals[p.currency] = totals.get(p.currency, 0) + p.revenue
    return RevenueReport(
        days=days,
        series=points,
        totals_by_currency=totals,
        by_restaurant=[
            RevenueByRestaurant(restaurant_id=i, restaurant_name=n, currency=c, revenue=int(t), orders=k)
            for i, n, c, t, k in by_restaurant
        ],
    )


@router.get("/restaurants/{restaurant_id}", response_model=AdminRestaurantDetail)
async def restaurant_detail(restaurant_id: uuid.UUID, _: SuperAdmin, session: Session):
    r = await session.scalar(
        select(Restaurant)
        .where(Restaurant.id == restaurant_id, Restaurant.deleted_at.is_(None))
        .options(selectinload(Restaurant.logo), selectinload(Restaurant.cover))
    )
    if not r:
        raise NotFound("Restaurant introuvable")
    base = await _admin_restaurant(session, r)
    staff_rows = await session.execute(
        select(Membership, User)
        .join(User, User.id == Membership.user_id)
        .where(Membership.restaurant_id == r.id)
        .order_by(Membership.role, User.full_name)
    )
    staff_rows = staff_rows.all()
    since = datetime.now(UTC) - timedelta(days=30)
    revenue_30d = await session.scalar(
        select(func.coalesce(func.sum(Order.total), 0)).where(
            Order.restaurant_id == r.id,
            Order.created_at >= since,
            Order.payment_status == PaymentStatus.PAID,
            Order.status != OrderStatus.CANCELLED,
        )
    )
    return AdminRestaurantDetail(
        **base.model_dump(),
        cuisine=r.cuisine,
        phone=r.phone,
        email=r.email,
        address_line=r.address_line,
        logo_url=public_url(r.logo.variants["thumb"]) if r.logo else None,
        cover_url=public_url(r.cover.variants["medium"]) if r.cover else None,
        members=[_admin_membership(m, r) for m, _u in staff_rows],
        staff=[
            StaffRow(user_id=u.id, email=u.email, full_name=u.full_name, role=m.role, status=user_status(u))
            for m, u in staff_rows
        ],
        products=await session.scalar(select(func.count()).select_from(Product).where(Product.restaurant_id == r.id))
        or 0,
        categories=await session.scalar(
            select(func.count()).select_from(MenuCategory).where(MenuCategory.restaurant_id == r.id)
        )
        or 0,
        revenue_30d=int(revenue_30d or 0),
        reservations_upcoming=await session.scalar(
            select(func.count())
            .select_from(Reservation)
            .where(
                Reservation.restaurant_id == r.id,
                Reservation.starts_at >= datetime.now(UTC),
                Reservation.status.in_([ReservationStatus.PENDING, ReservationStatus.CONFIRMED]),
            )
        )
        or 0,
    )


STATUS_LABEL = {
    RestaurantStatus.PENDING: "en préparation",
    RestaurantStatus.ACTIVE: "actif",
    RestaurantStatus.SUSPENDED: "suspendu",
    RestaurantStatus.CLOSED: "fermé",
}


@router.get("/audit-logs", response_model=Page[AuditOut])
async def audit_logs(
    _: SuperAdmin,
    session: Session,
    action: str | None = Query(default=None, max_length=64),
    restaurant_id: uuid.UUID | None = None,
    actor_id: uuid.UUID | None = None,
    entity_id: str | None = Query(default=None, max_length=64),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    """Journal global de la plateforme (réservé au super admin)."""
    cond = []
    if action:
        cond.append(AuditLog.action.ilike(f"{action}%"))
    if restaurant_id:
        cond.append(AuditLog.restaurant_id == restaurant_id)
    if actor_id:
        cond.append(AuditLog.actor_id == actor_id)
    if entity_id:
        cond.append(AuditLog.entity_id == entity_id)
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
