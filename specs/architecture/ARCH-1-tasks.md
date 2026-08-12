# Tasks

_Phase 0 fans out from a single serial gate (T1) into three parallel lanes (T2/T3/T4). One terminal runs T1 to completion; then three terminals run T2, T3, T4 in parallel; then all three converge at Join J0._

| Task | Role | Mode | Depends on | Parallel with | Status |
|---|---|---|---|---|---|
| **T1** — G0: Conventions and the health contract | backend-engineer | `checklist` | — | — | **done** (commit `2cf4713`) |
| **T2** — Lane 0-A: Backend runtime | backend-engineer | `test-after` | T1 | T3, T4 | **done** (commit `73160d8`) |
| **T3** — Lane 0-B: Frontend shell | frontend-engineer | `test-after` | T1 | T2, T4 | **done** |
| **T4** — Lane 0-C: Infra and E2E harness | infra-engineer | `checklist` | T1 | T2, T3 | pending |

---

## Task T1 — G0: Conventions and the health contract

**Mode:** `checklist`
**Agent role:** backend-engineer (per brief — owns both backend and frontend config)
**Date:** 2026-08-12
**Depends on:** —
**Blocks:** T2, T3, T4

### Description

Freeze every decision two agents could otherwise answer differently, and write the trivial health contract that establishes the schema-in-backend / mirrored-type-in-frontend pattern. G0 is the **serial bottleneck** of Phase 0 — T2/T3/T4 cannot start until this task is done.

### Context (from ARCH)

- **Architecture Summary** — G0 establishes the cross-cutting conventions every later phase depends on.
- **Inferred Requirements** — R1 (`fp` wrapping), R3 (one-file-per-domain), R4 (same-origin proxy), R5 (dependency ownership), R6 (envelope frozen), R7 (health schema), R8 (`/health` public).
- **Decisions** — A1 (same-origin), A2 (one-file-per-domain), A3 (`fp` enforcement by comment + example), A9 (pino defaults).

### Files Expected (from Change Footprint → New files)

| Path | Purpose |
|---|---|
| `package.json` (root) | Empty (or placeholder) scripts; **T4 appends** later. |
| `.nvmrc` | Node version pin. |
| `.editorconfig` | Cross-editor baseline. |
| `.gitignore` (root) | Standard Node + Next + Docker ignore list. |
| `.env.example` | `PORT`, `MONGO_URL`, `MONGO_DB`, `NODE_ENV`, `JWT_SECRET`, `COOKIE_NAME`, `BACKEND_ORIGIN`. |
| `docs/contracts/phase-0.md` | Health shape, envelope shape, env vars, ports, two conventions, `fp` rule, mirroring rule. |
| `apps/backend/package.json` | `fastify`, `@fastify/autoload`, `fastify-plugin`, `zod`, `mongodb`, `vitest`, `tsx`, `typescript`. |
| `apps/backend/tsconfig.json` | ESM, `strict`, `noUncheckedIndexedAccess`, target ES2023, `moduleResolution: "nodenext"`. |
| `apps/backend/vitest.config.ts` | Vitest config. |
| `apps/frontend/package.json` | `next`, `react`, `react-dom`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `typescript`. |
| `apps/frontend/tsconfig.json` | Same TS rules; `moduleResolution: "bundler"`. |
| `apps/frontend/next.config.ts` | Rewrite `/api/:path*` → `${BACKEND_ORIGIN}/api/:path*`. No `NEXT_PUBLIC_API_URL`. |
| `apps/frontend/vitest.config.ts` | Vitest + jsdom config. |
| `apps/backend/src/contracts/errors/envelope.ts` | `ErrorEnvelope` type + `VALIDATION_FAILED` / `INTERNAL_ERROR` codes only. |
| `apps/backend/src/contracts/health.ts` | `healthResponse` zod schema + inferred TS type. |
| `apps/frontend/src/lib/api/types/health.ts` | Hand-written mirror of `contracts/health.ts`; header comment names the backend file. |

### Implementation notes

