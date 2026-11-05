"""QR Code principal et permanent de chaque restaurant.

Le QR encode `{PUBLIC_APP_URL}/q/{code}`. Le code est créé une seule fois à la création
du restaurant ; modifier le menu, le nom ou le slug ne le change jamais.
Seul un super admin peut le régénérer explicitement (ex. QR détourné).
"""

import io
import re
import uuid
from base64 import b64encode
from datetime import UTC, datetime
from typing import Literal

import qrcode
from fastapi import APIRouter, Query
from fastapi.responses import Response
from PIL import Image, ImageDraw
from pydantic import Field
from qrcode.constants import ERROR_CORRECT_H, ERROR_CORRECT_M
from reportlab.lib.pagesizes import A4, A6
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas
from sqlalchemy import select, update
from starlette.concurrency import run_in_threadpool

from app.core.audit import audit
from app.core.config import get_settings
from app.core.db import utcnow
from app.core.deps import AnyMember, Can, Session, SuperAdmin
from app.core.errors import NotFound
from app.core.permissions import Perm
from app.core.schema import Schema
from app.core.storage import get_object
from app.models import Media, QrCode, Restaurant
from app.modules.restaurants import unique_qr_code

router = APIRouter(tags=["qrcodes"])

HEX = r"^#[0-9A-Fa-f]{6}$"


class QrOut(Schema):
    code: str
    url: str
    is_active: bool
    foreground_color: str
    background_color: str
    with_logo: bool
    scan_count: int
    last_scanned_at: datetime | None
    created_at: datetime
    regenerated_at: datetime | None


class QrUpdate(Schema):
    is_active: bool | None = None
    foreground_color: str | None = Field(default=None, pattern=HEX)
    background_color: str | None = Field(default=None, pattern=HEX)
    with_logo: bool | None = None


def qr_url(code: str) -> str:
    return f"{get_settings().public_app_url.rstrip('/')}/q/{code}"


def qr_out(q: QrCode) -> QrOut:
    return QrOut(
        code=q.code,
        url=qr_url(q.code),
        is_active=q.is_active,
        foreground_color=q.foreground_color,
        background_color=q.background_color,
        with_logo=q.with_logo,
        scan_count=q.scan_count,
        last_scanned_at=q.last_scanned_at,
        created_at=q.created_at,
        regenerated_at=q.regenerated_at,
    )


async def _get_qr(session, restaurant_id: uuid.UUID) -> QrCode:
    q = await session.scalar(select(QrCode).where(QrCode.restaurant_id == restaurant_id))
    if not q:  # filet de sécurité : tout restaurant doit avoir son QR
        q = QrCode(restaurant_id=restaurant_id, code=await unique_qr_code(session))
        session.add(q)
        await session.commit()
    return q


# ── Rendu ───────────────────────────────────────────────


def _matrix(data: str, with_logo: bool) -> list[list[bool]]:
    qr = qrcode.QRCode(error_correction=ERROR_CORRECT_H if with_logo else ERROR_CORRECT_M, border=4)
    qr.add_data(data)
    qr.make(fit=True)
    return qr.get_matrix()


def _prepare_logo(logo: bytes | None, size: int, bg: str) -> Image.Image | None:
    if not logo:
        return None
    try:
        img = Image.open(io.BytesIO(logo)).convert("RGBA")
    except Exception:
        return None
    img.thumbnail((size, size), Image.Resampling.LANCZOS)
    pad = max(4, size // 12)
    plate = Image.new("RGBA", (img.width + 2 * pad, img.height + 2 * pad), bg)
    mask = Image.new("L", plate.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, *plate.size), radius=pad * 2, fill=255)
    plate.paste(img, (pad, pad), img)
    plate.putalpha(mask)
    return plate


