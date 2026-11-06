"""WebSockets temps réel.

- /api/ws/restaurants/{id}?token=<access>  : cuisine, caisse, gérant (authentifié, membre du restaurant)
- /api/ws/orders/{tracking_token}          : suivi client (le jeton de suivi fait office de secret)

Le navigateur ne peut pas envoyer d'en-tête Authorization sur une WebSocket : le jeton d'accès
(durée de vie courte) passe en paramètre de requête.
"""

import uuid

from fastapi import APIRouter, WebSocket, status
from sqlalchemy import select

from app.core.db import SessionLocal
from app.core.deps import RestaurantContext, load_user_from_token, resolve_context
from app.core.errors import AppError, Forbidden
from app.core.permissions import Perm
from app.core.realtime import ACCESS_CHANGED, order_channel, relay, restaurant_channel
from app.models import Order, User

router = APIRouter(tags=["realtime"])

ORDER_PERMS = (Perm.ORDERS_PREPARE, Perm.ORDERS_HISTORY, Perm.ORDERS_CREATE)


def event_allowed(event: str, perms: frozenset[Perm], *, superadmin: bool = False) -> bool:
    """Un événement n'est relayé qu'à un abonné qui pourrait lire la même donnée par l'API."""
    if superadmin or event in ("", ACCESS_CHANGED):
        return True
    if event.startswith("order."):
        return any(p in perms for p in ORDER_PERMS)
    if event.startswith("reservation."):
        return Perm.RESERVATIONS_VIEW in perms
    if event.startswith("menu."):
        return Perm.MENU_VIEW in perms
    return False


async def restaurant_access(user_id: uuid.UUID, restaurant_id: uuid.UUID) -> RestaurantContext | None:
    """Droits actuels d'un utilisateur sur le restaurant (None : plus d'accès). Relu en base à chaque appel."""
    try:
        async with SessionLocal() as session:
            user = await session.get(User, user_id)
            if not user or not user.is_active or user.must_change_password:
                return None
            ctx = await resolve_context(session, user, restaurant_id)
    except AppError:
        return None
    readable = ctx.is_superadmin or any(event_allowed(e, ctx.perms) for e in ("order.", "reservation.", "menu."))
    return ctx if readable else None


@router.websocket("/api/ws/restaurants/{restaurant_id}")
async def restaurant_ws(websocket: WebSocket, restaurant_id: uuid.UUID, token: str | None = None):
    try:
        async with SessionLocal() as session:
            user = await load_user_from_token(session, token)
            if user.must_change_password:
                raise Forbidden("Mot de passe initial à changer")
    except AppError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    ctx = await restaurant_access(user.id, restaurant_id)
    if ctx is None:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    state = {"perms": ctx.perms, "superadmin": ctx.is_superadmin}

    async def check() -> bool:
        current = await restaurant_access(user.id, restaurant_id)
        if current is None:
            return False
        state["perms"] = current.perms  # un changement de permissions s'applique aussitôt au filtrage
        return True

    await websocket.accept()
    await relay(
        websocket,
        restaurant_channel(restaurant_id),
        check=check,
        allow=lambda event: event_allowed(event, state["perms"], superadmin=state["superadmin"]),
    )


@router.websocket("/api/ws/orders/{tracking_token}")
async def order_ws(websocket: WebSocket, tracking_token: str):
    async with SessionLocal() as session:
        exists = await session.scalar(select(Order.id).where(Order.tracking_token == tracking_token))
    if not exists:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await websocket.accept()
    await relay(websocket, order_channel(tracking_token))
