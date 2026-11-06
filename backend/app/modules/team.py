"""Équipe d'un restaurant : collaborateurs, invitations, création directe, rôles, permissions, affectation.

Règles :
- Il faut `team.manage` pour modifier l'équipe (`team.view` pour la consulter).
- Hiérarchie (app/core/access.py) : un membre ne gère, et n'attribue, que des rôles strictement inférieurs au
  sien (un administrateur gère les responsables et le personnel, un responsable le personnel). Seul un
  propriétaire (ou le super admin) nomme, modifie ou retire un propriétaire ; le dernier propriétaire actif
  est protégé.
- Un compte super admin n'est jamais ajouté ni modifié depuis l'équipe d'un restaurant.
- La création directe avec mot de passe n'est possible que pour un compte NOUVEAU : un compte existant
  (même pas encore activé) ne peut recevoir qu'une invitation, son mot de passe n'est jamais fixé ici.
- Désactiver ou retirer un collaborateur ferme ses sessions s'il n'a plus aucun restaurant accessible ;
  ses WebSockets ouvertes revérifient aussitôt leurs droits.
- Personne ne modifie son propre rôle, ses permissions ou son statut.
- Un membre qui n'est pas propriétaire ne peut pas accorder une permission qu'il n'a pas lui-même.
- Deux modes de création : invitation par email (lien d'activation, par défaut) ou création directe avec un
  mot de passe initial, jamais envoyé par email, à changer obligatoirement à la première connexion.
- « Retirer » supprime l'appartenance au restaurant ; le compte n'est supprimé que s'il n'a jamais été
  activé et n'appartient à aucun autre restaurant (sinon il reste, géré par le super admin).
"""

import uuid
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Query
from pydantic import EmailStr, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.access import (
    broadcast_access_changed,
    can_manage_member,
    revoke_if_no_access,
)
from app.core.audit import audit
from app.core.deps import AnyMember, Can, RestaurantContext, Session
from app.core.errors import Conflict, Forbidden, NotFound, Unprocessable
from app.core.permissions import CATALOG, ROLE_PERMISSIONS, Perm, effective_permissions, normalize_overrides
from app.core.schema import Schema
from app.core.security import hash_password
from app.models import ActivationToken, AuditLog, KitchenStation, Membership, User
from app.models.enums import AccountType, MemberRole, TokenPurpose
from app.modules.accounts import ensure_account, issue_link, send_activation_email

router = APIRouter(prefix="/api/restaurants/{restaurant_id}", tags=["team"])

InviteStatus = Literal["PENDING", "EXPIRED"]


# ── Schémas ─────────────────────────────────────────────


class MemberOut(Schema):
    id: uuid.UUID
    user_id: uuid.UUID
    email: str
    full_name: str
    phone: str | None
    role: MemberRole
    is_active: bool
    # Le compte a-t-il choisi son mot de passe ? (sinon : invitation en attente ou expirée)
    activated: bool
    must_change_password: bool
    invite_status: InviteStatus | None
    invite_expires_at: datetime | None
    station_id: uuid.UUID | None
    station_name: str | None
    permissions: list[Perm]  # permissions effectives
    permission_overrides: dict[str, bool]  # ajustements par rapport au rôle
    # Nom et téléphone modifiables par le restaurant : compte rattaché uniquement à ce restaurant.
    editable_profile: bool
    last_login_at: datetime | None
    created_at: datetime
    # Renseignés à l'ajout / au renvoi de l'invitation : lien à transmettre si l'email n'est pas parti.
    activation_url: str | None = None
    email_sent: bool | None = None


class MemberCreate(Schema):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    role: MemberRole
    phone: str | None = Field(default=None, max_length=32)
    # invite : lien d'activation par email (recommandé) ; password : mot de passe initial défini ici.
    mode: Literal["invite", "password"] = "invite"
    password: str | None = Field(default=None, min_length=10, max_length=200)
    permissions: list[Perm] | None = None  # permissions sur mesure (sinon : celles du rôle)
    station_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _password_for_direct(self):
        if self.mode == "password" and not self.password:
            raise ValueError("Mot de passe initial requis pour une création directe")
        if self.mode == "invite" and self.password:
            raise ValueError("Pas de mot de passe pour une invitation par email")
        return self


class MemberUpdate(Schema):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=32)
    role: MemberRole | None = None
    is_active: bool | None = None
    station_id: uuid.UUID | None = None
    permissions: list[Perm] | None = None  # ensemble complet souhaité
    reset_permissions: bool = False  # revenir aux permissions du rôle


