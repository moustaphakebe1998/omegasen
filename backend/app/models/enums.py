from enum import StrEnum


class MemberRole(StrEnum):
    OWNER = "OWNER"
    MANAGER = "MANAGER"
    CASHIER = "CASHIER"
    KITCHEN = "KITCHEN"


class RestaurantStatus(StrEnum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"


class MediaKind(StrEnum):
    LOGO = "LOGO"
    COVER = "COVER"
    GALLERY = "GALLERY"
    PRODUCT = "PRODUCT"


class OrderChannel(StrEnum):
    QR = "QR"
    POS = "POS"
    ONLINE = "ONLINE"
    KIOSK = "KIOSK"


class ServiceMode(StrEnum):
    DINE_IN = "DINE_IN"
    TAKEAWAY = "TAKEAWAY"
    DELIVERY = "DELIVERY"  # prévu, non activé pour l'instant


class OrderStatus(StrEnum):
    NEW = "NEW"
    PREPARING = "PREPARING"
    READY = "READY"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class PaymentStatus(StrEnum):
    UNPAID = "UNPAID"
    PARTIALLY_PAID = "PARTIALLY_PAID"
    PAID = "PAID"
    REFUNDED = "REFUNDED"


class PaymentMethod(StrEnum):
    CASH = "CASH"
    CARD = "CARD"
    ONLINE = "ONLINE"
    MOBILE_MONEY = "MOBILE_MONEY"
    OTHER = "OTHER"


class PaymentPreference(StrEnum):
    """Intention du client au moment de la commande (pas un paiement effectué)."""

    AT_COUNTER = "AT_COUNTER"
    ONLINE = "ONLINE"
    ON_DELIVERY = "ON_DELIVERY"


class TransactionStatus(StrEnum):
    PENDING = "PENDING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    REFUNDED = "REFUNDED"
    CANCELLED = "CANCELLED"
