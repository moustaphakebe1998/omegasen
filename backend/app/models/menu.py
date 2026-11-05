import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base, Timestamps, UUIDPk


class KitchenStation(UUIDPk, Timestamps, Base):
    """Poste de cuisine optionnel (grill, froid, boissons…)."""

    __tablename__ = "kitchen_stations"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("restaurants.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(60))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


class MenuCategory(UUIDPk, Timestamps, Base):
    __tablename__ = "menu_categories"

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("restaurants.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str | None] = mapped_column(String(300))
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Product(UUIDPk, Timestamps, Base):
    __tablename__ = "products"
    __table_args__ = (
        CheckConstraint("price >= 0", name="price_positive"),
        CheckConstraint("promo_price IS NULL OR promo_price >= 0", name="promo_positive"),
    )

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("restaurants.id", ondelete="CASCADE"), index=True
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("menu_categories.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    price: Mapped[int] = mapped_column(Integer)  # TTC, unités mineures
    promo_price: Mapped[int | None] = mapped_column(Integer)
    promo_starts_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    promo_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
    is_visible: Mapped[bool] = mapped_column(Boolean, default=True)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    allergens: Mapped[list[str]] = mapped_column(ARRAY(String(40)), default=list)
    tags: Mapped[list[str]] = mapped_column(ARRAY(String(40)), default=list)
    preparation_minutes: Mapped[int | None] = mapped_column(Integer)
    vat_rate_bp: Mapped[int | None] = mapped_column(Integer)  # sinon taux du restaurant
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    image_media_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("media.id", ondelete="SET NULL")
    )
    station_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("kitchen_stations.id", ondelete="SET NULL")
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    category: Mapped[MenuCategory] = relationship()
    image: Mapped["Media | None"] = relationship()  # noqa: F821
    option_groups: Mapped[list["OptionGroup"]] = relationship(
        back_populates="product", cascade="all, delete-orphan", order_by="OptionGroup.sort_order"
    )

    def effective_price(self, at: datetime) -> int:
        if self.promo_price is None:
            return self.price
        if self.promo_starts_at and at < self.promo_starts_at:
            return self.price
        if self.promo_ends_at and at >= self.promo_ends_at:
            return self.price
        return self.promo_price


class OptionGroup(UUIDPk, Timestamps, Base):
    """Groupe de suppléments / choix (ex. « Sauce », min 1 max 1 = obligatoire)."""

    __tablename__ = "option_groups"
    __table_args__ = (
        CheckConstraint("min_choices >= 0 AND max_choices >= 1 AND max_choices >= min_choices", name="choices"),
    )

    restaurant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("restaurants.id", ondelete="CASCADE"), index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(80))
    min_choices: Mapped[int] = mapped_column(Integer, default=0)
    max_choices: Mapped[int] = mapped_column(Integer, default=1)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    product: Mapped[Product] = relationship(back_populates="option_groups")
    options: Mapped[list["Option"]] = relationship(
        back_populates="group", cascade="all, delete-orphan", order_by="Option.sort_order"
    )


class Option(UUIDPk, Timestamps, Base):
    __tablename__ = "options"

    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("option_groups.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(80))
    price_delta: Mapped[int] = mapped_column(Integer, default=0)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    group: Mapped[OptionGroup] = relationship(back_populates="options")
