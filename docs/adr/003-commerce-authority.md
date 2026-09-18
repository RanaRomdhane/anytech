# ADR-003: Commerce authority

Status: accepted, 2026-09-18.

PostgreSQL-backed services are authoritative for price, stock, delivery fees, order state and tracking. AI may interpret intent and request allowlisted tools but cannot compose unsupported transaction facts or confirm an order from free-form model output alone.

