import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, Timestamps, UUIDPk
from app.models.enums import ReservationStatus
from app.models.types import str_enum


class Reservation(UUIDPk, Timestamps, Base):
    """Réservation de table : demandée par un client, confirmée ou refusée par le restaurant."""

    __tablename__ = "reservations"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("restaurants.id", ondelete="CASCADE"), index=True
    )
    customer_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    party_size: Mapped[int] = mapped_column(Integer)
    customer_name: Mapped[str] = mapped_column(String(120))
    customer_phone: Mapped[str] = mapped_column(String(32))
    customer_email: Mapped[str | None] = mapped_column(String(254))
    note: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ReservationStatus] = mapped_column(
        str_enum(ReservationStatus), default=ReservationStatus.PENDING, index=True
    )
    staff_note: Mapped[str | None] = mapped_column(Text)  # motif de refus, remarque interne
    tracking_token: Mapped[str] = mapped_column(String(64), unique=True)