class PermissionItem(Schema):
    key: Perm
    label: str


class PermissionGroup(Schema):
    label: str
    items: list[PermissionItem]


class PermissionCatalog(Schema):
    groups: list[PermissionGroup]
    role_defaults: dict[MemberRole, list[Perm]]
    # Rôles que l'utilisateur courant peut attribuer / gérer (hiérarchie), du plus élevé au plus bas.
    assignable_roles: list[MemberRole]


# ── Utilitaires ─────────────────────────────────────────


async def _invites(session, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, datetime]:
    """Date d'expiration du dernier lien d'activation non utilisé de chaque compte."""
    if not user_ids:
        return {}
    rows = await session.execute(
        select(ActivationToken.user_id, func.max(ActivationToken.expires_at))
        .where(
            ActivationToken.user_id.in_(user_ids),
            ActivationToken.purpose == TokenPurpose.ACTIVATION,
            ActivationToken.used_at.is_(None),
        )
        .group_by(ActivationToken.user_id)
    )
    return dict(rows.all())


async def _shared_accounts(session, restaurant_id: uuid.UUID, user_ids: list[uuid.UUID]) -> set[uuid.UUID]:
    """Comptes rattachés à au moins un AUTRE restaurant."""
    if not user_ids:
        return set()
    rows = await session.scalars(
        select(Membership.user_id).where(Membership.user_id.in_(user_ids), Membership.restaurant_id != restaurant_id)
    )
    return set(rows)


def _out(m: Membership, *, expires: datetime | None, shared: bool) -> MemberOut:
    u = m.user
    now = datetime.now(UTC)
    invite_status: InviteStatus | None = None
    if u.activated_at is None:
        invite_status = "PENDING" if expires and expires > now else "EXPIRED"
    return MemberOut(
        id=m.id,
        user_id=u.id,
        email=u.email,
        full_name=u.full_name,
        phone=u.phone,
        role=m.role,
        is_active=m.is_active,
        activated=u.activated_at is not None,
        must_change_password=u.must_change_password,
        invite_status=invite_status,
        invite_expires_at=expires if u.activated_at is None else None,
        station_id=m.station_id,
        station_name=m.station.name if m.station_id and m.station else None,
        permissions=sorted(effective_permissions(m.role, m.permission_overrides)),
        permission_overrides=m.permission_overrides or {},
        editable_profile=not shared and not u.is_superadmin,
        last_login_at=u.last_login_at,
        created_at=m.created_at,
    )


async def _member_out(session, ctx: RestaurantContext, m: Membership) -> MemberOut:
    expires = (await _invites(session, [m.user_id])).get(m.user_id)
    shared = m.user_id in await _shared_accounts(session, ctx.restaurant.id, [m.user_id])
    return _out(m, expires=expires, shared=shared)


async def _get_member(session, ctx: RestaurantContext, member_id: uuid.UUID) -> Membership:
    m = await session.scalar(
        select(Membership)
        .where(Membership.id == member_id, Membership.restaurant_id == ctx.restaurant.id)
        .options(selectinload(Membership.user), selectinload(Membership.station))
        .execution_options(populate_existing=True)
    )
    if not m:
        raise NotFound("Collaborateur introuvable")
    return m


def _is_owner(ctx: RestaurantContext) -> bool:
    return ctx.is_superadmin or ctx.role == MemberRole.OWNER


def _check_role(ctx: RestaurantContext, role: MemberRole) -> None:
    """Rôle attribuable : strictement inférieur à celui de l'auteur (propriétaire : tous)."""
    if role == MemberRole.OWNER and not _is_owner(ctx):
        raise Forbidden("Seul un propriétaire peut nommer un propriétaire", code="owner_only")
    if not can_manage_member(ctx.role, role, superadmin=ctx.is_superadmin):
        raise Forbidden("Vous ne pouvez attribuer qu'un rôle inférieur au vôtre", code="role_too_high")


def _check_target(ctx: RestaurantContext, m: Membership) -> None:
    """Collaborateur modifiable : rôle strictement inférieur à celui de l'auteur, jamais un super admin."""
    if m.user.is_superadmin and not ctx.is_superadmin:
        raise Forbidden("Ce compte est administré par la plateforme OmegaSen", code="superadmin_protected")
    if m.role == MemberRole.OWNER and not _is_owner(ctx):
        raise Forbidden("Seul un propriétaire peut modifier un propriétaire", code="owner_only")
    if not can_manage_member(ctx.role, m.role, superadmin=ctx.is_superadmin):
        raise Forbidden("Vous ne pouvez gérer que des collaborateurs de rang inférieur", code="role_too_high")


