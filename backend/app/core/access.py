"""Règles d'accès centrales : hiérarchie des rôles, statut des restaurants, révocation des sessions.

Deux niveaux strictement séparés :
- **plateforme** : le super admin (`User.is_superadmin`) a tous les droits, sur tous les restaurants, quel que
  soit leur statut, sans être membre d'aucun restaurant ;
- **restaurant** : un membre agit selon son rôle et ses permissions (app/core/permissions.py), et seulement
  si le statut du restaurant le permet (`restaurant_block`).

Le statut du restaurant est la règle centrale : suspendre ou fermer un restaurant ne modifie AUCUN compte.
Le blocage est calculé à chaque requête à partir du statut ; à la réactivation, les comptes encore actifs
retrouvent donc leurs accès, leurs rôles et leurs permissions, tandis qu'un compte désactivé individuellement
reste bloqué.
"""

import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Membership, RefreshToken, Restaurant, User
from app.models.enums import AccountType, MemberRole, RestaurantStatus

# ── Hiérarchie des rôles ────────────────────────────────

R = MemberRole
ROLE_RANK: dict[MemberRole, int] = {
    R.OWNER: 100,
    R.ADMIN: 80,
    R.MANAGER: 60,
    R.CASHIER: 20,
    R.WAITER: 20,
    R.KITCHEN: 20,
    R.STAFF: 10,
}
assert set(ROLE_RANK) == set(MemberRole)

# Rôles autorisés à préparer un restaurant en attente d'activation (menu, paramètres, équipe).
SETUP_ROLES = frozenset({R.OWNER, R.ADMIN})


def can_manage_member(actor_role: MemberRole | None, target_role: MemberRole, *, superadmin: bool = False) -> bool:
    """Un membre ne gère que les rôles strictement inférieurs au sien ; un propriétaire gère tout le monde."""
    if superadmin or actor_role == R.OWNER:
        return True
    return actor_role is not None and ROLE_RANK[actor_role] > ROLE_RANK[target_role]


# ── Statut du restaurant ────────────────────────────────

SUSPENDED_MESSAGE = (
    "Votre restaurant a été temporairement suspendu. Veuillez contacter l'administrateur de la plateforme OmegaSen."
)
CLOSED_MESSAGE = "Votre restaurant est fermé. Veuillez contacter l'administrateur de la plateforme OmegaSen."
PENDING_MESSAGE = (
    "Votre restaurant n'est pas encore activé. Il sera accessible dès son activation par l'équipe OmegaSen."
)


@dataclass(frozen=True)
class AccessBlock:
    code: str
    message: str
    restaurant_id: uuid.UUID | None = None
    restaurant_name: str | None = None

    def details(self) -> dict:
        return {
            "restaurant_id": str(self.restaurant_id) if self.restaurant_id else None,
            "restaurant_name": self.restaurant_name,
        }


def restaurant_block(restaurant: Restaurant, role: MemberRole | None) -> AccessBlock | None:
    """Raison pour laquelle un membre de ce rôle ne peut pas utiliser ce restaurant (None = accès permis)."""
    if restaurant.deleted_at is not None or restaurant.status == RestaurantStatus.CLOSED:
        code, message = "restaurant_closed", CLOSED_MESSAGE
    elif restaurant.status == RestaurantStatus.SUSPENDED:
        code, message = "restaurant_suspended", SUSPENDED_MESSAGE
    elif restaurant.status == RestaurantStatus.PENDING and role not in SETUP_ROLES:
        code, message = "restaurant_pending", PENDING_MESSAGE
    else:
        return None
    return AccessBlock(code, message, restaurant.id, restaurant.name)


async def account_block(session: AsyncSession, user: User) -> AccessBlock | None:
    """Blocage du compte entier : membre d'au moins un restaurant, et tous ses restaurants sont inaccessibles.

    Un compte rattaché à plusieurs restaurants garde l'accès aux restaurants actifs (les autres sont refusés
    restaurant par restaurant). Un client (sans restaurant) et le super admin ne sont jamais bloqués ici.
    """
    if user.is_superadmin:
        return None
    rows = (
        await session.execute(
            select(Membership.role, Restaurant)
            .join(Restaurant, Restaurant.id == Membership.restaurant_id)
            .where(Membership.user_id == user.id, Membership.is_active.is_(True))
        )
    ).all()
    if not rows:
        return None
    blocks = [restaurant_block(r, role) for role, r in rows]
    if any(b is None for b in blocks):
        return None
    # Message le plus grave d'abord : suspension, fermeture, attente.
    order = {"restaurant_suspended": 0, "restaurant_closed": 1, "restaurant_pending": 2}
    return min(blocks, key=lambda b: order[b.code])


async def user_access(user_id: uuid.UUID) -> bool:
    """Compte toujours actif et non bloqué par le statut de ses restaurants (relu en base)."""
    from app.core.db import SessionLocal

    async with SessionLocal() as session:
        user = await session.get(User, user_id)
        return bool(user and user.is_active and not await account_block(session, user))


# ── Sessions ────────────────────────────────────────────


async def revoke_sessions(session: AsyncSession, user_ids: Iterable[uuid.UUID]) -> int:
    """Révoque tous les jetons de rafraîchissement : plus aucun renouvellement de session possible.

    Les jetons d'accès (15 min) déjà émis restent signés, mais chaque requête revérifie le compte et le statut
    des restaurants (app/core/deps.py) : ils deviennent inutilisables dès maintenant.
    """
    ids = list(dict.fromkeys(user_ids))
    if not ids:
        return 0
    res = await session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id.in_(ids), RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
    return res.rowcount or 0


async def revoke_blocked_members(session: AsyncSession, restaurant_id: uuid.UUID) -> list[uuid.UUID]:
    """Après un changement de statut : ferme les sessions des membres qui n'ont plus aucun accès."""
    users = await session.scalars(
        select(User)
        .join(Membership, Membership.user_id == User.id)
        .where(Membership.restaurant_id == restaurant_id, User.is_superadmin.is_(False))
    )
    blocked = [u.id for u in users.unique() if await account_block(session, u)]
    await revoke_sessions(session, blocked)
    return blocked


async def revoke_if_no_access(session: AsyncSession, user: User) -> bool:
    """Après un retrait / une désactivation d'appartenance : un compte du personnel sans plus aucun
    restaurant actif perd ses sessions (un client garde les siennes)."""
    if user.is_superadmin or user.account_type == AccountType.CUSTOMER:
        return False
    active = await session.scalar(
        select(Membership.id).where(Membership.user_id == user.id, Membership.is_active.is_(True)).limit(1)
    )
    if active is None or await account_block(session, user):
        await revoke_sessions(session, [user.id])
        return True
    return False


async def broadcast_access_changed(restaurant_id: uuid.UUID | None = None, user_ids: Iterable[uuid.UUID] = ()) -> None:
    """Prévient les WebSockets ouvertes : elles revérifient les droits (et se ferment s'ils ont disparu),
    et l'interface recharge le profil (rôle, permissions, statut des restaurants)."""
    from app.core.realtime import ACCESS_CHANGED, publish, restaurant_channel, user_channel

    if restaurant_id:
        await publish(restaurant_channel(restaurant_id), ACCESS_CHANGED, {"restaurant_id": str(restaurant_id)})
    for uid in dict.fromkeys(user_ids):
        await publish(user_channel(uid), ACCESS_CHANGED, {})
