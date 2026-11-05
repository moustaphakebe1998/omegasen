import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, Timestamps, UUIDPk, utcnow
from app.models.enums import (
    OrderChannel,
    OrderStatus,
    PaymentPreference,
    PaymentStatus,
    ServiceMode,
)
from app.models.types import str_enum


class OrderCounter(Base):
    """Compteur journalier par restaurant pour les numéros de commande (verrouillé en écriture)."""

    __tablename__ = "order_counters"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("restaurants.id", ondelete="CASCADE"), primary_key=True
    )
    business_date: Mapped[date] = mapped_column(Date, primary_key=True)
    last_number: Mapped[int] = mapped_column(Integer, default=0)


class Order(UUIDPk, Timestamps, Base):
    __tablename__ = "orders"
    __table_args__ = (
        UniqueConstraint("restaurant_id", "business_date", "number", name="uq_order_daily_number"),
        UniqueConstraint("restaurant_id", "idempotency_key", name="uq_order_idempotency"),
        CheckConstraint("total >= 0", name="total_positive"),
    )

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("restaurants.id", ondelete="RESTRICT"), index=True
    )
    business_date: Mapped[date] = mapped_column(Date, index=True)
    number: Mapped[int] = mapped_column(Integer)
    reference: Mapped[str] = mapped_column(String(32), unique=True)  # ex. 20261105-042-K7H

    channel: Mapped[OrderChannel] = mapped_column(str_enum(OrderChannel))
    service_mode: Mapped[ServiceMode] = mapped_column(str_enum(ServiceMode))
    status: Mapped[OrderStatus] = mapped_column(str_enum(OrderStatus), default=OrderStatus.NEW, index=True)
    payment_status: Mapped[PaymentStatus] = mapped_column(str_enum(PaymentStatus), default=PaymentStatus.UNPAID)
    payment_preference: Mapped[PaymentPreference | None] = mapped_column(str_enum(PaymentPreference))
    sent_to_kitchen_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    customer_name: Mapped[str | None] = mapped_column(String(80))
    customer_phone: Mapped[str | None] = mapped_column(String(32))
    table_label: Mapped[str | None] = mapped_column(String(20))
    note: Mapped[str | None] = mapped_column(String(500))

    currency: Mapped[str] = mapped_column(String(3))
    subtotal: Mapped[int] = mapped_column(Integer)  # TTC avant remise
    discount: Mapped[int] = mapped_column(Integer, default=0)
    total: Mapped[int] = mapped_column(Integer)  # TTC à payer
    tax_total: Mapped[int] = mapped_column(Integer)  # TVA incluse dans total
    amount_paid: Mapped[int] = mapped_column(Integer, default=0)

    tracking_token: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(64))
    created_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    preparing_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ready_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cancel_reason: Mapped[str | None] = mapped_column(String(255))

    items: Mapped[list["OrderItem"]] = relationship(
        back_populates="order", cascade="all, delete-orphan", order_by="OrderItem.position"
    )
    events: Mapped[list["OrderStatusEvent"]] = relationship(
        cascade="all, delete-orphan", order_by="OrderStatusEvent.created_at"
    )
    payments: Mapped[list["Payment"]] = relationship(  # noqa: F821
        back_populates="order", order_by="Payment.created_at"
    )

    @property
    def display_number(self) -> str:
        return f"{self.number:03d}"


class OrderItem(UUIDPk, Base):
    __tablename__ = "order_items"
    __table_args__ = (CheckConstraint("quantity > 0", name="quantity_positive"),)

    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, default=0)
    product_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="SET NULL"), index=True
    )
    station_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("kitchen_stations.id", ondelete="SET NULL")
    )
    # Instantanés au moment de la commande
    product_name: Mapped[str] = mapped_column(String(120))
    base_price: Mapped[int] = mapped_column(Integer)
    unit_price: Mapped[int] = mapped_column(Integer)  # base + suppléments
    quantity: Mapped[int] = mapped_column(Integer)
    line_total: Mapped[int] = mapped_column(Integer)
    vat_rate_bp: Mapped[int] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(String(255))

    order: Mapped[Order] = relationship(back_populates="items")
    options: Mapped[list["OrderItemOption"]] = relationship(cascade="all, delete-orphan")


class OrderItemOption(UUIDPk, Base):
    __tablename__ = "order_item_options"

    order_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("order_items.id", ondelete="CASCADE"), index=True
    )
    option_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("options.id", ondelete="SET NULL")
    )
    group_name: Mapped[str] = mapped_column(String(80))
    option_name: Mapped[str] = mapped_column(String(80))
    price_delta: Mapped[int] = mapped_column(Integer)


class OrderStatusEvent(UUIDPk, Base):
    __tablename__ = "order_status_events"

    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="CASCADE"), index=True
    )
    from_status: Mapped[OrderStatus | None] = mapped_column(str_enum(OrderStatus, "from_status"))
    to_status: Mapped[OrderStatus] = mapped_column(str_enum(OrderStatus, "to_status"))
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    reason: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