def render_png(data: str, *, fg: str, bg: str, logo: bytes | None, size: int) -> bytes:
    matrix = _matrix(data, logo is not None)
    n = len(matrix)
    box = max(1, size // n)
    img = Image.new("RGB", (n * box, n * box), bg)
    draw = ImageDraw.Draw(img)
    for y, row in enumerate(matrix):
        for x, on in enumerate(row):
            if on:
                draw.rectangle((x * box, y * box, (x + 1) * box - 1, (y + 1) * box - 1), fill=fg)
    plate = _prepare_logo(logo, int(img.width * 0.22), bg)
    if plate:
        img.paste(plate, ((img.width - plate.width) // 2, (img.height - plate.height) // 2), plate)
    out = io.BytesIO()
    img.save(out, format="PNG", optimize=True)
    return out.getvalue()


def render_svg(data: str, *, fg: str, bg: str, logo: bytes | None) -> bytes:
    matrix = _matrix(data, logo is not None)
    n = len(matrix)
    path = "".join(f"M{x},{y}h1v1h-1z" for y, row in enumerate(matrix) for x, on in enumerate(row) if on)
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n} {n}" shape-rendering="crispEdges">',
        f'<rect width="{n}" height="{n}" fill="{bg}"/>',
        f'<path d="{path}" fill="{fg}"/>',
    ]
    plate = _prepare_logo(logo, 256, bg)
    if plate:
        buf = io.BytesIO()
        plate.save(buf, format="PNG")
        w = n * 0.22
        off = (n - w) / 2
        parts.append(
            f'<image x="{off:.2f}" y="{off:.2f}" width="{w:.2f}" height="{w:.2f}" '
            f'href="data:image/png;base64,{b64encode(buf.getvalue()).decode()}"/>'
        )
    parts.append("</svg>")
    return "".join(parts).encode()


def render_pdf(data: str, *, name: str, fg: str, bg: str, logo: bytes | None, page: Literal["A4", "A6"]) -> bytes:
    png = render_png(data, fg=fg, bg=bg, logo=logo, size=1200)
    size = A4 if page == "A4" else A6
    w, h = size
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=size)
    c.setTitle(f"QR Code — {name}")
    scale = 1.0 if page == "A4" else 0.5
    qr_side = w * 0.62
    c.setFont("Helvetica-Bold", 30 * scale)
    c.drawCentredString(w / 2, h - 80 * scale, name[:40])
    c.setFont("Helvetica", 18 * scale)
    c.drawCentredString(w / 2, h - 115 * scale, "Scannez pour consulter le menu et commander")
    c.drawImage(ImageReader(io.BytesIO(png)), (w - qr_side) / 2, (h - qr_side) / 2 - 20 * scale, qr_side, qr_side)
    c.setFont("Helvetica", 11 * scale)
    c.setFillColorRGB(0.4, 0.4, 0.4)
    c.drawCentredString(w / 2, 60 * scale, data)
    c.drawCentredString(w / 2, 40 * scale, "Propulsé par OmegaSen")
    c.showPage()
    c.save()
    return buf.getvalue()


async def _logo_bytes(session, restaurant: Restaurant, q: QrCode) -> bytes | None:
    if not q.with_logo or not restaurant.logo_media_id:
        return None
    media = await session.get(Media, restaurant.logo_media_id)
    return await get_object(media.variants["medium"]) if media else None


def _filename(restaurant: Restaurant, ext: str) -> str:
    safe = re.sub(r"[^a-z0-9-]", "", restaurant.slug)
    return f'attachment; filename="qrcode-{safe}.{ext}"'


# ── Routes restaurateur ─────────────────────────────────

PREFIX = "/api/restaurants/{restaurant_id}/qr"


@router.get(PREFIX, response_model=QrOut)
async def get_qr(ctx: AnyMember, session: Session):
    return qr_out(await _get_qr(session, ctx.restaurant.id))


@router.patch(PREFIX, response_model=QrOut)
async def update_qr(body: QrUpdate, ctx: Can(Perm.QR_MANAGE), session: Session):
    q = await _get_qr(session, ctx.restaurant.id)
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(q, k, v.upper() if isinstance(v, str) else v)
    audit(
        session,
        "qr.updated",
        actor_id=ctx.user.id,
        restaurant_id=ctx.restaurant.id,
        entity="QrCode",
        entity_id=q.id,
        data=data,
    )
    await session.commit()
    return qr_out(q)


