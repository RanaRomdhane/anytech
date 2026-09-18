# Implementation status

Status date: 2026-09-18

## Delivered foundation

| Capability | Status | Evidence |
|---|---|---|
| Repository, pinned runtime manifests, Docker Compose | Implemented | Root scripts, application Dockerfiles, infrastructure compose file |
| Branded responsive application shell | Implemented | Transparent brand asset, login, protected routes, desktop/tablet/mobile CSS and RTL direction switch |
| Live operational frontend | Implemented | Dashboard, catalogue creation, persisted inbox history, order creation, customers, deliveries, analytics, integration status, team, settings and audit use tenant-scoped API data |
| Authentication foundation | Implemented | Argon2id password verification and short-lived signed access token |
| Refresh-session security | Implemented | Hashed rotating refresh tokens, reuse-family revocation, cookie-origin checks and logout revocation |
| Company membership and API tenant scoping | Implemented | Shared dependency plus cross-tenant API test |
| PostgreSQL tenant RLS | Implemented in migration | Forced policies based on transaction-local company context |
| Catalogue and variants | Implemented | Tenant-scoped create/list/search base with company-scoped SKU constraint |
| Conversation takeover | Implemented | Optimistic version check and audited mode change |
| Draft, quote, confirmation, stock reservation | Implemented | Immutable quote snapshot, expiry, price/stock recheck, row lock, evidence and idempotency test |
| WhatsApp webhook ingress | Implemented at contract boundary | Challenge verification, raw-body signature verification, duplicate-safe receipt |
| Hosted AI drafting | Implemented for staff review | Live OpenAI-compatible provider call, bounded catalogue context, persisted usage/latency, transactional-claim normalization and editable inbox draft |
| Realtime and outbound dispatcher | Implemented at contract boundary | Tenant-authorized SSE replay, durable outbound record, Celery beat dispatcher, provider acknowledgement states |
| Order lifecycle controls | Implemented | Quote, confirmation, preparation, ready-for-delivery and cancellation with reservation release |
| CI and documentation | Implemented | GitHub Actions, PR template, PRD, architecture, data/API/UX/runbooks/ADRs |

## Required before pilot

| Capability | Blocker / next action |
|---|---|
| Real WhatsApp traffic | Supply Meta app/account identifiers and secrets, complete app review, then validate inbound/outbound sandbox traffic. |
| Hosted LLM release gate | Groq is connected for staff-reviewed drafts. Run the multilingual benchmark and pass the accuracy/grounding gates before autonomous customer sending. |
| Tunisian carrier | Select the provider and provide API documentation/sandbox credentials; contract requires COD and idempotency/reconciliation evidence. |
| Refresh sessions, MFA, invites, resets | Implement before any production user onboarding. Current access-token-only auth is development foundation. |
| Storage and media | Select S3-compatible provider and implement tenant-scoped signed upload validation. |
| Worker hardening | Add per-conversation serialization and production monitoring after real WhatsApp traffic is available. |
| Production operations | Provision separate stage/prod hosts, secrets, TLS, monitoring, encrypted backups, WAL archiving and complete a restore drill. |
| Legal/privacy decision | Confirm hosting region, processors, retention and customer notices for the launch market. |

Mocked or static provider behavior is not evidence of production provider completion. The local seed is synthetic and exists only to exercise the same database and API contracts used by the application. Provider-dependent screens report the actual configured state and never simulate a successful connection.
