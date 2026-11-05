import asyncio
import json

from app.core.money import extract_vat
from app.core.redis import get_redis
from tests.conftest import login, opt


def qr_order(menu, **extra):
    yassa = menu["yassa"]
    body = {
        "channel": "QR",
        "service_mode": "TAKEAWAY",
        "customer_name": "Moussa",
        "items": [
            {
                "product_id": yassa["id"],
                "quantity": 2,
                "option_ids": [opt(yassa, "Accompagnement", "Frites"), opt(yassa, "Suppléments", "Oignons")],
                "note": "Bien cuit",
            },
            {"product_id": menu["bissap"]["id"], "quantity": 1},
        ],
    }
    body.update(extra)
    return body


async def test_vat_extraction():
    assert extract_vat(1100, 1000) == 100  # 10 %
    assert extract_vat(1200, 2000) == 200  # 20 %
    assert extract_vat(11800, 1800) == 1800  # 18 % XOF
    assert extract_vat(0, 2000) == 0


async def test_qr_order_server_side_pricing(client, restaurant, menu):
    r = await client.post(f"/api/public/restaurants/{restaurant['slug']}/orders", json=qr_order(menu))
    assert r.status_code == 201, r.text
    o = r.json()
    # Yassa 3500 + Frites 500 + Oignons 200 = 4200 × 2 = 8400 ; + Bissap 1000
    assert o["total"] == 9400
    assert o["currency"] == "XOF"
    assert o["tax_total"] == extract_vat(8400, 1800) + extract_vat(1000, 1800)
    assert o["display_number"] == "001"
    assert o["status"] == "NEW" and o["payment_status"] == "UNPAID"
    assert o["items"][0]["note"] == "Bien cuit"
    assert {x["option_name"] for x in o["items"][0]["options"]} == {"Frites", "Oignons"}

    track = (await client.get(f"/api/public/orders/{o['tracking_token']}")).json()
    assert track["reference"] == o["reference"]
    assert "customer_phone" not in track


async def test_client_prices_are_ignored(client, restaurant, menu):
    body = qr_order(menu)
    body["items"][1]["price"] = 1  # champ inconnu ignoré ; le prix vient du menu
    r = await client.post(f"/api/public/restaurants/{restaurant['slug']}/orders", json=body)
    assert r.json()["total"] == 9400


async def test_required_option_group_enforced(client, restaurant, menu):
    body = qr_order(menu)
    body["items"][0]["option_ids"] = []
    r = await client.post(f"/api/public/restaurants/{restaurant['slug']}/orders", json=body)
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_options"

    body["items"][0]["option_ids"] = [
        opt(menu["yassa"], "Accompagnement", "Riz"),
        opt(menu["yassa"], "Accompagnement", "Frites"),
    ]
    r = await client.post(f"/api/public/restaurants/{restaurant['slug']}/orders", json=body)
    assert r.status_code == 422


async def test_unavailable_product_and_closed_restaurant(client, owner, restaurant, menu):
    rid, slug = restaurant["id"], restaurant["slug"]
    await owner.post(
        f"/api/restaurants/{rid}/menu/products/{menu['bissap']['id']}/availability", json={"is_available": False}
    )
    r = await client.post(f"/api/public/restaurants/{slug}/orders", json=qr_order(menu))
    assert r.status_code == 422 and r.json()["error"]["code"] == "product_unavailable"

    await owner.post(
        f"/api/restaurants/{rid}/menu/products/{menu['bissap']['id']}/availability", json={"is_available": True}
    )
    await owner.patch(f"/api/restaurants/{rid}", json={"accepting_orders": False})
    r = await client.post(f"/api/public/restaurants/{slug}/orders", json=qr_order(menu))
    assert r.json()["error"]["code"] == "restaurant_closed"

    await owner.patch(f"/api/restaurants/{rid}", json={"accepting_orders": True, "takeaway_enabled": False})
    r = await client.post(f"/api/public/restaurants/{slug}/orders", json=qr_order(menu))
    assert r.json()["error"]["code"] == "service_mode_unavailable"


async def test_customer_name_required_for_public(client, restaurant, menu):
    r = await client.post(
        f"/api/public/restaurants/{restaurant['slug']}/orders", json=qr_order(menu, customer_name=" ")
    )
    assert r.json()["error"]["code"] == "customer_name_required"


