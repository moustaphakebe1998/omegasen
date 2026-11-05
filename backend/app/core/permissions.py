"""Contrôle d'accès (RBAC) avec permissions granulaires.

- Chaque rôle de restaurant a des permissions par défaut (ROLE_PERMISSIONS).
- Le propriétaire (ou un membre ayant `team.manage`) peut ajuster les permissions d'un collaborateur :
  `Membership.permission_overrides = {"menu.delete": false, "stats.view": true, …}`.
- Le propriétaire a toujours toutes les permissions (non modifiable). Le super admin aussi, partout.
- Les routes du backend exigent une permission précise (app/core/deps.py : `require_perm`), et l'interface
  reçoit les permissions effectives via /api/auth/me.
"""

from enum import StrEnum

from app.models.enums import MemberRole


class Perm(StrEnum):
    # Établissement
    RESTAURANT_VIEW = "restaurant.view"
    RESTAURANT_EDIT = "restaurant.edit"  # informations, coordonnées, horaires
    SETTINGS_EDIT = "settings.edit"  # paramètres de commande et de réservation, postes de cuisine
    MEDIA_MANAGE = "media.manage"  # logo, couverture, galerie, photos des plats
    QR_MANAGE = "qr.manage"
    # Menu
    MENU_VIEW = "menu.view"
    MENU_CREATE = "menu.create"  # nouvelles catégories et nouveaux plats
    MENU_EDIT = "menu.edit"  # noms, descriptions, options, ordre (hors prix)
    MENU_DELETE = "menu.delete"
    PRICES_EDIT = "prices.edit"  # prix, promotions, suppléments payants
    STOCK_MANAGE = "stock.manage"  # disponibilité / ruptures
    # Commandes et paiements
    ORDERS_HISTORY = "orders.history"
    ORDERS_CREATE = "orders.create"  # prise de commande au guichet
    ORDERS_PREPARE = "orders.prepare"  # écran cuisine, avancement des commandes
    ORDERS_CANCEL = "orders.cancel"
    PAYMENTS_RECORD = "payments.record"
    PAYMENTS_REFUND = "payments.refund"
    # Réservations, statistiques, équipe
    RESERVATIONS_VIEW = "reservations.view"
    RESERVATIONS_MANAGE = "reservations.manage"
    STATS_VIEW = "stats.view"
    TEAM_VIEW = "team.view"
    TEAM_MANAGE = "team.manage"


ALL = frozenset(Perm)

# Libellés et regroupement pour l'interface (grille de permissions).
CATALOG: list[tuple[str, list[tuple[Perm, str]]]] = [
    (
        "Établissement",
        [
            (Perm.RESTAURANT_VIEW, "Consulter les informations du restaurant"),
            (Perm.RESTAURANT_EDIT, "Modifier les informations et les horaires"),
            (Perm.SETTINGS_EDIT, "Modifier les paramètres de fonctionnement et les postes"),
            (Perm.MEDIA_MANAGE, "Gérer le logo, les photos et la galerie"),
            (Perm.QR_MANAGE, "Personnaliser le QR Code"),
        ],
    ),
    (
        "Menu",
        [
            (Perm.MENU_VIEW, "Consulter le menu"),
            (Perm.MENU_CREATE, "Ajouter des catégories et des plats"),
            (Perm.MENU_EDIT, "Modifier les plats, options et l'ordre"),
            (Perm.MENU_DELETE, "Supprimer des catégories et des plats"),
            (Perm.PRICES_EDIT, "Modifier les prix, promotions et suppléments"),
            (Perm.STOCK_MANAGE, "Indiquer les ruptures de stock"),
        ],
    ),
    (
        "Commandes et paiements",
        [
            (Perm.ORDERS_HISTORY, "Consulter l'historique des commandes"),
            (Perm.ORDERS_CREATE, "Prendre des commandes au guichet"),
            (Perm.ORDERS_PREPARE, "Préparer les commandes (écran cuisine)"),
            (Perm.ORDERS_CANCEL, "Annuler des commandes"),
            (Perm.PAYMENTS_RECORD, "Encaisser"),
            (Perm.PAYMENTS_REFUND, "Rembourser"),
        ],
    ),
    (
        "Réservations, statistiques et équipe",
        [
            (Perm.RESERVATIONS_VIEW, "Consulter les réservations"),
            (Perm.RESERVATIONS_MANAGE, "Gérer les réservations"),
            (Perm.STATS_VIEW, "Consulter les statistiques et le chiffre d'affaires"),
            (Perm.TEAM_VIEW, "Consulter l'équipe"),
            (Perm.TEAM_MANAGE, "Gérer l'équipe et les permissions"),
        ],
    ),
]
assert {p for _, items in CATALOG for p, _ in items} == ALL, "CATALOG doit couvrir toutes les permissions"

ROLE_PERMISSIONS: dict[MemberRole, frozenset[Perm]] = {
    # Administrateur du restaurant : tout, toujours.
    MemberRole.OWNER: ALL,
    # Responsable : tout par défaut (le propriétaire peut restreindre) ; ne peut jamais nommer de propriétaire.
    MemberRole.MANAGER: ALL,
    MemberRole.CASHIER: frozenset(
        {
            Perm.RESTAURANT_VIEW,
            Perm.MENU_VIEW,
            Perm.STOCK_MANAGE,
            Perm.ORDERS_HISTORY,
            Perm.ORDERS_CREATE,
            Perm.ORDERS_PREPARE,
            Perm.ORDERS_CANCEL,
            Perm.PAYMENTS_RECORD,
            Perm.RESERVATIONS_VIEW,
            Perm.RESERVATIONS_MANAGE,
        }
    ),
    MemberRole.KITCHEN: frozenset({Perm.RESTAURANT_VIEW, Perm.MENU_VIEW, Perm.STOCK_MANAGE, Perm.ORDERS_PREPARE}),
}


def effective_permissions(
    role: MemberRole | None, overrides: dict | None = None, *, superadmin: bool = False
) -> frozenset[Perm]:
    """Permissions effectives : préréglage du rôle, puis ajustements (ignorés pour le propriétaire)."""
    if superadmin or role == MemberRole.OWNER:
        return ALL
    if role is None:
        return frozenset()
    perms = set(ROLE_PERMISSIONS[role])
    for key, granted in (overrides or {}).items():
        try:
            p = Perm(key)
        except ValueError:
            continue  # permission retirée du catalogue : ignorée
        if granted:
            perms.add(p)
        else:
            perms.discard(p)
    return frozenset(perms)


def permissions_for(role: MemberRole | None, *, superadmin: bool = False) -> frozenset[Perm]:
    """Préréglage d'un rôle (sans ajustement)."""
    return effective_permissions(role, None, superadmin=superadmin)


def normalize_overrides(role: MemberRole, wanted: set[Perm]) -> dict[str, bool]:
    """Transforme un ensemble de permissions souhaitées en ajustements minimaux par rapport au rôle."""
    base = ROLE_PERMISSIONS[role]
    overrides = {p.value: True for p in wanted - base}
    overrides.update({p.value: False for p in base - wanted})
    return dict(sorted(overrides.items()))
