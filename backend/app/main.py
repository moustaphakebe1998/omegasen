from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.core.db import engine
from app.core.errors import register_error_handlers
from app.core.logging import RequestLogMiddleware, configure_logging
from app.core.redis import close_redis, get_redis
from app.core.storage import ensure_bucket
from app.modules import (
    admin,
    analytics,
    auth,
    media,
    menu,
    orders,
    payments,
    public,
    qrcodes,
    requests,
    restaurants,
    ws,
)

log = structlog.get_logger()


@asynccontextmanager
async def lifespan(_: FastAPI):
    configure_logging()
    settings = get_settings()
    if settings.environment != "test":
        try:
            await run_in_threadpool(ensure_bucket)
        except Exception:
            log.warning("s3_unavailable_at_startup")
    log.info("startup", environment=settings.environment)
    yield
    await close_redis()
    await engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="OmegaSen API",
        version="3.0.0",
        description="Plateforme de gestion de restaurants : menus, QR Codes, commandes, cuisine, caisse.",
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
    )
    app.add_middleware(RequestLogMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    register_error_handlers(app)
    for module in (auth, restaurants, media, menu, qrcodes, orders, payments, public, analytics, admin, ws):
        app.include_router(module.router)
    app.include_router(requests.public_router)
    app.include_router(requests.admin_router)

    @app.get("/health", tags=["system"])
    @app.get("/api/health", tags=["system"], include_in_schema=False)
    async def health():
        checks = {}
        try:
            async with engine.connect() as conn:
                await conn.execute(text("SELECT 1"))
            checks["database"] = "ok"
        except Exception:
            checks["database"] = "error"
        try:
            await get_redis().ping()
            checks["redis"] = "ok"
        except Exception:
            checks["redis"] = "error"
        return {"status": "ok" if all(v == "ok" for v in checks.values()) else "degraded", **checks}

    return app


app = create_app()
