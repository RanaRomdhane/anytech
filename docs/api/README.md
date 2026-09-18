# API contract

The API base is `/api/v1`. Interactive OpenAPI is served at `/docs`; machine-readable JSON is served at `/openapi.json`.

## Conventions

- Bearer access token or secure access-token cookie.
- Company resources use `/companies/{company_id}` and independently verify membership.
- Unknown mutation fields are rejected.
- Money fields end in `_minor`; timestamps are ISO 8601 UTC.
- External-effect mutations require `Idempotency-Key`; version-sensitive writes carry an expected version.
- Cross-company lookups return 404.

Errors use:

```json
{
  "error": {
    "code": "QUOTE_CHANGED",
    "message": "Quote changed",
    "details": {},
    "request_id": "uuid"
  }
}
```

## Implemented routes

| Method and route | Purpose |
|---|---|
| `GET /health` | Runtime health |
| `POST /api/v1/auth/login` | Verify credentials and issue access token/cookie |
| `POST /api/v1/auth/refresh` | Rotate the refresh session and issue a new access cookie |
| `POST /api/v1/auth/logout` | Clear access cookie |
| `GET /api/v1/me` | Identity and memberships |
| `GET/POST /api/v1/companies/{company_id}/products` | List/search or create product with first variant |
| `GET /api/v1/companies/{company_id}/conversations` | List company conversations |
| `POST .../conversations/{id}/ai-draft` | Generate and persist a staff-reviewed grounded reply |
| `POST .../conversations/{id}/messages` | Save a draft or queue a configured WhatsApp message |
| `POST .../conversations/{id}/takeover` | Set `HUMAN_ACTIVE` with optimistic version |
| `POST .../conversations/{id}/return-to-ai` | Set `AI_ACTIVE` with optimistic version |
| `GET/POST /api/v1/companies/{company_id}/orders` | List or create draft order |
| `POST .../orders/{id}/quote` | Append 15-minute quote |
| `POST .../orders/{id}/confirm` | Confirm and reserve stock once |
| `POST .../orders/{id}/transitions` | Advance confirmed orders through preparation |
| `POST .../orders/{id}/cancel` | Cancel an eligible order and release reservations |
| `GET .../events` | Tenant-authorized server-sent event stream |
| `GET .../ai/status` and `/ai/runs` | Provider readiness and persisted execution history |
| `GET/POST /webhooks/whatsapp` | Meta handshake and verified durable receipt |

The remaining blueprint endpoints are tracked in `docs/implementation-status.md`; they are not advertised as available.
