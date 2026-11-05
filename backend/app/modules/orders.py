"""Moteur de commandes unique : QR Code, caisse, en ligne et borne passent tous par `place_order`.

Règles :
- les prix sont TOUJOURS recalculés côté serveur à partir du menu (prix TTC, promo valide) ;
- les noms / prix sont figés dans la commande (instantanés) ;
- la TVA est extraite des montants TTC ;
- le numéro court est attribué via un compteur journalier verrouillé (pas de doublon) ;
- le statut de préparation et le statut de paiement sont indépendants.
"""

import uuid
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Query
from pydantic import Field, model_validator
from sqlalchemy import and_, func, or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.audit import audit
from app.core.deps import FrontOfHouse, KitchenStaff, RestaurantContext, Session
from app.core.errors import Conflict, Forbidden, NotFound, Unprocessable
from app.core.money import extract_vat
from app.core.realtime import order_channel, publish, restaurant_channel
from app.core.schema import Schema
from app.core.security import random_code
from app.models import (
    Option,
    OptionGroup,
    Order,
    OrderCounter,
    OrderItem,
    OrderItemOption,
    OrderStatusEvent,
    Product,
    Restaurant,
    User,
)
from app.models.enums import (
    MemberRole,
    OrderChannel,
    OrderStatus,
    PaymentPreference,
    PaymentStatus,
    RestaurantStatus,
    ServiceMode,
)
from app.modules.notifications import notify, publish_pending, restaurant_member_ids

router = APIRouter(prefix="/api/restaurants/{restaurant_id}/orders", tags=["orders"])

S = OrderStatus
R = MemberRole
ALL_STAFF = {R.OWNER, R.MANAGER, R.CASHIER, R.KITCHEN}
FOH = {R.OWNER, R.MANAGER, R.CASHIER}

# (de, vers) → rôles autorisés
TRANSITIONS: dict[tuple[OrderStatus, OrderStatus], set[MemberRole]] = {
    (S.NEW, S.PREPARING): ALL_STAFF,
    (S.NEW, S.READY): ALL_STAFF,
    (S.PREPARING, S.READY): ALL_STAFF,
    (S.READY, S.COMPLETED): ALL_STAFF,
    # retours arrière (erreur de manipulation)
    (S.PREPARING, S.NEW): ALL_STAFF,
    (S.READY, S.PREPARING): ALL_STAFF,
    (S.COMPLETED, S.READY): FOH,
    # annulation
    (S.NEW, S.CANCELLED): FOH,
    (S.PREPARING, S.CANCELLED): FOH,
    (S.READY, S.CANCELLED): FOH,
}


def allowed_transitions(current: OrderStatus, role: MemberRole | None) -> list[OrderStatus]:
    return [to for (frm, to), roles in TRANSITIONS.items() if frm == current and (role is None or role in roles)]


# ── Schémas ─────────────────────────────────────────────


class ItemIn(Schema):
    product_id: uuid.UUID
    quantity: int = Field(ge=1, le=99)
    option_ids: list[uuid.UUID] = Field(default_factory=list, max_length=40)
    note: str | None = Field(default=None, max_length=255)


class PlaceOrderIn(Schema):
    service_mode: ServiceMode
    items: list[ItemIn] = Field(min_length=1, max_length=60)
    customer_name: str | None = Field(default=None, max_length=80)
    customer_phone: str | None = Field(default=None, max_length=32, pattern=r"^[0-9+ ().-]{6,32}$")
    table_label: str | None = Field(default=None, max_length=20)
    note: str | None = Field(default=None, max_length=500)
    payment_preference: PaymentPreference | None = None
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=64)


class ItemOptionOut(Schema):
    group_name: str
    option_name: str
    price_delta: int


class ItemOut(Schema):
    id: uuid.UUID
    product_id: uuid.UUID | None
    station_id: uuid.UUID | None
    product_name: str
    unit_price: int
    quantity: int
    line_total: int
    note: str | None
    options: list[ItemOptionOut]


class PaymentBrief(Schema):
    id: uuid.UUID
    method: str
    status: str
    amount: int
    amount_tendered: int | None
    paid_at: datetime | None


