import uuid
from datetime import datetime, time

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    Time,
)
from sqlalchemy import false as sql_false
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, Timestamps, UUIDPk
from app.models.enums import RestaurantStatus
from app.models.types import str_enum


class Restaurant(UUIDPk, Timestamps, Base):
    __tablename__ = "restaurants"

    slug: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    cuisine: Mapped[str | None] = mapped_column(String(80))

    # Coordonnées
    phone: Mapped[str | None] = mapped_column(String(32))
    email: Mapped[str | None] = mapped_column(String(254))
    website: Mapped[str | None] = mapped_column(String(255))
    address_line: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(120))
    postal_code: Mapped[str | None] = mapped_column(String(20))
    country: Mapped[str] = mapped_column(String(2), default="FR")
    latitude: Mapped[float | None] = mapped_column(Float)
    longitude: Mapped[float | None] = mapped_column(Float)

    # Paramètres financiers
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    timezone: Mapped[str] = mapped_column(String(64), default="Europe/Paris")
    vat_rate_bp: Mapped[int] = mapped_column(Integer, default=1000)  # 1000 = 10 %

    # Paramètres de commande
    status: Mapped[RestaurantStatus] = mapped_column(str_enum(RestaurantStatus), default=RestaurantStatus.ACTIVE)
    accepting_orders: Mapped[bool] = mapped_column(Boolean, default=True)
    dine_in_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    takeaway_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    require_prepayment: Mapped[bool] = mapped_column(Boolean, default=False)
    late_after_minutes: Mapped[int] = mapped_column(Integer, default=15)
    reservations_enabled: Mapped[bool] = mapped_column(Boolean, default=True)

    logo_media_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("media.id", ondelete="SET NULL", use_alter=True),
    )
    cover_media_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("media.id", ondelete="SET NULL", use_alter=True),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Restaurant de démonstration / test (ex. Baobab, `python -m app.cli seed-baobab`) : seules les
    # commandes de démo peuvent le réinitialiser ; un vrai restaurant n'est jamais marqué ainsi.
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False, server_default=sql_false())

    opening_hours: Mapped[list["OpeningHours"]] = relationship(
        cascade="all, delete-orphan", order_by="(OpeningHours.day_of_week, OpeningHours.opens_at)"
    )
    logo: Mapped["Media | None"] = relationship(foreign_keys=[logo_media_id])  # noqa: F821
    cover: Mapped["Media | None"] = relationship(foreign_keys=[cover_media_id])  # noqa: F821


class OpeningHours(UUIDPk, Base):
    """Une plage d'ouverture. Plusieurs plages possibles par jour (midi / soir)."""

    __tablename__ = "opening_hours"
    __table_args__ = (CheckConstraint("day_of_week BETWEEN 0 AND 6", name="day_range"),)

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("restaurants.id", ondelete="CASCADE"), index=True
    )
    day_of_week: Mapped[int] = mapped_column(SmallInteger)  # 0 = lundi … 6 = dimanche
    opens_at: Mapped[time] = mapped_column(Time)
    closes_at: Mapped[time] = mapped_column(Time)  # si < opens_at : ferme après minuit
