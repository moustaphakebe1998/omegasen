"""Réservations de table.

Côté client (public, compte facultatif) : demande de réservation, suivi et annulation via un jeton.
Côté restaurant (propriétaire, gérant, caisse) : liste, confirmation, refus, arrivée, absence, et saisie
d'une réservation prise par téléphone.
"""

import uuid
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Query, Request
from pydantic import EmailStr, Field
from sqlalchemy import select

from app.core.audit import audit
from app.core.config import get_settings
from app.core.deps import Can, OptionalUser, Session
from app.core.errors import NotFound, Unprocessable
from app.core.mailer import build, send_email
from app.core.permissions import Perm
from app.core.ratelimit import client_ip, hit
from app.core.realtime import publish, restaurant_channel
from app.core.schema import Schema
from app.core.security import new_refresh_token
from app.models import Reservation, Restaurant
from app.models.enums import MemberRole, ReservationStatus, RestaurantStatus
from app.modules.notifications import notify, publish_pending, restaurant_member_ids

public_router = APIRouter(prefix="/api/public", tags=["reservations"])
router = APIRouter(prefix="/api/restaurants/{restaurant_id}/reservations", tags=["reservations"])

R = ReservationStatus
MAX_ADVANCE_DAYS = 90
MIN_NOTICE = timedelta(minutes=30)

# Transitions autorisées côté restaurant
TRANSITIONS: dict[ReservationStatus, set[ReservationStatus]] = {
    R.PENDING: {R.CONFIRMED, R.DECLINED, R.CANCELLED},
    R.CONFIRMED: {R.SEATED, R.NO_SHOW, R.CANCELLED},
    R.SEATED: set(),
    R.DECLINED: set(),
    R.CANCELLED: set(),
    R.NO_SHOW: set(),
}

LABEL = {
    R.PENDING: "en attente de confirmation",
    R.CONFIRMED: "confirmée",
    R.DECLINED: "refusée",
    R.CANCELLED: "annulée",
    R.SEATED: "honorée",
    R.NO_SHOW: "non honorée",
}


class ReservationIn(Schema):
    starts_at: datetime
    party_size: int = Field(ge=1, le=50)
    customer_name: str = Field(min_length=2, max_length=120)
    customer_phone: str = Field(min_length=6, max_length=32)
    customer_email: EmailStr | None = None
    note: str | None = Field(default=None, max_length=1000)


class StaffReservationIn(ReservationIn):
    """Réservation saisie par le restaurant (ex. par téléphone) : confirmée directement."""


class ReservationOut(Schema):
    id: uuid.UUID
    starts_at: datetime
    party_size: int
    customer_name: str
    customer_phone: str
    customer_email: str | None
    note: str | None
    status: ReservationStatus
    staff_note: str | None
    created_at: datetime
    allowed_transitions: list[ReservationStatus]


class PublicReservationOut(Schema):
    restaurant_name: str
    restaurant_slug: str
    restaurant_timezone: str
    starts_at: datetime
    party_size: int
    customer_name: str
    status: ReservationStatus
    staff_note: str | None
    tracking_token: str
    can_cancel: bool


class StatusIn(Schema):
    status: ReservationStatus
    staff_note: str | None = Field(default=None, max_length=1000)


def _out(r: Reservation, can_manage: bool = True) -> ReservationOut:
    return ReservationOut(
        **{k: getattr(r, k) for k in ReservationOut.model_fields if k != "allowed_transitions"},
        allowed_transitions=sorted(TRANSITIONS[r.status]) if can_manage else [],
    )


def _public_out(r: Reservation, restaurant: Restaurant) -> PublicReservationOut:
    return PublicReservationOut(
        restaurant_name=restaurant.name,
        restaurant_slug=restaurant.slug,
        restaurant_timezone=restaurant.timezone,
        starts_at=r.starts_at,
        party_size=r.party_size,
        customer_name=r.customer_name,
        status=r.status,
        staff_note=r.staff_note if r.status == R.DECLINED else None,
        tracking_token=r.tracking_token,
        can_cancel=r.status in (R.PENDING, R.CONFIRMED) and r.starts_at > datetime.now(UTC),
    )


def _validate_slot(restaurant: Restaurant, starts_at: datetime) -> datetime:
    from app.modules.restaurants import is_open_at  # import local : évite un cycle

    if starts_at.tzinfo is None:  # heure locale du restaurant
        starts_at = starts_at.replace(tzinfo=ZoneInfo(restaurant.timezone))
    now = datetime.now(UTC)
    if starts_at < now + MIN_NOTICE:
        raise Unprocessable("Choisissez un horaire au moins 30 minutes à l'avance", code="reservation_too_soon")
    if starts_at > now + timedelta(days=MAX_ADVANCE_DAYS):
        raise Unprocessable(f"Réservation possible jusqu'à {MAX_ADVANCE_DAYS} jours à l'avance", code="too_far")
    if not is_open_at(restaurant, starts_at):
        raise Unprocessable("Le restaurant est fermé à cet horaire", code="restaurant_closed_at")
    return starts_at.astimezone(UTC)


