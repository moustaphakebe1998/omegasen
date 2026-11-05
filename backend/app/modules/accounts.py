"""Comptes utilisateurs : activation (choix du mot de passe), mot de passe oublié, profil, sessions, clients.

Règles :
- Aucun mot de passe provisoire : un compte créé par un administrateur (ou un gérant pour son équipe)
  reçoit par email un lien d'activation pour choisir son mot de passe. L'activation vaut vérification
  de l'adresse email.
- Liens uniques, à usage unique, temporaires (durées dans la configuration), stockés hachés ; émettre un
  nouveau lien invalide les précédents du même type.
- Les clients (compte facultatif) s'inscrivent avec leur email et reçoivent le même lien d'activation.
"""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Request, Response
from pydantic import EmailStr, Field
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.audit import audit
from app.core.config import get_settings
from app.core.deps import CurrentUser, Session
from app.core.errors import Conflict, NotFound
from app.core.mailer import build, send_email
from app.core.ratelimit import client_ip, hit
from app.core.schema import Schema
from app.core.security import hash_password, hash_token, new_refresh_token
from app.models import ActivationToken, Order, RefreshToken, Reservation, Restaurant, User
from app.models.enums import AccountType, OrderStatus, PaymentStatus, ReservationStatus, TokenPurpose
from app.modules.auth import REFRESH_COOKIE, TokenOut, UserOut, issue_tokens, user_out
from app.modules.notifications import notify, publish_pending, superadmin_ids

router = APIRouter(prefix="/api/auth", tags=["accounts"])
me_router = APIRouter(prefix="/api/me", tags=["accounts"])


# ── Liens d'activation / réinitialisation ───────────────


def _ttl(purpose: TokenPurpose) -> timedelta:
    s = get_settings()
    if purpose == TokenPurpose.RESET:
        return timedelta(minutes=s.reset_ttl_minutes)
    return timedelta(hours=s.activation_ttl_hours)


def _url(purpose: TokenPurpose, raw: str) -> str:
    base = get_settings().public_app_url.rstrip("/")
    return f"{base}/reset-password/{raw}" if purpose == TokenPurpose.RESET else f"{base}/activate/{raw}"


async def issue_link(session: AsyncSession, user: User, purpose: TokenPurpose = TokenPurpose.ACTIVATION) -> str:
    """Crée un lien à usage unique ; les liens précédents du même type pour ce compte sont invalidés."""
    now = datetime.now(UTC)
    await session.execute(
        update(ActivationToken)
        .where(
            ActivationToken.user_id == user.id,
            ActivationToken.purpose == purpose,
            ActivationToken.used_at.is_(None),
        )
        .values(used_at=now)
    )
    raw = new_refresh_token()
    session.add(
        ActivationToken(
            user_id=user.id,
            purpose=purpose,
            token_hash=hash_token(raw),
            created_at=now,
            expires_at=now + _ttl(purpose),
        )
    )
    return _url(purpose, raw)


