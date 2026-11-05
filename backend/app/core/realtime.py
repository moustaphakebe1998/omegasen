"""Temps réel : publication d'événements via Redis Pub/Sub, relayés aux clients WebSocket.

Redis permet à plusieurs instances du backend de partager les mêmes événements.
Canaux :
  - rt:restaurant:{id}  → écrans cuisine / caisse / gérant du restaurant
  - rt:order:{token}    → page de suivi d'une commande côté client
"""

import asyncio
import json
import uuid
from contextlib import suppress
from typing import Any

import structlog
from fastapi import WebSocket, WebSocketDisconnect

from app.core.redis import get_redis

log = structlog.get_logger()


def restaurant_channel(restaurant_id: uuid.UUID | str) -> str:
    return f"rt:restaurant:{restaurant_id}"


def order_channel(tracking_token: str) -> str:
    return f"rt:order:{tracking_token}"


async def publish(channel: str, event: str, data: Any) -> None:
    message = json.dumps({"event": event, "data": data}, default=str)
    try:
        await get_redis().publish(channel, message)
    except Exception:  # le temps réel ne doit jamais faire échouer une écriture métier
        log.warning("realtime_publish_failed", channel=channel, event=event)


async def relay(websocket: WebSocket, channel: str) -> None:
    """Abonne la WebSocket (déjà acceptée) au canal jusqu'à déconnexion."""
    pubsub = get_redis().pubsub()
    await pubsub.subscribe(channel)

    async def forward() -> None:
        async for message in pubsub.listen():
            if message.get("type") == "message":
                await websocket.send_text(message["data"])

    async def heartbeat_and_drain() -> None:
        # Lit les messages du client (ping) pour détecter la déconnexion.
        while True:
            try:
                text = await asyncio.wait_for(websocket.receive_text(), timeout=30)
                if text == "ping":
                    await websocket.send_text('{"event":"pong"}')
            except TimeoutError:
                await websocket.send_text('{"event":"heartbeat"}')

    tasks = [asyncio.create_task(forward()), asyncio.create_task(heartbeat_and_drain())]
    try:
        await websocket.send_text(json.dumps({"event": "connected", "data": {"channel": channel.split(":")[1]}}))
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for t in done:
            with suppress(WebSocketDisconnect, Exception):
                t.result()
    finally:
        for t in tasks:
            t.cancel()
        with suppress(Exception):
            await pubsub.unsubscribe(channel)
            await pubsub.aclose()
