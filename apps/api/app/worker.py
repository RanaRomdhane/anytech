import asyncio
import uuid
from datetime import UTC, datetime

from celery import Celery
from sqlalchemy import select, text

from app.config import settings
from app.db import SessionLocal
from app.events import emit_event
from app.integrations.whatsapp import WhatsAppCloudClient, WhatsAppProviderError
from app.models import Conversation, Customer, Message, OutboxEvent

celery_app = Celery("anytech", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    task_serializer="json",
    accept_content=["json"],
    beat_schedule={"dispatch-outbox": {"task": "anytech.dispatch_outbox", "schedule": 2.0}},
)


@celery_app.task(name="anytech.healthcheck")
def healthcheck() -> str:
    return "ok"


@celery_app.task(name="anytech.dispatch_outbox")
def dispatch_outbox() -> str:
    now = datetime.now(UTC)
    with SessionLocal.begin() as db:
        event = db.scalar(
            select(OutboxEvent)
            .where(
                OutboxEvent.topic == "whatsapp.message.send",
                OutboxEvent.published_at.is_(None),
                (OutboxEvent.next_attempt_at.is_(None) | (OutboxEvent.next_attempt_at <= now)),
            )
            .order_by(OutboxEvent.created_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if event is None:
            return "empty"
        try:
            company_id = uuid.UUID(event.payload["company_id"])
            message_id = uuid.UUID(event.payload["message_id"])
        except (KeyError, TypeError, ValueError):
            event.last_error = "Invalid outbox payload"
            event.published_at = now
            return "invalid"

        if db.bind and db.bind.dialect.name == "postgresql":
            db.execute(
                text("select set_config('app.current_company_id', :company_id, true)"),
                {"company_id": str(company_id)},
            )
        row = db.execute(
            select(Message, Conversation, Customer)
            .join(Conversation, Conversation.id == Message.conversation_id)
            .join(Customer, Customer.id == Conversation.customer_id)
            .where(
                Message.id == message_id,
                Message.company_id == company_id,
                Conversation.company_id == company_id,
                Customer.company_id == company_id,
            )
        ).one_or_none()
        if row is None:
            event.last_error = "Outbound message context not found"
            event.published_at = now
            return "missing"
        message, conversation, customer = row
        if message.status != "queued":
            event.published_at = now
            return "already_processed"

        client = WhatsAppCloudClient(
            access_token=settings.whatsapp_access_token,
            phone_number_id=settings.whatsapp_phone_number_id,
            graph_version=settings.whatsapp_graph_version,
            base_url=settings.whatsapp_graph_base_url,
        )
        event.attempts += 1
        try:
            result = asyncio.run(client.send_text(customer.phone, message.body))
            message.external_id = result.message_id
            message.status = "sent"
            event.published_at = now
            event.last_error = None
            outcome = "sent"
        except WhatsAppProviderError as exc:
            message.status = "unknown" if exc.ambiguous else "failed"
            event.last_error = str(exc)[:300]
            event.published_at = now
            outcome = message.status
        emit_event(
            db,
            company_id=company_id,
            event_type="message.updated",
            resource_id=message.id,
            payload={"conversation_id": str(conversation.id), "status": message.status},
        )
        return outcome