def link_validity_label(purpose: TokenPurpose) -> str:
    ttl = _ttl(purpose)
    hours = int(ttl.total_seconds() // 3600)
    if hours >= 48 and hours % 24 == 0:
        return f"{hours // 24} jours"
    if hours >= 1:
        return f"{hours} heure{'s' if hours > 1 else ''}"
    return f"{int(ttl.total_seconds() // 60)} minutes"


async def send_activation_email(user: User, url: str, *, context: str | None = None) -> bool:
    """`context` : phrase d'introduction (ex. « Votre restaurant X a été créé sur OmegaSen. »)."""
    paragraphs = [
        f"Bonjour {user.full_name},",
        context or "Un compte OmegaSen a été créé pour vous.",
        "Pour l'activer, choisissez votre mot de passe en suivant le lien ci-dessous. "
        f"Il est valable {link_validity_label(TokenPurpose.ACTIVATION)} et ne peut servir qu'une fois.",
        "Si vous n'êtes pas à l'origine de cette demande, ignorez cet email.",
    ]
    text, html_body = build("", "Activez votre compte OmegaSen", paragraphs, ("Choisir mon mot de passe", url))
    return await send_email(user.email, "Activez votre compte OmegaSen", text, html_body)


async def send_reset_email(user: User, url: str) -> bool:
    paragraphs = [
        f"Bonjour {user.full_name},",
        "Vous avez demandé à réinitialiser votre mot de passe OmegaSen.",
        f"Ce lien est valable {link_validity_label(TokenPurpose.RESET)} et ne peut servir qu'une fois.",
        "Si vous n'avez rien demandé, ignorez cet email : votre mot de passe reste inchangé.",
    ]
    text, html_body = build(
        "", "Réinitialisation du mot de passe", paragraphs, ("Choisir un nouveau mot de passe", url)
    )
    return await send_email(user.email, "Réinitialisation de votre mot de passe OmegaSen", text, html_body)


async def ensure_account(
    session: AsyncSession,
    email: str,
    full_name: str | None,
    *,
    phone: str | None = None,
    account_type: AccountType = AccountType.STAFF,
) -> tuple[User, bool]:
    """Retourne (compte, à_activer). Crée le compte s'il n'existe pas, sans mot de passe utilisable.

    `à_activer` est vrai si le compte n'a pas encore choisi de mot de passe : l'appelant émet alors un lien
    (`issue_link`) puis envoie l'email après le commit.
    """
    from app.core.errors import Unprocessable

    email = email.lower()
    user = await session.scalar(select(User).where(User.email == email))
    if user:
        if account_type == AccountType.STAFF and user.account_type == AccountType.CUSTOMER:
            user.account_type = AccountType.STAFF  # un client peut aussi devenir membre d'une équipe
        return user, user.activated_at is None
    if not full_name:
        raise Unprocessable("Nom requis pour créer le compte", code="owner_details_required")
    user = User(
        email=email,
        full_name=full_name.strip(),
        phone=phone,
        account_type=account_type,
        # Mot de passe aléatoire jamais communiqué : le compte ne sert qu'après activation.
        password_hash=hash_password(new_refresh_token()),
    )
    session.add(user)
    await session.flush()
    return user, True


async def _valid_token(session: AsyncSession, token: str, purpose: TokenPurpose) -> ActivationToken:
    row = await session.scalar(
        select(ActivationToken)
        .where(ActivationToken.token_hash == hash_token(token), ActivationToken.purpose == purpose)
        .options(selectinload(ActivationToken.user))
    )
    if not row or row.used_at or row.expires_at <= datetime.now(UTC) or not row.user.is_active:
        raise NotFound("Lien invalide ou expiré", code="invalid_activation")
    return row


async def _revoke_sessions(session: AsyncSession, user_id: uuid.UUID, keep_family: uuid.UUID | None = None) -> None:
    cond = [RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None)]
    if keep_family:
        cond.append(RefreshToken.family_id != keep_family)
    await session.execute(update(RefreshToken).where(*cond).values(revoked_at=datetime.now(UTC)))


# ── Schémas ─────────────────────────────────────────────


class TokenInfo(Schema):
    email: str
    full_name: str


class SetPasswordIn(Schema):
    token: str = Field(min_length=10, max_length=200)
    password: str = Field(min_length=10, max_length=200)


class ForgotIn(Schema):
    email: EmailStr


class SignupIn(Schema):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=32)


class ProfileIn(Schema):
    full_name: str | None = Field(default=None, min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=32)


class SessionOut(Schema):
    id: uuid.UUID  # identifiant de la famille de jetons (= un appareil / navigateur)
    user_agent: str | None
    ip_address: str | None
    created_at: datetime
    last_used_at: datetime
    current: bool


class MyOrder(Schema):
    reference: str
    display_number: str
    restaurant_name: str
    restaurant_slug: str
    total: int
    currency: str
    status: OrderStatus
    payment_status: PaymentStatus
    tracking_token: str
    created_at: datetime


class MyReservation(Schema):
    restaurant_name: str
    restaurant_slug: str
    starts_at: datetime
    party_size: int
    status: ReservationStatus
    tracking_token: str


# ── Activation et réinitialisation ──────────────────────