- **Pattern — one contract file per domain (A2).** Both files in `apps/backend/src/contracts/` and `apps/frontend/src/lib/api/types/` are co-owned by G0 because they are the contract for Phase 0 only. Later gates add new files inside those directories, never amend these.
- **Pattern — `fp` enforcement by comment + pattern-by-example (A3).** G0 does not write any plugin code, but the convention is written into `docs/contracts/phase-0.md` so that T2's `error-handler.ts` carries it forward by example.
- **Pattern — schema-in-backend / mirrored-type-in-frontend (per brief rule 1).** `lib/api/types/health.ts` is hand-written, with a header comment: `// mirrors apps/backend/src/contracts/health.ts — keep in sync by hand`.
- **Decision — same-origin proxy (A1).** `next.config.ts` rewrites `/api/:path*` to `${BACKEND_ORIGIN}/api/:path*`. Do not add `NEXT_PUBLIC_API_URL`, `@fastify/cors`, or `Access-Control-Allow-Credentials`.
- **Decision — dependency ownership (R5).** Both `package.json` files get the full Phase 0 + all wave-1 dependency lists now. Lanes do not run `npm install`. `JWT_SECRET` is declared in `.env.example` even though Phase 2 uses it, so the compose file never has to change.
- **Frozen envelope (R6).** `contracts/errors/envelope.ts` exports only the envelope shape and the two envelope-level codes. `docs/contracts/phase-0.md` says "no later gate amends this file."
- **Ports.** Default backend port for Phase 0 is 3001 (matches `BACKEND_ORIGIN=http://localhost:3001` in `.env.example` for host-process dev). Document this in `docs/contracts/phase-0.md`.

### Verification Checklist

| # | Check | Expected |
|---|---|---|
| V1 | `cd apps/backend && npm install && npm run typecheck` | exits 0 (a no-op typecheck over empty `src/` is acceptable per brief). |
| V2 | `cd apps/frontend && npm install && npm run typecheck` | exits 0. |
| V3 | `docs/contracts/phase-0.md` exists and contains all six sections: health endpoint, error envelope, env vars, the two conventions (one-file-per-domain + plugins-before-routes), the `fp` rule, and the mirroring rule. | grep hits for each section header. |
| V4 | `.env.example` declares `PORT`, `MONGO_URL`, `MONGO_DB`, `NODE_ENV`, `JWT_SECRET`, `COOKIE_NAME`, `BACKEND_ORIGIN`. | grep returns one line per variable; `JWT_SECRET` left blank. |
| V5 | `apps/backend/src/contracts/errors/envelope.ts` exports `ErrorEnvelope` and the two envelope-level codes; no other code identifiers live in it. | grep returns only `VALIDATION_FAILED` and `INTERNAL_ERROR` from the codes regex. _(regression-guard for R6, A2)_ |
| V6 | `apps/backend/src/contracts/health.ts` exports `healthResponse` zod schema and the inferred TS type. | import + runtime call to `.parse({...})` succeeds on the canonical payload. |
| V7 | `apps/frontend/src/lib/api/types/health.ts` mirrors `contracts/health.ts` by hand and has a header comment naming the backend file. | first lines of the file contain a comment with the backend file path. |
| V8 | `apps/frontend/next.config.ts` contains the rewrite `/api/:path*` → `${BACKEND_ORIGIN}/api/:path*`. | grep for the rewrite path matches. |
| V9 | No `NEXT_PUBLIC_API_URL`, no `@fastify/cors`, no `Access-Control-Allow-Credentials` anywhere in the repo. | grep returns no matches. _(regression-guard for R4, A1)_ |
| V10 | Backend `tsconfig.json` has `strict: true`, `noUncheckedIndexedAccess: true`, `module: "ESNext"`, `target: "ES2023"`, `moduleResolution: "nodenext"`. | grep the file. |
| V11 | Frontend `tsconfig.json` has `strict: true`, `noUncheckedIndexedAccess: true`, `moduleResolution: "bundler"`. | grep the file. |
| V12 | `package.json` files contain the exact dependency lists from the brief; nothing extra for wave 1. | grep backend deps (`fastify`, `@fastify/autoload`, `fastify-plugin`, `zod`, `mongodb`, `vitest`, `tsx`, `typescript`); grep frontend deps (`next`, `react`, `react-dom`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `typescript`). |

### Scope boundaries (Out of Scope for T1)

- All runtime code (`server.ts`, `app.ts`, `app/page.tsx`, `compose.yml`, etc.) — owned by T2/T3/T4.
- pino logger setup — T2.
- `version` field source — T2 chooses; T1 does not need to decide.
- The `apps/frontend/src/lib/api/client.ts` — T3.

### Dependencies

