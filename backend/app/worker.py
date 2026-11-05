"""Tâches planifiées (ARQ, s'appuie sur Redis).

arq app.worker.WorkerSettings
"""

from datetime import UTC, datetime, timedelta

import structlog
from arq import cron
from arq.connections import RedisSettings
from sqlalchemy import delete, or_

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.logging import configure_logging
from app.models import RefreshToken

log = structlog.get_logger()


async def purge_refresh_tokens(_ctx) -> int:
    """Supprime les jetons expirés ou révoqués depuis plus de 7 jours."""
    now = datetime.now(UTC)
    async with SessionLocal() as session:
        result = await session.execute(
            delete(RefreshToken).where(
                or_(RefreshToken.expires_at < now, RefreshToken.revoked_at < now - timedelta(days=7))
            )
        )
        await session.commit()
    log.info("purge_refresh_tokens", deleted=result.rowcount)
    return result.rowcount


async def startup(_ctx) -> None:
    configure_logging()


class WorkerSettings:
    redis_settings = RedisSettings.from_dsn(get_settings().redis_url)
    on_startup = startup
    functions = [purge_refresh_tokens]
    cron_jobs = [cron(purge_refresh_tokens, hour={3}, minute={15})]
