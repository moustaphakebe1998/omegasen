"""Centre de notifications.

- `notify*()` ajoute des notifications à la session ; elles sont publiées en temps réel (canal Redis
  rt:user:{id}) juste après le commit, via `publish_pending()`.
- Routes : liste, compteur non lu, marquer comme lu ; WebSocket /api/ws/me pour le temps réel.
"""

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Query, WebSocket, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.db import SessionLocal
from app.core.deps import CurrentUser, Session, load_user_from_token
from app.core.errors import AppError, NotFound
from app.core.realtime import publish, relay
from app.core.schema import Schema
from app.models import Membership, Notification, User
from app.models.enums import MemberRole

router = APIRouter(tags=["notifications"])

PENDING_KEY = "pending_notifications"


def user_channel(user_id: uuid.UUID | str) -> str:
    return f"rt:user:{user_id}"


class NotificationOut(Schema):
    id: uuid.UUID
    type: str
    title: str
    body: str | None
    link: str | None
    restaurant_id: uuid.UUID | None
    data: dict[str, Any]
    created_at: datetime
    read_at: datetime | None


class NotificationPage(Schema):
    items: list[NotificationOut]
    unread: int


def _out(n: Notification) -> NotificationOut:
    return NotificationOut.model_validate(n, from_attributes=True)


# ── Production des notifications ────────────────────────


def notify(
    session: AsyncSession,
    user_ids: list[uuid.UUID] | set[uuid.UUID],
    type: str,
    title: str,
    *,
    body: str | None = None,
    link: str | None = None,
    restaurant_id: uuid.UUID | None = None,
    data: dict | None = None,
) -> None:
    """Ajoute une notification par destinataire (commit et publication par l'appelant)."""
    now = datetime.now(UTC)
    pending: list[Notification] = session.info.setdefault(PENDING_KEY, [])
    for uid in dict.fromkeys(user_ids):  # dédoublonne en gardant l'ordre
        n = Notification(
            id=uuid.uuid4(),
            user_id=uid,
            type=type,
            title=title,
            body=body,
            link=link,
            restaurant_id=restaurant_id,
            data=data or {},
            created_at=now,
        )
        session.add(n)
        pending.append(n)


async def superadmin_ids(session: AsyncSession) -> list[uuid.UUID]:
    return list(await session.scalars(select(User.id).where(User.is_superadmin.is_(True), User.is_active.is_(True))))


async def restaurant_member_ids(
    session: AsyncSession, restaurant_id: uuid.UUID, roles: tuple[MemberRole, ...]
) -> list[uuid.UUID]:
    return list(
        await session.scalars(
            select(Membership.user_id)
            .join(User, User.id == Membership.user_id)
            .where(
                Membership.restaurant_id == restaurant_id,
                Membership.is_active.is_(True),
                Membership.role.in_(roles),
                User.is_active.is_(True),
            )
        )
    )


async def publish_pending(session: AsyncSession) -> None:
    """À appeler après le commit : pousse les nouvelles notifications aux navigateurs connectés."""
    pending: list[Notification] = session.info.pop(PENDING_KEY, [])
    for n in pending:
        await publish(user_channel(n.user_id), "notification.created", _out(n).model_dump(mode="json"))


# ── Routes ──────────────────────────────────────────────


@router.get("/api/notifications", response_model=NotificationPage)
async def list_notifications(
    user: CurrentUser,
    session: Session,
    unread_only: bool = False,
    limit: int = Query(30, ge=1, le=100),
):
    cond = [Notification.user_id == user.id]
    if unread_only:
        cond.append(Notification.read_at.is_(None))
    rows = await session.scalars(
        select(Notification).where(*cond).order_by(Notification.created_at.desc()).limit(limit)
    )
    unread = await session.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
    )
    return NotificationPage(items=[_out(n) for n in rows], unread=unread or 0)


@router.post("/api/notifications/{notification_id}/read", response_model=NotificationOut)
async def mark_read(notification_id: uuid.UUID, user: CurrentUser, session: Session):
    n = await session.get(Notification, notification_id)
    if not n or n.user_id != user.id:
        raise NotFound("Notification introuvable")
    if n.read_at is None:
        n.read_at = datetime.now(UTC)
        await session.commit()
    return _out(n)


@router.post("/api/notifications/read-all", status_code=204)
async def mark_all_read(user: CurrentUser, session: Session):
    await session.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=datetime.now(UTC))
    )
    await session.commit()


@router.websocket("/api/ws/me")
async def my_ws(websocket: WebSocket, token: str | None = None):
    try:
        async with SessionLocal() as session:
            user = await load_user_from_token(session, token)
    except AppError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await websocket.accept()
    await relay(websocket, user_channel(user.id))
