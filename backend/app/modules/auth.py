"""Authentification : connexion, inscription, rotation des jetons de rafraîchissement, profil."""

import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Request, Response
from pydantic import EmailStr, Field
from sqlalchemy import select, update

from app.core.audit import audit
from app.core.config import get_settings
from app.core.deps import CurrentUser, Session
from app.core.errors import Conflict, Unauthorized, Unprocessable
from app.core.ratelimit import client_ip, hit
from app.core.schema import Schema
from app.core.security import (
    create_access_token,
    hash_password,
    hash_token,
    new_refresh_token,
    verify_password,
)
from app.models import Membership, RefreshToken, Restaurant, User
from app.models.enums import MemberRole

router = APIRouter(prefix="/api/auth", tags=["auth"])

REFRESH_COOKIE = "omegasen_refresh"
COOKIE_PATH = "/api/auth"
REUSE_GRACE_SECONDS = 30


# ── Schémas ─────────────────────────────────────────────


class LoginIn(Schema):
    email: EmailStr
    password: str = Field(min_length=1, max_length=200)


class RegisterIn(Schema):
    email: EmailStr
    password: str = Field(min_length=10, max_length=200)
    full_name: str = Field(min_length=2, max_length=120)
    phone: str | None = Field(default=None, max_length=32)


class ChangePasswordIn(Schema):
    current_password: str
    new_password: str = Field(min_length=10, max_length=200)


class MembershipOut(Schema):
    restaurant_id: uuid.UUID
    restaurant_name: str
    restaurant_slug: str
    role: MemberRole


class UserOut(Schema):
    id: uuid.UUID
    email: str
    full_name: str
    phone: str | None
    is_superadmin: bool
    memberships: list[MembershipOut]


class TokenOut(Schema):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


# ── Helpers ─────────────────────────────────────────────


async def user_out(session, user: User) -> UserOut:
    rows = await session.execute(
        select(Membership, Restaurant)
        .join(Restaurant, Restaurant.id == Membership.restaurant_id)
        .where(
            Membership.user_id == user.id,
            Membership.is_active.is_(True),
            Restaurant.deleted_at.is_(None),
        )
        .order_by(Restaurant.name)
    )
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        is_superadmin=user.is_superadmin,
        memberships=[
            MembershipOut(restaurant_id=r.id, restaurant_name=r.name, restaurant_slug=r.slug, role=m.role)
            for m, r in rows.all()
        ],
    )


async def _issue_tokens(
    session, request: Request, response: Response, user: User, family_id: uuid.UUID | None = None
) -> TokenOut:
    settings = get_settings()
    raw = new_refresh_token()
    now = datetime.now(UTC)
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(raw),
            family_id=family_id or uuid.uuid4(),
            created_at=now,
            expires_at=now + timedelta(days=settings.refresh_token_ttl_days),
            user_agent=(request.headers.get("user-agent") or "")[:255],
            ip_address=client_ip(request),
        )
    )
    await session.commit()
    response.set_cookie(
        REFRESH_COOKIE,
        raw,
        max_age=settings.refresh_token_ttl_days * 86400,
        httponly=True,
        secure=settings.is_production,
        samesite="strict",
        path=COOKIE_PATH,
    )
    return TokenOut(
        access_token=create_access_token(user.id, is_superadmin=user.is_superadmin),
        expires_in=settings.access_token_ttl_minutes * 60,
        user=await user_out(session, user),
    )


# ── Routes ──────────────────────────────────────────────


@router.post("/login", response_model=TokenOut)
async def login(body: LoginIn, request: Request, response: Response, session: Session):
    settings = get_settings()
    email = body.email.lower()
    await hit("login", f"{client_ip(request)}:{email}", limit=10, window_seconds=300)

    user = await session.scalar(select(User).where(User.email == email))
    now = datetime.now(UTC)
    if user and user.locked_until and user.locked_until > now:
        raise Unauthorized("Compte temporairement verrouillé, réessayez plus tard", code="account_locked")

    if not user or not verify_password(body.password, user.password_hash):
        if user:
            user.failed_logins += 1
            if user.failed_logins >= settings.max_login_attempts:
                user.locked_until = now + timedelta(minutes=settings.lockout_minutes)
                user.failed_logins = 0
                audit(session, "user.locked", actor_id=user.id, ip=client_ip(request))
            await session.commit()
        raise Unauthorized("Email ou mot de passe incorrect", code="invalid_credentials")

    if not user.is_active:
        raise Unauthorized("Compte désactivé")

    user.failed_logins = 0
    user.locked_until = None
    user.last_login_at = now
    audit(session, "user.login", actor_id=user.id, ip=client_ip(request))
    return await _issue_tokens(session, request, response, user)


