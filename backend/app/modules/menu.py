"""Menus : catégories, produits (plats, boissons…), groupes de suppléments / options."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter
from pydantic import Field, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.audit import audit
from app.core.deps import Can, Session
from app.core.errors import NotFound, Unprocessable
from app.core.permissions import Perm
from app.core.realtime import publish, restaurant_channel
from app.core.schema import Schema
from app.core.storage import public_url
from app.models import KitchenStation, Media, MenuCategory, Option, OptionGroup, Product

router = APIRouter(prefix="/api/restaurants/{restaurant_id}/menu", tags=["menu"])

MAX_PRICE = 100_000_000


# ── Schémas ─────────────────────────────────────────────


class OptionIn(Schema):
    id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=80)
    price_delta: int = Field(default=0, ge=0, le=MAX_PRICE)
    is_available: bool = True


class OptionOut(OptionIn):
    id: uuid.UUID


class OptionGroupIn(Schema):
    id: uuid.UUID | None = None
    name: str = Field(min_length=1, max_length=80)
    min_choices: int = Field(default=0, ge=0, le=20)
    max_choices: int = Field(default=1, ge=1, le=20)
    options: list[OptionIn] = Field(min_length=1, max_length=40)

    @model_validator(mode="after")
    def _bounds(self):
        if self.max_choices < self.min_choices:
            raise ValueError("Le maximum doit être supérieur ou égal au minimum")
        if self.min_choices > len(self.options):
            raise ValueError("Le minimum dépasse le nombre d'options")
        return self


class OptionGroupOut(Schema):
    id: uuid.UUID
    name: str
    min_choices: int
    max_choices: int
    options: list[OptionOut]


class ProductBase(Schema):
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    price: int = Field(ge=0, le=MAX_PRICE)
    promo_price: int | None = Field(default=None, ge=0, le=MAX_PRICE)
    promo_starts_at: datetime | None = None
    promo_ends_at: datetime | None = None
    is_available: bool = True
    is_visible: bool = True
    is_featured: bool = False
    allergens: list[str] = Field(default_factory=list, max_length=20)
    tags: list[str] = Field(default_factory=list, max_length=20)
    preparation_minutes: int | None = Field(default=None, ge=0, le=600)
    vat_rate_bp: int | None = Field(default=None, ge=0, le=5000)
    image_media_id: uuid.UUID | None = None
    station_id: uuid.UUID | None = None


class ProductCreate(ProductBase):
    category_id: uuid.UUID
    option_groups: list[OptionGroupIn] = Field(default_factory=list, max_length=20)


class ProductUpdate(Schema):
    category_id: uuid.UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
    price: int | None = Field(default=None, ge=0, le=MAX_PRICE)
    promo_price: int | None = Field(default=None, ge=0, le=MAX_PRICE)
    promo_starts_at: datetime | None = None
    promo_ends_at: datetime | None = None
    is_available: bool | None = None
    is_visible: bool | None = None
    is_featured: bool | None = None
    allergens: list[str] | None = Field(default=None, max_length=20)
    tags: list[str] | None = Field(default=None, max_length=20)
    preparation_minutes: int | None = Field(default=None, ge=0, le=600)
    vat_rate_bp: int | None = Field(default=None, ge=0, le=5000)
    image_media_id: uuid.UUID | None = None
    station_id: uuid.UUID | None = None
    option_groups: list[OptionGroupIn] | None = Field(default=None, max_length=20)


class ProductOut(ProductBase):
    id: uuid.UUID
    category_id: uuid.UUID
    sort_order: int
    effective_price: int
    image_url: str | None
    image_thumb_url: str | None
    option_groups: list[OptionGroupOut]


class CategoryIn(Schema):
    name: str = Field(min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=300)
    is_visible: bool = True


class CategoryUpdate(Schema):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    description: str | None = Field(default=None, max_length=300)
    is_visible: bool | None = None


class CategoryOut(Schema):
    id: uuid.UUID
    name: str
    description: str | None
    is_visible: bool
    sort_order: int
    products: list[ProductOut]


class ReorderIn(Schema):
    ids: list[uuid.UUID] = Field(min_length=1, max_length=500)


# ── Sérialisation partagée (aussi utilisée par l'espace public) ──


def product_out(p: Product, now: datetime | None = None) -> ProductOut:
    now = now or datetime.now(UTC)
    return ProductOut(
        id=p.id,
        category_id=p.category_id,
        name=p.name,
        description=p.description,
        price=p.price,
        promo_price=p.promo_price,
        promo_starts_at=p.promo_starts_at,
        promo_ends_at=p.promo_ends_at,
        is_available=p.is_available,
        is_visible=p.is_visible,
        is_featured=p.is_featured,
        allergens=p.allergens or [],
        tags=p.tags or [],
        preparation_minutes=p.preparation_minutes,
        vat_rate_bp=p.vat_rate_bp,
        image_media_id=p.image_media_id,
        station_id=p.station_id,
        sort_order=p.sort_order,
        effective_price=p.effective_price(now),
        image_url=public_url(p.image.variants.get("medium")) if p.image else None,
        image_thumb_url=public_url(p.image.variants.get("thumb")) if p.image else None,
        option_groups=[
            OptionGroupOut(
                id=g.id,
                name=g.name,
                min_choices=g.min_choices,
                max_choices=g.max_choices,
                options=[
                    OptionOut(id=o.id, name=o.name, price_delta=o.price_delta, is_available=o.is_available)
                    for o in g.options
                ],
            )
            for g in p.option_groups
        ],
    )


PRODUCT_LOADS = (
    selectinload(Product.image),
    selectinload(Product.option_groups).selectinload(OptionGroup.options),
)


async def load_menu(session: AsyncSession, restaurant_id: uuid.UUID, *, public: bool) -> list[CategoryOut]:
    cat_q = select(MenuCategory).where(MenuCategory.restaurant_id == restaurant_id, MenuCategory.deleted_at.is_(None))
    prod_q = select(Product).where(Product.restaurant_id == restaurant_id, Product.deleted_at.is_(None))
    if public:
        cat_q = cat_q.where(MenuCategory.is_visible.is_(True))
        prod_q = prod_q.where(Product.is_visible.is_(True))
    categories = (await session.scalars(cat_q.order_by(MenuCategory.sort_order, MenuCategory.name))).all()
    products = (await session.scalars(prod_q.options(*PRODUCT_LOADS).order_by(Product.sort_order, Product.name))).all()
    now = datetime.now(UTC)
    by_cat: dict[uuid.UUID, list[ProductOut]] = {}
    for p in products:
        out = product_out(p, now)
        if public:
            for g in out.option_groups:
                g.options = [o for o in g.options if o.is_available]
        by_cat.setdefault(p.category_id, []).append(out)
    result = [
        CategoryOut(
            id=c.id,
            name=c.name,
            description=c.description,
            is_visible=c.is_visible,
            sort_order=c.sort_order,
            products=by_cat.get(c.id, []),
        )
        for c in categories
    ]
    return [c for c in result if c.products] if public else result


# ── Helpers ─────────────────────────────────────────────


async def _category(session, rid: uuid.UUID, cid: uuid.UUID) -> MenuCategory:
    c = await session.get(MenuCategory, cid)
    if not c or c.restaurant_id != rid or c.deleted_at:
        raise NotFound("Catégorie introuvable")
    return c


async def _product(session, rid: uuid.UUID, pid: uuid.UUID) -> Product:
    p = await session.scalar(
        select(Product).where(Product.id == pid).options(*PRODUCT_LOADS).execution_options(populate_existing=True)
    )
    if not p or p.restaurant_id != rid or p.deleted_at:
        raise NotFound("Produit introuvable")
    return p


async def _check_refs(session, rid: uuid.UUID, data: dict) -> None:
    if data.get("image_media_id"):
        m = await session.get(Media, data["image_media_id"])
        if not m or m.restaurant_id != rid:
            raise Unprocessable("Image introuvable pour ce restaurant")
    if data.get("station_id"):
        s = await session.get(KitchenStation, data["station_id"])
        if not s or s.restaurant_id != rid:
            raise Unprocessable("Poste de cuisine introuvable")
    if data.get("category_id"):
        await _category(session, rid, data["category_id"])


def _check_promo(price: int, promo: int | None, start, end) -> None:
    if promo is not None and promo >= price:
        raise Unprocessable("Le prix promotionnel doit être inférieur au prix normal", code="invalid_promo")
    if start and end and end <= start:
        raise Unprocessable("La fin de promotion doit suivre son début", code="invalid_promo")


def _sync_option_groups(product: Product, groups: list[OptionGroupIn]) -> None:
    """Remplace les groupes d'options en conservant les identifiants existants (historique)."""
    existing_groups = {g.id: g for g in product.option_groups}
    new_groups: list[OptionGroup] = []
    for gi, g_in in enumerate(groups):
        group = existing_groups.get(g_in.id) if g_in.id else None
        if group is None:
            group = OptionGroup(restaurant_id=product.restaurant_id)
        group.name, group.min_choices, group.max_choices, group.sort_order = (
            g_in.name,
            g_in.min_choices,
            g_in.max_choices,
            gi,
        )
        existing_opts = {o.id: o for o in group.options} if group.id else {}
        opts: list[Option] = []
        for oi, o_in in enumerate(g_in.options):
            opt = existing_opts.get(o_in.id) if o_in.id else None
            if opt is None:
                opt = Option()
            opt.name, opt.price_delta, opt.is_available, opt.sort_order = (
                o_in.name,
                o_in.price_delta,
                o_in.is_available,
                oi,
            )
            opts.append(opt)
        group.options = opts
        new_groups.append(group)
    product.option_groups = new_groups