def _check_grant(ctx: RestaurantContext, role: MemberRole, perms: frozenset[Perm]) -> None:
    """Rôle attribuable, et un non-propriétaire n'accorde jamais plus que ses propres droits."""
    _check_role(ctx, role)
    if not _is_owner(ctx) and not perms <= ctx.perms:
        missing = sorted(p.value for p in perms - ctx.perms)
        raise Forbidden(
            "Vous ne pouvez pas accorder des permissions que vous n'avez pas", code="grant_exceeds", details=missing
        )


async def _check_station(session, ctx: RestaurantContext, station_id: uuid.UUID | None) -> None:
    if station_id is None:
        return
    st = await session.get(KitchenStation, station_id)
    if not st or st.restaurant_id != ctx.restaurant.id:
        raise Unprocessable("Poste introuvable pour ce restaurant", code="station_not_found")


async def _ensure_other_owner(session, ctx: RestaurantContext, m: Membership) -> None:
    if m.role != MemberRole.OWNER or not m.is_active:
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


def _plain(v):
    """Valeur sérialisable pour le journal d'activité."""
    return v if v is None or isinstance(v, bool | dict | int) else str(v)


def _context_text(ctx: RestaurantContext) -> str:
    return f"Vous avez été ajouté(e) à l'équipe du restaurant « {ctx.restaurant.name} » sur OmegaSen."


# ── Routes ──────────────────────────────────────────────


@router.get("/permissions/catalog", response_model=PermissionCatalog)
async def permission_catalog(ctx: AnyMember):
    """Libellés des permissions et préréglages de chaque rôle (pour la grille de l'interface)."""
    return PermissionCatalog(
        groups=[
            PermissionGroup(label=label, items=[PermissionItem(key=p, label=t) for p, t in items])
            for label, items in CATALOG
        ],
        role_defaults={r: sorted(ps) for r, ps in ROLE_PERMISSIONS.items()},
        assignable_roles=[r for r in MemberRole if can_manage_member(ctx.role, r, superadmin=ctx.is_superadmin)],
    )


@router.get("/members", response_model=list[MemberOut])
async def list_members(ctx: Can(Perm.TEAM_VIEW), session: Session):
    rows = list(
        await session.scalars(
            select(Membership)
            .where(Membership.restaurant_id == ctx.restaurant.id)
            .options(selectinload(Membership.user), selectinload(Membership.station))
            .order_by(Membership.created_at)
        )
    )
    ids = [m.user_id for m in rows]
    invites = await _invites(session, ids)
    shared = await _shared_accounts(session, ctx.restaurant.id, ids)
    return [_out(m, expires=invites.get(m.user_id), shared=m.user_id in shared) for m in rows]


@router.post("/members", response_model=MemberOut, status_code=201)
async def add_member(body: MemberCreate, ctx: Can(Perm.TEAM_MANAGE), session: Session):
    wanted = frozenset(body.permissions) if body.permissions is not None else ROLE_PERMISSIONS[body.role]
    _check_grant(ctx, body.role, effective_permissions(body.role, normalize_overrides(body.role, set(wanted))))
    await _check_station(session, ctx, body.station_id)

    existing = await session.scalar(select(User).where(User.email == body.email.lower()))
    if existing is not None and existing.is_superadmin:
        raise Forbidden("Ce compte est administré par la plateforme OmegaSen", code="superadmin_protected")
    if existing is not None and body.mode == "password":
        # Jamais de mot de passe fixé sur un compte qui existe déjà (même non activé) : il appartient à
        # quelqu'un d'autre (invitation d'un autre restaurant, compte créé par la plateforme…).
        raise Conflict(
            "Un compte existe déjà avec cet email : ajoutez-le par invitation", code="account_exists_use_invite"
        )
    user, needs_activation = await ensure_account(session, body.email, body.full_name, phone=body.phone)
    if await session.scalar(
        select(Membership.id).where(Membership.user_id == user.id, Membership.restaurant_id == ctx.restaurant.id)
    ):
        raise Conflict("Cette personne fait déjà partie de l'équipe", code="already_member")

    url = None
    if needs_activation:
        if body.mode == "password":
            # Création directe : mot de passe initial (Argon2id), à changer à la première connexion.
            user.password_hash = hash_password(body.password)
            user.must_change_password = True
            user.activated_at = datetime.now(UTC)
        else:
            url = await issue_link(session, user)
    # Compte déjà actif (autre restaurant) : on l'ajoute simplement, son mot de passe ne change pas.

    m = Membership(
        user_id=user.id,
        restaurant_id=ctx.restaurant.id,
        role=body.role,
        permission_overrides=normalize_overrides(body.role, set(wanted)) if body.role != MemberRole.OWNER else {},
        station_id=body.station_id,
        invited_by_id=ctx.user.id,
    )
    session.add(m)
    await session.flush()
    audit(
        session,
        "member.added",
        actor_id=ctx.user.id,
        restaurant_id=ctx.restaurant.id,
        entity="User",
        entity_id=user.id,
        data={
            "role": body.role,
            "mode": body.mode if needs_activation else "existing_account",
            "overrides": m.permission_overrides,
        },
    )
    await session.commit()
    await broadcast_access_changed(user_ids=[user.id])
    out = await _member_out(session, ctx, await _get_member(session, ctx, m.id))
    if url:
        out.activation_url = url
        out.email_sent = await send_activation_email(user, url, context=_context_text(ctx))
    return out


