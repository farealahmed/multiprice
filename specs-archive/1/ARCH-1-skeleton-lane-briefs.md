# Architecture: Phase 0 — Skeleton (lane briefs)

> **Date:** 2026-08-12
> **Issue:** #1
> **Phase:** 2 of 5 (System Architecture)
> **Requirements source:** Standalone brief — see Inferred Requirements
> **Type:** infrastructure

## Architecture Summary

Phase 0 is a greenfield skeleton phase: it produces **no product surface**, only the cross-cutting conventions and the health contract that every later phase depends on. A gate (G0) freezes dependencies, TypeScript configuration, the error envelope, the health schema, and the two single-most-important backend rules (`fp`-wrapping every plugin, autoloading plugins before routes); then three lanes run in parallel — 0-A builds the Fastify runtime that boots from validated config and answers `GET /health` with real Mongo connectivity, 0-B builds the Next.js shell with a typed `fetch` client that talks to the backend through a same-origin rewrite, 0-C builds the Docker/Cypress/Makefile harness that makes `docker compose up` and `npx cypress run` work on a clean clone. The whole phase is proved at Join J0 by `make up` + a green `health.cy.ts`. Drift in any G0 convention is silent until a later phase breaks; the conventions are therefore enforced by comment + pattern-by-example rather than by test.

## Inferred Requirements

