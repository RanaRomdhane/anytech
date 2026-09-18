# ADR-001: Modular monolith

Status: accepted, 2026-09-18.

Use one FastAPI codebase and image for HTTP and worker processes. Domain modules share application services and one PostgreSQL database. This minimizes distributed transaction and deployment cost for the pilot. Split a service only after measured scaling, ownership, or isolation pressure.