async def test_idempotency_and_sequential_numbers(client, restaurant, menu):
    slug = restaurant["slug"]
    a = await client.post(f"/api/public/restaurants/{slug}/orders", json=qr_order(menu, idempotency_key="cart-123456"))
    b = await client.post(f"/api/public/restaurants/{slug}/orders", json=qr_order(menu, idempotency_key="cart-123456"))
    assert a.json()["reference"] == b.json()["reference"]

    results = await asyncio.gather(
        *[client.post(f"/api/public/restaurants/{slug}/orders", json=qr_order(menu)) for _ in range(8)]
    )
    numbers = sorted(int(r.json()["display_number"]) for r in results)
    assert numbers == list(range(2, 10))


async def test_kitchen_flow_and_roles(client, owner, restaurant, menu):
    rid = restaurant["id"]
    await owner.post(
        f"/api/restaurants/{rid}/members",
        json={"email": "chef@example.com", "full_name": "Chef", "role": "KITCHEN", "password": "Password!123"},
    )
    chef = await login(client, "chef@example.com")
    placed = (await client.post(f"/api/public/restaurants/{restaurant['slug']}/orders", json=qr_order(menu))).json()

    active = (await chef.get(f"/api/restaurants/{rid}/orders/active")).json()
    assert len(active) == 1 and active[0]["channel"] == "QR"
    oid = active[0]["id"]
    assert set(active[0]["allowed_transitions"]) == {"PREPARING", "READY"}

    rules = (await chef.get(f"/api/restaurants/{rid}/orders/transitions")).json()
    assert rules["COMPLETED"] == [] and "CANCELLED" not in rules["NEW"]
    owner_rules = (await owner.get(f"/api/restaurants/{rid}/orders/transitions")).json()
    assert owner_rules["COMPLETED"] == ["READY"] and "CANCELLED" in owner_rules["NEW"]

    for status in ("PREPARING", "READY", "COMPLETED"):
        r = await chef.post(f"/api/restaurants/{rid}/orders/{oid}/status", json={"status": status})
        assert r.status_code == 200, r.text
    done = r.json()
    assert done["preparing_at"] and done["ready_at"] and done["completed_at"]
    assert (await chef.get(f"/api/restaurants/{rid}/orders/active")).json() == []

    # La cuisine ne peut pas rouvrir une commande terminée ni annuler.
    r = await chef.post(f"/api/restaurants/{rid}/orders/{oid}/status", json={"status": "READY"})
    assert r.status_code == 403
    r = await owner.post(f"/api/restaurants/{rid}/orders/{oid}/status", json={"status": "READY"})
    assert r.status_code == 200 and r.json()["completed_at"] is None

    track = (await client.get(f"/api/public/orders/{placed['tracking_token']}")).json()
    assert track["status"] == "READY"


async def test_cancel_requires_reason(owner, restaurant, menu, client):
    rid = restaurant["id"]
    o = (await client.post(f"/api/public/restaurants/{restaurant['slug']}/orders", json=qr_order(menu))).json()
    order = (await owner.get(f"/api/restaurants/{rid}/orders")).json()["items"][0]
    r = await owner.post(f"/api/restaurants/{rid}/orders/{order['id']}/status", json={"status": "CANCELLED"})
    assert r.status_code == 422
    r = await owner.post(
        f"/api/restaurants/{rid}/orders/{order['id']}/status", json={"status": "CANCELLED", "reason": "Client parti"}
    )
    assert r.json()["status"] == "CANCELLED"
    r = await owner.post(f"/api/restaurants/{rid}/orders/{order['id']}/status", json={"status": "PREPARING"})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_transition"
    assert o["reference"] == order["reference"]


async def test_pos_order_with_cash_payment(owner, restaurant, menu):
    rid = restaurant["id"]
    body = {
        "service_mode": "DINE_IN",
        "items": [{"product_id": menu["bissap"]["id"], "quantity": 3}],
        "payment": {"method": "CASH", "amount_tendered": 5000},
    }
    r = await owner.post(f"/api/restaurants/{rid}/orders", json=body)
    assert r.status_code == 201, r.text
    o = r.json()
    assert o["channel"] == "POS" and o["total"] == 3000
    assert o["payment_status"] == "PAID" and o["amount_paid"] == 3000
    assert o["payments"][0]["amount_tendered"] == 5000
    assert o["sent_to_kitchen_at"] is not None


