# ADR-002: Tenant isolation

Status: accepted, 2026-09-18.

Use global users plus company memberships. Every business row has `company_id`; API queries scope it explicitly and PostgreSQL forces RLS from a transaction-local company setting. The runtime role cannot own protected tables or bypass RLS. Cross-tenant integration tests are mandatory for each new business endpoint.

