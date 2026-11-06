"""restaurant is_demo flag (données de démonstration / test isolées)

Revision ID: b7c4d1e9a2f0
Revises: a2508d2f8a5d
Create Date: 2026-11-06 10:00:00
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = 'b7c4d1e9a2f0'
down_revision: str | None = 'a2508d2f8a5d'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column('restaurants', sa.Column('is_demo', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column('restaurants', 'is_demo')