async def test_payments_partial_overpay_refund(owner, restaurant, menu, client):
    rid = restaurant["id"]
    await client.post(f"/api/public/restaurants/{restaurant['slug']}/orders", json=qr_order(menu))
    oid = (await owner.get(f"/api/restaurants/{rid}/orders")).json()["items"][0]["id"]
    url = f"/api/restaurants/{rid}/orders/{oid}/payments"

    r = await owner.post(url, json={"method": "CARD", "amount": 4000})
    assert r.json()["payment_status"] == "PARTIALLY_PAID"
    r = await owner.post(url, json={"method": "CASH", "amount": 6000})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_amount"
    r = await owner.post(url, json={"method": "CASH", "amount_tendered": 3000})
    assert r.json()["error"]["code"] == "insufficient_cash"
    r = await owner.post(url, json={"method": "CASH", "amount_tendered": 10000})
    assert r.json()["payment_status"] == "PAID"
    r = await owner.post(url, json={"method": "ONLINE"})
    assert r.status_code == 422  # jamais de paiement en ligne saisi à la main

    pay_id = r_id = (await owner.get(f"/api/restaurants/{rid}/orders/{oid}")).json()["payments"][0]["id"]
    r = await owner.post(f"{url}/{pay_id}/refund", json={"reason": "Erreur de caisse"})
    assert r.json()["payment_status"] == "PARTIALLY_PAID" and r.json()["amount_paid"] == 5400
    assert r_id


async def test_prepayment_holds_order_out_of_kitchen(client, owner, restaurant, menu):
    rid = restaurant["id"]
    await owner.patch(f"/api/restaurants/{rid}", json={"require_prepayment": True})
    o = (await client.post(f"/api/public/restaurants/{restaurant['slug']}/orders", json=qr_order(menu))).json()
    assert (await owner.get(f"/api/restaurants/{rid}/orders/active")).json() == []
    waiting = (await owner.get(f"/api/restaurants/{rid}/orders/awaiting-payment")).json()
    assert len(waiting) == 1
    oid = waiting[0]["id"]
    r = await owner.post(f"/api/restaurants/{rid}/orders/{oid}/status", json={"status": "PREPARING"})
    assert r.json()["error"]["code"] == "awaiting_payment"

    await owner.post(f"/api/restaurants/{rid}/orders/{oid}/payments", json={"method": "CARD"})
    assert len((await owner.get(f"/api/restaurants/{rid}/orders/active")).json()) == 1

    # Le paiement en ligne n'est pas simulé : 503 tant qu'aucun prestataire n'est branché.
    r = await client.post(
        f"/api/public/orders/{o['tracking_token']}/checkout",
        json={"success_url": "https://x", "cancel_url": "https://y"},
    )
    assert r.status_code == 503


async def test_realtime_event_published(client, restaurant, menu):
    pubsub = get_redis().pubsub()
    await pubsub.subscribe(f"rt:restaurant:{restaurant['id']}")
    await pubsub.get_message(timeout=1)  # confirmation d'abonnement
    await client.post(f"/api/public/restaurants/{restaurant['slug']}/orders", json=qr_order(menu))
    msg = None
    for _ in range(20):
        msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.5)
        if msg:
            break
    await pubsub.aclose()
    assert msg is not None
    event = json.loads(msg["data"])
    assert event["event"] == "order.created"
    assert event["data"]["items"][0]["product_name"] == "Yassa poulet"


async def test_stats(owner, restaurant, menu, client):
    rid = restaurant["id"]
    await owner.post(
        f"/api/restaurants/{rid}/orders",
        json={
            "service_mode": "DINE_IN",
            "items": [{"product_id": menu["bissap"]["id"], "quantity": 2}],
            "payment": {"method": "CARD"},
        },
    )
    await client.post(f"/api/public/restaurants/{restaurant['slug']}/orders", json=qr_order(menu))
    s = (await owner.get(f"/api/restaurants/{rid}/stats")).json()
    assert s["orders"] == 2 and s["revenue"] == 2000
    assert {b["key"] for b in s["by_channel"]} == {"POS", "QR"}
    assert s["top_products"][0]["name"] in ("Bissap", "Yassa poulet")
