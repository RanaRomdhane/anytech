import uuid

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import ai_service
from app.ai_service import normalize_transactional_claims
from app.config import settings
from app.integrations.llm import LLMResult
from app.models import AIRun, Conversation, Customer, Message, Product, ProductVariant


def test_login_rotates_refresh_session_and_rejects_reuse(client: TestClient, tenant: dict):
    login = client.post(
        "/api/v1/auth/login",
        json={"email": tenant["admin"].email, "password": "strong-password"},
    )
    assert login.status_code == 200
    first_refresh = login.cookies.get("refresh_token")
    assert first_refresh

    refreshed = client.post("/api/v1/auth/refresh")
    assert refreshed.status_code == 200
    second_refresh = refreshed.cookies.get("refresh_token")
    assert second_refresh and second_refresh != first_refresh

    client.cookies.set("refresh_token", first_refresh)
    reuse = client.post("/api/v1/auth/refresh")
    assert reuse.status_code == 401
    assert reuse.json()["error"]["code"] == "SESSION_REUSE_DETECTED"


def test_grounded_ai_draft_is_persisted_and_message_remains_draft_without_channel(
    client: TestClient,
    db: Session,
    tenant: dict,
    monkeypatch,
):
    company = tenant["company"]
    customer = Customer(company_id=company.id, name="Amel", phone="+21620000000")
    product = Product(company_id=company.id, name="Atlas", description="Chaussure légère")
    product.variants.append(
        ProductVariant(
            company_id=company.id,
            sku="ATL-38",
            attributes={"taille": "38"},
            price_minor=39900,
            stock_on_hand=3,
        )
    )
    db.add_all([customer, product])
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
            body="Atlas taille 38 disponible ?",
        )
    )
    db.commit()

    class Provider:
        def __init__(self, **_):
            pass

        async def complete(self, messages):
            prompt = "\n".join(message["content"] for message in messages)
            assert '"price_minor": 39900' in prompt
            assert '"available_stock": 3' in prompt
            return LLMResult(
                content="Oui, Atlas taille 38 est disponible à 39,900 TND.",
                model="test-model",
                prompt_tokens=40,
                completion_tokens=12,
            )

    monkeypatch.setattr(ai_service, "OpenAICompatibleLLM", Provider)
    monkeypatch.setattr(settings, "llm_provider", "test")
    monkeypatch.setattr(settings, "llm_model", "test-model")
    monkeypatch.setattr(settings, "llm_api_key", "configured")
    monkeypatch.setattr(settings, "whatsapp_access_token", "")

    response = client.post(
        f"/api/v1/companies/{company.id}/conversations/{conversation.id}/ai-draft",
        headers=tenant["admin_headers"],
    )
    assert response.status_code == 200, response.text
    assert response.json()["content"].startswith("Oui")
    run = db.scalar(select(AIRun).where(AIRun.id == uuid.UUID(response.json()["run_id"])))
    assert run and run.status == "completed" and run.prompt_tokens == 40
    status = client.get(
        f"/api/v1/companies/{company.id}/ai/status", headers=tenant["admin_headers"]
    )
    history = client.get(f"/api/v1/companies/{company.id}/ai/runs", headers=tenant["admin_headers"])
    assert status.json()["run_count"] == 1
    assert status.json()["prompt_tokens"] == 40
    assert history.json()[0]["model"] == "test-model"

    saved = client.post(
        f"/api/v1/companies/{company.id}/conversations/{conversation.id}/messages",
        headers=tenant["admin_headers"],
        json={
            "body": response.json()["content"],
            "client_message_id": "browser-message-0001",
        },
    )
    assert saved.status_code == 201
    assert saved.json()["status"] == "draft"


def test_transactional_claims_are_normalized_or_rejected():
    variant = ProductVariant(
        company_id=__import__("uuid").uuid4(),
        product_id=__import__("uuid").uuid4(),
        sku="ATL-38",
        price_minor=137900,
        stock_on_hand=12,
        stock_reserved=0,
    )
    normalized = normalize_transactional_claims(
        "Il reste 12 pièces et le prix est 137 900 TND.", [variant]
    )
    rejected = normalize_transactional_claims(
        "Il reste 99 pièces et le prix est 10 TND.", [variant]
    )

    assert normalized == "Il reste 12 pièces et le prix est 137,900 TND."
    assert rejected.startswith("Je vérifie")
