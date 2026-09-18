# AnyTech AI Social Commerce

AnyTech is a multi-tenant commerce workspace that turns WhatsApp conversations into grounded product answers, confirmed orders, and tracked deliveries. Transactional facts always come from backend services; AI cannot invent prices, stock, totals, or tracking references.

## Current implementation

This repository contains the first runnable product foundation:

- Angular 20 dashboard with AnyTech branding, responsive layouts, RTL switching, accessible controls, and operational views.
- FastAPI REST API with JWT authentication, company memberships, role checks, tenant-scoped catalogue and conversations.
- Draft order, immutable quote, explicit confirmation evidence, transactional stock reservation, and idempotent confirmation.
- Verified WhatsApp webhook handshake/signature entry points with durable, duplicate-safe receipt storage.
- PostgreSQL schema and row-level security migration, Redis/Celery worker foundation, Docker Compose, CI, tests, and project documentation.

The dashboard currently uses representative pilot data. WhatsApp outbound delivery, a hosted LLM, a real Tunisian carrier, invitation/MFA flows, file storage, and production deployment require provider selection or credentials and remain release blockers. See [implementation status](docs/implementation-status.md).

## Run locally

### Docker

1. Copy `.env.example` to `.env` and replace `JWT_SECRET`.
2. Start the stack:

   ```bash
   docker compose --env-file .env -f infra/compose/docker-compose.yml up --build
   ```

3. Open `http://localhost:4200`; API docs are available at `http://localhost:8000/docs`.

The development seed creates `admin@anytech.tn` with password `AnytechDemo2026!`. Disable `DEMO_MODE` outside local development.

### Native development

```bash
pnpm install
pnpm web:dev

cd apps/api
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"
.venv/Scripts/uvicorn app.main:app --reload
```

On Linux/macOS, use `.venv/bin/...` instead of `.venv/Scripts/...`.

## Validation

```bash
pnpm web:build
pnpm web:test
cd apps/api
.venv/Scripts/ruff check .
.venv/Scripts/ruff format --check .
.venv/Scripts/pytest
```

## Documentation

- [Product requirements](docs/prd.md)
- [Architecture and threat boundaries](docs/architecture.md)
- [Data model](docs/data-model.md)
- [API contract](docs/api/README.md)
- [UX system](docs/ux/design-system.md)
- [Delivery integration](docs/delivery/provider-contract.md)
- [Deployment runbook](docs/runbooks/deployment.md)
- [Implementation status](docs/implementation-status.md)
- [Architecture decisions](docs/adr/README.md)

## License

Copyright © 2026 AnyTech Company. All rights reserved. This public repository is source-available for review; no open-source license is granted. See [LICENSE](LICENSE).

