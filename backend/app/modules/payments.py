"""Paiements : transactions séparées du cycle de préparation.

- Espèces / carte (TPE) / mobile money au guichet : enregistrés par un employé qui a
  réellement encaissé. Aucun paiement n'est jamais simulé.
- Paiement en ligne : délégué à un prestataire (`PaymentProvider`) qui confirme par webhook.
  Aucun prestataire n'est configuré par défaut → l'API répond 503 plutôt que de simuler.
"""

import uuid
from datetime import UTC, datetime
from typing import Protocol

from fastapi import APIRouter
from pydantic import Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import audit
from app.core.deps import Can, RestaurantContext, Session
from app.core.errors import AppError, NotFound, Unprocessable
from app.core.permissions import Perm
from app.core.schema import Schema
from app.models import Order, Payment
from app.models.enums import PaymentMethod, PaymentStatus, TransactionStatus
from app.modules.orders import OrderOut, broadcast_order, load_order, order_out

router = APIRouter(prefix="/api/restaurants/{restaurant_id}/orders/{order_id}/payments", tags=["payments"])

MANUAL_METHODS = {PaymentMethod.CASH, PaymentMethod.CARD, PaymentMethod.MOBILE_MONEY, PaymentMethod.OTHER}


# ── Abstraction prestataire (Stripe, PayDunya, Wave… à brancher plus tard) ──


class CheckoutSession(Schema):
    provider: str
    redirect_url: str
    external_ref: str


class PaymentProvider(Protocol):
    name: str

    async def create_checkout(self, order: Order, *, success_url: str, cancel_url: str) -> CheckoutSession: ...

    async def parse_webhook(self, payload: bytes, headers: dict[str, str]) -> tuple[str, TransactionStatus]:
        """Vérifie la signature et retourne (external_ref, statut)."""
        ...


PROVIDERS: dict[str, PaymentProvider] = {}


class OnlinePaymentUnavailable(AppError):
    status_code = 503
    code = "online_payment_unavailable"


def get_provider(currency: str) -> PaymentProvider:
    # Point d'extension : choisir le prestataire selon la devise / le marché.
    if not PROVIDERS:
        raise OnlinePaymentUnavailable("Le paiement en ligne n'est pas encore disponible pour ce restaurant")
    return next(iter(PROVIDERS.values()))


# ── Logique ─────────────────────────────────────────────


def recompute_payment_status(order: Order) -> None:
    paid = sum(p.amount for p in order.payments if p.status == TransactionStatus.SUCCEEDED)
    refunded = any(p.status == TransactionStatus.REFUNDED for p in order.payments)
    order.amount_paid = paid
    if paid >= order.total and order.total > 0:
        order.payment_status = PaymentStatus.PAID
    elif paid > 0:
        order.payment_status = PaymentStatus.PARTIALLY_PAID
    elif refunded:
        order.payment_status = PaymentStatus.REFUNDED
    else:
        order.payment_status = PaymentStatus.UNPAID


async def record_payment(
    session: AsyncSession,
    ctx: RestaurantContext,
    order: Order,
    *,
    method: str,
    amount: int,
    amount_tendered: int | None = None,
    external_ref: str | None = None,
) -> Payment:
    method = PaymentMethod(method)
    if method not in MANUAL_METHODS:
        raise Unprocessable("Un paiement en ligne ne peut être confirmé que par le prestataire", code="invalid_method")
    if order.status == "CANCELLED":
        raise Unprocessable("Commande annulée", code="order_cancelled")
    remaining = order.total - order.amount_paid
    if remaining <= 0:
        raise Unprocessable("Cette commande est déjà réglée", code="already_paid")
    if amount <= 0 or amount > remaining:
        raise Unprocessable(f"Montant invalide (reste à payer : {remaining})", code="invalid_amount")
    if method == PaymentMethod.CASH:
        if amount_tendered is None:
            amount_tendered = amount
        if amount_tendered < amount:
            raise Unprocessable("Montant remis insuffisant", code="insufficient_cash")
    else:
        amount_tendered = None

    now = datetime.now(UTC)
    payment = Payment(
        restaurant_id=order.restaurant_id,
        order_id=order.id,
        method=method,
        provider="manual",
        status=TransactionStatus.SUCCEEDED,
        amount=amount,
        currency=order.currency,
        amount_tendered=amount_tendered,
        external_ref=external_ref,
        received_by_id=ctx.user.id,
        paid_at=now,
    )
    session.add(payment)
    order.payments.append(payment)
    recompute_payment_status(order)
    if order.payment_status == PaymentStatus.PAID and order.sent_to_kitchen_at is None:
        order.sent_to_kitchen_at = now  # prépaiement reçu → la commande part en cuisine
    audit(
        session,
        "payment.recorded",
        actor_id=ctx.user.id,
        restaurant_id=order.restaurant_id,
        entity="Order",
        entity_id=order.id,
        data={"method": method, "amount": amount},
    )
    return payment


class PaymentIn(Schema):
    method: PaymentMethod
    amount: int | None = Field(default=None, gt=0, description="Par défaut : le reste à payer")
    amount_tendered: int | None = Field(default=None, ge=0)
    external_ref: str | None = Field(default=None, max_length=128)


class RefundIn(Schema):
    reason: str = Field(min_length=3, max_length=255)


@router.post("", response_model=OrderOut, status_code=201)
async def add_payment(order_id: uuid.UUID, body: PaymentIn, ctx: Can(Perm.PAYMENTS_RECORD), session: Session):
    order = await load_order(session, ctx.restaurant.id, order_id)
    was_in_kitchen = order.sent_to_kitchen_at is not None
    await record_payment(
        session,
        ctx,
        order,
        method=body.method,
        amount=body.amount or (order.total - order.amount_paid),
        amount_tendered=body.amount_tendered,
        external_ref=body.external_ref,
    )
    await session.commit()
    order = await load_order(session, ctx.restaurant.id, order_id)
    await broadcast_order(order, ctx.restaurant, "order.updated" if was_in_kitchen else "order.created")
    return order_out(order, ctx.restaurant, ctx.perms)


@router.post("/{payment_id}/refund", response_model=OrderOut)
async def refund(
    order_id: uuid.UUID, payment_id: uuid.UUID, body: RefundIn, ctx: Can(Perm.PAYMENTS_REFUND), session: Session
):
    order = await load_order(session, ctx.restaurant.id, order_id)
    payment = next((p for p in order.payments if p.id == payment_id), None)
    if not payment:
        raise NotFound("Paiement introuvable")
    if payment.status != TransactionStatus.SUCCEEDED:
        raise Unprocessable("Seul un paiement encaissé peut être remboursé", code="invalid_state")
    if payment.provider != "manual":
        raise OnlinePaymentUnavailable("Le remboursement en ligne doit passer par le prestataire")
    payment.status = TransactionStatus.REFUNDED
    payment.refunded_at = datetime.now(UTC)
    payment.meta = {**(payment.meta or {}), "refund_reason": body.reason}
    recompute_payment_status(order)
    audit(
        session,
        "payment.refunded",
        actor_id=ctx.user.id,
        restaurant_id=order.restaurant_id,
        entity="Payment",
        entity_id=payment.id,
        data={"amount": payment.amount, "reason": body.reason},
    )
    await session.commit()
    order = await load_order(session, ctx.restaurant.id, order_id)
    await broadcast_order(order, ctx.restaurant, "order.updated")
    return order_out(order, ctx.restaurant, ctx.perms)
