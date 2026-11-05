"""Espace public : découverte des restaurants, menu, commande (QR / en ligne / borne), suivi."""

from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Query, Request
from sqlalchemy import func, or_, select

from app.core.deps import OptionalUser, Session
from app.core.errors import NotFound
from app.core.ratelimit import client_ip, hit
from app.core.schema import Schema
from app.core.storage import public_url
from app.models import Media, Order, Restaurant
from app.models.enums import MediaKind, OrderChannel, RestaurantStatus
from app.modules.media import MediaOut, media_out
from app.modules.menu import CategoryOut, load_menu
from app.modules.notifications import publish_pending
from app.modules.orders import (
    ORDER_LOADS,
    PlaceOrderIn,
    TrackingOut,
    broadcast_order,
    notify_new_order,
    place_order,
    tracking_out,
)
from app.modules.payments import CheckoutSession, get_provider
from app.modules.restaurants import RESTAURANT_LOADS, HoursSlot, is_open_at

router = APIRouter(prefix="/api/public", tags=["public"])


class PublicRestaurantCard(Schema):
    slug: str
    name: str
    cuisine: str | None
    city: str | None
    description: str | None
    logo_url: str | None
    cover_url: str | None
    is_open_now: bool
    currency: str


class PublicRestaurant(PublicRestaurantCard):
    phone: str | None
    email: str | None
    website: str | None
    address_line: str | None
    postal_code: str | None
    country: str
    latitude: float | None
    longitude: float | None
    accepting_orders: bool
    dine_in_enabled: bool
    takeaway_enabled: bool
    require_prepayment: bool
    reservations_enabled: bool
    timezone: str
    opening_hours: list[HoursSlot]
    gallery: list[MediaOut]
    menu: list[CategoryOut]


class RestaurantList(Schema):
    items: list[PublicRestaurantCard]
    total: int


def _card(r: Restaurant, now: datetime) -> dict:
    return dict(
        slug=r.slug,
        name=r.name,
        cuisine=r.cuisine,
        city=r.city,
        description=r.description,
        logo_url=public_url(r.logo.variants.get("medium")) if r.logo else None,
        cover_url=public_url(r.cover.variants.get("medium")) if r.cover else None,
        is_open_now=is_open_at(r, now),
        currency=r.currency,
    )


def _active():
    return (Restaurant.status == RestaurantStatus.ACTIVE, Restaurant.deleted_at.is_(None))


async def _by_slug(session, slug: str) -> Restaurant:
    r = await session.scalar(select(Restaurant).where(Restaurant.slug == slug, *_active()).options(*RESTAURANT_LOADS))
    if not r:
        raise NotFound("Restaurant introuvable")
    return r


@router.get("/restaurants", response_model=RestaurantList)
async def list_restaurants(
    session: Session,
    q: str | None = Query(default=None, max_length=80),
    city: str | None = Query(default=None, max_length=80),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=60),
):
    cond = list(_active())
    if q:
        like = f"%{q.strip()}%"
        cond.append(or_(Restaurant.name.ilike(like), Restaurant.cuisine.ilike(like), Restaurant.city.ilike(like)))
    if city:
        cond.append(Restaurant.city.ilike(city.strip()))
    total = await session.scalar(select(func.count()).select_from(Restaurant).where(*cond))
    rows = await session.scalars(
        select(Restaurant)
        .where(*cond)
        .options(*RESTAURANT_LOADS)
        .order_by(Restaurant.name)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    now = datetime.now(UTC)
    return RestaurantList(items=[PublicRestaurantCard(**_card(r, now)) for r in rows], total=total or 0)


@router.get("/restaurants/{slug}", response_model=PublicRestaurant)
async def get_restaurant(slug: str, session: Session):
    r = await _by_slug(session, slug)
    gallery = await session.scalars(
        select(Media)
        .where(Media.restaurant_id == r.id, Media.kind == MediaKind.GALLERY)
        .order_by(Media.sort_order, Media.created_at)
    )
    now = datetime.now(UTC)
    return PublicRestaurant(
        **_card(r, now),
        phone=r.phone,
        email=r.email,
        website=r.website,
        address_line=r.address_line,
        postal_code=r.postal_code,
        country=r.country,
        latitude=r.latitude,
        longitude=r.longitude,
        accepting_orders=r.accepting_orders,
        dine_in_enabled=r.dine_in_enabled,
        takeaway_enabled=r.takeaway_enabled,
        require_prepayment=r.require_prepayment,
        reservations_enabled=r.reservations_enabled,
        timezone=r.timezone,
        opening_hours=[
            HoursSlot(day_of_week=h.day_of_week, opens_at=h.opens_at, closes_at=h.closes_at) for h in r.opening_hours
        ],
        gallery=[media_out(m) for m in gallery],
        menu=await load_menu(session, r.id, public=True),
    )


class PublicOrderIn(PlaceOrderIn):
    channel: Literal["QR", "ONLINE", "KIOSK"] = "ONLINE"


class PlacedOrderOut(TrackingOut):
    tracking_token: str


@router.post("/restaurants/{slug}/orders", response_model=PlacedOrderOut, status_code=201)
async def create_order(slug: str, body: PublicOrderIn, request: Request, session: Session, user: OptionalUser):
    await hit("public_order", client_ip(request), limit=20, window_seconds=600)
    r = await _by_slug(session, slug)
    order, created = await place_order(session, r, body, channel=OrderChannel(body.channel), actor=None)
    if created:
        if user:  # client connecté : la commande apparaît dans « Mes commandes »
            order.customer_user_id = user.id
        await notify_new_order(session, order, r)
    await session.commit()
    await publish_pending(session)
    order = await session.scalar(
        select(Order).where(Order.id == order.id).options(*ORDER_LOADS).execution_options(populate_existing=True)
    )
    if created:
        await broadcast_order(order, r, "order.created")
    return PlacedOrderOut(**tracking_out(order, r).model_dump(), tracking_token=order.tracking_token)


async def _by_token(session, token: str) -> tuple[Order, Restaurant]:
    order = await session.scalar(select(Order).where(Order.tracking_token == token).options(*ORDER_LOADS))
    if not order:
        raise NotFound("Commande introuvable")
    r = await session.get(Restaurant, order.restaurant_id)
    return order, r


@router.get("/orders/{token}", response_model=TrackingOut)
async def track(token: str, session: Session):
    order, r = await _by_token(session, token)
    return tracking_out(order, r)


class CheckoutIn(Schema):
    success_url: str
    cancel_url: str


@router.post(
    "/orders/{token}/checkout",
    response_model=CheckoutSession,
    responses={503: {"description": "Paiement en ligne non configuré"}},
)
async def checkout(token: str, body: CheckoutIn, session: Session):
    order, r = await _by_token(session, token)
    provider = get_provider(r.currency)  # lève 503 tant qu'aucun prestataire n'est branché
    return await provider.create_checkout(order, success_url=body.success_url, cancel_url=body.cancel_url)
