# Implementation status

Status date: 2026-09-18

## Delivered foundation

| Capability | Status | Evidence |
|---|---|---|
| Repository, pinned runtime manifests, Docker Compose | Implemented | Root scripts, application Dockerfiles, infrastructure compose file |
| Branded responsive application shell | Implemented | Transparent brand asset, login, protected routes, desktop/tablet/mobile CSS and RTL direction switch |
| Live operational frontend slice | Implemented | Dashboard, catalogue creation, inbox takeover and order list use the FastAPI contracts and PostgreSQL demo data |
| Authentication foundation | Implemented | Argon2id password verification and short-lived signed access token |
| Company membership and API tenant scoping | Implemented | Shared dependency plus cross-tenant API test |
| PostgreSQL tenant RLS | Implemented in migration | Forced policies based on transaction-local company context |
| Catalogue and variants | Implemented | Tenant-scoped create/list/search base with company-scoped SKU constraint |
| Conversation takeover | Implemented | Optimistic version check and audited mode change |
| Draft, quote, confirmation, stock reservation | Implemented | Immutable quote snapshot, expiry, price/stock recheck, row lock, evidence and idempotency test |
| WhatsApp webhook ingress | Implemented at contract boundary | Challenge verification, raw-body signature verification, duplicate-safe receipt |
| CI and documentation | Implemented | GitHub Actions, PR template, PRD, architecture, data/API/UX/runbooks/ADRs |

## Required before pilot

| Capability | Blocker / next action |
|---|---|
| Real WhatsApp traffic | Supply Meta app/account identifiers and secrets, complete app review, then validate inbound/outbound sandbox traffic. |
| Hosted LLM | Run the multilingual benchmark, select the provider/model, add the provider adapter and pass grounding gates. |
| Tunisian carrier | Select the provider and provide API documentation/sandbox credentials; contract requires COD and idempotency/reconciliation evidence. |
| Refresh sessions, MFA, invites, resets | Implement before any production user onboarding. Current access-token-only auth is development foundation. |
| Storage and media | Select S3-compatible provider and implement tenant-scoped signed upload validation. |
| SSE, dispatcher and worker processing | Implement durable outbox claiming, per-conversation serialization, replay and client synchronization. |
| Production operations | Provision separate stage/prod hosts, secrets, TLS, monitoring, encrypted backups, WAL archiving and complete a restore drill. |
| Legal/privacy decision | Confirm hosting region, processors, retention and customer notices for the launch market. |

Mocked or static dashboard behavior is not evidence of production provider completion.

The development seed is synthetic and exists only to exercise real application contracts. Operational pages for customers, delivery, AI, analytics, integrations, team and settings state their next implementation gates rather than simulating external success.
