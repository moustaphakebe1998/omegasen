from enum import StrEnum


class MemberRole(StrEnum):
    """Rôle d'un collaborateur dans UN restaurant (le super admin est un rôle de plateforme, voir User).

    Hiérarchie (app/core/access.py, ROLE_RANK) : OWNER > ADMIN > MANAGER > rôles opérationnels.
    """

    OWNER = "OWNER"  # propriétaire du restaurant
    ADMIN = "ADMIN"  # administrateur du restaurant
    MANAGER = "MANAGER"  # responsable (gestion opérationnelle)
    CASHIER = "CASHIER"  # caisse
    WAITER = "WAITER"  # service en salle
    KITCHEN = "KITCHEN"  # cuisine
    STAFF = "STAFF"  # personnel (permissions accordées individuellement)


class RestaurantStatus(StrEnum):
    PENDING = "PENDING"  # en préparation : visible par l'équipe, pas encore public
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"  # bloqué par le super admin
    CLOSED = "CLOSED"  # fermé définitivement


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


class RequestStatus(StrEnum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class TokenPurpose(StrEnum):
    ACTIVATION = "ACTIVATION"  # première connexion : choix du mot de passe (vaut vérification de l'email)
    RESET = "RESET"  # mot de passe oublié


class AccountType(StrEnum):
    STAFF = "STAFF"  # personnel des restaurants et super admins
    CUSTOMER = "CUSTOMER"  # client final (compte facultatif)


class ReservationStatus(StrEnum):
    PENDING = "PENDING"
    CONFIRMED = "CONFIRMED"
    DECLINED = "DECLINED"
    CANCELLED = "CANCELLED"
    SEATED = "SEATED"
    NO_SHOW = "NO_SHOW"
