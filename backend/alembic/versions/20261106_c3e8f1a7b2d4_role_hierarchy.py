"""hiérarchie des rôles : ADMIN, WAITER, STAFF ; nouveau préréglage MANAGER

- élargit la contrainte CHECK de memberships.role (OWNER, ADMIN, MANAGER, CASHIER, WAITER, KITCHEN, STAFF) ;
- le préréglage MANAGER passe de « tout » à la gestion opérationnelle : les ajustements de chaque
  responsable existant sont recalculés pour que ses permissions effectives restent EXACTEMENT les mêmes
  (aucun droit perdu ni gagné). Downgrade : recalcul inverse, puis contrainte d'origine (refusé si des
  rattachements utilisent déjà les nouveaux rôles).

Les ensembles de permissions sont figés ici (et non importés de l'application) pour que la migration
reste valable si les préréglages évoluent plus tard.

Revision ID: c3e8f1a7b2d4
Revises: b7c4d1e9a2f0
Create Date: 2026-11-06 14:00:00
"""

import json
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c3e8f1a7b2d4"
down_revision: str | None = "b7c4d1e9a2f0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD_ROLES = ("OWNER", "MANAGER", "CASHIER", "KITCHEN")
NEW_ROLES = ("OWNER", "ADMIN", "MANAGER", "CASHIER", "WAITER", "KITCHEN", "STAFF")

# Toutes les permissions existant avant cette migration (ancien préréglage MANAGER = tout).
OLD_ALL = frozenset(
    {
        "restaurant.view",
        "restaurant.edit",
        "settings.edit",
        "media.manage",
        "qr.manage",
        "menu.view",
        "menu.create",
        "menu.edit",
        "menu.delete",
        "prices.edit",
        "stock.manage",
        "orders.history",
        "orders.create",
        "orders.prepare",
        "orders.cancel",
        "payments.record",
        "payments.refund",
        "reservations.view",
        "reservations.manage",
        "stats.view",
        "team.view",
        "team.manage",
    }
)
NEW_MANAGER = frozenset(
    {
        "restaurant.view",
        "menu.view",
        "menu.create",
        "menu.edit",
        "stock.manage",
        "orders.history",
        "orders.create",
        "orders.prepare",
        "orders.cancel",
        "payments.record",
        "reservations.view",
        "reservations.manage",
        "stats.view",
        "team.view",
        "team.manage",
    }
)


def _effective(base: frozenset[str], overrides: dict) -> set[str]:
    perms = set(base)
    for key, granted in (overrides or {}).items():
        (perms.add if granted else perms.discard)(key)
    return perms


def _overrides(base: frozenset[str], wanted: set[str]) -> dict[str, bool]:
    out = {p: True for p in wanted - base}
    out.update({p: False for p in base - wanted})
    return dict(sorted(out.items()))


def _recompute(old_base: frozenset[str], new_base: frozenset[str]) -> None:
    conn = op.get_bind()
    rows = conn.execute(sa.text("SELECT id, permission_overrides FROM memberships WHERE role = 'MANAGER'")).all()
    for mid, overrides in rows:
        wanted = _effective(old_base, overrides or {})
        conn.execute(
            sa.text("UPDATE memberships SET permission_overrides = CAST(:o AS jsonb) WHERE id = :id"),
            {"o": json.dumps(_overrides(new_base, wanted)), "id": mid},
        )


def _check(roles: tuple[str, ...]) -> str:
    return "role IN (" + ", ".join(f"'{r}'" for r in roles) + ")"


def upgrade() -> None:
    op.drop_constraint(op.f("ck_memberships_memberrole"), "memberships", type_="check")
    op.create_check_constraint("memberrole", "memberships", _check(NEW_ROLES))
    _recompute(OLD_ALL, NEW_MANAGER)


def downgrade() -> None:
    conn = op.get_bind()
    n = conn.execute(sa.text("SELECT count(*) FROM memberships WHERE role IN ('ADMIN', 'WAITER', 'STAFF')")).scalar()
    if n:
        raise RuntimeError(f"{n} rattachement(s) utilisent ADMIN / WAITER / STAFF : à convertir avant le downgrade")
    _recompute(NEW_MANAGER, OLD_ALL)
    op.drop_constraint(op.f("ck_memberships_memberrole"), "memberships", type_="check")
    op.create_check_constraint("memberrole", "memberships", _check(OLD_ROLES))