class OrderOut(Schema):
    id: uuid.UUID
    restaurant_id: uuid.UUID
    reference: str
    number: int
    display_number: str
    channel: OrderChannel
    service_mode: ServiceMode
    status: OrderStatus
    payment_status: PaymentStatus
    payment_preference: PaymentPreference | None
    customer_name: str | None
    customer_phone: str | None
    table_label: str | None
    note: str | None
    currency: str
    subtotal: int
    discount: int
    total: int
    tax_total: int
    amount_paid: int
    tracking_token: str
    sent_to_kitchen_at: datetime | None
    created_at: datetime
    preparing_at: datetime | None
    ready_at: datetime | None
    completed_at: datetime | None
    cancelled_at: datetime | None
    cancel_reason: str | None
    is_late: bool
    allowed_transitions: list[OrderStatus]
    items: list[ItemOut]
    payments: list[PaymentBrief]


class TrackingOut(Schema):
    reference: str
    display_number: str
    restaurant_name: str
    restaurant_slug: str
    channel: OrderChannel
    service_mode: ServiceMode
    status: OrderStatus
    payment_status: PaymentStatus
    payment_preference: PaymentPreference | None
    customer_name: str | None
    currency: str
    total: int
    tax_total: int
    created_at: datetime
    preparing_at: datetime | None
    ready_at: datetime | None
    completed_at: datetime | None
    cancelled_at: datetime | None
    items: list[ItemOut]


ORDER_LOADS = (
    selectinload(Order.items).selectinload(OrderItem.options),
    selectinload(Order.payments),
)


def _is_late(o: Order, late_after: int, now: datetime) -> bool:
    if o.status not in (S.NEW, S.PREPARING):
        return False
    start = o.sent_to_kitchen_at or o.created_at
    return now - start > timedelta(minutes=late_after)


def _items_out(o: Order) -> list[ItemOut]:
    return [
        ItemOut(
            id=i.id,
            product_id=i.product_id,
            station_id=i.station_id,
            product_name=i.product_name,
            unit_price=i.unit_price,
            quantity=i.quantity,
            line_total=i.line_total,
            note=i.note,
            options=[
                ItemOptionOut(group_name=x.group_name, option_name=x.option_name, price_delta=x.price_delta)
                for x in i.options
            ],
        )
        for i in o.items
    ]


def order_out(o: Order, restaurant: Restaurant, role: MemberRole | None = None) -> OrderOut:
    now = datetime.now(UTC)
    return OrderOut(
        id=o.id,
        restaurant_id=o.restaurant_id,
        reference=o.reference,
        number=o.number,
        display_number=o.display_number,
        channel=o.channel,
        service_mode=o.service_mode,
        status=o.status,
        payment_status=o.payment_status,
        payment_preference=o.payment_preference,
        customer_name=o.customer_name,
        customer_phone=o.customer_phone,
        table_label=o.table_label,
        note=o.note,
        currency=o.currency,
        subtotal=o.subtotal,
        discount=o.discount,
        total=o.total,
        tax_total=o.tax_total,
        amount_paid=o.amount_paid,
        tracking_token=o.tracking_token,
        sent_to_kitchen_at=o.sent_to_kitchen_at,
        created_at=o.created_at,
        preparing_at=o.preparing_at,
        ready_at=o.ready_at,
        completed_at=o.completed_at,
        cancelled_at=o.cancelled_at,
        cancel_reason=o.cancel_reason,
        is_late=_is_late(o, restaurant.late_after_minutes, now),
        allowed_transitions=allowed_transitions(o.status, role),
        items=_items_out(o),
        payments=[
            PaymentBrief(
                id=p.id,
                method=p.method,
                status=p.status,
                amount=p.amount,
                amount_tendered=p.amount_tendered,
                paid_at=p.paid_at,
            )
            for p in o.payments
        ],
    )


def tracking_out(o: Order, restaurant: Restaurant) -> TrackingOut:
    return TrackingOut(
        reference=o.reference,
        display_number=o.display_number,
        restaurant_name=restaurant.name,
        restaurant_slug=restaurant.slug,
        channel=o.channel,
        service_mode=o.service_mode,
        status=o.status,
        payment_status=o.payment_status,
        payment_preference=o.payment_preference,
        customer_name=o.customer_name,
        currency=o.currency,
        total=o.total,
        tax_total=o.tax_total,
        created_at=o.created_at,
        preparing_at=o.preparing_at,
        ready_at=o.ready_at,
        completed_at=o.completed_at,
        cancelled_at=o.cancelled_at,
        items=_items_out(o),
    )


async def load_order(session: AsyncSession, restaurant_id: uuid.UUID, order_id: uuid.UUID) -> Order:
    o = await session.scalar(
        select(Order)
        .where(Order.id == order_id, Order.restaurant_id == restaurant_id)
        .options(*ORDER_LOADS)
        .execution_options(populate_existing=True)
    )
    if not o:
        raise NotFound("Commande introuvable")
    return o


