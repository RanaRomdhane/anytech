from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Conversation, Customer, Message


def test_cross_tenant_catalogue_access_is_hidden(client: TestClient, tenant: dict):
    response = client.get(
        f"/api/v1/companies/{tenant['company'].id}/products",
        headers=tenant["outsider_headers"],
    )

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "COMPANY_NOT_FOUND"


def test_order_quote_confirmation_reserves_stock_once(
    client: TestClient, db: Session, tenant: dict
):
    company_id = tenant["company"].id
    headers = tenant["admin_headers"]
    product_response = client.post(
        f"/api/v1/companies/{company_id}/products",
        headers=headers,
        json={
            "name": "Écouteurs Atlas",
            "description": "Bluetooth, autonomie 30 heures",
            "variant": {
                "sku": "ATL-BLK",
                "attributes": {"couleur": "noir"},
                "price_minor": 89900,
                "stock_on_hand": 1,
            },
        },
    )
    assert product_response.status_code == 201, product_response.text
    variant_id = product_response.json()["variants"][0]["id"]

    order_response = client.post(
        f"/api/v1/companies/{company_id}/orders",
        headers=headers,
        json={"items": [{"variant_id": variant_id, "quantity": 1}]},
    )
    assert order_response.status_code == 201, order_response.text
    order_id = order_response.json()["id"]

    quote_response = client.post(
        f"/api/v1/companies/{company_id}/orders/{order_id}/quote",
        headers=headers,
        json={"delivery_minor": 8000},
    )
    assert quote_response.status_code == 200, quote_response.text

    confirm_headers = {**headers, "Idempotency-Key": "confirm-atlas-1"}
    confirm_payload = {
        "quote_version": quote_response.json()["version"],
        "evidence_type": "staff",
        "evidence_id": tenant["request_id"],
    }
    first = client.post(
        f"/api/v1/companies/{company_id}/orders/{order_id}/confirm",
        headers=confirm_headers,
        json=confirm_payload,
    )
    second = client.post(
        f"/api/v1/companies/{company_id}/orders/{order_id}/confirm",
        headers=confirm_headers,
        json=confirm_payload,
    )

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert first.json()["status"] == "CONFIRMED"
    assert first.json()["total_minor"] == 97900

    product = client.get(f"/api/v1/companies/{company_id}/products", headers=headers).json()[
        "items"
    ][0]
    assert product["variants"][0]["stock_reserved"] == 1


def test_workspace_pages_return_tenant_scoped_data(client: TestClient, db: Session, tenant: dict):
    company = tenant["company"]
    customer = Customer(
        company_id=company.id,
        name="Amel Ben Salah",
        phone="+21620000111",
        city="Tunis",
    )
    db.add(customer)
    db.flush()
    conversation = Conversation(company_id=company.id, customer_id=customer.id)
    db.add(conversation)
    db.flush()
    db.add(
        Message(
            company_id=company.id,
            conversation_id=conversation.id,
            direction="inbound",
            sender_type="customer",
            body="Bonjour",
        )
    )
    db.commit()

    headers = tenant["admin_headers"]
    customers = client.get(f"/api/v1/companies/{company.id}/customers", headers=headers)
    detail = client.get(
        f"/api/v1/companies/{company.id}/conversations/{conversation.id}",
        headers=headers,
    )
    analytics = client.get(f"/api/v1/companies/{company.id}/analytics/summary", headers=headers)
    team = client.get(f"/api/v1/companies/{company.id}/team", headers=headers)

    assert customers.status_code == 200
    assert customers.json()[0]["name"] == "Amel Ben Salah"
    assert detail.status_code == 200
    assert detail.json()["messages"][0]["body"] == "Bonjour"
    assert analytics.json()["customers"] == 1
    assert analytics.json()["conversations"] == 1
    assert team.json()[0]["email"] == "owner@example.com"


def test_company_settings_update_is_persisted(client: TestClient, tenant: dict):
    company_id = tenant["company"].id
    response = client.patch(
        f"/api/v1/companies/{company_id}/settings",
        headers=tenant["admin_headers"],
        json={"name": "Atlas Commerce", "currency": "TND", "timezone": "Africa/Tunis"},
    )

    assert response.status_code == 200
    assert response.json()["name"] == "Atlas Commerce"