async def _notify(rid: uuid.UUID) -> None:
    await publish(restaurant_channel(rid), "menu.updated", {"restaurant_id": str(rid)})


# ── Routes ──────────────────────────────────────────────


@router.get("", response_model=list[CategoryOut])
async def get_menu(ctx: Can(Perm.MENU_VIEW), session: Session):
    return await load_menu(session, ctx.restaurant.id, public=False)


@router.post("/categories", response_model=CategoryOut, status_code=201)
async def create_category(body: CategoryIn, ctx: Can(Perm.MENU_CREATE), session: Session):
    last = await session.scalar(
        select(MenuCategory.sort_order)
        .where(MenuCategory.restaurant_id == ctx.restaurant.id)
        .order_by(MenuCategory.sort_order.desc())
        .limit(1)
    )
    c = MenuCategory(restaurant_id=ctx.restaurant.id, sort_order=(last or 0) + 1, **body.model_dump())
    session.add(c)
    audit(
        session,
        "menu.category_created",
        actor_id=ctx.user.id,
        restaurant_id=ctx.restaurant.id,
        entity="MenuCategory",
        data={"name": c.name},
    )
    await session.commit()
    await _notify(ctx.restaurant.id)
    return CategoryOut(
        id=c.id, name=c.name, description=c.description, is_visible=c.is_visible, sort_order=c.sort_order, products=[]
    )