async def notify_new_order(session: AsyncSession, o: Order, restaurant: Restaurant) -> None:
    """Commande publique (QR, en ligne, borne) : prévient les responsables du restaurant."""
    notify(
        session,
        await restaurant_member_ids(session, restaurant.id, (MemberRole.OWNER, MemberRole.MANAGER)),
        "order.created",
        f"Nouvelle commande {o.display_number}",
        body=f"{CHANNEL_LABEL.get(o.channel, o.channel)} · {o.customer_name or 'Client'}",
        link=f"/manage/{restaurant.id}/orders",
        restaurant_id=restaurant.id,
        data={"order_id": str(o.id), "reference": o.reference},
    )


async def notify_order_ready(session: AsyncSession, o: Order, restaurant: Restaurant) -> None:
    """Commande prête : prévient la caisse et les responsables, ainsi que le client s'il a un compte."""
    staff = await restaurant_member_ids(
        session, restaurant.id, (MemberRole.OWNER, MemberRole.MANAGER, MemberRole.CASHIER)
    )
    notify(
        session,
        staff,
        "order.ready",
        f"Commande {o.display_number} prête",
        body=o.customer_name or None,
        link=f"/pos/{restaurant.id}",
        restaurant_id=restaurant.id,
        data={"order_id": str(o.id), "reference": o.reference},
    )
    if o.customer_user_id:
        notify(
            session,
            [o.customer_user_id],
            "order.ready",
            f"Votre commande {o.display_number} est prête",
            body=restaurant.name,
            link=f"/track/{o.tracking_token}",
            restaurant_id=restaurant.id,
        )


CHANNEL_LABEL = {
    OrderChannel.QR: "QR Code",
    OrderChannel.ONLINE: "En ligne",
    OrderChannel.KIOSK: "Borne",
    OrderChannel.POS: "Guichet",
}


async def broadcast_order(o: Order, restaurant: Restaurant, event: str) -> None:
    """Diffuse l'état de la commande à la cuisine/caisse et à la page de suivi du client."""
    await publish(restaurant_channel(restaurant.id), event, order_out(o, restaurant).model_dump(mode="json"))
    await publish(order_channel(o.tracking_token), "order.updated", tracking_out(o, restaurant).model_dump(mode="json"))


# ── Création ────────────────────────────────────────────


def business_date(restaurant: Restaurant, at: datetime) -> date:
    return at.astimezone(ZoneInfo(restaurant.timezone)).date()


async def _next_number(session: AsyncSession, restaurant_id: uuid.UUID, day: date) -> int:
    stmt = (
        pg_insert(OrderCounter)
        .values(restaurant_id=restaurant_id, business_date=day, last_number=1)
        .on_conflict_do_update(
            index_elements=[OrderCounter.restaurant_id, OrderCounter.business_date],
            set_={"last_number": OrderCounter.last_number + 1},
        )
        .returning(OrderCounter.last_number)
    )
    return (await session.execute(stmt)).scalar_one()


async def _build_items(
    session: AsyncSession, restaurant: Restaurant, items: list[ItemIn], *, public: bool, now: datetime
) -> list[OrderItem]:
    product_ids = {i.product_id for i in items}
    products = {
        p.id: p
        for p in await session.scalars(
            select(Product)
            .where(Product.id.in_(product_ids), Product.restaurant_id == restaurant.id, Product.deleted_at.is_(None))
            .options(selectinload(Product.option_groups).selectinload(OptionGroup.options))
        )
    }
    lines: list[OrderItem] = []
    for pos, item in enumerate(items):
        p = products.get(item.product_id)
        if not p or (public and not p.is_visible):
            raise Unprocessable(
                "Un produit du panier n'existe plus",
                code="product_unavailable",
                details={"product_id": str(item.product_id)},
            )
        if not p.is_available:
            raise Unprocessable(
                f"« {p.name} » n'est plus disponible", code="product_unavailable", details={"product_id": str(p.id)}
            )
        if len(set(item.option_ids)) != len(item.option_ids):
            raise Unprocessable("Option sélectionnée en double", code="invalid_options")

        options_by_id: dict[uuid.UUID, tuple[OptionGroup, Option]] = {
            o.id: (g, o) for g in p.option_groups for o in g.options
        }
        chosen: list[tuple[OptionGroup, Option]] = []
        for oid in item.option_ids:
            pair = options_by_id.get(oid)
            if not pair:
                raise Unprocessable(f"Option invalide pour « {p.name} »", code="invalid_options")
            if not pair[1].is_available:
                raise Unprocessable(f"L'option « {pair[1].name} » n'est plus disponible", code="invalid_options")
            chosen.append(pair)
        for g in p.option_groups:
            n = sum(1 for cg, _ in chosen if cg.id == g.id)
            if n < g.min_choices or n > g.max_choices:
                raise Unprocessable(
                    f"« {g.name} » : choisissez entre {g.min_choices} et {g.max_choices} option(s)",
                    code="invalid_options",
                    details={"product_id": str(p.id), "group_id": str(g.id)},
                )

        base = p.effective_price(now)
        unit = base + sum(o.price_delta for _, o in chosen)
        line = OrderItem(
            position=pos,
            product_id=p.id,
            station_id=p.station_id,
            product_name=p.name,
            base_price=base,
            unit_price=unit,
            quantity=item.quantity,
            line_total=unit * item.quantity,
            vat_rate_bp=p.vat_rate_bp if p.vat_rate_bp is not None else restaurant.vat_rate_bp,
            note=(item.note or "").strip() or None,
        )
        line.options = [
            OrderItemOption(option_id=o.id, group_name=g.name, option_name=o.name, price_delta=o.price_delta)
            for g, o in chosen
        ]
        lines.append(line)
    return lines


