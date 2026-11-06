"""Dépendances FastAPI : utilisateur courant, rôles, contexte restaurant (isolation multi-tenant).

Contrôles centralisés, dans cet ordre, pour chaque requête authentifiée :
1. jeton d'accès valide (authentifié) ;
2. compte existant et actif (`User.is_active`, relu en base à chaque requête) ;
3. mot de passe initial déjà changé ;
4. compte non bloqué par le statut de ses restaurants (app/core/access.py, `account_block`) ;
puis, pour toute route sous /api/restaurants/{restaurant_id}/... (`require_perm` / `Can(...)`) :
5. appartenance active au restaurant (sinon 404 : l'existence d'un restaurant tiers n'est pas révélée) ;
6. statut du restaurant compatible avec le rôle (`restaurant_block`) ;
7. permission précise exigée par la route.
Chaque route charge ensuite ses ressources filtrées par `restaurant_id` (une ressource d'un autre
restaurant renvoie 404). Le super admin passe les étapes 4 à 7 sur tous les restaurants.
"""

import uuid
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Path, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.access import account_block, restaurant_block
from app.core.db import get_session
from app.core.errors import Forbidden, NotFound, Unauthorized
from app.core.permissions import ALL, Perm, effective_permissions
from app.core.security import decode_access_token
from app.models import Membership, Restaurant, User
from app.models.enums import MemberRole

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


# Routes accessibles tant que le mot de passe initial n'a pas été changé.
PASSWORD_CHANGE_ALLOWED = {"/api/auth/me", "/api/auth/change-password", "/api/auth/logout", "/api/auth/refresh"}
# Routes accessibles à un compte bloqué par le statut de ses restaurants : profil (pour afficher le motif)
# et déconnexion.
BLOCKED_ALLOWED = {"/api/auth/me", "/api/auth/logout"}


async def current_user(request: Request, session: Session) -> User:
    user = await load_user_from_token(session, _bearer(request))
    if user.must_change_password and request.url.path not in PASSWORD_CHANGE_ALLOWED:
        raise Forbidden(
            "Vous devez changer votre mot de passe initial avant de continuer", code="password_change_required"
        )
    if request.url.path not in BLOCKED_ALLOWED:
        block = await account_block(session, user)
        if block:
            raise Forbidden(block.message, code=block.code, details=block.details())
    return user


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
    perms: frozenset[Perm] = frozenset()
    membership: Membership | None = None

    @property
    def is_superadmin(self) -> bool:
        return self.user.is_superadmin

    def has(self, *roles: MemberRole) -> bool:
        return self.is_superadmin or (self.role in roles)

    def can(self, *perms: Perm) -> bool:
        return self.is_superadmin or all(p in self.perms for p in perms)

    def require(self, *perms: Perm) -> None:
        """Contrôle complémentaire dans une route (ex. modification d'un prix)."""
        if not self.can(*perms):
            raise Forbidden("Vous n'avez pas la permission pour cette action", code="permission_denied")


async def resolve_context(
    session: AsyncSession,
    user: User,
    restaurant_id: uuid.UUID,
    roles: tuple[MemberRole, ...] = (),
    perms: tuple[Perm, ...] = (),
) -> RestaurantContext:
    restaurant = await session.get(Restaurant, restaurant_id)
    if not restaurant or restaurant.deleted_at is not None:
        raise NotFound("Restaurant introuvable")
    if user.is_superadmin:
        return RestaurantContext(user, restaurant, None, ALL)
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
    # Statut du restaurant : règle centrale, vérifiée à chaque requête (aucun compte n'est modifié).
    block = restaurant_block(restaurant, membership.role)
    if block:
        raise Forbidden(block.message, code=block.code, details=block.details())
    if roles and membership.role not in roles:
        raise Forbidden("Votre rôle ne permet pas cette action")
    effective = effective_permissions(membership.role, membership.permission_overrides)
    ctx = RestaurantContext(user, restaurant, membership.role, effective, membership)
    if perms and not ctx.can(*perms):
        raise Forbidden("Vous n'avez pas la permission pour cette action", code="permission_denied")
    return ctx


def require_roles(*roles: MemberRole):
    async def dep(
        user: CurrentUser,
        session: Session,
        restaurant_id: Annotated[uuid.UUID, Path()],
    ) -> RestaurantContext:
        return await resolve_context(session, user, restaurant_id, roles)

    return dep


def require_perm(*perms: Perm):
    """Exige toutes les permissions indiquées sur le restaurant de l'URL (membre actif ou super admin)."""

    async def dep(
        user: CurrentUser,
        session: Session,
        restaurant_id: Annotated[uuid.UUID, Path()],
    ) -> RestaurantContext:
        return await resolve_context(session, user, restaurant_id, perms=perms)

    return dep


def Can(*perms: Perm):  # noqa: N802 — s'utilise comme un type : `ctx: Can(Perm.MENU_EDIT)`
    return Annotated[RestaurantContext, Depends(require_perm(*perms))]


# Tout membre actif du restaurant (lecture de base).
AnyMember = Annotated[RestaurantContext, Depends(require_perm())]
Owner = Annotated[RestaurantContext, Depends(require_roles(MemberRole.OWNER))]
