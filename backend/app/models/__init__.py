"""Import de tous les modèles (nécessaire pour Alembic et la résolution des relations)."""

from app.models.audit import AuditLog
from app.models.media import Media
from app.models.menu import KitchenStation, MenuCategory, Option, OptionGroup, Product
from app.models.notifications import Notification
from app.models.orders import Order, OrderCounter, OrderItem, OrderItemOption, OrderStatusEvent
from app.models.payments import Payment
from app.models.qrcodes import QrCode
from app.models.requests import RestaurantRequest
from app.models.reservations import Reservation
from app.models.restaurants import OpeningHours, Restaurant
from app.models.users import ActivationToken, Membership, RefreshToken, User

__all__ = [
    "ActivationToken",
    "AuditLog",
    "KitchenStation",
    "Media",
    "Membership",
    "Notification",
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
    "Reservation",
    "Restaurant",
    "RestaurantRequest",
    "User",
]