@router.post("/members/{member_id}/resend-invite", response_model=MemberOut)
async def resend_invite(member_id: uuid.UUID, ctx: Can(Perm.TEAM_MANAGE), session: Session):
    m = await _get_member(session, ctx, member_id)
    _check_target(ctx, m)
    if m.user.activated_at is not None:
        raise Conflict("Ce compte est déjà activé", code="already_activated")
    url = await issue_link(session, m.user)  # invalide les liens précédents
    audit(
        session,
        "member.invite_resent",
        actor_id=ctx.user.id,
        restaurant_id=ctx.restaurant.id,
        entity="User",
        entity_id=m.user_id,
    )
    await session.commit()
    out = await _member_out(session, ctx, await _get_member(session, ctx, member_id))
    out.activation_url = url
    out.email_sent = await send_activation_email(m.user, url, context=_context_text(ctx))
    return out


@router.patch("/members/{member_id}", response_model=MemberOut)
async def update_member(member_id: uuid.UUID, body: MemberUpdate, ctx: Can(Perm.TEAM_MANAGE), session: Session):
    m = await _get_member(session, ctx, member_id)
    data = body.model_dump(exclude_unset=True)
    if m.user_id == ctx.user.id and set(data) & {"role", "is_active", "permissions", "reset_permissions"}:
        raise Forbidden("Vous ne pouvez pas modifier votre propre rôle ou vos permissions", code="self_edit")
    if m.user_id != ctx.user.id:
        _check_target(ctx, m)

    changes: dict = {}
    # Profil (nom, téléphone) : seulement pour un compte propre à ce restaurant.
    if "full_name" in data or "phone" in data:
        if m.user_id in await _shared_accounts(session, ctx.restaurant.id, [m.user_id]) or m.user.is_superadmin:
            raise Forbidden(
                "Ce compte est aussi utilisé dans un autre établissement : seul son titulaire peut le modifier",
                code="shared_account",
            )
        if body.full_name:
            changes["full_name"] = [m.user.full_name, body.full_name.strip()]
            m.user.full_name = body.full_name.strip()
        if "phone" in data:
            changes["phone"] = [m.user.phone, body.phone or None]
            m.user.phone = body.phone or None

    new_role = body.role or m.role
    if body.role is not None and body.role != m.role:
        if m.role == MemberRole.OWNER:
            await _ensure_other_owner(session, ctx, m)
        changes["role"] = [m.role, body.role]

    # Permissions : ensemble demandé, retour au rôle, ou conservation des ajustements existants.
    if body.reset_permissions or new_role == MemberRole.OWNER:
        overrides: dict[str, bool] = {}
    elif body.permissions is not None:
        overrides = normalize_overrides(new_role, set(body.permissions))
    elif body.role is not None and body.role != m.role:
        overrides = {}  # changement de rôle : on repart des permissions du nouveau rôle
    else:
        overrides = m.permission_overrides or {}
    new_perms = effective_permissions(new_role, overrides)
    if body.role is not None or body.permissions is not None or body.reset_permissions:
        _check_grant(ctx, new_role, new_perms)
    if overrides != (m.permission_overrides or {}):
        changes["permissions"] = [m.permission_overrides or {}, overrides]
    m.role = new_role
    m.permission_overrides = overrides

    if "station_id" in data:
        await _check_station(session, ctx, body.station_id)
        changes["station_id"] = [
            str(m.station_id) if m.station_id else None,
            str(body.station_id) if body.station_id else None,
        ]
        m.station_id = body.station_id

    if body.is_active is not None and body.is_active != m.is_active:
        if not body.is_active:
            await _ensure_other_owner(session, ctx, m)
        changes["is_active"] = [m.is_active, body.is_active]
        m.is_active = body.is_active

    audit(
        session,
        "member.updated",
        actor_id=ctx.user.id,
        restaurant_id=ctx.restaurant.id,
        entity="User",
        entity_id=m.user_id,
        data={"changes": {k: [_plain(a), _plain(b)] for k, (a, b) in changes.items()}},
    )
    if changes.get("is_active") == [True, False]:
        await session.flush()
        if await revoke_if_no_access(session, m.user):
            audit(
                session,
                "auth.sessions_revoked",
                actor_id=ctx.user.id,
                restaurant_id=ctx.restaurant.id,
                entity="User",
                entity_id=m.user_id,
                data={"reason": "member_deactivated"},
            )
    await session.commit()
    if changes:  # rôle, permissions ou statut : appliqués aussitôt (API, WebSockets, interface)
        await broadcast_access_changed(ctx.restaurant.id, [m.user_id])
    return await _member_out(session, ctx, await _get_member(session, ctx, member_id))