async def place_order(
    session: AsyncSession,
    restaurant: Restaurant,
    body: PlaceOrderIn,
    *,
    channel: OrderChannel,
    actor: User | None,
) -> tuple[Order, bool]:
    """Crée la commande. Retourne (commande, créée?) — False si la clé d'idempotence existait déjà."""
    from app.modules.restaurants import is_open_at  # import local pour éviter un cycle

    public = channel in (OrderChannel.QR, OrderChannel.ONLINE, OrderChannel.KIOSK)
    now = datetime.now(UTC)

    if body.idempotency_key:
        existing = await session.scalar(
            select(Order)
            .where(Order.restaurant_id == restaurant.id, Order.idempotency_key == body.idempotency_key)
            .options(*ORDER_LOADS)
        )
        if existing:
            return existing, False

    if restaurant.status != RestaurantStatus.ACTIVE or restaurant.deleted_at:
        raise Unprocessable("Ce restaurant n'accepte pas de commandes", code="restaurant_closed")
    if public:
        if not restaurant.accepting_orders:
            raise Unprocessable("Le restaurant ne prend pas de commandes pour le moment", code="restaurant_closed")
        await session.refresh(restaurant, ["opening_hours"])
        if not is_open_at(restaurant, now):
            raise Unprocessable("Le restaurant est actuellement fermé", code="restaurant_closed")
        if not (body.customer_name or "").strip():
            raise Unprocessable("Merci d'indiquer votre prénom", code="customer_name_required")
    if body.service_mode == ServiceMode.DELIVERY:
        raise Unprocessable("La livraison n'est pas encore disponible", code="service_mode_unavailable")
    if body.service_mode == ServiceMode.DINE_IN and not restaurant.dine_in_enabled:
        raise Unprocessable("La consommation sur place n'est pas proposée", code="service_mode_unavailable")
    if body.service_mode == ServiceMode.TAKEAWAY and not restaurant.takeaway_enabled:
        raise Unprocessable("La vente à emporter n'est pas proposée", code="service_mode_unavailable")

    lines = await _build_items(session, restaurant, body.items, public=public, now=now)
    subtotal = sum(line.line_total for line in lines)
    tax_total = sum(extract_vat(line.line_total, line.vat_rate_bp) for line in lines)

    day = business_date(restaurant, now)
    number = await _next_number(session, restaurant.id, day)
    # Les commandes publiques attendent le paiement si le restaurant l'exige.
    to_kitchen_now = not (public and restaurant.require_prepayment)

    order = Order(
        restaurant_id=restaurant.id,
        business_date=day,
        number=number,
        reference=f"{day:%y%m%d}-{number:03d}-{random_code(4).upper()}",
        channel=channel,
        service_mode=body.service_mode,
        status=S.NEW,
        payment_status=PaymentStatus.UNPAID,
        payment_preference=body.payment_preference,
        customer_name=(body.customer_name or "").strip() or None,
        customer_phone=body.customer_phone,
        table_label=body.table_label,
        note=(body.note or "").strip() or None,
        currency=restaurant.currency,
        subtotal=subtotal,
        discount=0,
        total=subtotal,
        tax_total=tax_total,
        amount_paid=0,
        tracking_token=random_code(24),
        idempotency_key=body.idempotency_key,
        created_by_id=actor.id if actor else None,
        sent_to_kitchen_at=now if to_kitchen_now else None,
    )
    order.items = lines
    order.events = [
        OrderStatusEvent(
            from_status=None, to_status=S.NEW, actor_id=order.created_by_id, reason=f"Commande créée ({channel})"
        )
    ]
    order.payments = []
    session.add(order)
    audit(
        session,
        "order.created",
        actor_id=order.created_by_id,
        restaurant_id=restaurant.id,
        entity="Order",
        data={"reference": order.reference, "channel": channel, "total": subtotal},
    )
    try:
        await session.flush()
    except IntegrityError:
        # Course sur la même clé d'idempotence : on renvoie la commande gagnante.
        await session.rollback()
        if body.idempotency_key:
            existing = await session.scalar(
                select(Order)
                .where(Order.restaurant_id == restaurant.id, Order.idempotency_key == body.idempotency_key)
                .options(*ORDER_LOADS)
            )
            if existing:
                return existing, False
        raise Conflict("Commande en double") from None
    return order, True