async def _broadcast(r: Reservation, event: str) -> None:
    """Écrans de l'équipe (gérant, caisse) : rafraîchissent leur liste de réservations."""
    await publish(restaurant_channel(r.restaurant_id), event, {"id": str(r.id), "status": r.status})


def _local(restaurant: Restaurant, dt: datetime) -> str:
    return dt.astimezone(ZoneInfo(restaurant.timezone)).strftime("%d/%m/%Y à %H:%M")


async def _email_customer(r: Reservation, restaurant: Restaurant, title: str, lines: list[str]) -> None:
    if not r.customer_email:
        return
    url = f"{get_settings().public_app_url.rstrip('/')}/reservation/{r.tracking_token}"
    text, html_body = build("", title, [f"Bonjour {r.customer_name},", *lines], ("Voir ma réservation", url))
    await send_email(r.customer_email, f"{title} — {restaurant.name}", text, html_body)


# ── Public ──────────────────────────────────────────────


async def _public_restaurant(session, slug: str) -> Restaurant:
    from app.modules.restaurants import RESTAURANT_LOADS

    r = await session.scalar(
        select(Restaurant)
        .where(Restaurant.slug == slug, Restaurant.deleted_at.is_(None), Restaurant.status == RestaurantStatus.ACTIVE)
        .options(*RESTAURANT_LOADS)
    )
    if not r:
        raise NotFound("Restaurant introuvable")
    return r


@public_router.post("/restaurants/{slug}/reservations", response_model=PublicReservationOut, status_code=201)
async def request_reservation(slug: str, body: ReservationIn, request: Request, session: Session, user: OptionalUser):
    await hit("reservation", client_ip(request), limit=10, window_seconds=3600)
    restaurant = await _public_restaurant(session, slug)
    if not restaurant.reservations_enabled:
        raise Unprocessable("Ce restaurant ne prend pas de réservations en ligne", code="reservations_disabled")
    starts_at = _validate_slot(restaurant, body.starts_at)
    r = Reservation(
        restaurant_id=restaurant.id,
        customer_user_id=user.id if user else None,
        starts_at=starts_at,
        party_size=body.party_size,
        customer_name=body.customer_name.strip(),
        customer_phone=body.customer_phone.strip(),
        customer_email=(body.customer_email or (user.email if user else None)),
        note=body.note,
        tracking_token=new_refresh_token(),
    )
    session.add(r)
    await session.flush()
    notify(
        session,
        await restaurant_member_ids(session, restaurant.id, (MemberRole.OWNER, MemberRole.MANAGER, MemberRole.CASHIER)),
        "reservation.created",
        f"Réservation : {r.customer_name}, {r.party_size} pers.",
        body=_local(restaurant, starts_at),
        link=f"/manage/{restaurant.id}/reservations",
        restaurant_id=restaurant.id,
        data={"reservation_id": str(r.id)},
    )
    audit(session, "reservation.requested", restaurant_id=restaurant.id, entity="Reservation", entity_id=r.id)
    await session.commit()
    await publish_pending(session)
    await _broadcast(r, "reservation.created")
    await _email_customer(
        r,
        restaurant,
        "Demande de réservation reçue",
        [
            f"Votre demande pour {r.party_size} personne(s) le {_local(restaurant, starts_at)} a bien été reçue.",
            "Le restaurant va la confirmer : vous recevrez un email.",
        ],
    )
    return _public_out(r, restaurant)


async def _by_token(session, token: str) -> tuple[Reservation, Restaurant]:
    r = await session.scalar(select(Reservation).where(Reservation.tracking_token == token))
    if not r:
        raise NotFound("Réservation introuvable")
    return r, await session.get(Restaurant, r.restaurant_id)


@public_router.get("/reservations/{token}", response_model=PublicReservationOut)
async def track_reservation(token: str, session: Session):
    r, restaurant = await _by_token(session, token)
    return _public_out(r, restaurant)


@public_router.post("/reservations/{token}/cancel", response_model=PublicReservationOut)
async def cancel_reservation(token: str, session: Session):
    r, restaurant = await _by_token(session, token)
    if r.status not in (R.PENDING, R.CONFIRMED) or r.starts_at <= datetime.now(UTC):
        raise Unprocessable("Cette réservation ne peut plus être annulée", code="cannot_cancel")
    r.status = R.CANCELLED
    notify(
        session,
        await restaurant_member_ids(session, restaurant.id, (MemberRole.OWNER, MemberRole.MANAGER, MemberRole.CASHIER)),
        "reservation.cancelled",
        f"Réservation annulée : {r.customer_name}",
        body=_local(restaurant, r.starts_at),
        link=f"/manage/{restaurant.id}/reservations",
        restaurant_id=restaurant.id,
    )
    audit(
        session, "reservation.cancelled_by_customer", restaurant_id=restaurant.id, entity="Reservation", entity_id=r.id
    )
    await session.commit()
    await publish_pending(session)
    await _broadcast(r, "reservation.updated")
    return _public_out(r, restaurant)


