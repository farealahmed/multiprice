# Phase 0 — Skeleton (lane briefs)

Plan context: `docs/implementation-phases.md` § Phase 0. Rules: `docs/parallel-execution.md`.
Serves no evaluation row directly; makes every later phase demonstrable.

```
G0 ──► ┌─ 0-A backend runtime ─┐
       ├─ 0-B frontend shell ──┤ ──► J0
       └─ 0-C infra & E2E ─────┘
```

`G1` (Phase 1's contract) runs alongside 0-A/0-B/0-C in wave 1 — it needs G0's conventions, nothing else. `1-A`, the pricing engine, follows in wave 2 and still overtakes the rest of Phase 1.

---

## Gate G0 — Conventions and the health contract

**Agent** backend-engineer · **Depends on** nothing · **Blocks** every lane in the repo

**Mission** Freeze every decision that two agents could otherwise answer differently, and write the trivial health contract that establishes the schema-in-backend / mirrored-type-in-frontend pattern.

**Owns**
- `package.json`, `.nvmrc`, `.editorconfig`, `.gitignore` (root)
- `apps/backend/package.json`, `apps/backend/tsconfig.json`, `apps/backend/vitest.config.ts`
- `apps/frontend/package.json`, `apps/frontend/tsconfig.json`, `apps/frontend/next.config.ts`, `apps/frontend/vitest.config.ts`
- `apps/backend/src/contracts/errors/envelope.ts`, `apps/backend/src/contracts/health.ts`
- `apps/frontend/src/lib/api/types/health.ts`
- `docs/contracts/phase-0.md` · `.env.example`

**Build**
1. Scaffold both `package.json` files with the stack from `docs/parallel-execution.md` § Stack conventions, and install dependencies so lanes are not each running `npm install` on top of one another. Backend: `fastify`, `@fastify/autoload`, `fastify-plugin`, `zod`, `mongodb`, `vitest`, `tsx`, `typescript`. Frontend: `next`, `react`, `react-dom`, `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `typescript`.

   **Dependency ownership, stated once:** a phase's *gate* adds that phase's dependencies to the relevant `package.json` — G2 adds `argon2`, `@fastify/cookie`, `@fastify/jwt`; a later gate adds whatever its phase needs. Lanes never install. Where two gates share a wave (`G4`/`G5`), neither may add dependencies; if one needs to, it moves to its own wave.
2. TypeScript config for both: ESM, `strict`, `noUncheckedIndexedAccess`, target ES2023, `moduleResolution: "bundler"` (frontend) / `"nodenext"` (backend).
3. Freeze the error envelope in `apps/backend/src/contracts/errors/envelope.ts`:
   ```ts
   export type ErrorEnvelope = {
     error: { code: string; message: string; details?: Array<{ path: string; code: string; message: string }> }
   }
   ```
   `details` carries per-field validation failures — Phase 3 depends on the field path being there from the start.
4. Freeze the env schema shape in `.env.example`: `PORT`, `MONGO_URL`, `MONGO_DB`, `NODE_ENV`, `JWT_SECRET`, `COOKIE_NAME`, `BACKEND_ORIGIN`. Phase 2's variables are declared now so `compose.yml` never has to change for them.

   **The browser never talks to the backend cross-origin.** `next.config.ts` (yours) rewrites `/api/:path*` to `${BACKEND_ORIGIN}/api/:path*`, and the frontend client calls **relative `/api/...` URLs only**. There is no `NEXT_PUBLIC_API_URL` and no CORS configuration anywhere in this project.

   This is worth being deliberate about, because the alternative fails twice. `localhost:3000` → `localhost:3001` is cross-origin, so `credentials: 'include'` needs `@fastify/cors` with an explicit origin and `Access-Control-Allow-Credentials` — that is the J0 failure. And in production, a frontend and backend on different domains are cross-*site*, where a `SameSite=Lax` session cookie is simply not sent — that is the J2 failure, on the deployed URL only, after it passed locally. A same-origin proxy removes both, and costs three lines.
5. **Two conventions that keep later gates from colliding.** Write both into `docs/contracts/phase-0.md`:

   - **One contract file per domain, never a shared append-target.** Each gate owns `apps/backend/src/contracts/<domain>.ts` and `apps/frontend/src/lib/api/types/<domain>.ts`, and **exports that domain's error codes from its own contract file**. There is no growing `codes.ts` and no growing `types.ts` — two gates running in the same wave would otherwise be appending to the same two files. `contracts/errors/envelope.ts` holds only the envelope and its two envelope-level codes (`VALIDATION_FAILED`, `INTERNAL_ERROR`), and no later gate touches it.
   - **Two autoloaded directories, plugins before routes.** `src/api/plugins/` loads first, then `src/api/routes/`. A lane creates a file in either and it is live — nothing else would work, since `app.ts` belongs to Lane 0-A and every later lane (1-B, 2-A, 3-A, 4-A, 5-A, 4-D) must add plugins or routes without editing it.

     **Every file in `src/api/plugins/` must be wrapped in `fastify-plugin` (`fp`).** Without it, Fastify encapsulates the plugin and its hooks apply only to itself — a guard registered that way would silently protect nothing. This is exactly how Phase 4's immutability guard reaches Phase 3's routes, and how Phase 2's index bootstrap runs at boot. Write the `fp` requirement into `docs/contracts/phase-0.md`; a lane that misses it gets a guard that passes its own tests and protects no real route.

6. Health contract — `apps/backend/src/contracts/health.ts`: `{ status: 'ok' | 'degraded', db: 'up' | 'down', version: string }`, as a zod schema plus its inferred type.
7. Mirror it by hand in `apps/frontend/src/lib/api/types/health.ts`. Hand-written duplication is the deliberate choice here (plan, rule 1) — add a header comment saying so, naming the backend file it mirrors.
8. Write `docs/contracts/phase-0.md`: the health endpoint, the error envelope, the env vars, the ports, the two conventions from step 5, and one paragraph on the mirroring rule.

**Done when** `npm run typecheck` passes in both apps (a no-op typecheck over an empty `src` is acceptable) and `docs/contracts/phase-0.md` exists.

**Guardrails** No runtime code beyond types and config. Do not create `server.ts`, pages, or Dockerfiles — those belong to lanes A, B, C. Every dependency any wave-1 lane needs must be installed here, or three agents will race on `node_modules`.

---

## Lane 0-A — Backend runtime

**Agent** backend-engineer · **Depends on** G0 · **Parallel with** 0-B, 0-C, 1-A

**Mission** A Fastify server that boots from validated config, answers `GET /health` with real Mongo connectivity, fails predictably, and shuts down cleanly.

**Owns** `apps/backend/src/server.ts`, `apps/backend/src/app.ts`, `apps/backend/src/config/**`, `apps/backend/src/api/plugins/error-handler.ts`, `apps/backend/src/api/errors/envelope-mapper.ts`, `apps/backend/src/api/routes/health.ts`, `apps/backend/src/persistence/mongo.ts`, `apps/backend/src/observability/**`, `apps/backend/test/api/health.test.ts`

**Reads, never edits** `apps/backend/src/contracts/health.ts`, `apps/backend/src/contracts/errors/envelope.ts`, `docs/contracts/phase-0.md`

**Build**
1. `config/` — parse `process.env` through zod at boot. Invalid config exits non-zero with a readable message; it never surfaces as a request-time failure.
2. `persistence/mongo.ts` — a Fastify plugin owning one `MongoClient`, decorating `app.mongo` / `app.db`, closing on shutdown. Connection failure at boot is fatal; connection loss at runtime is not.
3. `api/errors/` — one error handler mapping thrown errors to the frozen envelope. A zod failure becomes `VALIDATION_FAILED` with `details[]` populated from the issue paths. An unmapped error becomes `INTERNAL_ERROR` with a generic message and a logged cause. **Every later phase's error handling is this handler** — nothing after Phase 0 should add a second one.
4. `api/routes/health.ts` — pings the database (`db.command({ ping: 1 })`), returns `status: 'ok'` + `db: 'up'`, or `503` with `status: 'degraded'` + `db: 'down'`. Response validated against the contract schema so a drift breaks here rather than in the browser.
5. **`app.ts` autoloads `src/api/plugins/` and then `src/api/routes/`** with `@fastify/autoload`, per G0's convention — every later lane drops a plugin or route file into those directories and it registers itself, because none of them may edit this file. Plugins load first and are `fp`-wrapped, so their hooks apply app-wide rather than to themselves. You own only `plugins/error-handler.ts`; the directory itself is shared with later lanes. Get this right; it is the single thing in Phase 0 that every subsequent backend lane depends on. `app.ts` builds and returns the Fastify instance without listening (tests need this); `server.ts` listens and handles `SIGTERM`/`SIGINT` with in-flight request draining.
6. Structured JSON logging with a request id. No secrets in log output.
7. `test/api/health.test.ts` — via `app.inject()`: healthy path returns 200 with the contract shape; a stubbed failing ping returns 503 and `db: 'down'`.

**Done when** `cd apps/backend && npm test && npm run typecheck` exits zero.

**Guardrails** No business logic, no auth, no document routes. Do not create `src/pricing/**` — 1-A is inside it right now. Do not write `compose.yml` or the Dockerfile.

---

## Lane 0-B — Frontend shell

**Agent** frontend-engineer · **Depends on** G0 · **Parallel with** 0-A, 0-C, 1-A

**Mission** An App Router application carrying the mockups' visual system, with a typed API client, that proves on screen that the backend and database are alive.

**Owns** `apps/frontend/src/app/layout.tsx`, `apps/frontend/src/app/page.tsx`, `apps/frontend/src/app/globals.css`, `apps/frontend/src/styles/**`, `apps/frontend/src/components/shell/**`, `apps/frontend/src/lib/api/client.ts`, `apps/frontend/src/lib/api/*.test.ts`

**Reads, never edits** `apps/frontend/src/lib/api/types/health.ts` (gate-owned), `design/htmls/styles.css`, `design/htmls/documents.html`

**Build**
1. App Router skeleton: root layout, `globals.css`, font setup. The mockups use Marcellus (display), Noto Sans (UI), Roboto (numerals) — self-host or use `next/font`; do not leave a bare CDN link in the layout.
2. Port the design tokens out of `design/htmls/styles.css` into `src/styles/tokens.css` — the warm palette (`--ink`, `--bg`, `--cream`, `--accent`, `--sand`, `--line`, `--danger`), the three font stacks, and the tabular-numeral rule for `.num`/`.amount`. Later lanes consume these variables; they will not go back to the mockups for colors.
3. Shell components from `design/htmls/documents.html`: topbar with brand mark, nav slot, user slot. Drive the nav from an exported `NAV_ITEMS` array in `components/shell/nav-items.ts` — later phases add screens, and the **join** of the phase that adds one appends its entry, since no page lane may edit the shell. Auth-aware behavior is Phase 2's — leave the slots empty, not fake.
4. `lib/api/client.ts` — a typed `fetch` wrapper: **relative `/api/...` URLs only**, resolved by G0's Next rewrite, so every request is same-origin and no CORS or cross-site cookie problem exists. `credentials: 'include'` (Phase 2's cookie needs it and retrofitting is how sessions silently break), JSON in/out, and a parsed `ErrorEnvelope` on non-2xx thrown as a typed `ApiError` carrying `code`, `message`, `details`. **Every later lane calls the API through this file.**
5. A page calling `GET /health` through the client and rendering the backend and database state — including the failure state, which is the one worth seeing.
6. One test for `client.ts`: a non-2xx response produces an `ApiError` with the envelope's `code` and `details` intact.

**Done when** `cd apps/frontend && npm test && npm run build` exits zero.

**Guardrails** No page that Phase 2+ owns (documents, editor, report). No arithmetic anywhere — the PDF forbids the client being the source of truth, and the habit starts here. Do not edit `types.ts`.

---

## Lane 0-C — Infra and E2E harness

**Agent** infra-engineer · **Depends on** G0 · **Parallel with** 0-A, 0-B, 1-A

**Mission** `docker compose up` on a clean clone produces a working stack, and Cypress can drive it.

**Owns** `compose.yml` (repo root), `compose.dev.yml` (repo root), `infra/.dockerignore`, `apps/backend/Dockerfile`, `apps/frontend/Dockerfile`, `apps/*/.dockerignore`, `e2e/**` (cypress config, support, `e2e/health.cy.ts`), `Makefile`, root `package.json` scripts *(coordinate: G0 created that file — append scripts only, and stage nothing else)*

**Build**
1. Multi-stage Dockerfiles for both apps: build stage with dev dependencies, runtime stage on `node:22-alpine` with production dependencies only, non-root user, `NODE_ENV=production`. Frontend uses Next's standalone output.
2. `compose.yml` — **at the repository root, not in `infra/`**. Docker Compose discovers `compose.yml` from the working directory; a file in `infra/` makes the bare `docker compose up` in the README fail, and that command is a graded deliverable. `infra/` keeps the Dockerfiles' shared assets. This is the **reviewer's stack**: `mongo`, `backend`, `frontend`, all containerized, production images. An ordinary `mongo:7` container: lines are embedded, so writes stay inside one document and a replica set buys nothing here. **Mongo publishes no host port**; only the backend reaches it over the compose network. Named volume for data. Backend depends on Mongo being healthy, not merely started.
3. `compose.dev.yml` — also at the root, the **development stack**: Mongo alone, published on `127.0.0.1:27017`, on its own named volume so resetting dev data never touches the demo stack's. This is what a human runs while working, with the backend and frontend as hot-reloading host processes against it. The two compose files are separate rather than one file with overrides — the reviewer's path must stay a single unqualified `docker compose up`, and an override that leaks a database port into it would be a real mistake.
4. Env wiring from `.env.example`, with development defaults inline in both compose files so a clean clone runs without hand-editing anything.
5. Cypress at the repo root: config with `baseUrl: http://localhost:3000`, TypeScript support file, and a `data-testid` selector convention documented in `e2e/README.md` for the UI lanes to follow.
6. `e2e/health.cy.ts` — the page loads and reports a healthy backend and database. It will fail until 0-A and 0-B land; that is expected, and J0 is where it goes green.
7. `Makefile` targets, one per thing a human actually does:

   | Target | Does |
   |---|---|
   | `up` / `down` / `logs` | the full containerized stack |
   | `reset` | `down` + drop the volume — a clean database |
   | `dev-db` | Mongo only, published to localhost, for host-process development |
   | `dev-api` | backend in watch mode against `dev-db` |
   | `dev-web` | frontend in dev mode against the host backend |
   | `db-shell` | `mongosh` inside the running Mongo container |
   | `test` / `e2e` | suites, and Cypress against a running stack |

8. Hot reload for the host processes: `tsx watch` on the backend, `next dev` on the frontend. Do not attempt bind-mounted hot reload inside the containers — it is fiddly on macOS, and the container path exists for demonstration, not for editing.

**Done when** a bare `docker compose config` in the repository root validates (no `-f` flag — that is the point), both images build, `make dev-db` gives a Mongo reachable at `localhost:27017`, and `npx cypress verify` passes.

**Guardrails** Do not write application source. If a container needs an app-side change (an exposed port, a build script), request it via `specs/lanes/0-C.md` rather than editing `src/`. No CI pipeline, no deployment manifests — deployment is already handled.

---

## Join J0

1. Confirm `specs/lanes/0-A.md`, `0-B.md`, `0-C.md` exist.
2. `make up` → both apps healthy, Mongo reachable only from the backend.
3. `npx cypress run --spec e2e/health.cy.ts` green.
4. Fix seams — usually the client base URL between browser and container network.
5. Commit `chore(J0): join phase 0`.

**Demo** `docker compose up` on a clean clone → browser shows the app talking to Mongo.