@router.get("/activation/{token}", response_model=TokenInfo)
async def activation_info(token: str, request: Request, session: Session):
    await hit("activation", client_ip(request), limit=30, window_seconds=600)
    row = await _valid_token(session, token, TokenPurpose.ACTIVATION)
    return TokenInfo(email=row.user.email, full_name=row.user.full_name)


@router.post("/activate", response_model=TokenOut)
async def activate(body: SetPasswordIn, request: Request, response: Response, session: Session):
    await hit("activation", client_ip(request), limit=30, window_seconds=600)
    row = await _valid_token(session, body.token, TokenPurpose.ACTIVATION)
    now = datetime.now(UTC)
    row.used_at = now
    user = row.user
    user.password_hash = hash_password(body.password)
    user.activated_at = user.activated_at or now
    user.failed_logins = 0
    user.locked_until = None
    user.last_login_at = now
    audit(session, "user.activated", actor_id=user.id, entity="User", entity_id=user.id, ip=client_ip(request))
    if user.account_type == AccountType.STAFF:
        notify(
            session,
            await superadmin_ids(session),
            "account.activated",
            f"Compte activé : {user.full_name}",
            body=user.email,
            link="/admin/users",
        )
    out = await issue_tokens(session, request, response, user)  # commit inclus
    await publish_pending(session)
    return out


@router.post("/forgot-password", status_code=202)
async def forgot_password(body: ForgotIn, request: Request, session: Session):
    """Répond toujours 202 (ne révèle pas si l'adresse existe)."""
    await hit("forgot", client_ip(request), limit=5, window_seconds=900)
    user = await session.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not user.is_active:
        return
    # Compte jamais activé : on renvoie le lien d'activation plutôt qu'un lien de réinitialisation.
    if user.activated_at is None:
        url = await issue_link(session, user, TokenPurpose.ACTIVATION)
        await session.commit()
        await send_activation_email(user, url)
        return
    url = await issue_link(session, user, TokenPurpose.RESET)
    audit(session, "user.password_reset_requested", actor_id=user.id, ip=client_ip(request))
    await session.commit()
    await send_reset_email(user, url)


@router.get("/reset/{token}", response_model=TokenInfo)
async def reset_info(token: str, request: Request, session: Session):
    await hit("activation", client_ip(request), limit=30, window_seconds=600)
    row = await _valid_token(session, token, TokenPurpose.RESET)
    return TokenInfo(email=row.user.email, full_name=row.user.full_name)


@router.post("/reset-password", status_code=204)
async def reset_password(body: SetPasswordIn, request: Request, session: Session):
    await hit("activation", client_ip(request), limit=30, window_seconds=600)
    row = await _valid_token(session, body.token, TokenPurpose.RESET)
    user = row.user
    row.used_at = datetime.now(UTC)
    user.password_hash = hash_password(body.password)
    user.failed_logins = 0
    user.locked_until = None
    await _revoke_sessions(session, user.id)  # déconnecte tous les appareils
    audit(session, "user.password_reset", actor_id=user.id, ip=client_ip(request))
    await session.commit()


@router.post("/signup", status_code=202)
async def customer_signup(body: SignupIn, request: Request, session: Session):
    """Compte client facultatif : envoie un lien d'activation (choix du mot de passe = email vérifié)."""
    await hit("signup", client_ip(request), limit=5, window_seconds=3600)
    existing = await session.scalar(select(User).where(User.email == body.email.lower()))
    if existing and existing.activated_at is not None:
        raise Conflict(
            "Un compte existe déjà avec cet email. Connectez-vous ou réinitialisez le mot de passe.", code="email_taken"
        )
    user, _ = await ensure_account(
        session, body.email, body.full_name, phone=body.phone, account_type=AccountType.CUSTOMER
    )
    url = await issue_link(session, user, TokenPurpose.ACTIVATION)
    audit(session, "customer.signup", entity="User", entity_id=user.id, ip=client_ip(request))
    await session.commit()
    await send_activation_email(user, url, context="Bienvenue sur OmegaSen ! Votre compte client est presque prêt.")


