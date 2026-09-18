# Product requirements

## Product statement

AnyTech Commerce AI helps Tunisia-first merchants sell through WhatsApp while preserving human control and reliable commerce records. It centralizes conversations, product data, orders, dispatch and operational reporting.

## Personas

- **Platform administrator:** provisions companies and diagnoses platform integration failures through audited support access.
- **Company administrator:** configures products, team, integrations, AI controls and operations within one company.
- **Human agent:** handles conversations, orders and permitted cancellations, including immediate AI takeover.
- **Customer:** chats through WhatsApp and explicitly confirms an order without creating a dashboard account.
- **AI service actor:** invokes a small server-authorized tool set and has no direct database authority.

## MVP requirements

| ID | Requirement | Acceptance criterion |
|---|---|---|
| ID-01 | Secure dashboard authentication and company membership | Inactive/invalid sessions fail; cross-company resource requests return 404. |
| CAT-01 | Products have company-scoped variants, prices and stock | Duplicate SKU within one company is rejected; another company may reuse it. |
| MSG-01 | WhatsApp events are verified and durably accepted once | Invalid signatures fail; identical events do not create duplicate receipts. |
| MSG-02 | Staff can take over or resume a conversation | Version conflicts fail; a takeover is audited before any later send. |
| AI-01 | AI only presents tool-derived transaction facts | Evaluation set contains zero unsupported price, stock, fee or tracking claims. |
| ORD-01 | Draft orders reuse catalogued variant facts | Order lines snapshot SKU, product name and unit price. |
| ORD-02 | Confirmation targets the latest unexpired quote | Stale/expired quote fails and requires a refreshed customer review. |
| ORD-03 | Confirmation cannot oversell stock | Row-locked confirmation reserves the last unit only once. |
| ORD-04 | Confirmation is explicit and replay-safe | Evidence identifies staff/customer message and repeated idempotency key has one effect. |
| DEL-01 | Only ready orders may be dispatched | Carrier acceptance is persisted before shipment success is communicated. |
| OPS-01 | Sensitive operations are attributable | Audit records include company, actor, action, resource and safe metadata. |
| UX-01 | Core flows work on keyboard, narrow screens and RTL | Manual WCAG 2.2 AA checks pass in French and Arabic layouts. |

## Non-functional targets

- 99.5% pilot availability, RPO at most 15 minutes, RTO at most four hours.
- Internal API p95 at most 500 ms outside provider calls; durable webhook p95 at most one second.
- AI response p95 at most 15 seconds when its provider is healthy.
- 20 pilot companies, 50 concurrent dashboard users and five inbound messages per second with short tenfold bursts.
- Raw webhook retention seven days, message content 90 days, operational/audit metadata 365 days, pending legal review.
- French and Arabic dashboard; Derja, Arabic, French and English customer messages.

## Pilot success

Release gates: zero tenant-isolation, duplicate external-effect, or unsupported transactional-fact defects in the release suite. Pilot targets: three onboarded merchants, 100 real conversations, 30 confirmed orders, at least 50% AI resolution on eligible sales enquiries and 50% response-time reduction against merchant baselines.

AI resolution means no human reply and no reopening within 24 hours. Conversion is one confirmed order within seven days of an eligible distinct conversation.