# ── Changement de statut ────────────────────────────────


class StatusIn(Schema):
    status: OrderStatus
    reason: str | None = Field(default=None, max_length=255)

    @model_validator(mode="after")
    def _reason(self):
        if self.status == S.CANCELLED and not (self.reason or "").strip():
            raise ValueError("Un motif est requis pour annuler une commande")
        return self


async def change_status(session: AsyncSession, ctx: RestaurantContext, order: Order, body: StatusIn) -> None:
    key = (order.status, body.status)
    if key not in TRANSITIONS:
        raise Unprocessable(f"Transition {order.status} → {body.status} impossible", code="invalid_transition")
    if not ctx.is_superadmin and ctx.role not in TRANSITIONS[key]:
        raise Forbidden("Votre rôle ne permet pas ce changement de statut")
    if order.sent_to_kitchen_at is None and body.status != S.CANCELLED:
        raise Unprocessable(
            "Commande en attente de paiement : elle n'est pas encore en cuisine", code="awaiting_payment"
        )
    now = datetime.now(UTC)
    frm, to = order.status, body.status
    order.status = to
    if to == S.PREPARING and frm == S.NEW:
        order.preparing_at = now
    elif to == S.READY and frm in (S.NEW, S.PREPARING):
        order.ready_at = now
        order.preparing_at = order.preparing_at or now
    elif to == S.COMPLETED:
        order.completed_at = now
    elif to == S.CANCELLED:
        order.cancelled_at, order.cancel_reason = now, body.reason
    # retours arrière : on efface l'horodatage de l'étape annulée
    if (frm, to) == (S.PREPARING, S.NEW):
        order.preparing_at = None
    elif (frm, to) == (S.READY, S.PREPARING):
        order.ready_at = None
    elif (frm, to) == (S.COMPLETED, S.READY):
        order.completed_at = None
    session.add(
        OrderStatusEvent(order_id=order.id, from_status=frm, to_status=to, actor_id=ctx.user.id, reason=body.reason)
    )
    if to == S.READY and frm in (S.NEW, S.PREPARING):
        await notify_order_ready(session, order, ctx.restaurant)
    audit(
        session,
        "order.status_changed",
        actor_id=ctx.user.id,
        restaurant_id=order.restaurant_id,
        entity="Order",
        entity_id=order.id,
        data={"from": frm, "to": to, "reason": body.reason},
    )


# ── Routes personnel ────────────────────────────────────


class PosPaymentIn(Schema):
    method: str = Field(pattern="^(CASH|CARD|MOBILE_MONEY|OTHER)$")
    amount_tendered: int | None = Field(default=None, ge=0)
    external_ref: str | None = Field(default=None, max_length=128)


class PosOrderIn(PlaceOrderIn):
    payment: PosPaymentIn | None = None


class OrderPage(Schema):
    items: list[OrderOut]
    total: int
    page: int
    page_size: int


