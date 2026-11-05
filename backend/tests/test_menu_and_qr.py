import io

from PIL import Image

from tests.conftest import register


async def test_menu_crud_and_public_visibility(client, owner, restaurant, menu):
    rid = restaurant["id"]
    yassa = menu["yassa"]
    groups = yassa["option_groups"]
    assert [g["name"] for g in groups] == ["Accompagnement", "Suppléments"]

    # Mise à jour : les identifiants d'options existants sont conservés.
    payload = [{**g, "options": [{**o} for o in g["options"]]} for g in groups]
    payload[0]["options"].append({"name": "Attiéké", "price_delta": 300})
    r = await owner.patch(f"/api/restaurants/{rid}/menu/products/{yassa['id']}", json={"option_groups": payload})
    assert r.status_code == 200, r.text
    new_groups = r.json()["option_groups"]
    assert new_groups[0]["id"] == groups[0]["id"]
    assert new_groups[0]["options"][0]["id"] == groups[0]["options"][0]["id"]
    assert len(new_groups[0]["options"]) == 3

    # Produit masqué → absent du menu public ; catégorie vide → masquée.
    await owner.patch(f"/api/restaurants/{rid}/menu/products/{menu['bissap']['id']}", json={"is_visible": False})
    public = (await client.get(f"/api/public/restaurants/{restaurant['slug']}")).json()
    assert [c["name"] for c in public["menu"]] == ["Plats"]


async def test_promo_validation(owner, restaurant, menu):
    rid = restaurant["id"]
    r = await owner.patch(f"/api/restaurants/{rid}/menu/products/{menu['bissap']['id']}", json={"promo_price": 2000})
    assert r.status_code == 422
    r = await owner.patch(f"/api/restaurants/{rid}/menu/products/{menu['bissap']['id']}", json={"promo_price": 800})
    assert r.json()["effective_price"] == 800


async def test_invalid_option_group_bounds(owner, restaurant, menu):
    r = await owner.post(
        f"/api/restaurants/{restaurant['id']}/menu/products",
        json={
            "category_id": menu["plats"]["id"],
            "name": "X",
            "price": 100,
            "option_groups": [{"name": "G", "min_choices": 2, "max_choices": 1, "options": [{"name": "a"}]}],
        },
    )
    assert r.status_code == 422


async def test_qr_created_and_permanent(client, owner, restaurant):
    rid = restaurant["id"]
    qr = (await owner.get(f"/api/restaurants/{rid}/qr")).json()
    assert qr["url"] == f"https://omegasen.test/q/{qr['code']}"
    assert qr["is_active"]

    # Renommer le restaurant / changer son slug ne change pas le QR.
    await owner.patch(f"/api/restaurants/{rid}", json={"name": "Chez Awa & Fils", "slug": "awa-et-fils"})
    assert (await owner.get(f"/api/restaurants/{rid}/qr")).json()["code"] == qr["code"]

    resolved = (await client.get(f"/api/public/qr/{qr['code']}")).json()
    assert resolved == {"active": True, "restaurant_slug": "awa-et-fils", "restaurant_name": "Chez Awa & Fils"}
    assert (await owner.get(f"/api/restaurants/{rid}/qr")).json()["scan_count"] == 1

    await owner.patch(f"/api/restaurants/{rid}/qr", json={"is_active": False})
    assert (await client.get(f"/api/public/qr/{qr['code']}")).json()["active"] is False
    assert (await client.get("/api/public/qr/inconnu")).status_code == 404


async def test_qr_downloads(owner, restaurant):
    rid = restaurant["id"]
    png = await owner.get(f"/api/restaurants/{rid}/qr/image.png?size=512&download=true")
    assert png.status_code == 200 and png.headers["content-type"] == "image/png"
    assert "attachment" in png.headers["content-disposition"]
    assert Image.open(io.BytesIO(png.content)).size[0] >= 400

    svg = await owner.get(f"/api/restaurants/{rid}/qr/image.svg")
    assert svg.headers["content-type"].startswith("image/svg+xml")
    assert svg.text.startswith("<svg")

    for page in ("A4", "A6"):
        pdf = await owner.get(f"/api/restaurants/{rid}/qr/print.pdf?page={page}")
        assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")


async def test_qr_with_logo(owner, restaurant):
    rid = restaurant["id"]
    buf = io.BytesIO()
    Image.new("RGB", (400, 400), "orange").save(buf, format="PNG")
    up = await owner.post(
        f"/api/restaurants/{rid}/media",
        files={"file": ("logo.png", buf.getvalue(), "image/png")},
        data={"kind": "LOGO"},
    )
    assert up.status_code == 201, up.text
    await owner.patch(f"/api/restaurants/{rid}", json={"logo_media_id": up.json()["id"]})
    svg = await owner.get(f"/api/restaurants/{rid}/qr/image.svg")
    assert "data:image/png;base64" in svg.text


async def test_qr_regenerate_superadmin_only(client, owner, restaurant):
    rid = restaurant["id"]
    r = await owner.post(f"/api/admin/restaurants/{rid}/qr/regenerate")
    assert r.status_code == 403
    admin = await register(client, "root@example.com")
    from sqlalchemy import update

    from app.core.db import SessionLocal
    from app.models import User

    async with SessionLocal() as s:
        await s.execute(update(User).where(User.email == "root@example.com").values(is_superadmin=True))
        await s.commit()
    old = (await owner.get(f"/api/restaurants/{rid}/qr")).json()["code"]
    r = await admin.post(f"/api/admin/restaurants/{rid}/qr/regenerate")
    assert r.status_code == 200 and r.json()["code"] != old


async def test_media_upload_validation(owner, restaurant, s3):
    rid = restaurant["id"]
    bad = await owner.post(
        f"/api/restaurants/{rid}/media",
        files={"file": ("x.png", b"not an image", "image/png")},
        data={"kind": "GALLERY"},
    )
    assert bad.status_code == 422 and bad.json()["error"]["code"] == "invalid_image"

    buf = io.BytesIO()
    Image.new("RGB", (3000, 1500), "blue").save(buf, format="JPEG")
    up = await owner.post(
        f"/api/restaurants/{rid}/media",
        files={"file": ("p.jpg", buf.getvalue(), "image/jpeg")},
        data={"kind": "GALLERY"},
    )
    assert up.status_code == 201
    m = up.json()
    assert (m["width"], m["height"]) == (2000, 1000)
    assert m["thumb_url"].startswith("https://cdn.test/test-bucket/public/restaurants/")
    keys = [o["Key"] for o in s3.list_objects_v2(Bucket="test-bucket")["Contents"]]
    assert len(keys) == 3 and all(k.endswith(".webp") for k in keys)

    assert (await owner.delete(f"/api/restaurants/{rid}/media/{m['id']}")).status_code == 204
    assert s3.list_objects_v2(Bucket="test-bucket").get("KeyCount") == 0