@router.patch("/categories/{category_id}", response_model=CategoryOut)
async def update_category(category_id: uuid.UUID, body: CategoryUpdate, ctx: Can(Perm.MENU_EDIT), session: Session):
    c = await _category(session, ctx.restaurant.id, category_id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(c, k, v)
    await session.commit()
    await _notify(ctx.restaurant.id)
    menu = await load_menu(session, ctx.restaurant.id, public=False)
    return next(x for x in menu if x.id == c.id)


@router.delete("/categories/{category_id}", status_code=204)
async def delete_category(category_id: uuid.UUID, ctx: Can(Perm.MENU_DELETE), session: Session):
    c = await _category(session, ctx.restaurant.id, category_id)
    now = datetime.now(UTC)
    c.deleted_at = now
    products = await session.scalars(select(Product).where(Product.category_id == c.id, Product.deleted_at.is_(None)))
    for p in products:
        p.deleted_at = now
    audit(
        session,
        "menu.category_deleted",
        actor_id=ctx.user.id,
        restaurant_id=ctx.restaurant.id,
        entity="MenuCategory",
        entity_id=c.id,
    )
    await session.commit()
    await _notify(ctx.restaurant.id)


@router.put("/categories/order", status_code=204)
async def reorder_categories(body: ReorderIn, ctx: Can(Perm.MENU_EDIT), session: Session):
    cats = {
        c.id: c
        for c in await session.scalars(
            select(MenuCategory).where(MenuCategory.restaurant_id == ctx.restaurant.id, MenuCategory.id.in_(body.ids))
        )
    }
    for i, cid in enumerate(body.ids):
        if cid in cats:
            cats[cid].sort_order = i
    await session.commit()
    await _notify(ctx.restaurant.id)


@router.put("/categories/{category_id}/products/order", status_code=204)
async def reorder_products(category_id: uuid.UUID, body: ReorderIn, ctx: Can(Perm.MENU_EDIT), session: Session):
    await _category(session, ctx.restaurant.id, category_id)
    prods = {
        p.id: p
        for p in await session.scalars(
            select(Product).where(Product.category_id == category_id, Product.id.in_(body.ids))
        )
    }
    for i, pid in enumerate(body.ids):
        if pid in prods:
            prods[pid].sort_order = i
    await session.commit()
    await _notify(ctx.restaurant.id)


@router.post("/products", response_model=ProductOut, status_code=201)
async def create_product(body: ProductCreate, ctx: Can(Perm.MENU_CREATE, Perm.PRICES_EDIT), session: Session):
    rid = ctx.restaurant.id
    data = body.model_dump(exclude={"option_groups"})
    await _check_refs(session, rid, data)
    _check_promo(body.price, body.promo_price, body.promo_starts_at, body.promo_ends_at)
    last = await session.scalar(
        select(Product.sort_order)
        .where(Product.category_id == body.category_id)
        .order_by(Product.sort_order.desc())
        .limit(1)
    )
    p = Product(restaurant_id=rid, sort_order=(last or 0) + 1, **data)
    p.option_groups = []
    _sync_option_groups(p, body.option_groups)
    session.add(p)
    audit(
        session,
        "menu.product_created",
        actor_id=ctx.user.id,
        restaurant_id=rid,
        entity="Product",
        data={"name": p.name, "price": p.price},
    )
    await session.commit()
    await _notify(rid)
    return product_out(await _product(session, rid, p.id))


PRICE_FIELDS = ("price", "promo_price", "promo_starts_at", "promo_ends_at")


def _touches_prices(p: Product, data: dict, groups: list[OptionGroupIn] | None) -> bool:
    """La modification change-t-elle un prix, une promotion ou le prix d'un supplément ?"""

    def differs(new, old) -> bool:
        # Les dates de promotion des formulaires sont arrondies à la minute : comparaison à la minute près.
        if isinstance(new, datetime) and isinstance(old, datetime):
            return abs((new - old).total_seconds()) >= 60
        return new != old

    if any(k in data and differs(data[k], getattr(p, k)) for k in PRICE_FIELDS):
        return True
    if groups is None:
        return False
    current = {o.id: o.price_delta for g in p.option_groups for o in g.options}
    for g in groups:
        for o in g.options:
            if (o.id in current and current[o.id] != o.price_delta) or (o.id not in current and o.price_delta):
                return True
    return False


@router.patch("/products/{product_id}", response_model=ProductOut)
async def update_product(product_id: uuid.UUID, body: ProductUpdate, ctx: Can(Perm.MENU_EDIT), session: Session):
    rid = ctx.restaurant.id
    p = await _product(session, rid, product_id)
    data = body.model_dump(exclude_unset=True, exclude={"option_groups"})
    await _check_refs(session, rid, data)
    if _touches_prices(p, data, body.option_groups):
        ctx.require(Perm.PRICES_EDIT)
    before = {"price": p.price, "is_available": p.is_available}
    for k, v in data.items():
        setattr(p, k, v)
    _check_promo(p.price, p.promo_price, p.promo_starts_at, p.promo_ends_at)
    if body.option_groups is not None:
        _sync_option_groups(p, body.option_groups)
    audit(
        session,
        "menu.product_updated",
        actor_id=ctx.user.id,
        restaurant_id=rid,
        entity="Product",
        entity_id=p.id,
        data={"before": before, "fields": sorted(body.model_dump(exclude_unset=True))},
    )
    await session.commit()
    await _notify(rid)
    return product_out(await _product(session, rid, product_id))


class AvailabilityIn(Schema):
    is_available: bool


@router.post("/products/{product_id}/availability", response_model=ProductOut)
async def set_availability(product_id: uuid.UUID, body: AvailabilityIn, ctx: Can(Perm.STOCK_MANAGE), session: Session):
    """Rupture de stock rapide : accessible à tout le personnel (cuisine comprise)."""
    p = await _product(session, ctx.restaurant.id, product_id)
    p.is_available = body.is_available
    audit(
        session,
        "menu.product_availability",
        actor_id=ctx.user.id,
        restaurant_id=ctx.restaurant.id,
        entity="Product",
        entity_id=p.id,
        data={"is_available": body.is_available},
    )
    await session.commit()
    await _notify(ctx.restaurant.id)
    return product_out(p)


@router.delete("/products/{product_id}", status_code=204)
async def delete_product(product_id: uuid.UUID, ctx: Can(Perm.MENU_DELETE), session: Session):
    p = await _product(session, ctx.restaurant.id, product_id)
    p.deleted_at = datetime.now(UTC)
    audit(
        session,
        "menu.product_deleted",
        actor_id=ctx.user.id,
        restaurant_id=ctx.restaurant.id,
        entity="Product",
        entity_id=p.id,
    )
    await session.commit()
    await _notify(ctx.restaurant.id)
