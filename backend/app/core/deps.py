"""Dépendances FastAPI : utilisateur courant, rôles, contexte restaurant (isolation multi-tenant).

Toute route sous /api/restaurants/{restaurant_id}/... DOIT passer par `require_roles`,
qui vérifie l'appartenance de l'utilisateur au restaurant avant toute lecture/écriture.
"""

import uuid
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Path, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import get_session
from app.core.errors import Forbidden, NotFound, Unauthorized
from app.core.permissions import Perm, roles_with
from app.core.security import decode_access_token
from app.models import Membership, Restaurant, User
from app.models.enums import MemberRole, RestaurantStatus

Session = Annotated[AsyncSession, Depends(get_session)]


def _bearer(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return None


async def load_user_from_token(session: AsyncSession, token: str | None) -> User:
    if not token:
        raise Unauthorized("Authentification requise")
    payload = decode_access_token(token)
    if not payload:
        raise Unauthorized("Session expirée", code="token_expired")
    user = await session.get(User, uuid.UUID(payload["sub"]))
    if not user or not user.is_active:
        raise Unauthorized("Compte désactivé")
    return user


async def current_user(request: Request, session: Session) -> User:
    return await load_user_from_token(session, _bearer(request))


CurrentUser = Annotated[User, Depends(current_user)]


async def optional_user(request: Request, session: Session) -> User | None:
    """Utilisateur connecté s'il y en a un (routes publiques : compte client facultatif)."""
    token = _bearer(request)
    if not token:
        return None
    try:
        return await load_user_from_token(session, token)
    except Unauthorized:
        return None


OptionalUser = Annotated[User | None, Depends(optional_user)]


async def superadmin(user: CurrentUser) -> User:
    if not user.is_superadmin:
        raise Forbidden("Réservé au super administrateur")
    return user


SuperAdmin = Annotated[User, Depends(superadmin)]


@dataclass
class RestaurantContext:
    user: User
    restaurant: Restaurant
    role: MemberRole | None  # None = super admin sans rattachement

    @property
    def is_superadmin(self) -> bool:
        return self.user.is_superadmin

    def has(self, *roles: MemberRole) -> bool:
        return self.is_superadmin or (self.role in roles)


async def resolve_context(
    session: AsyncSession, user: User, restaurant_id: uuid.UUID, roles: tuple[MemberRole, ...]
) -> RestaurantContext:
    restaurant = await session.get(Restaurant, restaurant_id)
    if not restaurant or restaurant.deleted_at is not None:
        raise NotFound("Restaurant introuvable")
    if user.is_superadmin:
        return RestaurantContext(user, restaurant, None)
    membership = await session.scalar(
        select(Membership).where(
            Membership.user_id == user.id,
            Membership.restaurant_id == restaurant_id,
            Membership.is_active.is_(True),
        )
    )
    # 404 plutôt que 403 : ne révèle pas l'existence d'un restaurant tiers.
    if not membership:
        raise NotFound("Restaurant introuvable")
    if restaurant.status == RestaurantStatus.SUSPENDED:
        raise Forbidden("Ce restaurant est suspendu", code="restaurant_suspended")
    if restaurant.status == RestaurantStatus.CLOSED:
        raise Forbidden("Ce restaurant est fermé", code="restaurant_closed")
    if roles and membership.role not in roles:
        raise Forbidden("Votre rôle ne permet pas cette action")
    return RestaurantContext(user, restaurant, membership.role)


# Groupes de rôles dérivés de la table des permissions (app/core/permissions.py).
ALL_ROLES = tuple(MemberRole)
MANAGERS = roles_with(Perm.TEAM_MANAGE)
FRONT_OF_HOUSE = roles_with(Perm.ORDERS_CREATE)
KITCHEN_STAFF = roles_with(Perm.ORDERS_PREPARE)
RESERVATION_STAFF = roles_with(Perm.RESERVATIONS_MANAGE)


def require_roles(*roles: MemberRole):
    async def dep(
        user: CurrentUser,
        session: Session,
        restaurant_id: Annotated[uuid.UUID, Path()],
    ) -> RestaurantContext:
        return await resolve_context(session, user, restaurant_id, roles)

    return dep


AnyMember = Annotated[RestaurantContext, Depends(require_roles(*ALL_ROLES))]
Manager = Annotated[RestaurantContext, Depends(require_roles(*MANAGERS))]
FrontOfHouse = Annotated[RestaurantContext, Depends(require_roles(*FRONT_OF_HOUSE))]
KitchenStaff = Annotated[RestaurantContext, Depends(require_roles(*KITCHEN_STAFF))]
Owner = Annotated[RestaurantContext, Depends(require_roles(MemberRole.OWNER))]
ReservationStaff = Annotated[RestaurantContext, Depends(require_roles(*RESERVATION_STAFF))]
