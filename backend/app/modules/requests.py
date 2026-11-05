"""Demandes d'ouverture de restaurant.

Seul un super admin crée des restaurants. Un restaurateur intéressé envoie une demande (formulaire public) ;
le super admin l'approuve (création du restaurant + compte propriétaire avec lien d'activation) ou la refuse.
"""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Query, Request
from pydantic import EmailStr, Field
from sqlalchemy import func, select

from app.core.audit import audit
from app.core.deps import Session, SuperAdmin
from app.core.errors import Conflict, NotFound
from app.core.ratelimit import client_ip, hit
from app.core.schema import Schema
from app.models import RestaurantRequest
from app.models.enums import RequestStatus
from app.modules.auth import ensure_account
from app.modules.restaurants import RestaurantCreate, create_restaurant

public_router = APIRouter(prefix="/api/public/restaurant-requests", tags=["restaurant-requests"])
admin_router = APIRouter(prefix="/api/admin/restaurant-requests", tags=["restaurant-requests"])


class RequestIn(Schema):
    restaurant_name: str = Field(min_length=2, max_length=120)
    contact_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=32)
    city: str | None = Field(default=None, max_length=80)
    cuisine: str | None = Field(default=None, max_length=80)
    message: str | None = Field(default=None, max_length=2000)


class RequestReceipt(Schema):
    id: uuid.UUID
    status: RequestStatus


class RequestOut(Schema):
    id: uuid.UUID
    restaurant_name: str
    contact_name: str
    email: str
    phone: str | None
    city: str | None
    cuisine: str | None
    message: str | None
    status: RequestStatus
    review_note: str | None
    reviewed_at: datetime | None
    restaurant_id: uuid.UUID | None
    created_at: datetime


class RequestPage(Schema):
    items: list[RequestOut]
    total: int
    pending: int


class ApproveIn(Schema):
    """Valeurs reprises de la demande, modifiables par l'admin avant création."""

    name: str | None = Field(default=None, min_length=2, max_length=120)
    currency: str = "XOF"
    city: str | None = Field(default=None, max_length=120)
    cuisine: str | None = Field(default=None, max_length=80)
    review_note: str | None = Field(default=None, max_length=2000)


class ApproveOut(Schema):
    request: RequestOut
    restaurant_id: uuid.UUID
    restaurant_slug: str
    owner_email: str
    # Présent si le propriétaire n'avait pas encore de compte : lien à lui transmettre (valable 7 jours).
    activation_url: str | None


class RejectIn(Schema):
    review_note: str = Field(min_length=2, max_length=2000)


def _out(r: RestaurantRequest) -> RequestOut:
    return RequestOut.model_validate(r, from_attributes=True)


async def _pending(session, request_id: uuid.UUID) -> RestaurantRequest:
    r = await session.get(RestaurantRequest, request_id, with_for_update=True)
    if not r:
        raise NotFound("Demande introuvable")
    if r.status != RequestStatus.PENDING:
        raise Conflict("Cette demande a déjà été traitée", code="request_already_reviewed")
    return r


@public_router.post("", response_model=RequestReceipt, status_code=201)
async def submit(body: RequestIn, request: Request, session: Session):
    await hit("restaurant-request", client_ip(request), limit=5, window_seconds=3600)
    email = body.email.lower()
    duplicate = await session.scalar(
        select(RestaurantRequest.id).where(
            RestaurantRequest.email == email,
            RestaurantRequest.status == RequestStatus.PENDING,
            func.lower(RestaurantRequest.restaurant_name) == body.restaurant_name.strip().lower(),
        )
    )
    if duplicate:
        raise Conflict("Une demande est déjà en cours pour ce restaurant", code="request_pending")
    r = RestaurantRequest(**body.model_dump(exclude={"email"}), email=email)
    r.restaurant_name = r.restaurant_name.strip()
    r.contact_name = r.contact_name.strip()
    session.add(r)
    await session.flush()
    audit(session, "restaurant_request.submitted", entity="RestaurantRequest", entity_id=r.id, ip=client_ip(request))
    await session.commit()
    return RequestReceipt(id=r.id, status=r.status)


@admin_router.get("", response_model=RequestPage)
async def list_requests(
    _: SuperAdmin,
    session: Session,
    status: RequestStatus | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    cond = [RestaurantRequest.status == status] if status else []
    total = await session.scalar(select(func.count()).select_from(RestaurantRequest).where(*cond))
    pending = await session.scalar(
        select(func.count()).select_from(RestaurantRequest).where(RestaurantRequest.status == RequestStatus.PENDING)
    )
    rows = await session.scalars(
        select(RestaurantRequest)
        .where(*cond)
        .order_by(RestaurantRequest.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return RequestPage(items=[_out(r) for r in rows], total=total or 0, pending=pending or 0)


@admin_router.post("/{request_id}/approve", response_model=ApproveOut)
async def approve(request_id: uuid.UUID, body: ApproveIn, admin: SuperAdmin, session: Session):
    req = await _pending(session, request_id)
    owner, activation_url = await ensure_account(session, req.email, req.contact_name, phone=req.phone)
    restaurant = await create_restaurant(
        session,
        RestaurantCreate(
            name=body.name or req.restaurant_name,
            currency=body.currency,
            city=body.city if body.city is not None else req.city,
            cuisine=body.cuisine if body.cuisine is not None else req.cuisine,
            phone=req.phone,
            email=req.email,
        ),
        owner,
    )
    req.status = RequestStatus.APPROVED
    req.review_note = body.review_note
    req.reviewed_at = datetime.now(UTC)
    req.reviewed_by_id = admin.id
    req.restaurant_id = restaurant.id
    audit(
        session,
        "restaurant_request.approved",
        actor_id=admin.id,
        restaurant_id=restaurant.id,
        entity="RestaurantRequest",
        entity_id=req.id,
        data={"owner": owner.email},
    )
    await session.commit()
    return ApproveOut(
        request=_out(req),
        restaurant_id=restaurant.id,
        restaurant_slug=restaurant.slug,
        owner_email=owner.email,
        activation_url=activation_url,
    )


@admin_router.post("/{request_id}/reject", response_model=RequestOut)
async def reject(request_id: uuid.UUID, body: RejectIn, admin: SuperAdmin, session: Session):
    req = await _pending(session, request_id)
    req.status = RequestStatus.REJECTED
    req.review_note = body.review_note
    req.reviewed_at = datetime.now(UTC)
    req.reviewed_by_id = admin.id
    audit(session, "restaurant_request.rejected", actor_id=admin.id, entity="RestaurantRequest", entity_id=req.id)
    await session.commit()
    return _out(req)
