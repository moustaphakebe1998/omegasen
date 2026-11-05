import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit import AuditLog


def audit(
    session: AsyncSession,
    action: str,
    *,
    actor_id: uuid.UUID | None = None,
    restaurant_id: uuid.UUID | None = None,
    entity: str | None = None,
    entity_id: Any = None,
    data: dict | None = None,
    ip: str | None = None,
) -> None:
    """Ajoute une entrée d'audit dans la transaction courante (commit par l'appelant)."""
    session.add(
        AuditLog(
            action=action,
            actor_id=actor_id,
            restaurant_id=restaurant_id,
            entity=entity,
            entity_id=str(entity_id) if entity_id is not None else None,
            data=data or {},
            ip_address=ip,
        )
    )
