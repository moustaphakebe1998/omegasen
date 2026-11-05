"""Statistiques d'un restaurant sur une période (dates locales du restaurant)."""

from datetime import date, timedelta
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Query
from sqlalchemy import Integer, cast, extract, func, select

from app.core.deps import Can, Session
from app.core.errors import Unprocessable
from app.core.permissions import Perm
from app.core.schema import Schema
from app.models import Order, OrderItem, QrCode
from app.models.enums import OrderStatus, PaymentStatus

router = APIRouter(prefix="/api/restaurants/{restaurant_id}/stats", tags=["analytics"])


class Bucket(Schema):
    key: str
    orders: int
    revenue: int


class TopProduct(Schema):
    name: str
    quantity: int
    revenue: int


class StatsOut(Schema):
    currency: str
    date_from: date
    date_to: date
    orders: int
    cancelled: int
    revenue: int  # encaissé (commandes payées, hors annulées)
    tax: int
    average_ticket: int
    avg_preparation_minutes: float | None
    by_channel: list[Bucket]
    by_service_mode: list[Bucket]
    by_day: list[Bucket]
    by_hour: list[Bucket]
    top_products: list[TopProduct]
    qr_scans_total: int


@router.get("", response_model=StatsOut)
async def stats(
    ctx: Can(Perm.STATS_VIEW),
    session: Session,
    date_from: date | None = Query(default=None, alias="from"),
    date_to: date | None = Query(default=None, alias="to"),
):
    r = ctx.restaurant
    date_to = date_to or date.today()
    date_from = date_from or (date_to - timedelta(days=29))
    if date_from > date_to or (date_to - date_from).days > 366:
        raise Unprocessable("Période invalide (366 jours maximum)")

    base = [Order.restaurant_id == r.id, Order.business_date >= date_from, Order.business_date <= date_to]
    valid = [*base, Order.status != OrderStatus.CANCELLED]
    paid = [*valid, Order.payment_status == PaymentStatus.PAID]

    orders = await session.scalar(select(func.count()).select_from(Order).where(*valid)) or 0
    cancelled = (
        await session.scalar(
            select(func.count()).select_from(Order).where(*base, Order.status == OrderStatus.CANCELLED)
        )
        or 0
    )
    revenue, tax = (
        await session.execute(
            select(func.coalesce(func.sum(Order.total), 0), func.coalesce(func.sum(Order.tax_total), 0)).where(*paid)
        )
    ).one()
    paid_count = await session.scalar(select(func.count()).select_from(Order).where(*paid)) or 0
    prep = await session.scalar(
        select(func.avg(extract("epoch", Order.ready_at - Order.sent_to_kitchen_at) / 60)).where(
            *valid, Order.ready_at.is_not(None), Order.sent_to_kitchen_at.is_not(None)
        )
    )

    async def group(col, label=str):
        rows = await session.execute(
            select(
                col,
                func.count(),
                func.coalesce(func.sum(Order.total).filter(Order.payment_status == PaymentStatus.PAID), 0),
            )
            .where(*valid)
            .group_by(col)
            .order_by(col)
        )
        return [Bucket(key=label(k), orders=n, revenue=int(rev)) for k, n, rev in rows]

    local_hour = cast(extract("hour", func.timezone(r.timezone, Order.created_at)), Integer)
    top = await session.execute(
        select(OrderItem.product_name, func.sum(OrderItem.quantity), func.sum(OrderItem.line_total))
        .join(Order, Order.id == OrderItem.order_id)
        .where(*valid)
        .group_by(OrderItem.product_name)
        .order_by(func.sum(OrderItem.quantity).desc())
        .limit(10)
    )
    scans = await session.scalar(select(QrCode.scan_count).where(QrCode.restaurant_id == r.id)) or 0
    ZoneInfo(r.timezone)  # valide le fuseau

    return StatsOut(
        currency=r.currency,
        date_from=date_from,
        date_to=date_to,
        orders=orders,
        cancelled=cancelled,
        revenue=int(revenue),
        tax=int(tax),
        average_ticket=int(revenue) // paid_count if paid_count else 0,
        avg_preparation_minutes=round(float(prep), 1) if prep is not None else None,
        by_channel=await group(Order.channel),
        by_service_mode=await group(Order.service_mode),
        by_day=await group(Order.business_date, lambda d: d.isoformat()),
        by_hour=await group(local_hour, lambda h: f"{int(h):02d}h"),
        top_products=[TopProduct(name=n, quantity=int(q), revenue=int(v)) for n, q, v in top],
        qr_scans_total=scans,
    )