@router.post("/register", response_model=TokenOut, status_code=201)
async def register(body: RegisterIn, request: Request, response: Response, session: Session):
    await hit("register", client_ip(request), limit=5, window_seconds=3600)
    email = body.email.lower()
    if await session.scalar(select(User.id).where(User.email == email)):
        raise Conflict("Un compte existe déjà avec cet email", code="email_taken")
    user = User(
        email=email,
        password_hash=hash_password(body.password),
        full_name=body.full_name.strip(),
        phone=body.phone,
    )
    session.add(user)
    await session.flush()
    audit(session, "user.registered", actor_id=user.id, ip=client_ip(request))
    return await _issue_tokens(session, request, response, user)


@router.post("/refresh", response_model=TokenOut)
async def refresh(request: Request, response: Response, session: Session):
    raw = request.cookies.get(REFRESH_COOKIE)
    if not raw:
        raise Unauthorized("Session absente", code="no_session")
    now = datetime.now(UTC)
    token = await session.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw)))
    if not token or token.expires_at <= now:
        response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH)
        raise Unauthorized("Session expirée", code="session_expired")
    if token.revoked_at is not None:
        # Tolérance : deux onglets qui rafraîchissent en même temps présentent le même jeton.
        # Si le jeton vient d'être tourné (< 30 s) et que sa famille est toujours active, on l'accepte.
        family_alive = await session.scalar(
            select(RefreshToken.id).where(
                RefreshToken.family_id == token.family_id,
                RefreshToken.revoked_at.is_(None),
                RefreshToken.expires_at > now,
            )
        )
        if family_alive and now - token.revoked_at < timedelta(seconds=REUSE_GRACE_SECONDS):
            user = await session.get(User, token.user_id)
            if user and user.is_active:
                return await _issue_tokens(session, request, response, user, family_id=token.family_id)
        # Sinon : réutilisation d'un jeton déjà tourné → vol probable → révoque toute la famille.
        await session.execute(
            update(RefreshToken)
            .where(RefreshToken.family_id == token.family_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        audit(session, "auth.refresh_reuse", actor_id=token.user_id, ip=client_ip(request))
        await session.commit()
        response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH)
        raise Unauthorized("Session invalide", code="session_revoked")

    user = await session.get(User, token.user_id)
    if not user or not user.is_active:
        raise Unauthorized("Compte désactivé")
    token.revoked_at = now
    return await _issue_tokens(session, request, response, user, family_id=token.family_id)


@router.post("/logout", status_code=204)
async def logout(request: Request, response: Response, session: Session):
    raw = request.cookies.get(REFRESH_COOKIE)
    if raw:
        token = await session.scalar(select(RefreshToken).where(RefreshToken.token_hash == hash_token(raw)))
        if token:  # révoque toute la famille : la session est close sur cet appareil
            await session.execute(
                update(RefreshToken)
                .where(RefreshToken.family_id == token.family_id, RefreshToken.revoked_at.is_(None))
                .values(revoked_at=datetime.now(UTC))
            )
            await session.commit()
    response.delete_cookie(REFRESH_COOKIE, path=COOKIE_PATH)
    response.status_code = 204
    return response


@router.get("/me", response_model=UserOut)
async def me(user: CurrentUser, session: Session):
    return await user_out(session, user)


@router.post("/change-password", status_code=204)
async def change_password(body: ChangePasswordIn, user: CurrentUser, session: Session):
    if not verify_password(body.current_password, user.password_hash):
        raise Unprocessable("Mot de passe actuel incorrect", code="invalid_password")
    user.password_hash = hash_password(body.new_password)
    # Déconnecte toutes les autres sessions.
    await session.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(UTC))
    )
    audit(session, "user.password_changed", actor_id=user.id)
    await session.commit()
