import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, Timestamps, UUIDPk
from app.models.enums import PaymentMethod, TransactionStatus
from app.models.types import str_enum


class Payment(UUIDPk, Timestamps, Base):
    """Transaction financière, séparée du cycle de préparation de la commande.

    Une transaction n'est SUCCEEDED que si un employé a réellement encaissé
    (espèces / TPE) ou si un prestataire l'a confirmée par webhook.
    """

    __tablename__ = "payments"
    __table_args__ = (CheckConstraint("amount > 0", name="amount_positive"),)

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("restaurants.id", ondelete="RESTRICT"), index=True
    )
    order_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("orders.id", ondelete="RESTRICT"), index=True
    )
    method: Mapped[PaymentMethod] = mapped_column(str_enum(PaymentMethod))
    provider: Mapped[str] = mapped_column(String(32), default="manual")
    status: Mapped[TransactionStatus] = mapped_column(str_enum(TransactionStatus), default=TransactionStatus.PENDING)
    amount: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3))
    amount_tendered: Mapped[int | None] = mapped_column(Integer)  # espèces remises
    external_ref: Mapped[str | None] = mapped_column(String(128), index=True)
    received_by_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    meta: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)

    order: Mapped["Order"] = relationship(back_populates="payments")  # noqa: F821