# ── Restaurant ──────────────────────────────────────────


@router.get("", response_model=list[ReservationOut])
async def list_reservations(
    ctx: Can(Perm.RESERVATIONS_VIEW),
    session: Session,
    status: ReservationStatus | None = None,
    day: date | None = Query(default=None, description="Jour (heure locale du restaurant)"),
    upcoming: bool = False,
):
    cond = [Reservation.restaurant_id == ctx.restaurant.id]
    if status:
        cond.append(Reservation.status == status)
    if day:
        tz = ZoneInfo(ctx.restaurant.timezone)
        start = datetime.combine(day, datetime.min.time(), tz)
        cond += [Reservation.starts_at >= start, Reservation.starts_at < start + timedelta(days=1)]
    if upcoming:
        cond.append(Reservation.starts_at >= datetime.now(UTC) - timedelta(hours=3))
    rows = await session.scalars(select(Reservation).where(*cond).order_by(Reservation.starts_at).limit(500))
    can_manage = ctx.can(Perm.RESERVATIONS_MANAGE)
    return [_out(r, can_manage) for r in rows]


@router.post("", response_model=ReservationOut, status_code=201)
async def create_reservation(body: StaffReservationIn, ctx: Can(Perm.RESERVATIONS_MANAGE), session: Session):
    from app.modules.restaurants import RESTAURANT_LOADS

    restaurant = await session.scalar(
        select(Restaurant).where(Restaurant.id == ctx.restaurant.id).options(*RESTAURANT_LOADS)
    )
    starts_at = _validate_slot(restaurant, body.starts_at)
    r = Reservation(
        restaurant_id=restaurant.id,
        starts_at=starts_at,
        party_size=body.party_size,
        customer_name=body.customer_name.strip(),
        customer_phone=body.customer_phone.strip(),
        customer_email=body.customer_email,
        note=body.note,
        status=R.CONFIRMED,
        tracking_token=new_refresh_token(),
    )
    session.add(r)
    await session.flush()
    audit(
        session,
        "reservation.created",
        actor_id=ctx.user.id,
        restaurant_id=restaurant.id,
        entity="Reservation",
        entity_id=r.id,
    )
    await session.commit()
    await _broadcast(r, "reservation.created")
    return _out(r)


@router.post("/{reservation_id}/status", response_model=ReservationOut)
async def set_status(reservation_id: uuid.UUID, body: StatusIn, ctx: Can(Perm.RESERVATIONS_MANAGE), session: Session):
    r = await session.get(Reservation, reservation_id)
    if not r or r.restaurant_id != ctx.restaurant.id:
        raise NotFound("Réservation introuvable")
    if body.status not in TRANSITIONS[r.status]:
        raise Unprocessable(f"Passage {r.status} → {body.status} impossible", code="invalid_transition")
    if body.status == R.DECLINED and not (body.staff_note and body.staff_note.strip()):
        raise Unprocessable("Indiquez le motif du refus", code="reason_required")
    previous = r.status
    r.status = body.status
    if body.staff_note is not None:
        r.staff_note = body.staff_note.strip() or None
    if r.customer_user_id and body.status in (R.CONFIRMED, R.DECLINED):
        notify(
            session,
            [r.customer_user_id],
            f"reservation.{body.status.lower()}",
            f"Réservation {LABEL[body.status]} — {ctx.restaurant.name}",
            body=_local(ctx.restaurant, r.starts_at),
            link=f"/reservation/{r.tracking_token}",
            restaurant_id=ctx.restaurant.id,
        )
    audit(
        session,
        "reservation.status_changed",
        actor_id=ctx.user.id,
        restaurant_id=ctx.restaurant.id,
        entity="Reservation",
        entity_id=r.id,
        data={"from": previous, "to": body.status},
    )
    await session.commit()
    await publish_pending(session)
    await _broadcast(r, "reservation.updated")
    if body.status == R.CONFIRMED:
        await _email_customer(
            r,
            ctx.restaurant,
            "Réservation confirmée",
            [f"Votre table pour {r.party_size} personne(s) est confirmée le {_local(ctx.restaurant, r.starts_at)}."],
        )
    elif body.status == R.DECLINED:
        await _email_customer(
            r,
            ctx.restaurant,
            "Réservation non disponible",
            [
                f"Le restaurant ne peut pas vous accueillir le {_local(ctx.restaurant, r.starts_at)}.",
                f"Motif : {r.staff_note}",
            ],
        )
    return _out(r)
