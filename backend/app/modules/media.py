"""Images des restaurants : upload, optimisation (Pillow), stockage S3/MinIO, galerie."""

import uuid
from datetime import datetime

from fastapi import APIRouter, File, Form, UploadFile
from pydantic import Field
from sqlalchemy import select, update
from starlette.concurrency import run_in_threadpool

from app.core.audit import audit
from app.core.config import get_settings
from app.core.deps import AnyMember, Can, Session
from app.core.errors import NotFound, Unprocessable
from app.core.images import ProcessedImage, process_image
from app.core.permissions import Perm
from app.core.schema import Schema
from app.core.storage import PUBLIC_PREFIX, delete_objects, public_url, put_object
from app.models import Media, Product, Restaurant
from app.models.enums import MediaKind

router = APIRouter(prefix="/api/restaurants/{restaurant_id}/media", tags=["media"])


class MediaOut(Schema):
    id: uuid.UUID
    kind: MediaKind
    url: str
    medium_url: str
    thumb_url: str
    width: int
    height: int
    size_bytes: int
    alt: str | None
    sort_order: int
    created_at: datetime


class MediaUpdate(Schema):
    alt: str | None = Field(default=None, max_length=255)
    sort_order: int | None = None


def media_out(m: Media) -> MediaOut:
    return MediaOut(
        id=m.id,
        kind=m.kind,
        url=public_url(m.variants["original"]),
        medium_url=public_url(m.variants["medium"]),
        thumb_url=public_url(m.variants["thumb"]),
        width=m.width,
        height=m.height,
        size_bytes=m.size_bytes,
        alt=m.alt,
        sort_order=m.sort_order,
        created_at=m.created_at,
    )


async def put_variants(base: str, data: bytes) -> tuple[ProcessedImage, dict[str, str]]:
    """Optimise l'image (WebP, 3 tailles) et dépose chaque variante sous `base/`."""
    processed = await run_in_threadpool(process_image, data)
    keys = {name: f"{base}/{name}.webp" for name in processed.variants}
    for name, content in processed.variants.items():
        await put_object(keys[name], content, "image/webp")
    return processed, keys


async def store_image(
    session,
    restaurant_id: uuid.UUID,
    kind: MediaKind,
    data: bytes,
    *,
    alt: str | None = None,
    uploaded_by_id: uuid.UUID | None = None,
) -> tuple[Media, dict[str, str]]:
    """Traite, stocke sur S3 et ajoute à la session un Media (sans commit)."""
    media_id = uuid.uuid4()
    base = f"{PUBLIC_PREFIX}restaurants/{restaurant_id}/{kind.lower()}/{media_id}"
    processed, keys = await put_variants(base, data)
    m = Media(
        id=media_id,
        restaurant_id=restaurant_id,
        kind=kind,
        storage_key=keys["original"],
        content_type="image/webp",
        width=processed.width,
        height=processed.height,
        size_bytes=sum(len(c) for c in processed.variants.values()),
        variants=keys,
        alt=alt,
        uploaded_by_id=uploaded_by_id,
    )
    session.add(m)
    return m, keys


@router.post("", response_model=MediaOut, status_code=201)
async def upload(
    ctx: Can(Perm.MEDIA_MANAGE),
    session: Session,
    file: UploadFile = File(...),
    kind: MediaKind = Form(...),
    alt: str | None = Form(default=None, max_length=255),
):
    max_bytes = get_settings().max_upload_mb * 1024 * 1024
    data = await file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise Unprocessable(f"Image trop lourde (max {get_settings().max_upload_mb} Mo)", code="file_too_large")
    if not data:
        raise Unprocessable("Fichier vide", code="invalid_image")

    m, keys = await store_image(session, ctx.restaurant.id, kind, data, alt=alt, uploaded_by_id=ctx.user.id)
    media_id = m.id
    audit(
        session,
        "media.uploaded",
        actor_id=ctx.user.id,
        restaurant_id=ctx.restaurant.id,
        entity="Media",
        entity_id=media_id,
        data={"kind": kind},
    )
    try:
        await session.commit()
    except Exception:
        await delete_objects(list(keys.values()))
        raise
    return media_out(m)


@router.get("", response_model=list[MediaOut])
async def list_media(ctx: AnyMember, session: Session, kind: MediaKind | None = None):
    q = select(Media).where(Media.restaurant_id == ctx.restaurant.id)
    if kind:
        q = q.where(Media.kind == kind)
    rows = await session.scalars(q.order_by(Media.kind, Media.sort_order, Media.created_at))
    return [media_out(m) for m in rows]


async def _get(session, ctx, media_id: uuid.UUID) -> Media:
    m = await session.get(Media, media_id)
    if not m or m.restaurant_id != ctx.restaurant.id:
        raise NotFound("Image introuvable")
    return m


@router.patch("/{media_id}", response_model=MediaOut)
async def update_media(media_id: uuid.UUID, body: MediaUpdate, ctx: Can(Perm.MEDIA_MANAGE), session: Session):
    m = await _get(session, ctx, media_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(m, k, v)
    await session.commit()
    return media_out(m)


@router.delete("/{media_id}", status_code=204)
async def delete_media(media_id: uuid.UUID, ctx: Can(Perm.MEDIA_MANAGE), session: Session):
    m = await _get(session, ctx, media_id)
    keys = list(m.variants.values())
    # Détache l'image des entités qui la référencent (les FK sont en SET NULL, on le fait explicitement
    # pour garder la session cohérente).
    await session.execute(update(Restaurant).where(Restaurant.logo_media_id == m.id).values(logo_media_id=None))
    await session.execute(update(Restaurant).where(Restaurant.cover_media_id == m.id).values(cover_media_id=None))
    await session.execute(update(Product).where(Product.image_media_id == m.id).values(image_media_id=None))
    await session.delete(m)
    audit(
        session, "media.deleted", actor_id=ctx.user.id, restaurant_id=ctx.restaurant.id, entity="Media", entity_id=m.id
    )
    await session.commit()
    await delete_objects(keys)
