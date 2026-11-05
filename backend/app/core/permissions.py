"""Contrôle d'accès par rôle (RBAC) : table unique des permissions de chaque rôle de restaurant.

Le super admin (drapeau global) a toutes les permissions sur tous les restaurants.
Les dépendances FastAPI (app/core/deps.py) et l'interface (via /api/auth/me) s'appuient sur cette table.
"""

from enum import StrEnum

from app.models.enums import MemberRole


class Perm(StrEnum):
    RESTAURANT_VIEW = "restaurant.view"
    RESTAURANT_EDIT = "restaurant.edit"  # informations, horaires, images, paramètres
    MENU_MANAGE = "menu.manage"  # catégories, plats, options, prix
    STOCK_MANAGE = "stock.manage"  # disponibilité / ruptures
    QR_MANAGE = "qr.manage"
    TEAM_MANAGE = "team.manage"  # créer et gérer les comptes de l'équipe
    ORDERS_HISTORY = "orders.history"  # historique et recherche des commandes
    ORDERS_CREATE = "orders.create"  # prise de commande au guichet
    ORDERS_PREPARE = "orders.prepare"  # écran cuisine, changements de statut
    ORDERS_CANCEL = "orders.cancel"
    PAYMENTS_RECORD = "payments.record"  # encaissement
    PAYMENTS_REFUND = "payments.refund"
    RESERVATIONS_MANAGE = "reservations.manage"
    STATS_VIEW = "stats.view"  # statistiques et chiffre d'affaires


_ALL = frozenset(Perm)

ROLE_PERMISSIONS: dict[MemberRole, frozenset[Perm]] = {
    # Administrateur du restaurant (propriétaire)
    MemberRole.OWNER: _ALL,
    # Responsable : gère tout le restaurant comme le propriétaire, sauf qu'il ne peut ni nommer ni retirer
    # de propriétaire (règle appliquée dans le module équipe).
    MemberRole.MANAGER: _ALL,
    # Caisse : prise de commande, encaissement, suivi, réservations
    MemberRole.CASHIER: frozenset(
        {
            Perm.RESTAURANT_VIEW,
            Perm.STOCK_MANAGE,
            Perm.ORDERS_HISTORY,
            Perm.ORDERS_CREATE,
            Perm.ORDERS_PREPARE,
            Perm.ORDERS_CANCEL,
            Perm.PAYMENTS_RECORD,
            Perm.RESERVATIONS_MANAGE,
        }
    ),
    # Cuisine : uniquement la préparation des commandes et les ruptures
    MemberRole.KITCHEN: frozenset({Perm.RESTAURANT_VIEW, Perm.STOCK_MANAGE, Perm.ORDERS_PREPARE}),
}


def permissions_for(role: MemberRole | None, *, superadmin: bool = False) -> frozenset[Perm]:
    if superadmin:
        return _ALL
    return ROLE_PERMISSIONS.get(role, frozenset()) if role else frozenset()


def roles_with(perm: Perm) -> tuple[MemberRole, ...]:
    """Rôles disposant d'une permission (pour construire les dépendances d'accès)."""
    return tuple(r for r in MemberRole if perm in ROLE_PERMISSIONS[r])