@router.delete("/members/{member_id}", status_code=204)
async def remove_member(member_id: uuid.UUID, ctx: Can(Perm.TEAM_MANAGE), session: Session):
    m = await _get_member(session, ctx, member_id)
    if m.user_id == ctx.user.id:
        raise Forbidden("Vous ne pouvez pas vous retirer vous-même de l'équipe", code="self_edit")
    _check_target(ctx, m)
    await _ensure_other_owner(session, ctx, m)
    user = m.user
    shared = user.id in await _shared_accounts(session, ctx.restaurant.id, [user.id])
    # Compte jamais activé, créé pour ce seul restaurant : supprimé avec l'appartenance.
    delete_account = (
        not shared and user.activated_at is None and not user.is_superadmin and user.account_type == AccountType.STAFF
    )
    await session.delete(m)
    if delete_account:
        await session.delete(user)
    audit(
        session,
        "member.removed",
        actor_id=ctx.user.id,
        restaurant_id=ctx.restaurant.id,
        entity="User",
        entity_id=user.id,
        data={"email": user.email, "role": m.role, "account_deleted": delete_account},
    )
    if not delete_account:
        await session.flush()
        await revoke_if_no_access(session, user)
    await session.commit()
    await broadcast_access_changed(ctx.restaurant.id, [user.id])


# ── Journal d'activité du restaurant ────────────────────


class ActivityOut(Schema):
    id: uuid.UUID
    created_at: datetime
    action: str
    actor_name: str | None
    entity: str | None
    entity_id: str | None
    data: dict


class ActivityPage(Schema):
    items: list[ActivityOut]
    total: int


@router.get("/activity", response_model=ActivityPage)
async def restaurant_activity(
    ctx: Can(Perm.ACTIVITY_VIEW),
    session: Session,
    action: str | None = Query(default=None, max_length=64),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    """Activité de l'équipe sur CE restaurant uniquement (le journal global est réservé au super admin).

    Les actions de la plateforme sont attribuées à « Équipe OmegaSen » sans révéler le compte du super admin.
    """
    cond = [AuditLog.restaurant_id == ctx.restaurant.id]
    if action:
        cond.append(AuditLog.action.ilike(f"{action}%"))
    total = await session.scalar(select(func.count()).select_from(AuditLog).where(*cond))
    rows = await session.execute(
        select(AuditLog, User)
        .outerjoin(User, User.id == AuditLog.actor_id)
        .where(*cond)
        .order_by(AuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = []
    for a, u in rows:
        actor = None if u is None else ("Équipe OmegaSen" if u.is_superadmin else u.full_name)
        items.append(
            ActivityOut(
                id=a.id,
                created_at=a.created_at,
                action=a.action,
                actor_name=actor,
                entity=a.entity,
                entity_id=a.entity_id,
                data=a.data or {},
            )
        )
    return ActivityPage(items=items, total=total or 0)