| ID  | Inferred Requirement                                                                                              | Source                              |
|-----|-------------------------------------------------------------------------------------------------------------------|-------------------------------------|
| R1  | Every file in `apps/backend/src/api/plugins/` must be wrapped in `fastify-plugin` (`fp`) so hooks apply app-wide.  | Brief step 5, second bullet         |
| R2  | `apps/backend/src/api/plugins/` must load before `apps/backend/src/api/routes/`, via `@fastify/autoload` order.   | Brief step 5, second bullet         |
| R3  | Each domain owns a single contract file on both sides; later phases add domain error codes inside their own file. | Brief step 5, first bullet          |
| R4  | The browser never talks to the backend cross-origin; Next rewrites `/api/:path*` to `${BACKEND_ORIGIN}/api/:path*`; no CORS config, no `NEXT_PUBLIC_API_URL`. | Brief step 4                        |
| R5  | `dependencies` for a phase are added by that phase's gate; lanes never install. Where two gates share a wave, neither may add dependencies — it moves to its own wave. | Brief step 1                        |
| R6  | The error envelope is frozen as `{ error: { code, message, details? } }`. `details` carries per-field validation failures. Only envelope-level codes (`VALIDATION_FAILED`, `INTERNAL_ERROR`) live in `contracts/errors/envelope.ts`; no later gate adds codes there. | Brief steps 3, 5                    |
| R7  | Health endpoint returns `{ status: 'ok' \| 'degraded', db: 'up' \| 'down', version: string }`. 200 when ok, 503 when degraded. Response is validated against the contract schema. | Brief step 6; Lane 0-A step 4       |
| R8  | `GET /health` is public (no auth check) — auth lands in Phase 2.                                                   | Confirmed in Phase F               |
| R9  | Frontend `client.ts` uses `credentials: 'include'` from day 1 so Phase 2's session cookie works without retrofit. | Lane 0-B step 4                    |
| R10 | Cypress uses a `data-testid` selector convention documented in `e2e/README.md`; UI lanes follow it.               | Lane 0-C step 5                     |
| R11 | Two compose files (not one with overrides): `compose.yml` (reviewer's stack, Mongo unpublished) and `compose.dev.yml` (host-process dev, Mongo on `127.0.0.1:27017`). | Lane 0-C steps 2–3                  |
| R12 | Mongo connection failure at boot is fatal; connection loss at runtime is not (driver reconnects).                  | Lane 0-A step 2                     |

## High-Level Structure

```
Wave 1 (after G0)
  G0  ─►  ┌─ 0-A backend-engineer ─ Fastify + Mongo ─┐
          ├─ 0-B frontend-engineer ─ Next.js shell ───┤ ──► J0
          └─ 0-C infra-engineer ── Docker/Cypress ────┘
  G1  runs in parallel with 0-A/0-B/0-C (Phase 1's gate; depends only on G0's conventions)

Wave 2
  1-A pricing engine (overshoots 1-B/1-C of Phase 1)
  ...
```

```
Browser (Next.js, port 3000)
  │  GET /api/health               relative URL, same-origin
  ▼
Next.js rewrite (next.config.ts)  /api/:path*  →  ${BACKEND_ORIGIN}/api/:path*
  │  HTTP proxy
  ▼
Fastify backend (port 3001 inside container; BACKEND_ORIGIN points at it)
  │  db.command({ ping: 1 })
  ▼
Mongo (unpublished host port; reachable only on the compose network)
```

G0 is the **serial bottleneck** of Phase 0; 0-A/0-B/0-C + G1 fan out from it. J0 is the only point where all three lanes meet, and the Cypress test is what proves it.

## Tech Choices

| Area                     | Decision                                                                                                | Alternatives Considered           | Rationale                                                                                |
|--------------------------|---------------------------------------------------------------------------------------------------------|-----------------------------------|------------------------------------------------------------------------------------------|
| Backend framework        | Fastify 4 + `@fastify/autoload` + `fastify-plugin`                                                      | Express, NestJS                   | Already frozen by the brief; aligns with the `fp` + autoload conventions the phase exists to enforce. |
| Backend validation       | zod schemas, inferred TS types, JSON schema registered on the route                                     | yup, class-validator              | zod is already in the brief stack; reused by Phase 1+ for domain contracts.                |
| Database                 | MongoDB 7, embedded in `docker compose`, single mongod                                                  | Mongo replica set, external Atlas | Brief: writes are single-document; a replica set buys nothing here.                       |
| Backend testing          | vitest + `@fastify/autoload` `app.inject()`                                                             | Jest + supertest                  | Already frozen; `app.inject()` removes the listen/drain cost from tests.                   |
| Frontend framework       | Next.js 15 App Router, standalone output                                                                | Vite + React Router               | Brief step 1; App Router matches the design mockups.                                      |
| Frontend styling         | CSS Modules + design tokens in `src/styles/tokens.css`                                                  | Tailwind, CSS-in-JS               | Brief tokens are CSS custom properties; CSS Modules keeps the surface small.              |
| Frontend fonts           | Marcellus (display), Noto Sans (UI), Roboto (numerals) via `next/font`                                  | CDN `<link>`                      | Brief: "do not leave a bare CDN link in the layout."                                      |
| Frontend testing         | vitest + `@testing-library/react` + `jsdom`                                                             | Playwright component tests        | Brief; component tests added by UI lanes later.                                          |
| Cross-cutting transport  | Same-origin Next.js rewrite; relative `/api/...` URLs; `credentials: 'include'`                        | CORS + cross-site cookies         | Brief step 4: cross-origin needs `@fastify/cors` + `Access-Control-Allow-Credentials`; cross-site cookies break in production. The rewrite removes both for three lines. |
| E2E                      | Cypress at repo root, `baseUrl: http://localhost:3000`                                                  | Playwright                        | Brief step 5.                                                                            |
| Container build          | Multi-stage Dockerfiles on `node:22-alpine`, non-root, `NODE_ENV=production`, Next standalone output    | single-stage, root user           | Brief step 1.                                                                             |
| Logging                  | pino (Fastify default) + `genReqId` for request IDs; no redact list in Phase 0                          | Winston, custom logger            | pino is the Fastify default; Phase 2 may add a redact list when secrets appear in logs.   |
| Config parsing           | zod on `process.env` at boot; exits non-zero on invalid config                                          | dotenv + manual checks            | Brief: invalid config is not a request-time failure.                                      |

## Patterns & Conventions

- **One contract file per domain.** Each gate owns `apps/backend/src/contracts/<domain>.ts` (schemas + this domain's error codes) and `apps/frontend/src/lib/api/types/<domain>.ts` (hand-written mirror). There is no growing `codes.ts` and no growing `types.ts`. Two gates running in the same wave would otherwise collide on those shared files. `contracts/errors/envelope.ts` is touched by G0 only and holds only the envelope shape + envelope-level codes (`VALIDATION_FAILED`, `INTERNAL_ERROR`). _Applied because:_ the wave-collision cost of a shared append-target is real; _affects:_ every phase 1+.
- **`fastify-plugin` (`fp`) on every file in `src/api/plugins/`.** Without `fp`, Fastify encapsulates the plugin and its hooks apply only to itself — a guard registered that way passes its own tests and protects no real route. The first file 0-A writes in `plugins/` is `error-handler.ts`, which uses `fp`; the pattern is set by example before 4-A's immutability guard lands. A code comment at the top of `app.ts` reinforces this. _Applied because:_ Phase 4's immutability guard and Phase 2's index bootstrap reach every route only when `fp` is used. _Affected by:_ 0-A's `app.ts`, every later lane that adds a plugin.
- **Two autoloaded directories, plugins before routes.** `src/api/plugins/` loads first, then `src/api/routes/`. A lane creates a file in either and it is live — `app.ts` is owned by 0-A and never edited again. _Applied because:_ every later lane (1-B, 2-A, 3-A, 4-A, 5-A, 4-D) must add plugins or routes without editing `app.ts`. _Affected by:_ 0-A's autoload ordering.
- **Hand-written mirror on the frontend, with a header comment naming the backend file it mirrors.** _Applied because:_ rule 1 of the brief; the alternative is a code-generation step that is not worth its weight at this scale. _Affected by:_ every contract pair in the project.
- **Schema-validate the route's own response.** `GET /health` is registered with the zod-inferred JSON schema; drift in `contracts/health.ts` breaks the route, not the browser. _Applied because:_ the two halves of the contract are written by hand; the cheapest insurance is at the boundary.
- **One error handler, registered once by autoload.** `api/plugins/error-handler.ts` is the only error handler; later phases do **not** add a second. _Applied because:_ the envelope is the single contract surface for errors; two handlers = two envelope versions.

## Data Models

### HealthResponse

**Purpose:** The single document Phase 0 produces and Phase 1+ may rely on for liveness/readiness signals.

**Key fields:**
| Field     | Type / Constraint                    | Notes                                                              |
|-----------|--------------------------------------|--------------------------------------------------------------------|
| `status`  | `'ok' \| 'degraded'`                 | `'ok'` only when Mongo ping succeeds.                              |
| `db`      | `'up' \| 'down'`                     | Result of `db.command({ ping: 1 })`.                                |
| `version` | `string`                             | Backend build version. Source TBD by 0-A (env var or `package.json`). |

**Relationships:** None. This is the only domain entity in Phase 0.

**Lifecycle:**
- Created on every `GET /health` request → returned to caller → discarded.

**Constraints:** Response body is validated against the zod schema on the route (server side) and against the mirrored TS type on the client (compile side). A mismatch fails the server-side schema check at request time, not the browser.

## API Contracts / Interfaces

### Health endpoint

**Boundary:** HTTP API (public, no auth).

**Operations:**

| Method/Op   | Path           | Purpose                                   | Errors / Returns                                                                                |
|-------------|----------------|-------------------------------------------|-------------------------------------------------------------------------------------------------|
| `GET`       | `/api/health`  | Liveness probe + Mongo connectivity check | 200 + `{ status: 'ok', db: 'up', version }` when healthy. 503 + `{ status: 'degraded', db: 'down', version }` when Mongo ping fails. Response body validated against `healthResponse` zod schema on every request. |

**Auth requirements:** Public. No session, no token. Auth lands in Phase 2.

### Error envelope

**Boundary:** Cross-cutting contract. Every non-2xx response carries this envelope.

**Shape:**
```ts
export type ErrorEnvelope = {
  error: { code: string; message: string; details?: Array<{ path: string; code: string; message: string }> }
}
```

**Envelope-level codes** (live in `contracts/errors/envelope.ts`, set by G0, never amended):
- `VALIDATION_FAILED` — zod schema validation failed; `details[]` populated from issue paths.
- `INTERNAL_ERROR` — unmapped throwable; `message` is generic, the cause is logged.

**Domain codes** (added by later phases, in their own contract file): out of scope for Phase 0.

### Frontend API client

**Boundary:** Internal module — every later frontend lane calls the API through this file.

**Operations:**

| Op                                  | Purpose                                                                     | Errors / Returns                                                          |
|-------------------------------------|-----------------------------------------------------------------------------|---------------------------------------------------------------------------|
| `apiFetch<T>(path, init?): Promise<T>` | Relative `/api/...` URL; JSON in/out; `credentials: 'include'` always.   | 2xx → parsed JSON as `T`. Non-2xx → parse envelope, throw typed `ApiError` carrying `{ code, message, details }`. |

**Auth requirements:** N/A in Phase 0 (no auth). `credentials: 'include'` is unconditional from day 1.

## Module Boundaries

| Module / Package                                       | Responsibility                                                                                              | Allowed Dependencies                                                                  |
|--------------------------------------------------------|-------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------------|
| `apps/backend/src/contracts/**`                        | Frozen zod schemas and TS types. G0 owns `errors/envelope.ts` and `health.ts`. Later gates own their own files. | `zod` only. No runtime imports.                                                       |
| `apps/backend/src/config/**`                           | Parse `process.env` via zod at boot; export typed `config` object.                                            | `zod`, `node:process`. No app code.                                                   |
| `apps/backend/src/persistence/**`                      | Mongo plugin: one `MongoClient`, `app.mongo` / `app.db` decoration, close on `onClose`. 0-A owns `mongo.ts`. | `mongodb`, `fastify`, `fastify-plugin`. No route imports.                              |
| `apps/backend/src/api/plugins/**`                      | Autoloaded plugins. 0-A owns `error-handler.ts`; later lanes add their own. Every file `fp`-wrapped.          | `fastify`, `fastify-plugin`. No direct route imports.                                 |
| `apps/backend/src/api/routes/**`                       | Autoloaded routes. 0-A owns `health.ts`; later lanes add their own.                                           | `fastify`. Plugins are applied via autoload, not direct import.                       |
| `apps/backend/src/api/errors/envelope-mapper.ts`       | Maps thrown errors → `ErrorEnvelope`. Imported only by `plugins/error-handler.ts`.                            | `zod`.                                                                                |
| `apps/backend/src/observability/**`                    | Logging setup. 0-A owns the directory. Default pino config in Phase 0.                                        | `pino` (transitive via Fastify).                                                       |
| `apps/backend/src/app.ts`                              | Fastify instance builder. Autoloads plugins then routes. Owned by 0-A, **never edited by later lanes**.       | `fastify`, `@fastify/autoload`.                                                        |
| `apps/backend/src/server.ts`                           | Listens, handles SIGTERM/SIGINT with in-flight drain. Owned by 0-A.                                           | `app.ts`, `node:process`.                                                              |
| `apps/backend/test/**`                                 | Vitest suites via `app.inject()`. 0-A owns `test/api/health.test.ts`.                                         | `vitest`, app source.                                                                  |
| `apps/frontend/src/app/**`                             | App Router root layout, home page, `globals.css`. 0-B owns.                                                   | `next`, React. No business logic.                                                     |
| `apps/frontend/src/styles/**`                          | Design tokens + global styles. 0-B owns `tokens.css` (port from `design/htmls/styles.css`).                   | CSS only.                                                                              |
| `apps/frontend/src/components/shell/**`               | Topbar, brand mark, nav slot, user slot. 0-B owns. Nav driven by `NAV_ITEMS` exported from `nav-items.ts`.    | React.                                                                                 |
| `apps/frontend/src/lib/api/client.ts`                  | Typed `fetch` wrapper. 0-B owns. Every later frontend lane calls the API through this.                          | Browser globals (`fetch`). No React.                                                  |
| `apps/frontend/src/lib/api/types/**`                   | Hand-written mirrors of backend contracts. G0 owns `health.ts`; later gates own their own.                    | Type-only. No runtime imports.                                                        |
| `compose.yml` (root)                                   | Reviewer's stack: `mongo`, `backend`, `frontend`. Mongo unpublished. 0-C owns.                                | Docker Compose.                                                                        |
| `compose.dev.yml` (root)                               | Host-process dev: `mongo` on `127.0.0.1:27017`, own volume. 0-C owns.                                          | Docker Compose.                                                                        |
| `apps/backend/Dockerfile`, `apps/frontend/Dockerfile` | Multi-stage builds. 0-C owns.                                                                                | Docker.                                                                                |
| `e2e/**`                                               | Cypress config, support, `health.cy.ts`. 0-C owns.                                                            | Cypress.                                                                               |
| `Makefile`                                             | `up`/`down`/`logs`/`reset`/`dev-db`/`dev-api`/`dev-web`/`db-shell`/`test`/`e2e`. 0-C owns.                   | make.                                                                                  |
| `docs/contracts/phase-0.md`                            | Health endpoint, error envelope, env vars, ports, two conventions (one-file-per-domain, plugins-before-routes), the `fp` rule, and the mirroring rule. G0 owns. | Markdown only. |

## Change Footprint

_All files are new — this is a greenfield phase._

### New files / modules

| Path                                                                  | Purpose                                                                                              | Pattern reference                  |
|-----------------------------------------------------------------------|------------------------------------------------------------------------------------------------------|------------------------------------|
| `package.json` (root)                                                 | Root scripts; G0 creates, 0-C appends (no other writes).                                              | None.                              |
| `.nvmrc`, `.editorconfig`, `.gitignore`                               | Tooling pin + ignore list. G0 owns.                                                                  | None.                              |
| `.env.example`                                                        | `PORT`, `MONGO_URL`, `MONGO_DB`, `NODE_ENV`, `JWT_SECRET`, `COOKIE_NAME`, `BACKEND_ORIGIN`. G0 owns. | None.                              |
| `docs/contracts/phase-0.md`                                           | Frozen contract doc; conventions; mirroring rule. G0 owns.                                           | None.                              |
| `apps/backend/package.json`, `apps/backend/tsconfig.json`, `apps/backend/vitest.config.ts` | ESM, `strict`, `noUncheckedIndexedAccess`, target ES2023, `moduleResolution: "nodenext"`. G0 owns. | None. |
| `apps/frontend/package.json`, `apps/frontend/tsconfig.json`, `apps/frontend/next.config.ts`, `apps/frontend/vitest.config.ts` | Same TS rules; `moduleResolution: "bundler"`; rewrite `/api/:path*` → `${BACKEND_ORIGIN}/api/:path*`. G0 owns. | None. |
| `apps/backend/src/contracts/errors/envelope.ts`                       | Frozen `ErrorEnvelope` type + envelope-level codes. G0 owns, never amended.                          | None.                              |
| `apps/backend/src/contracts/health.ts`                                | `healthResponse` zod schema + inferred TS type. G0 owns.                                              | None.                              |
| `apps/frontend/src/lib/api/types/health.ts`                           | Hand-written mirror of `contracts/health.ts`, with header comment. G0 owns.                           | `apps/backend/src/contracts/health.ts`. |
| `apps/backend/src/config/index.ts` (+ zod schema)                     | Parse `process.env`; exit on invalid. 0-A owns.                                                       | None.                              |
| `apps/backend/src/persistence/mongo.ts`                               | Mongo plugin: `app.mongo` / `app.db`, close on `onClose`. 0-A owns.                                  | None.                              |
| `apps/backend/src/api/errors/envelope-mapper.ts`                      | Maps `ZodError` → `VALIDATION_FAILED`; other throwables → `INTERNAL_ERROR`. 0-A owns.                | None.                              |
| `apps/backend/src/api/plugins/error-handler.ts`                       | Fastify error handler, `fp`-wrapped. 0-A owns.                                                        | None.                              |
| `apps/backend/src/api/routes/health.ts`                               | `GET /health` with schema-validated response. 0-A owns.                                              | `apps/backend/src/contracts/health.ts`. |
| `apps/backend/src/observability/**`                                   | Logging setup (pino defaults). 0-A owns.                                                             | None.                              |
| `apps/backend/src/app.ts`                                             | Fastify instance builder; autoloads plugins then routes. 0-A owns, **never edited again**.            | None.                              |
| `apps/backend/src/server.ts`                                          | Listen + SIGTERM/SIGINT drain. 0-A owns.                                                              | `apps/backend/src/app.ts`.        |
| `apps/backend/test/api/health.test.ts`                                | `app.inject()`: healthy → 200 + shape; failing ping → 503 + `db: 'down'`. 0-A owns.                   | None.                              |
| `apps/frontend/src/app/layout.tsx`, `apps/frontend/src/app/page.tsx`, `apps/frontend/src/app/globals.css` | App Router skeleton with Marcellus / Noto Sans / Roboto via `next/font`. 0-B owns. | None. |
| `apps/frontend/src/styles/tokens.css`                                 | Warm palette + font stacks + tabular-numeral rule for `.num`/`.amount`. 0-B owns.                     | `design/htmls/styles.css`.        |
| `apps/frontend/src/components/shell/{Topbar,Brand,NavSlot,UserSlot}.tsx` (+ `nav-items.ts`) | Shell from `design/htmls/documents.html`; nav driven by `NAV_ITEMS`. 0-B owns. | `design/htmls/documents.html`.    |
| `apps/frontend/src/lib/api/client.ts`                                 | `apiFetch<T>`; relative URLs; `credentials: 'include'`; throws typed `ApiError`. 0-B owns.            | None.                              |
| `apps/frontend/src/lib/api/client.test.ts`                            | Non-2xx response → `ApiError` with envelope `code` + `details` intact. 0-B owns.                      | None.                              |
| `compose.yml` (root)                                                  | Reviewer's stack; Mongo unpublished; named volume. 0-C owns.                                          | None.                              |
| `compose.dev.yml` (root)                                              | Dev stack; Mongo on `127.0.0.1:27017`; separate volume. 0-C owns.                                    | None.                              |
| `infra/.dockerignore`, `apps/backend/.dockerignore`, `apps/frontend/.dockerignore` | Exclude `node_modules`, tests, build artifacts. 0-C owns.                                | None.                              |
| `apps/backend/Dockerfile`, `apps/frontend/Dockerfile`                 | Multi-stage, non-root, `NODE_ENV=production`; Next standalone for frontend. 0-C owns.                | None.                              |
| `e2e/cypress.config.ts`, `e2e/support/**`, `e2e/health.cy.ts`, `e2e/README.md` | Cypress harness + one test + `data-testid` convention doc. 0-C owns.                       | None.                              |
| `Makefile`                                                            | 10 targets per the brief table. 0-C owns.                                                              | None.                              |

### Modified files / modules

_None — greenfield._

### Deleted / replaced

_None._

### Touched but not changed (silent-regression hotspots)

_None in Phase 0 — there is nothing pre-existing._

## Areas of Impact

_Broader-than-files impact. All forward-looking — no consumer exists yet._

| Area                                       | Impact                                                              | Risk (L/M/H) | Why                                                                                                  |
|--------------------------------------------|---------------------------------------------------------------------|--------------|------------------------------------------------------------------------------------------------------|
| Phase 1+ contract files (`contracts/pricing.ts`, etc.) | Will mirror G0's one-file-per-domain rule.                    | **M**        | A drift here (e.g. shared `codes.ts`) reintroduces the wave-collision problem G0 exists to prevent. |
| Phase 4 immutability guard (`api/plugins/immutability.ts`) | Depends on `fp` wrapping and autoload ordering.            | **M**        | A missing `fp` or wrong autoload order means the guard passes its own tests and protects no route.   |
| Phase 2 session cookie (`credentials: 'include'`) | Frontend `client.ts` already carries it from day 1.             | **L**        | If a future lane "simplifies" the client to remove `credentials`, Phase 2 breaks silently in production. |
| Phase 2+ Mongo usage                       | Decoration via `app.mongo` / `app.db` is the only access pattern.   | **L**        | Phases that bypass decoration (e.g. instantiate a client themselves) would break `onClose`.          |
| Phase 2+ error handling                    | All errors flow through the one handler in `plugins/error-handler.ts`. | **M**  | A Phase 1+ lane that adds a second handler splits the envelope into two versions.                     |
| Cypress `data-testid` convention           | UI lanes will read `e2e/README.md` and follow it.                  | **L**        | Convention only — not enforced as lint in Phase 0. Drift is visible in PR review.                   |
| `docker compose up` reviewer's path        | Two compose files, not one with overrides.                          | **M**        | An override that leaks Mongo's host port into the reviewer's stack would expose dev data.            |
| `BACKEND_ORIGIN`                            | Single env var the Next rewrite reads.                              | **L**        | Misconfigured → 502 at J0; caught by `e2e/health.cy.ts`.                                              |

**Contract changes:** None — no external/public contract exists yet.

**Cross-cutting ripples:** Auth, telemetry, migrations, feature flags, CI/build pipeline: all null in Phase 0. Auth in Phase 2, telemetry in Phase 2, migrations in Phase 2, no feature flags, no CI yet. That's the point of a skeleton phase.

## Cross-Cutting Concerns

- **Errors:** One error handler (`api/plugins/error-handler.ts`) maps every thrown error to the frozen envelope. `ZodError` → `VALIDATION_FAILED` with `details[]` from issue paths. Anything else → `INTERNAL_ERROR` with a generic `message` and a logged `cause`. The handler is registered once by autoload; later phases do not add a second one. The browser's `client.ts` parses the envelope on non-2xx and throws typed `ApiError` carrying `{ code, message, details }`.
- **Logging & metrics:** pino (Fastify default) with `genReqId` for request IDs. JSON output. No secrets in logs (Phase 0 has no secrets; Phase 2 may add a redact list). No custom metrics in Phase 0.
- **Auth / authz:** None in Phase 0. `/health` is public. Auth lands in Phase 2.
- **Performance:** No budgets in Phase 0. The only metric-shaped thing is `/health`'s `db.command({ ping: 1 })`, which is bounded by the Mongo round-trip. No caching in Phase 0.
- **Security:** No user data in Phase 0. Validation boundary: every zod schema is a hard input boundary; route response is validated against the contract schema. No secrets in `.env.example` values; `JWT_SECRET` is left blank for the user to fill in.
- **Migrations / rollout:** No DB writes in Phase 0, no migrations. Rollout = `make up` on a clean clone → J0 Cypress green. The `reset` target (`down` + drop volume) is the recovery path.

## Architecture Decisions Log

| #   | Decision                                                                                       | Alternatives                                                       | Chosen Because                                                                                                                                          | Satisfies REQs |
|-----|------------------------------------------------------------------------------------------------|--------------------------------------------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------|----------------|
| A1  | Same-origin proxy via Next rewrite; relative `/api/...` URLs; no CORS config; no `NEXT_PUBLIC_API_URL`. | CORS + `Access-Control-Allow-Credentials`; two deployment domains. | Brief step 4: cross-origin fails at J0 (CORS) and cross-site fails at J2 (cookie not sent). Rewrite removes both for three lines.                       | R4             |
| A2  | One contract file per domain; later phases add their own codes inside their file.              | Shared `codes.ts` and `types.ts` files.                            | Two gates in the same wave would otherwise collide on those shared files.                                                                                | R3, R6         |
| A3  | Every file in `src/api/plugins/` must be `fp`-wrapped.                                          | Run-time check via vitest; lint rule.                              | Comment + pattern-by-example is enough; a vitest test for `fp` would be brittle (the test would have to introspect the plugin system).                | R1             |
| A4  | `GET /health` is public, not auth-protected.                                                    | Require a session token.                                            | `/health` must be reachable before any session exists; auth lands in Phase 2.                                                                            | R8             |
| A5  | Health route schema-validates its own response against the zod-inferred JSON schema.           | Type-only validation; client-side validation only.                 | Drift in `contracts/health.ts` breaks the route, not the browser. Two hand-written halves (backend schema + frontend mirror) make this cheap insurance. | R7             |
| A6  | One error handler, registered once by autoload. Later phases do not add a second.              | Per-domain error handlers.                                          | The envelope is the single contract surface for errors; two handlers = two envelope versions.                                                            | R6             |
| A7  | Mongo connection failure at boot is fatal; runtime loss is not.                                 | Always-fatal; never-fatal.                                         | Brief: "connection failure at boot is fatal; connection loss at runtime is not." Aligns with how Phase 2+ will depend on Mongo at request time.        | R12            |
| A8  | Two compose files (`compose.yml` + `compose.dev.yml`), not one with overrides.                  | Single file with `compose.override.yml`.                           | The reviewer's path is `docker compose up` with no flags; an override that leaks Mongo's host port is a real mistake.                                  | R11            |
| A9  | pino defaults + `genReqId`; no custom logger; no redact list.                                   | Winston; custom pino config; redact list from day 1.                | pino is Fastify's default; Phase 0 has no secrets to redact. Phase 2 may add a redact list when auth lands.                                            | R5 (logging)   |
| A10 | Frontend `client.ts` carries `credentials: 'include'` from day 1.                               | Add it in Phase 2 when sessions land.                              | Brief step 4: retrofitting is how Phase 2's session cookie silently breaks in production.                                                                | R9             |
| A11 | Cypress `data-testid` convention lives in `e2e/README.md`, not as a lint rule.                 | ESLint plugin, custom Cypress command.                              | Convention is enough for a skeleton phase; PR review catches drift. Adding tooling now is premature.                                                    | R10            |

## Risk & Stress-Test Scenarios

### Forward — runtime failure scenarios

| Scenario                                                          | How the Design Handles It                                                                                  |
|-------------------------------------------------------------------|------------------------------------------------------------------------------------------------------------|
| A lane drops a plugin in `src/api/plugins/` without `fp`.          | Pattern set by 0-A's `error-handler.ts` (which uses `fp`); comment at top of `app.ts` reinforces. One PR review catches it. |
| Next rewrite `BACKEND_ORIGIN` misconfigured → 502 at J0.          | `e2e/health.cy.ts` runs against `localhost:3000` and asserts the page reports healthy backend. Caught at J0. |
| Two later phases want to amend the envelope / add a code.         | `docs/contracts/phase-0.md` enumerates the two envelope-level codes and states "no later gate adds codes here — domain codes live in their domain file." PR review catches a violation. |
| Mongo connection drops at runtime.                                | `/health` returns 503 + `status: 'degraded'` + `db: 'down'`. Driver reconnects; subsequent requests succeed. |
| Config invalid at boot.                                           | Zod parses `process.env`; process exits non-zero with a readable message. Docker container restart loops until config is fixed. |
| `credentials: 'include'` removed from `client.ts` by a later lane. | PR review against the brief's step 4. Production failure mode is invisible in local dev.                  |
| Reviewer's `compose.yml` accidentally publishes Mongo on a host port. | Two-file design makes this a deliberate edit, not an override accident. PR review catches it.            |

### Backward — regression risk per touched area (brownfield only)

_Not applicable — greenfield. No pre-existing code can regress._

## Open Questions

- **`version` field source.** The health response carries a `version` string. Should 0-A source it from `process.env.VERSION` (set at image build), from `apps/backend/package.json` (read at boot), or hardcode it? _Impact if unresolved:_ test data and observability both treat this as opaque, so any source works; the choice only matters when Phase 2+ starts emitting it in logs. _Suggested default:_ read `package.json` at boot via `fs.readFile` + JSON.parse, fall back to `'unknown'`. Cheap, no build-pipeline coupling.

## Out of Scope

- **Auth (sessions, JWT, cookies).** Reason: lands in Phase 2.
- **Pricing engine.** Reason: lands in Phase 1.
- **Documents, editors, reports.** Reason: lands in Phases 3, 5.
- **CI / deployment pipelines.** Reason: deployment is already handled (per the project README); CI is not a Phase 0 deliverable.
- **OpenAPI spec.** Reason: not generated in Phase 0; Phase 6 may add it only if it falls out of the existing zod setup for free.
- **Component tests for the shell.** Reason: brief: "do not create component tests merely to test the skeleton."
- **Redact list in pino.** Reason: Phase 0 has no secrets in logs; the list arrives with Phase 2's auth.