@router.get(PREFIX + "/image.png", response_class=Response, responses={200: {"content": {"image/png": {}}}})
async def qr_png(ctx: AnyMember, session: Session, size: int = Query(1024, ge=128, le=4096), download: bool = False):
    q = await _get_qr(session, ctx.restaurant.id)
    logo = await _logo_bytes(session, ctx.restaurant, q)
    png = await run_in_threadpool(
        render_png, qr_url(q.code), fg=q.foreground_color, bg=q.background_color, logo=logo, size=size
    )
    headers = {"Content-Disposition": _filename(ctx.restaurant, "png")} if download else {}
    return Response(png, media_type="image/png", headers=headers)


@router.get(PREFIX + "/image.svg", response_class=Response, responses={200: {"content": {"image/svg+xml": {}}}})
async def qr_svg(ctx: AnyMember, session: Session):
    q = await _get_qr(session, ctx.restaurant.id)
    logo = await _logo_bytes(session, ctx.restaurant, q)
    svg = await run_in_threadpool(render_svg, qr_url(q.code), fg=q.foreground_color, bg=q.background_color, logo=logo)
    return Response(svg, media_type="image/svg+xml", headers={"Content-Disposition": _filename(ctx.restaurant, "svg")})


@router.get(PREFIX + "/print.pdf", response_class=Response, responses={200: {"content": {"application/pdf": {}}}})
async def qr_pdf(ctx: AnyMember, session: Session, page: Literal["A4", "A6"] = "A4"):
    q = await _get_qr(session, ctx.restaurant.id)
    logo = await _logo_bytes(session, ctx.restaurant, q)
    pdf = await run_in_threadpool(
        render_pdf,
        qr_url(q.code),
        name=ctx.restaurant.name,
        fg=q.foreground_color,
        bg=q.background_color,
        logo=logo,
        page=page,
    )
    return Response(
        pdf, media_type="application/pdf", headers={"Content-Disposition": _filename(ctx.restaurant, "pdf")}
    )


# ── Super admin ─────────────────────────────────────────


@router.post("/api/admin/restaurants/{restaurant_id}/qr/regenerate", response_model=QrOut)
async def regenerate(restaurant_id: uuid.UUID, admin: SuperAdmin, session: Session):
    q = await session.scalar(select(QrCode).where(QrCode.restaurant_id == restaurant_id))
    if not q:
        raise NotFound("QR Code introuvable")
    old = q.code
    q.code = await unique_qr_code(session)
    q.regenerated_at = datetime.now(UTC)
    q.scan_count = 0
    audit(
        session,
        "qr.regenerated",
        actor_id=admin.id,
        restaurant_id=restaurant_id,
        entity="QrCode",
        entity_id=q.id,
        data={"old_code": old},
    )
    await session.commit()
    return qr_out(q)


# ── Public : résolution d'un scan ───────────────────────


class QrResolveOut(Schema):
    active: bool
    restaurant_slug: str | None
    restaurant_name: str | None


@router.get("/api/public/qr/{code}", response_model=QrResolveOut, tags=["public"])
async def resolve(code: str, session: Session, count: bool = True):
    row = (
        await session.execute(
            select(QrCode, Restaurant)
            .join(Restaurant, Restaurant.id == QrCode.restaurant_id)
            .where(QrCode.code == code, Restaurant.deleted_at.is_(None))
        )
    ).first()
    if not row:
        raise NotFound("QR Code inconnu")
    q, r = row
    if count and q.is_active:
        await session.execute(
            update(QrCode).where(QrCode.id == q.id).values(scan_count=QrCode.scan_count + 1, last_scanned_at=utcnow())
        )
        await session.commit()
    return QrResolveOut(active=q.is_active and r.status == "ACTIVE", restaurant_slug=r.slug, restaurant_name=r.name)
