.PHONY: up down logs reset dev-db dev-api dev-web db-shell test e2e

up:
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f

reset:
	docker compose down -v

dev-db:
	docker compose -f compose.dev.yml up -d

dev-api:
	cd apps/backend && npm run dev

dev-web:
	cd apps/frontend && npm run dev

db-shell:
	docker compose exec mongo mongosh mongodb://localhost:27017/multiprice

test:
	cd apps/backend && npm test
	cd apps/frontend && npm test

e2e:
	npx cypress run --config-file e2e/cypress.config.ts --spec e2e/health.cy.ts
