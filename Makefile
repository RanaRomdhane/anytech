.PHONY: dev api-test api-lint web-build up down

dev:
	docker compose --env-file .env -f infra/compose/docker-compose.yml up --build

api-test:
	cd apps/api && pytest

api-lint:
	cd apps/api && ruff check . && ruff format --check .

web-build:
	pnpm --dir apps/web build

up:
	docker compose --env-file .env -f infra/compose/docker-compose.yml up -d

down:
	docker compose --env-file .env -f infra/compose/docker-compose.yml down
