"""Import de tous les modèles (nécessaire pour Alembic et la résolution des relations)."""

from app.models.audit import AuditLog
from app.models.media import Media
from app.models.menu import KitchenStation, MenuCategory, Option, OptionGroup, Product
from app.models.orders import Order, OrderCounter, OrderItem, OrderItemOption, OrderStatusEvent
from app.models.payments import Payment
from app.models.qrcodes import QrCode
from app.models.restaurants import OpeningHours, Restaurant
from app.models.users import Membership, RefreshToken, User

__all__ = [
    "AuditLog",
    "KitchenStation",
    "Media",
    "Membership",
    "MenuCategory",
    "OpeningHours",
    "Option",
    "OptionGroup",
    "Order",
    "OrderCounter",
    "OrderItem",
    "OrderItemOption",
    "OrderStatusEvent",
    "Payment",
    "Product",
    "QrCode",
    "RefreshToken",
    "Restaurant",
    "User",
]
