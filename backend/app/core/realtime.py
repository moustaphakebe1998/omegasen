"""Temps réel : publication d'événements via Redis Pub/Sub, relayés aux clients WebSocket.

Redis permet à plusieurs instances du backend de partager les mêmes événements.
Canaux :
  - rt:restaurant:{id}  → écrans cuisine / caisse / gérant du restaurant
  - rt:order:{token}    → page de suivi d'une commande côté client
"""

import asyncio
import json
import uuid
from collections.abc import Awaitable, Callable
from contextlib import suppress
from typing import Any

import structlog
from fastapi import WebSocket

from app.core.redis import get_redis

log = structlog.get_logger()


def restaurant_channel(restaurant_id: uuid.UUID | str) -> str:
    return f"rt:restaurant:{restaurant_id}"


def user_channel(user_id: uuid.UUID | str) -> str:
    return f"rt:user:{user_id}"


def order_channel(tracking_token: str) -> str:
    return f"rt:order:{tracking_token}"


async def publish(channel: str, event: str, data: Any) -> None:
    message = json.dumps({"event": event, "data": data}, default=str)
    try:
        await get_redis().publish(channel, message)
    except Exception:  # le temps réel ne doit jamais faire échouer une écriture métier
        log.warning("realtime_publish_failed", channel=channel, event=event)


# Revérification des droits d'une WebSocket ouverte (en plus de l'événement « access.changed »).
RECHECK_SECONDS = 30
ACCESS_CHANGED = "access.changed"

Check = Callable[[], Awaitable[bool]]
Allow = Callable[[str], bool]


async def relay(websocket: WebSocket, channel: str, *, check: Check | None = None, allow: Allow | None = None) -> None:
    """Abonne la WebSocket (déjà acceptée) au canal jusqu'à déconnexion.

    - `check` : revérifie les droits (compte actif, appartenance, statut du restaurant, permission) toutes les
      30 s et à chaque événement « access.changed » ; s'il échoue, la WebSocket est fermée (code 1008).
    - `allow(event)` : filtre les événements relayés selon les permissions de l'abonné.
    """
    pubsub = get_redis().pubsub()
    await pubsub.subscribe(channel)

    async def revoke() -> None:
        with suppress(Exception):
            await websocket.send_text(json.dumps({"event": "access.revoked"}))
        raise AccessRevoked

    async def forward() -> None:
        async for message in pubsub.listen():
            if message.get("type") != "message":
                continue
            raw = message["data"]
            try:
                event = json.loads(raw).get("event", "")
            except (ValueError, AttributeError):
                event = ""
            if event == ACCESS_CHANGED and check is not None and not await check():
                await revoke()
            if allow is None or allow(event):
                await websocket.send_text(raw)

    async def heartbeat_and_drain() -> None:
        # Lit les messages du client (ping) pour détecter la déconnexion ; revérifie les droits.
        while True:
            try:
                text = await asyncio.wait_for(websocket.receive_text(), timeout=RECHECK_SECONDS)
                if text == "ping":
                    await websocket.send_text('{"event":"pong"}')
            except TimeoutError:
                if check is not None and not await check():
                    await revoke()
                await websocket.send_text('{"event":"heartbeat"}')

    tasks = [asyncio.create_task(forward()), asyncio.create_task(heartbeat_and_drain())]
    revoked = False
    try:
        await websocket.send_text(json.dumps({"event": "connected", "data": {"channel": channel.split(":")[1]}}))
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for t in done:
            if isinstance(t.exception(), AccessRevoked):
                revoked = True
    finally:
        for t in tasks:
            t.cancel()
        with suppress(Exception):
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()
        if revoked:
            with suppress(Exception):
                await websocket.close(code=1008)


class AccessRevoked(Exception):
    """Les droits de l'abonné ont disparu : la WebSocket est fermée."""