# ── Profil et sessions ──────────────────────────────────


@router.patch("/me", response_model=UserOut)
async def update_profile(body: ProfileIn, user: CurrentUser, session: Session):
    data = body.model_dump(exclude_unset=True)
    if "full_name" in data and data["full_name"]:
        user.full_name = data["full_name"].strip()
    if "phone" in data:
        user.phone = data["phone"] or None
    audit(session, "user.profile_updated", actor_id=user.id, entity="User", entity_id=user.id)
    await session.commit()
    return await user_out(session, user)


async def _current_family(session: AsyncSession, request: Request) -> uuid.UUID | None:
    raw = request.cookies.get(REFRESH_COOKIE)
    if not raw:
        return None
    return await session.scalar(select(RefreshToken.family_id).where(RefreshToken.token_hash == hash_token(raw)))


@router.get("/sessions", response_model=list[SessionOut])
async def list_sessions(user: CurrentUser, request: Request, session: Session):
    now = datetime.now(UTC)
    current = await _current_family(session, request)
    rows = await session.execute(
        select(
            RefreshToken.family_id,
            func.min(RefreshToken.created_at),
            func.max(RefreshToken.created_at),
        )
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None), RefreshToken.expires_at > now)
        .group_by(RefreshToken.family_id)
        .order_by(func.max(RefreshToken.created_at).desc())
    )
    out = []
    for family_id, first, last in rows.all():
        latest = await session.scalar(
            select(RefreshToken)
            .where(RefreshToken.family_id == family_id)
            .order_by(RefreshToken.created_at.desc())
            .limit(1)
        )
        out.append(
            SessionOut(
                id=family_id,
                user_agent=latest.user_agent if latest else None,
                ip_address=latest.ip_address if latest else None,
                created_at=first,
                last_used_at=last,
                current=family_id == current,
            )
        )
    return out


@router.delete("/sessions/{family_id}", status_code=204)
async def revoke_session(family_id: uuid.UUID, user: CurrentUser, session: Session):
    await session.execute(
        update(RefreshToken)
        .where(
            RefreshToken.user_id == user.id,
            RefreshToken.family_id == family_id,
            RefreshToken.revoked_at.is_(None),
        )
        .values(revoked_at=datetime.now(UTC))
    )
    audit(session, "user.session_revoked", actor_id=user.id)
    await session.commit()


@router.post("/sessions/revoke-others", status_code=204)
async def revoke_other_sessions(user: CurrentUser, request: Request, session: Session):
    await _revoke_sessions(session, user.id, keep_family=await _current_family(session, request))
    audit(session, "user.sessions_revoked", actor_id=user.id)
    await session.commit()


# ── Espace client : historique ──────────────────────────


@me_router.get("/orders", response_model=list[MyOrder])
async def my_orders(user: CurrentUser, session: Session):
    rows = await session.execute(
        select(Order, Restaurant)
        .join(Restaurant, Restaurant.id == Order.restaurant_id)
        .where(Order.customer_user_id == user.id)
        .order_by(Order.created_at.desc())
        .limit(100)
    )
    return [
        MyOrder(
            reference=o.reference,
            display_number=o.display_number,
            restaurant_name=r.name,
            restaurant_slug=r.slug,
            total=o.total,
            currency=o.currency,
            status=o.status,
            payment_status=o.payment_status,
            tracking_token=o.tracking_token,
            created_at=o.created_at,
        )
        for o, r in rows.all()
    ]


@me_router.get("/reservations", response_model=list[MyReservation])
async def my_reservations(user: CurrentUser, session: Session):
    rows = await session.execute(
        select(Reservation, Restaurant)
        .join(Restaurant, Restaurant.id == Reservation.restaurant_id)
        .where(Reservation.customer_user_id == user.id)
        .order_by(Reservation.starts_at.desc())
        .limit(100)
    )
    return [
        MyReservation(
            restaurant_name=r.name,
            restaurant_slug=r.slug,
            starts_at=res.starts_at,
            party_size=res.party_size,
            status=res.status,
            tracking_token=res.tracking_token,
        )
        for res, r in rows.all()
    ]
