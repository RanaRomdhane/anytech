# Deployment runbook

## Prerequisites

- Separate staging and production hosts, DNS/TLS, provider credentials and encrypted backup target.
- A 32+ character random JWT secret and provider encryption key stored outside Git.
- A PostgreSQL runtime role that neither owns tables nor has `BYPASSRLS`.

## Release

1. Confirm CI, backup freshness and migration review.
2. Build immutable API and web images for the release tag and record digests.
3. Deploy the same digests to staging, run `alembic upgrade head`, then smoke health/auth/tenant/order flows.
4. Promote the approved digests to production.
5. Run migration once, start API/worker/web, verify `/health`, queue depth, webhook receipt and provider checks.
6. Observe error rate, latency, rejected signatures, outbox age and external-operation failures.

Prefer additive migrations. Roll back the image only while the schema remains backward-compatible; repair data forward otherwise.

## Backup and restoration

Take encrypted daily base backups plus WAL archiving targeting RPO 15 minutes. Quarterly and before pilot launch, restore into an isolated database, run integrity checks, start the application against it and record measured RPO/RTO. A backup file without a completed restoration is not evidence of recoverability.