@router.post("", response_model=OrderOut, status_code=201)
async def create_pos_order(body: PosOrderIn, ctx: FrontOfHouse, session: Session):
    """Commande saisie au guichet (caisse). Peut être encaissée immédiatement."""
    from app.modules.payments import record_payment  # cycle

    order, created = await place_order(session, ctx.restaurant, body, channel=OrderChannel.POS, actor=ctx.user)
    if created and body.payment:
        await record_payment(
            session,
            ctx,
            order,
            method=body.payment.method,
            amount=order.total,
            amount_tendered=body.payment.amount_tendered,
            external_ref=body.payment.external_ref,
        )
    await session.commit()
    order = await load_order(session, ctx.restaurant.id, order.id)
    if created:
        await broadcast_order(order, ctx.restaurant, "order.created")
    return order_out(order, ctx.restaurant, ctx.role)


@router.get("", response_model=OrderPage)
async def list_orders(
    ctx: FrontOfHouse,
    session: Session,
    status: list[OrderStatus] | None = Query(default=None),
    channel: OrderChannel | None = None,
    payment_status: PaymentStatus | None = None,
    day: date | None = None,
    q: str | None = Query(default=None, max_length=40),
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=100),
):
    cond = [Order.restaurant_id == ctx.restaurant.id]
    if status:
        cond.append(Order.status.in_(status))
    if channel:
        cond.append(Order.channel == channel)
    if payment_status:
        cond.append(Order.payment_status == payment_status)
    if day:
        cond.append(Order.business_date == day)
    if q:
        like = f"%{q.strip()}%"
        conds = [Order.reference.ilike(like), Order.customer_name.ilike(like)]
        if q.strip().isdigit():
            conds.append(Order.number == int(q.strip()))
        cond.append(or_(*conds))
    total = await session.scalar(select(func.count()).select_from(Order).where(and_(*cond)))
    rows = await session.scalars(
        select(Order)
        .where(and_(*cond))
        .options(*ORDER_LOADS)
        .order_by(Order.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return OrderPage(
        items=[order_out(o, ctx.restaurant, ctx.role) for o in rows], total=total or 0, page=page, page_size=page_size
    )


@router.get("/active", response_model=list[OrderOut])
async def active_orders(
    ctx: KitchenStaff,
    session: Session,
    station_id: uuid.UUID | None = None,
    include_completed_minutes: int = Query(0, ge=0, le=240),
):
    """Écran cuisine : commandes envoyées en cuisine et non terminées (+ terminées récemment)."""
    cond = [Order.restaurant_id == ctx.restaurant.id, Order.sent_to_kitchen_at.is_not(None)]
    active = Order.status.in_([S.NEW, S.PREPARING, S.READY])
    if include_completed_minutes:
        since = datetime.now(UTC) - timedelta(minutes=include_completed_minutes)
        cond.append(or_(active, and_(Order.status == S.COMPLETED, Order.completed_at >= since)))
    else:
        cond.append(active)
    if station_id:
        cond.append(Order.items.any(OrderItem.station_id == station_id))
    rows = await session.scalars(select(Order).where(*cond).options(*ORDER_LOADS).order_by(Order.sent_to_kitchen_at))
    return [order_out(o, ctx.restaurant, ctx.role) for o in rows]


@router.get("/awaiting-payment", response_model=list[OrderOut])
async def awaiting_payment(ctx: FrontOfHouse, session: Session):
    """Commandes publiques en attente de paiement (restaurants avec prépaiement obligatoire)."""
    rows = await session.scalars(
        select(Order)
        .where(Order.restaurant_id == ctx.restaurant.id, Order.sent_to_kitchen_at.is_(None), Order.status == S.NEW)
        .options(*ORDER_LOADS)
        .order_by(Order.created_at)
    )
    return [order_out(o, ctx.restaurant, ctx.role) for o in rows]


@router.get("/transitions", response_model=dict[OrderStatus, list[OrderStatus]])
async def transition_rules(ctx: KitchenStaff):
    """Transitions de statut permises au rôle courant (source unique pour les écrans)."""
    return {st: allowed_transitions(st, ctx.role) for st in OrderStatus}


@router.get("/{order_id}", response_model=OrderOut)
async def get_order(order_id: uuid.UUID, ctx: KitchenStaff, session: Session):
    return order_out(await load_order(session, ctx.restaurant.id, order_id), ctx.restaurant, ctx.role)


@router.post("/{order_id}/status", response_model=OrderOut)
async def set_status(order_id: uuid.UUID, body: StatusIn, ctx: KitchenStaff, session: Session):
    order = await load_order(session, ctx.restaurant.id, order_id)
    await change_status(session, ctx, order, body)
    await session.commit()
    await publish_pending(session)
    order = await load_order(session, ctx.restaurant.id, order_id)
    await broadcast_order(order, ctx.restaurant, "order.updated")
    return order_out(order, ctx.restaurant, ctx.role)
