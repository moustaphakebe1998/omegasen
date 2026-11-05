"""Limitation de débit simple à fenêtre fixe, stockée dans Redis."""

import structlog
from fastapi import Request

from app.core.errors import TooManyRequests
from app.core.redis import get_redis

log = structlog.get_logger()


def client_ip(request: Request) -> str:
    # Nginx place l'IP réelle en tête de X-Forwarded-For.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


async def hit(bucket: str, key: str, *, limit: int, window_seconds: int) -> None:
    redis_key = f"rl:{bucket}:{key}"
    try:
        r = get_redis()
        count = await r.incr(redis_key)
        if count == 1:
            await r.expire(redis_key, window_seconds)
    except Exception:  # Redis indisponible : on n'empêche pas le service
        log.warning("ratelimit_unavailable", bucket=bucket)
        return
    if count > limit:
        raise TooManyRequests("Trop de requêtes, veuillez patienter un instant")