- **Blocks:** T2, T3, T4 (all read-only against G0's files).
- **Depends on:** nothing.

---

## Task T2 — Lane 0-A: Backend runtime

**Mode:** `test-after`
**Agent role:** backend-engineer
**Date:** 2026-08-12
**Depends on:** T1
**Parallel with:** T3, T4

### Description

A Fastify server that boots from validated config, answers `GET /health` with real Mongo connectivity, fails predictably on bad config, and shuts down cleanly. Sets the `fp`-wrapped pattern for every later plugin.

### Context (from ARCH)

- **API Contracts** — `GET /api/health` (R7) and the error envelope (R6).
- **Decisions** — A1 (same-origin), A3 (`fp` enforcement), A5 (schema-validate own response), A6 (one error handler), A7 (Mongo boot fatal, runtime non-fatal), A9 (pino defaults).
- **Areas of Impact** — M-risk areas include `fp` wrapping (R1) and autoload order (R2); both have explicit regression-guard scenarios.

### Files Expected (from Change Footprint → New files)

| Path | Purpose |
|---|---|
| `apps/backend/src/server.ts` | Listen, SIGTERM/SIGINT drain. |
| `apps/backend/src/app.ts` | Fastify instance builder; autoloads `src/api/plugins/` then `src/api/routes/`. **Never edited by later lanes.** Top comment about `fp`. |
| `apps/backend/src/config/index.ts` (+ zod schema) | Parse `process.env`; exit non-zero on invalid config. |
| `apps/backend/src/persistence/mongo.ts` | Mongo plugin: one `MongoClient`, decorates `app.mongo` / `app.db`, close on `onClose`. Boot failure fatal; runtime loss non-fatal. |
| `apps/backend/src/api/errors/envelope-mapper.ts` | Maps `ZodError` → `VALIDATION_FAILED`; other throwables → `INTERNAL_ERROR`. |
| `apps/backend/src/api/plugins/error-handler.ts` | Fastify error handler, `fp`-wrapped (sets the pattern for T4's immutability guard). |
| `apps/backend/src/api/routes/health.ts` | `GET /health` with zod-validated response schema. |
| `apps/backend/src/observability/index.ts` (+ pino config) | Logging setup; defaults + `genReqId` for request IDs. |
| `apps/backend/test/api/health.test.ts` | `app.inject()`: healthy + failing-ping scenarios. |

### Implementation notes

- **Pattern — `fp` enforcement by example (A3).** `plugins/error-handler.ts` is the first file written in `plugins/`; it MUST be wrapped in `fastify-plugin`. `app.ts` has a top comment: `// Every file in src/api/plugins/ must be wrapped in fastify-plugin (fp). Without it, hooks apply only to the plugin itself — a guard registered that way protects nothing.`
- **Pattern — autoload order (R2).** `app.ts` calls `app.register(autoload, { dir: 'src/api/plugins' })` then `app.register(autoload, { dir: 'src/api/routes' })`. Plugins load first because their hooks must apply to routes.
- **Decision — schema-validate own response (A5).** `routes/health.ts` uses `schema.response[200]` and `schema.response[503]` from `healthResponse`. A drift in `contracts/health.ts` causes the route to fail validation at request time.
- **Decision — one error handler (A6).** `plugins/error-handler.ts` is the **only** error handler registered. It catches `ZodError` via `envelope-mapper.ts` and emits `VALIDATION_FAILED` with `details[]` from issue paths. Anything else becomes `INTERNAL_ERROR` with a generic `message` and a logged `cause`.
- **Decision — Mongo lifecycle (R12, A7).** `persistence/mongo.ts` connects at boot; throws on failure (exits non-zero). Registers `onClose` that calls `MongoClient.close()`. Does not register its own reconnection logic — the driver does.
- **Decision — `version` field (open question in ARCH).** Read `apps/backend/package.json` at boot via `fs.readFile` + `JSON.parse`; fall back to `'unknown'` if the read fails. Avoids a build-pipeline coupling.
- **Observability (A9).** Use Fastify's pino defaults; provide a `genReqId` that produces a short ULID or UUID. No redact list yet (no secrets in Phase 0).
- **Reads-only against G0:** `apps/backend/src/contracts/errors/envelope.ts`, `apps/backend/src/contracts/health.ts`, `docs/contracts/phase-0.md`.

### Test Plan

**Test file:** `apps/backend/test/api/health.test.ts` (plus minimal setup in `apps/backend/test/setup.ts` if needed to import `buildApp`).

**Test blocks:**

- **`describe('GET /api/health — happy path')`**
  - **returns 200 + canonical shape when Mongo ping succeeds** — GIVEN a stubbed Mongo plugin whose `db.command({ ping: 1 })` resolves WHEN the route is hit via `app.inject({ method: 'GET', url: '/api/health' })` THEN the response is 200 with body `{ status: 'ok', db: 'up', version }` matching `healthResponse`. _(verifies R7, A5)_
- **`describe('GET /api/health — degraded path')`**
  - **returns 503 + degraded shape when Mongo ping throws** — GIVEN a stubbed Mongo plugin whose `db.command({ ping: 1 })` rejects WHEN the route is hit THEN the response is 503 with body `{ status: 'degraded', db: 'down', version }` matching the schema. _(verifies R7)_
- **`describe('error envelope')`**
  - **`ZodError` becomes VALIDATION_FAILED with details[]** — GIVEN a stubbed route that throws a `ZodError` with multiple issue paths WHEN the route is hit THEN the response carries `{ error: { code: 'VALIDATION_FAILED', message, details: [{ path, code, message }, ...] } }` with `details` reflecting every issue path. _(verifies R6)_
  - **unmapped throwable becomes INTERNAL_ERROR with logged cause** — GIVEN a stubbed route that throws `new Error('database password leaked')` WHEN the route is hit THEN the response carries `{ error: { code: 'INTERNAL_ERROR', message: <generic> } }` and the cause is logged (assert log capture); the response message MUST NOT contain the leaked substring. _(regression-guard for A6 — single handler; verifies message does not leak the underlying error string.)_
- **`describe('autoload order')`**
  - **`app.ts` loads plugins before routes** — GIVEN the built `app` instance after `app.ready()` WHEN we assert via Fastify introspection (`app.printPlugins()` output, or by checking that the error handler's hook fires on a route registered after it) THEN plugins are observed before routes. _(regression-guard for R2 — if this ever fails, T4's immutability guard will not reach routes.)_
- **`describe('config validation')`**
  - **invalid env exits non-zero at boot** — GIVEN a stripped env without `PORT` WHEN `buildApp()` is called and `app.ready()` is awaited THEN it rejects (or the process exits). _(regression-guard for "invalid config is not a request-time failure")_
- **`describe('logging')`**
  - **request id appears in every log line** — GIVEN any handled request WHEN the response is emitted THEN the captured pino logs contain the same `reqId` value in every line for that request. _(regression-guard for A9)_

**Backward-regression guards:** _None — greenfield. (Skipped per ARCH note.)_

### Scope boundaries (Out of Scope for T2)

- Pricing engine — Phase 1.
- Domain routes other than `/health` — later lanes.
- Auth — Phase 2.
- Mongo collection accessors / repositories — later phases (T2 only decorates `app.mongo` / `app.db`).
- OpenAPI spec — Phase 6 at the earliest, only if it falls out of zod for free.
- A separate `infra/` directory at the backend level — T4 owns `infra/.dockerignore` only.

### Dependencies

- **Depends on:** T1 (must read `contracts/errors/envelope.ts`, `contracts/health.ts`, `docs/contracts/phase-0.md`).
- **Parallel with:** T3, T4.
- **Blocks:** T4's `apps/backend/Dockerfile` build step (must wait for `app.ts` to compile); J0 (the join).

---

## Task T3 — Lane 0-B: Frontend shell

**Mode:** `test-after`
**Agent role:** frontend-engineer
**Date:** 2026-08-12
**Depends on:** T1
**Parallel with:** T2, T4

### Description

An App Router application carrying the mockups' visual system, with a typed `fetch` client, that proves on screen that the backend and database are alive.

### Context (from ARCH)

- **API Contracts** — the frontend API client (`apiFetch`).
- **Decisions** — A1 (same-origin), A10 (`credentials: 'include'` from day 1), A11 (data-testid convention in docs).
- **Areas of Impact** — L-risk areas include `credentials: 'include'` (R9) and the `data-testid` convention (R10); both have explicit regression-guard scenarios.

### Files Expected (from Change Footprint → New files)

| Path | Purpose |
|---|---|
| `apps/frontend/src/app/layout.tsx` | Root layout. Loads Marcellus / Noto Sans / Roboto via `next/font` (no CDN `<link>`). |
| `apps/frontend/src/app/page.tsx` | Home page: calls `GET /api/health` through `client.ts` and renders backend+db state, including the failure state. |
| `apps/frontend/src/app/globals.css` | Minimal global resets; imports `tokens.css`. |
| `apps/frontend/src/styles/tokens.css` | Warm palette, three font stacks, tabular-numeral rule for `.num`/`.amount`. Ported from `design/htmls/styles.css`. |
| `apps/frontend/src/components/shell/Topbar.tsx` (+ `Brand.tsx`, `NavSlot.tsx`, `UserSlot.tsx`) | Shell components from `design/htmls/documents.html`. Slots are empty (auth lands in Phase 2). |
| `apps/frontend/src/components/shell/nav-items.ts` | Exports `NAV_ITEMS` array; later phases append, no shell editing. |
| `apps/frontend/src/lib/api/client.ts` | `apiFetch<T>(path, init?)`; relative `/api/...`; `credentials: 'include'` unconditional; throws typed `ApiError` on non-2xx. |
| `apps/frontend/src/lib/api/client.test.ts` | Non-2xx → `ApiError` with envelope `code` + `details`; 2xx → parsed JSON; `credentials: 'include'` static check. |
| `apps/frontend/src/test-setup.ts` | Vitest setup required by the existing frontend configuration. |

### Implementation notes

- **Decision — same-origin (A1).** `client.ts` uses `fetch(path, { credentials: 'include', ... })` with **relative** URLs only. No `process.env.NEXT_PUBLIC_API_URL`. The Next rewrite in `next.config.ts` resolves the path server-side.
- **Decision — `credentials: 'include'` unconditional (A10).** The client hardcodes `credentials: 'include'` in its `fetch` init object. A static test asserts it is set so a future "simplification" cannot silently remove it. _(regression-guard for R9.)_
- **Pattern — `data-testid` convention (A11).** Components used by `e2e/health.cy.ts` carry `data-testid` attributes. The convention is not enforced as lint in Phase 0; T4 documents it in `e2e/README.md`.
- **Decision — `ApiError` shape.** `client.ts` exports an `ApiError` class with `{ code, message, details }` — exactly the envelope's fields — so `e2e/health.cy.ts` and later UI code can assert on it without parsing strings.
- **Pattern — no arithmetic (from brief).** No calculation of any price, total, or amount anywhere in `app/`, `components/`, or `lib/`. The page only renders the strings returned by `/health`.
- **Reads-only against G0:** `apps/frontend/src/lib/api/types/health.ts`, `design/htmls/styles.css`, `design/htmls/documents.html`.
- **Visual port from design.** Tokens are CSS custom properties (no Tailwind, no CSS-in-JS). Components are functional and small — no state management, no client interactivity beyond the initial fetch.

### Test Plan

**Test file:** `apps/frontend/src/lib/api/client.test.ts`.

**Test blocks:**

- **`describe('apiFetch — success path')`**
  - **resolves with parsed JSON on 2xx** — GIVEN a stubbed `fetch` returning `new Response(JSON.stringify({ status: 'ok' }), { status: 200 })` WHEN `apiFetch<HealthResponse>('/api/health')` is awaited THEN the resolved value is the parsed object. _(verifies the happy path contract.)_
- **`describe('apiFetch — error envelope')`**
  - **non-2xx throws ApiError with envelope's code and details** — GIVEN a stubbed `fetch` returning 400 with the canonical validation envelope (`{ error: { code: 'VALIDATION_FAILED', message: '...', details: [{ path: 'qty', code: 'too_small', message: '...' }] } }`) WHEN the call is awaited THEN it rejects with an `ApiError` whose `.code === 'VALIDATION_FAILED'`, `.message` matches, and `.details` deep-equals the array. _(verifies R6 — envelope round-trips.)_
  - **non-2xx without envelope falls back to INTERNAL_ERROR** — GIVEN a stubbed `fetch` returning 500 with `text/plain` body WHEN the call is awaited THEN the rejection is an `ApiError` with `.code === 'INTERNAL_ERROR'`. _(defensive; not a regression-guard per se.)_
- **`describe('apiFetch — credentials')`**
  - **`credentials: 'include'` is always set** — GIVEN a stubbed `fetch` WHEN any `apiFetch` call is made THEN the captured `init.credentials` is `'include'`. _(regression-guard for R9 / A10 — silent-breakage protection for Phase 2.)_
- **`describe('apiFetch — URL handling')`**
  - **relative paths pass through unchanged** — GIVEN a relative path like `/api/health` WHEN the call is made THEN the captured URL is exactly `/api/health` (no `localhost:3001` prefix, no `NEXT_PUBLIC_*` env var). _(regression-guard for A1.)_

**Component tests:** None. The brief explicitly excludes component tests for the skeleton.

**E2E coverage:** The visible shell (loading state, healthy state, degraded state) is asserted by `e2e/health.cy.ts` (T4), not by component tests.

### Verification Checklist (for non-test observations)

| # | Check | Expected |
|---|---|---|
| V1 | `cd apps/frontend && npm run typecheck` | exits 0. |
| V2 | `cd apps/frontend && npm run build` | exits 0; `.next/standalone/` produced. _(regression-guard for T4's Dockerfile.)_ |
| V3 | `tokens.css` contains all seven warm-palette variables (`--ink`, `--bg`, `--cream`, `--accent`, `--sand`, `--line`, `--danger`), the three font stacks, and the tabular-numeral rule for `.num`/`.amount`. | grep returns each variable and rule. |
| V4 | Layout uses Marcellus / Noto Sans / Roboto via `next/font`; no bare CDN `<link>` to a font host. | grep for `next/font` matches; grep for `fonts.googleapis.com` / `fonts.gstatic.com` returns nothing. |
| V5 | `components/shell/nav-items.ts` exports `NAV_ITEMS` as an array. | import + `Array.isArray(NAV_ITEMS)` is true. |
| V6 | `client.ts` does not contain `localhost:3001`, `process.env.NEXT_PUBLIC_*`, or any absolute backend URL. | grep returns nothing. |
| V7 | No arithmetic operators (`+`, `-`, `*`, `/`) appear in any `*.tsx` / `*.ts` under `app/`, `components/`, `lib/`. | grep regex returns nothing. _(regression-guard for "client is not the source of truth")_ |

### Scope boundaries (Out of Scope for T3)

- Page content beyond `/health` — later phases (1-B, 3-A, 4-A, etc.).
- Auth-aware shell slots (user avatar, login state) — Phase 2.
- Documents list / editor / report screens — Phases 3, 5.
- Component tests for the shell — excluded by brief.
- Storybook, Chromatic, visual regression tooling — out of scope for Phase 0.

### Dependencies

- **Depends on:** T1 (`lib/api/types/health.ts`, `next.config.ts`, `tokens.css` must exist for the page to render; the page can mock `/api/health` if T2 is not yet running).
- **Parallel with:** T2, T4.
- **Blocks:** J0 (the join).

---

## Task T4 — Lane 0-C: Infra and E2E harness

**Mode:** `checklist`
**Agent role:** infra-engineer
**Date:** 2026-08-12
**Depends on:** T1
**Parallel with:** T2, T3
**Status:** Implemented and verified (T4 terminal checks passed; J0 pending T2/T3).

### Description

`docker compose up` on a clean clone produces a working stack, and Cypress can drive it. Two compose files (not one with overrides), two Dockerfiles, a Makefile, and a Cypress harness with one test.

### Context (from ARCH)

- **Decisions** — A8 (two compose files, not overrides), A11 (data-testid convention in `e2e/README.md`).
- **Areas of Impact** — M-risk areas include Mongo host-port hygiene (R11) and `BACKEND_ORIGIN` (L but J0-critical).

### Files Expected (from Change Footprint → New files + 1 modified)

| Path | Purpose | Footprint row |
|---|---|---|
| `compose.yml` (root) | Reviewer's stack: `mongo`, `backend`, `frontend`. Mongo unpublished. Named volume. | New |
| `compose.dev.yml` (root) | Dev stack: `mongo` on `127.0.0.1:27017`, own named volume. | New |
| `infra/.dockerignore` | Shared build-ignore for the apps' Dockerfiles. | New |
| `apps/backend/.dockerignore` | Exclude `node_modules`, `test`, `coverage`, `.env`. | New |
| `apps/frontend/.dockerignore` | Exclude `node_modules`, `.next/cache`, `test`, `coverage`, `.env`. | New |
| `apps/backend/Dockerfile` | Multi-stage: build (devDeps) → runtime (`node:22-alpine`, non-root, `NODE_ENV=production`). | New |
| `apps/frontend/Dockerfile` | Multi-stage; uses Next's standalone output. | New |
| `e2e/cypress.config.ts` | `baseUrl: http://localhost:3000`, TypeScript support. | New |
| `e2e/support/**` (e.g. `e2e.ts`, `commands.ts`) | Cypress support files. | New |
| `e2e/health.cy.ts` | Page loads + reports healthy backend and database. Fails until T2 + T3 land; J0 turns it green. | New |
| `e2e/README.md` | Documents the `data-testid` selector convention (A11 / R10). | New |
| `Makefile` | 10 targets: `up`, `down`, `logs`, `reset`, `dev-db`, `dev-api`, `dev-web`, `db-shell`, `test`, `e2e`. | New |
| `package.json` (root) **— append only** | T1 created the file (empty or placeholder). T4 appends scripts: `make` aliases and `cypress verify`. | Modified (append) |

### Implementation notes

- **Decision — two compose files (A8 / R11).** `compose.yml` (reviewer's path) does **not** publish Mongo's host port — only the backend reaches it over the compose network. `compose.dev.yml` publishes Mongo on `127.0.0.1:27017` for host-process development. The files are siblings, not override relationships.
- **Decision — Dockerfile layering.** Multi-stage. Build stage uses full `package.json` and dev deps; runtime stage on `node:22-alpine` with `NODE_ENV=production`, non-root user. Frontend uses Next standalone output (`output: 'standalone'` was set in T1's `next.config.ts`; the Dockerfile `COPY --from=builder /app/apps/frontend/.next/standalone .`).
- **Decision — healthchecks.** `compose.yml`'s `mongo` service declares a healthcheck; `backend` declares `depends_on: { mongo: { condition: service_healthy } }`.
- **Decision — `BACKEND_ORIGIN` for the in-container frontend.** Inside the reviewer's `compose.yml`, the frontend's `BACKEND_ORIGIN` points at `http://backend:3001` (compose-network DNS). In `compose.dev.yml`, the **frontend is not containerized** — host-process dev uses `BACKEND_ORIGIN=http://localhost:3001` from `.env`.
- **Decision — Makefile targets.** `up` / `down` / `logs` for the reviewer's stack (`compose.yml`); `reset` = `down` + named volume drop; `dev-db` = `compose.dev.yml` Mongo only; `dev-api` = `cd apps/backend && npm run dev` (or `tsx watch`); `dev-web` = `cd apps/frontend && npm run dev`; `db-shell` = `mongosh` inside the running container; `test` = per-app vitest; `e2e` = `cypress run` against a running stack.
- **Decision — Cypress selector convention (A11).** T4 writes `e2e/README.md` stating the rule: "UI lanes tag interactive and stateful elements with `data-testid`; Cypress tests select on `[data-testid="..."]`." No lint enforcement in Phase 0.
- **Decision — root `package.json` (R5).** T4 **only appends** scripts. T1 created the file; no other writes. The append is one short block: `make` aliases (`make up`, `make test`, etc.) and `cypress verify` for the harness.
- **Hot reload.** Hot reload runs on the **host** (`tsx watch`, `next dev`), not inside the container. Containers exist for demonstration, not editing.
- **Cross-lane coordination.** The `data-testid` attribute names T4 uses in `e2e/health.cy.ts` must match the ones T3 attaches to the relevant DOM nodes in `app/page.tsx`. T3's choice of names is part of T3's deliverable; T4 may either (a) propose names in `specs/lanes/0-C.md` and ask T3 to use them, or (b) read T3's page once it's in place and align. Pick (a) for parallel-friendliness; default names are suggested in the table below.

**Suggested `data-testid` names** (T3 uses these in `app/page.tsx`; T4 selects on them in `e2e/health.cy.ts`):

| Element | `data-testid` |
|---|---|
| Backend status badge | `health-backend-status` |
| Database status badge | `health-db-status` |
| App version string | `health-version` |
| Failure-state retry button | `health-retry` |

### Verification Checklist

| # | Check | Expected |
|---|---|---|
| V1 | `docker compose config` in repo root validates (no `-f` flag — that is the point). | exits 0. |
| V2 | `docker compose -f compose.dev.yml config` validates. | exits 0. |
| V3 | `compose.yml` does **not** publish Mongo's host port. Mongo is reachable only by the `backend` service. | `docker compose config --format json \| jq '.services.mongo.ports'` is `null` or absent. _(regression-guard for R11, A8)_ |
| V4 | `compose.yml`'s `backend` service has `depends_on.mongo.condition: service_healthy`, and `mongo` has a `healthcheck` block. | grep + parse the rendered config. |
| V5 | `compose.dev.yml` publishes Mongo on `127.0.0.1:27017` with its own named volume (different from `compose.yml`'s volume). | grep the file; volume names differ. |
| V6 | `make dev-db` brings up Mongo; `mongosh mongodb://127.0.0.1:27017` from the host shell connects. | manual smoke check. |
| V7 | `npx cypress verify` exits 0. | exits 0. |
| V8 | `Makefile` exposes all 10 targets: `up`, `down`, `logs`, `reset`, `dev-db`, `dev-api`, `dev-web`, `db-shell`, `test`, `e2e`. | grep returns each target name as a `^<name>:` line. |
| V9 | `cypress.config.ts` declares `baseUrl: http://localhost:3000` and TypeScript support (`specPattern` matching `e2e/**/*.cy.ts`). | grep the file. |
| V10 | `e2e/README.md` documents the `data-testid` selector convention in a short, scannable section. | grep for the term. _(regression-guard for R10, A11)_ |
| V11 | `e2e/health.cy.ts` exists; visits `/` and asserts `data-testid="health-backend-status"` shows healthy and `data-testid="health-db-status"` shows up; the test names align with T3's choice. | the file exists; the test names are sensible; `data-testid` attrs match T3's. _(regression-guard for the cross-lane seam.)_ |
| V12 | `apps/backend/Dockerfile` is multi-stage, base runtime image `node:22-alpine`, has a `USER` directive for a non-root user, sets `NODE_ENV=production`. | grep the file for `FROM node:22-alpine`, `USER`, `NODE_ENV=production`, two `FROM` stages. |
| V13 | `apps/frontend/Dockerfile` uses Next's standalone output: `COPY --from=builder ... .next/standalone ...`. | grep the file. |
| V14 | `.dockerignore` files (in `apps/backend/`, `apps/frontend/`, `infra/`) all exclude `node_modules`, test/coverage directories, `.env`. | grep each file. |
| V15 | Root `package.json` was modified **only by T1 + T4's appended scripts** (no other writes). | `git log --diff-filter=M -p package.json \| grep '^+'` shows only the scripts block from T4's contribution. |

### Scope boundaries (Out of Scope for T4)

- Application source under `apps/*/src/` — T2/T3 own those; T4 must not edit them.
- CI pipeline (GitHub Actions, etc.) — not a Phase 0 deliverable.
- Deployment manifests (Kubernetes, Terraform) — deployment is already handled per the README.
- Production observability (metrics, traces, log shipping) — Phase 2 or later.
- Mongo replica set — single `mongod` per brief.
- Production HTTPS / certs — out of scope.
- Storybook / visual regression tooling — out of scope.

### Dependencies

- **Depends on:** T1 (root `package.json`, `next.config.ts`, `apps/backend/Dockerfile` build context depend on T1's configs being in place). Reads-only against T2/T3's files; the `data-testid` names in `e2e/health.cy.ts` coordinate with T3.
- **Parallel with:** T2, T3.
- **Blocks:** J0 (the join).

---

## Join J0 — verification point, not a task

After T2, T3, T4 all turn green in their respective terminals, run the join from any terminal:

1. `make up` → backend and frontend healthy; Mongo reachable only from the backend.
2. `npx cypress run --spec e2e/health.cy.ts` exits 0.
3. Fix any seam issues (most likely `BACKEND_ORIGIN` between browser and container network, or a `data-testid` mismatch between T3's component and T4's test).
4. Commit `chore(J0): join phase 0`.

**Demo:** `docker compose up` on a clean clone → browser shows the app talking to Mongo.

---

## Suggested implementation order

1. **Terminal 1** — T1 (G0 gate). Wait for V1 + V2 + V5 + V9 to pass; commit.
2. **Terminal 2, 3, 4** (in parallel) — T2, T3, T4. They may start as soon as T1 lands.
3. **Any terminal** — J0 once T2/T3/T4 all turn green.