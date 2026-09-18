# ADR-004: Durable provider work

Status: accepted, 2026-09-18.

Persist inbound events and outbound intents in PostgreSQL before acknowledging or dispatching. Redis/Celery accelerates execution but is not the source of truth. Tasks are replay-safe, use stable request keys and reconcile ambiguous external timeouts before retrying.

