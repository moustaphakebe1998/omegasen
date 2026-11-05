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
from app.core.deps import ALL_ROLES, load_user_from_token, resolve_context
from app.core.errors import AppError
from app.core.realtime import order_channel, relay, restaurant_channel
from app.models import Order

router = APIRouter(tags=["realtime"])


@router.websocket("/api/ws/restaurants/{restaurant_id}")
async def restaurant_ws(websocket: WebSocket, restaurant_id: uuid.UUID, token: str | None = None):
    try:
        async with SessionLocal() as session:
            user = await load_user_from_token(session, token)
            await resolve_context(session, user, restaurant_id, ALL_ROLES)
    except AppError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await websocket.accept()
    await relay(websocket, restaurant_channel(restaurant_id))


@router.websocket("/api/ws/orders/{tracking_token}")
async def order_ws(websocket: WebSocket, tracking_token: str):
    async with SessionLocal() as session:
        exists = await session.scalar(select(Order.id).where(Order.tracking_token == tracking_token))
    if not exists:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return
    await websocket.accept()
    await relay(websocket, order_channel(tracking_token))
