import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base, Timestamps, UUIDPk


class QrCode(UUIDPk, Timestamps, Base):
    """QR Code principal et permanent d'un restaurant (un seul par restaurant).

    Le QR encode `{PUBLIC_APP_URL}/q/{code}` : le code ne dépend ni du slug ni du menu,
    il reste donc valable quelles que soient les modifications du restaurant.
    """

    __tablename__ = "qr_codes"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("restaurants.id", ondelete="CASCADE"), unique=True
    )
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    foreground_color: Mapped[str] = mapped_column(String(7), default="#111827")
    background_color: Mapped[str] = mapped_column(String(7), default="#FFFFFF")
    with_logo: Mapped[bool] = mapped_column(Boolean, default=True)
    scan_count: Mapped[int] = mapped_column(Integer, default=0)
    last_scanned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    regenerated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
