# Phase 0 — Frozen Contracts

This document freezes the cross-cutting decisions every later phase depends on.
Nothing here is amendable by later gates; PR review enforces it.

## 1. Health endpoint

`GET /api/health` — public, no auth.

**Response (200):**

```json
{ "status": "ok", "db": "up", "version": "<string>" }
```

**Response (503)** when Mongo ping fails:

```json
{ "status": "degraded", "db": "down", "version": "<string>" }
```

The route validates its own response against `apps/backend/src/contracts/health.ts`
on every request. A drift in the contract breaks the route, not the browser.

`version` is opaque to clients; the source (env var, `package.json`) is chosen
by Lane 0-A.

## 2. Error envelope

Every non-2xx response across the API carries this shape:

```ts
type ErrorEnvelope = {
  error: {
    code: string;
    message: string;
    details?: Array<{ path: string; code: string; message: string }>;
  };
};
```

`details[]` carries per-field validation failures — Phase 3 depends on the field
path being there from the start.

**Envelope-level codes** — live in `apps/backend/src/contracts/errors/envelope.ts`,
set by G0, **never amended** by later gates:

- `VALIDATION_FAILED` — zod validation failed; `details[]` populated from issue paths.
- `INTERNAL_ERROR` — unmapped throwable; `message` is generic, cause is logged.

**Domain codes** — added by later phases inside their own contract file
(`apps/backend/src/contracts/<domain>.ts`), never in `envelope.ts`.

There is exactly **one** error handler, registered once by autoload in
`apps/backend/src/api/plugins/error-handler.ts`. Later phases do **not** add a
second handler; two handlers = two envelope versions.

## 3. Env vars

Declared in `.env.example`; parsed at boot via zod in
`apps/backend/src/config/index.ts`. Invalid config exits non-zero with a readable
message — it is never a request-time failure.

| Variable | Purpose | Default |
|----------|---------|---------|
| `PORT` | Backend listen port | `3001` |
| `NODE_ENV` | Runtime mode | `development` |
| `MONGO_URL` | Mongo connection string | `mongodb://localhost:27017` |
| `MONGO_DB` | Database name | `multiprice` |
| `JWT_SECRET` | Session signing secret (Phase 2) | _empty — set at deploy time_ |
| `COOKIE_NAME` | Session cookie name (Phase 2) | `mp_session` |
| `BACKEND_ORIGIN` | Same-origin proxy target for Next rewrite | `http://localhost:3001` |

Phase 2's variables (`JWT_SECRET`, `COOKIE_NAME`) are declared now so the
compose files never have to change for them.

## 4. Ports

| Service | Host-process dev | Reviewer's stack (compose) |
|---------|-----------------|----------------------------|
| Backend | `127.0.0.1:3001` | `backend:3001` (compose DNS; no host port published) |
| Frontend | `127.0.0.1:3000` | `localhost:3000` (published) |
| Mongo | `127.0.0.1:27017` (via `compose.dev.yml` only) | _unpublished — backend reaches over compose network_ |

## 5. Conventions

### 5.1 One contract file per domain

Each gate owns `apps/backend/src/contracts/<domain>.ts` and
`apps/frontend/src/lib/api/types/<domain>.ts` and exports that domain's error
codes from its own contract file.

There is no growing `codes.ts` and no growing `types.ts`. Two gates running in
the same wave would otherwise collide on those shared files.

`contracts/errors/envelope.ts` holds only the envelope shape and the two
envelope-level codes — no later gate touches it.

### 5.2 Two autoloaded directories, plugins before routes

`apps/backend/src/api/plugins/` loads first, then `apps/backend/src/api/routes/`.
A lane creates a file in either and it is live — `app.ts` is owned by Lane 0-A
and never edited again.

Plugins must load first because their hooks must apply to routes. Plugins are
`fp`-wrapped so their hooks apply app-wide rather than to themselves (see §5.3).

### 5.3 The `fp` rule

**Every file in `apps/backend/src/api/plugins/` must be wrapped in
`fastify-plugin` (`fp`).** Without it, Fastify encapsulates the plugin and its
hooks apply only to itself — a guard registered that way silently protects
nothing.

This is exactly how Phase 4's immutability guard reaches Phase 3's routes, and
how Phase 2's index bootstrap runs at boot. The pattern is set by example in
Lane 0-A's `plugins/error-handler.ts` (the first file in `plugins/`).

### 5.4 Same-origin transport

The browser never talks to the backend cross-origin. `next.config.ts` rewrites
`/api/:path*` to `${BACKEND_ORIGIN}/api/:path*`; the frontend client calls
**relative `/api/...` URLs only**.

There is no `NEXT_PUBLIC_API_URL`, no `@fastify/cors`, and no
`Access-Control-Allow-Credentials` anywhere in this project. This is deliberate:
the alternative fails twice — at J0 (CORS) and at J2 (cross-site cookie not
sent in production). A same-origin proxy removes both, in three lines.

## 6. Mirroring rule

The frontend keeps a hand-written mirror of every backend contract in
`apps/frontend/src/lib/api/types/<domain>.ts`. The mirror file begins with a
comment naming the backend file it mirrors, e.g.:

```ts
// Hand-written mirror of apps/backend/src/contracts/health.ts — keep in sync by hand.
```

**Duplication is the deliberate choice.** Rule 1 of the phase plan: do not
introduce a code-generation step. Drift is caught by:

1. The route schema-validating its own response at request time.
2. The client type-checking against the mirror at compile time.
3. PR review.

## 7. Mirroring — error envelope

The frontend's typed `ApiError` (defined in `apps/frontend/src/lib/api/client.ts`
by Lane 0-B) carries the same three fields as the envelope's `error` object:
`code`, `message`, `details`. Lanes that catch API errors should destructure
those three fields — never parse message strings.