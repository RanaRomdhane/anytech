import uuid

from sqlalchemy.orm import Session

from app.models import RealtimeEvent


def emit_event(
    db: Session,
    *,
    company_id: uuid.UUID,
    event_type: str,
    resource_id: uuid.UUID | None,
    version: int | None = None,
    payload: dict | None = None,
) -> None:
    db.add(
        RealtimeEvent(
            company_id=company_id,
            event_type=event_type,
            resource_id=resource_id,
            version=version,
            payload=payload or {},
        )
    )
