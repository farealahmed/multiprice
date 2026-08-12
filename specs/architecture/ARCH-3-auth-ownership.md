# Architecture: Authentication and ownership

> **Date:** 2026-08-13
> **Issue:** #3
> **Phase:** 2 of 5 (System Architecture)
> **Requirements source:** Standalone brief — see Inferred Requirements (`specs/context/3.md`, `docs/phases/phase-2-issue-3.md`, `docs/implementation-phases.md` § Phase 2)
> **Type:** feature

## Architecture Summary

A new `users` collection and a cookie-based JWT session establish identity; a new
ownership-scoped repository base (`persistence/repository.ts`) establishes the pattern every
later collection (starting with Phase 3's `documents`) inherits, so an unscoped query fails to
typecheck rather than leaking another user's data. `POST /auth/signup|login|logout` and
`GET /auth/me` (`apps/backend/src/api/routes/auth.ts`) sit on top of `services/auth.ts` and
`persistence/users.repository.ts`; a `fp`-wrapped `authenticate.ts` plugin decorates
`app.authenticate`, an opt-in preHandler that every protected route from Phase 3 onward attaches
explicitly — it is exported, not globally applied, so public routes (signup/login) are unaffected
by its existence. Domain errors (`EMAIL_TAKEN`, `INVALID_CREDENTIALS`, `UNAUTHENTICATED`) are
caught and mapped to their status codes inside the route, mirroring the pattern
`api/errors/engine-errors.ts` already established for pricing — the single global error handler
stays the catch-all for the unmapped case, not the auth-code router. On the frontend, a new
`(auth)` route group (sign-in, create-account) and a session context wrap the existing `(app)`
group behind a redirect guard; the session cookie is never touched from JavaScript. Two hardening
decisions land in this phase alongside the brief: `JWT_SECRET` loses its empty-string default —
boot now fails fast (the existing `InvalidConfigError` path) if it's unset, in every environment
— and a global, per-IP rate limit (`@fastify/rate-limit`) applies across the whole API, not just
auth routes, as a deliberate demonstration rather than a brief requirement.

## Inferred Requirements

No REQ doc exists for this issue; `specs/context/3.md` (= `docs/phases/phase-2-issue-3.md`) is
itself a complete lane-brief specification. Requirements below are restated from it and from
`docs/implementation-phases.md` § Phase 2 for traceability by `generate-tasks`.

| ID | Inferred Requirement | Source |
|----|----|----|
| R1 | Every user sees and modifies only their own data — enforced structurally, not by convention. | Issue #3 Requirement 1; Brief G2 step 5 |
| R2 | `SignupInput{email,password}`, `LoginInput{email,password}`, `SessionUser{id,email,createdAt}` — password ≥12 chars, no composition rules, length capped. | Brief G2 step 1 |
| R3 | Error codes `EMAIL_TAKEN`, `INVALID_CREDENTIALS`, `UNAUTHENTICATED`, `PASSWORD_TOO_SHORT`, `EMAIL_INVALID`; `INVALID_CREDENTIALS` is one code for both unknown-email and wrong-password. | Brief G2 step 2 |
| R4 | Session: JWT in an httpOnly, `SameSite=Lax`, Secure-in-production cookie named by `COOKIE_NAME`; claims `{sub, iat, exp}` only, 7-day expiry; cookie-only, no `Authorization` header, no `localStorage`. | Brief G2 step 4 |
| R5 | Every repository method reading/writing user-owned data takes `ownerId` as its first parameter, scoped in the Mongo filter; never fetch-then-check. A shared base helper makes this inherited rather than remembered. | Brief G2 step 5 |
| R6 | Idempotent index bootstrap (`users.email` unique) runs at boot via an `fp`-wrapped autoloaded plugin; uniqueness is a database constraint, closing the concurrent-signup race. | Brief G2 step 6 |
| R7 | An integration test harness (`test/support/db.ts`) connects to a test database with per-test isolation and teardown; every Phase 3+ integration test reuses it. | Brief G2 step 7 |
| R8 | `SessionUser` and the auth error codes are mirrored to `apps/frontend/src/lib/api/types/auth.ts`; endpoints, cookie name/flags, the ownership rule, and the 404-not-403 convention are documented in `docs/contracts/phase-2.md`. | Brief G2 step 8 |
| R9 | Email is stored lowercased and trimmed; the unique index is on the normalized value. | Brief 2-A step 1 |
| R10 | argon2id with library defaults (no hand-tuned cost params); the hash never leaves the repository layer — no route response, log line, or error message ever contains it. | Brief 2-A step 2 |
| R11 | `POST /auth/signup` — a duplicate-key error from the index becomes `409 EMAIL_TAKEN`; the check is the index, not a prior `findByEmail` (which loses the race). Sets the session cookie, returns `SessionUser`. | Brief 2-A step 3 |
| R12 | `POST /auth/login` — wrong password and unknown email both return `401 INVALID_CREDENTIALS` and do equal work (verify against a dummy hash when the user is absent), so timing does not enumerate accounts. | Brief 2-A step 4 |
| R13 | `POST /auth/logout` clears the cookie with the same attributes it was set with. | Brief 2-A step 5 |
| R14 | `GET /auth/me` returns the current `SessionUser` or `401 UNAUTHENTICATED`. | Brief 2-A step 6 |
| R15 | `authenticate.ts` is a preHandler verifying the JWT and decorating `request.userId`; failure is `401 UNAUTHENTICATED`. Exported so every protected route in Phases 3–5 attaches it explicitly; `request.userId` is typed non-optional in protected route contexts. | Brief 2-A step 7 |
| R16 | Sign-in / create-account pages follow `design/htmls/index.html`'s split layout, built from shared form primitives (`components/forms/**`) that Phase 3 reuses. | Brief 2-B step 1 |
| R17 | Frontend auth: `lib/api/auth.ts` (signup/login/logout/me through the existing client, credentials included); a `useSession()` hook with a pending state distinct from signed-out (no sign-in flash for an authenticated user); route protection over `(app)` with the attempted path preserved for post-login return. | Brief 2-B steps 2–4 |
| R18 | Client-side validation mirrors the contract; `EMAIL_TAKEN` attaches to the email field, `INVALID_CREDENTIALS` renders at form level (deliberately not field-specific). | Brief 2-B step 5 |
| R19 | Sign-out lives in the shell's `UserSlot` (currently an empty stub), calls logout, clears context, redirects. | Brief 2-B step 6 |
| R20 | Never read/write the session cookie from JavaScript; no token in `localStorage`. | Brief 2-B guardrail |
| R21 | J2: full suite green, `e2e/auth.cy.ts` covers signup → protected app → sign out → redirected on direct protected-route access; devtools confirms the cookie is httpOnly. | Brief Join J2 |
| R22 | `JWT_SECRET` has no default — `buildConfig` fails at boot (existing `InvalidConfigError` path) when it is unset, in every environment, not just production. | Developer decision, 2026-08-13 |
| R23 | A global per-IP rate limit applies across the whole API (not auth-endpoint-specific) — a deliberate security-awareness addition, not a requirement scored by the brief. | Developer decision, 2026-08-13 |

## High-Level Structure

```
Browser
  │ POST /auth/signup | /auth/login          (credentials: include)
  ▼
Next.js rewrite (same-origin, unchanged)
  ▼
[global] api/plugins/rate-limit.ts — per-IP cap, onRequest, applies to every
         route incl. public ones; 429 RATE_LIMITED past the cap. Skipped in
         NODE_ENV=test so the automated suites never trip it.
  ▼
Fastify route  src/api/routes/auth.ts
  │  1. zod-validate against contracts/auth.ts
  │  2. services/auth.ts: hash/verify (argon2id), build session
  ▼
src/persistence/users.repository.ts  ──(unscoped: users own themselves)──►  users collection
  │  duplicate-key (11000) on insert → EMAIL_TAKEN
  │  not found / bad password → dummy-hash verify → INVALID_CREDENTIALS
  ▼
services/auth.ts: sign JWT {sub,iat,exp} → route sets httpOnly cookie (COOKIE_NAME)
  ▼
Route replies 200 SessionUser, or catches the domain error and replies
409 / 401 directly (mirrors api/errors/engine-errors.ts's local-mapping pattern)
  ▼
Browser: session cookie set, invisible to document.cookie

Protected route (Phase 3+):
Browser ──cookie──► route  { preHandler: app.authenticate }
                       │  authenticate.ts verifies JWT, decorates request.userId
                       │  failure → 401 UNAUTHENTICATED (route-level, same pattern)
                       ▼
                     handler calls a repository built on persistence/repository.ts,
                     passing request.userId as ownerId — the Mongo filter always
                     includes it; an unscoped call is a missing argument, a compile error.
```

**Added to the existing system:** `contracts/auth.ts`, `persistence/repository.ts` (base) +
`persistence/users.repository.ts`, `api/plugins/indexes.ts` + `api/plugins/authenticate.ts` +
`api/plugins/rate-limit.ts`, `api/routes/auth.ts`, `services/auth.ts`, `domain/user.ts`,
`test/support/db.ts`; frontend `(auth)` route group, `(app)/layout.tsx` guard, `lib/auth/**`,
`lib/api/auth.ts`, `components/forms/**`.

**Modified in the existing system:** `apps/backend/package.json` (four new dependencies),
`apps/frontend/src/components/shell/UserSlot.tsx` (sign-out — see Change Footprint amendment
note), `apps/backend/src/config/index.ts` (`JWT_SECRET` loses its default — amendment, see
below), `.env.example` (documents that `JWT_SECRET` must now be set).

**Untouched:** `app.ts` (autoload only), `error-handler.ts`, `envelope-mapper.ts`, `mongo.ts`,
`config/index.ts` (already declares `JWT_SECRET`/`COOKIE_NAME` since Phase 0), `src/pricing`,
pricing routes, `lib/api/client.ts`, `nav-items.ts` (no new nav entry this phase — `/editor` is
already listed and auth pages aren't nav destinations).

## Tech Choices

| Area | Decision | Alternatives Considered | Rationale |
|----|----|----|----|
| Password hashing | `argon2` (argon2id), library defaults for cost params | `bcrypt`, hand-tuned argon2 cost | Brief mandates argon2 with library defaults explicitly — tuning invites an untested, environment-specific cost choice for no stated benefit |
| Session mechanism | `@fastify/jwt` + `@fastify/cookie`, JWT stored in an httpOnly cookie via the jwt plugin's cookie mode | `Authorization: Bearer` header, server-side session store (Mongo/Redis-backed) | Brief freezes cookie-only, no header path. A server-side store adds a dependency and a lookup on every request for no requirement this phase states — the stateless JWT is sufficient at 7-day expiry with no revocation requirement in scope |
| Domain error delivery | Route-level catch-and-map (`services/auth.ts` throws `{code}`, the route replies with the matching status), global handler stays the 500 fallback | Route the domain code through the global handler (as `envelope-mapper.ts` does for zod) | `api/routes/pricing.ts` + `engine-errors.ts` already establish this exact pattern for non-validation domain errors in this codebase; reusing it avoids inventing a second convention for "how a route reports a business-rule failure" |
| `authenticate.ts` wiring | `fp`-wrapped plugin that **decorates** `app.authenticate` (an opt-in preHandler); routes attach it explicitly | A global `onRequest` hook via `fp` | A global hook would apply to every autoloaded route, including `POST /auth/signup`/`login`, which must stay public. `fp` here serves its stated purpose — making the decorator visible outside the plugin's own encapsulation — not "apply everywhere" |
| Ownership base helper | Functional factory `createOwnedRepository<T>(collection)` returning `{findOne, find, insertOne, updateOne, deleteOne}`, each requiring `ownerId` first | An abstract base class `Repository<T>` with a protected `scope()` method | No class exists anywhere in this codebase (`mongoPlugin`, `src/pricing`, `services/pricing-preview.ts` are all functional); a factory matches the established idiom and needs no `this`-binding discipline across autoloaded modules |
| `users.repository.ts` vs. the base helper | Hand-written, **not** built on `createOwnedRepository` — `create`, `findByEmail`, `findById` stay unscoped | Force `users` through the ownership helper for consistency | A user is not owned by another user; `ownerId` has no referent for the identity collection itself. The helper's first real consumer is Phase 3's `documents.repository.ts`. Stated explicitly so a future reader doesn't "fix" this as an inconsistency |
| Integration test harness | Connect to the existing `compose.dev.yml` Mongo (`MONGO_URL`), one uniquely-named test database per test file, dropped on teardown | Testcontainers | G2's dependency list (`argon2`, `@fastify/cookie`, `@fastify/jwt`) is exhaustive and "no lane installs anything" is explicit — `testcontainers` isn't on it. The dev Mongo already exists and is simpler to reuse |
| Timing-safe login | A fixed, precomputed dummy argon2 hash verified against on every login where the email isn't found | Short-circuit return on unknown email (fast path) | The fast path is exactly the timing side-channel `INVALID_CREDENTIALS`'s single-code design (R12) exists to close — verifying against a dummy hash keeps the wall-clock cost equal whether or not the account exists |
| Password max length | 128 characters | Unbounded (rejected by the brief itself), a tighter bound (e.g. 64) | Generous round number; argon2 has no practical limit so the cap exists purely to bound CPU cost per request, not to constrain legitimate passphrases |
| Index bootstrap | `api/plugins/indexes.ts`, `fp`-wrapped, calls `createIndex` with `{unique: true}` on `users.email` (idempotent — Mongo no-ops on a pre-existing equivalent index); exposes a small registry so later phases' collections add their own index calls here rather than a second plugin file | A per-collection index call inside each repository's first use | Brief explicitly requires one `fp`-wrapped autoloaded plugin so it "actually runs at boot" — deferring to first-use would make index creation a race with the first real request instead of a boot invariant |
| `JWT_SECRET` validation | Remove its default in `config/index.ts` (`z.string().default('')` → `z.string().min(1)`); boot fails via the existing `InvalidConfigError` path when unset, in **every** environment | A `NODE_ENV === 'production'`-only conditional check | Developer call: "env data is mandatory." Reusing the config module's existing fail-fast mechanism is simpler than new branching logic, and matches how `MONGO_URL`/`MONGO_DB` already behave — no environment gets to boot on an empty secret. `COOKIE_NAME` keeps its default; it isn't sensitive |
| Rate limiting | `@fastify/rate-limit`, registered globally via a new `fp`-wrapped `api/plugins/rate-limit.ts` (one per-IP cap across the whole API); the plugin no-ops when `NODE_ENV === 'test'` | Limiting only `/auth/*`; a hand-rolled token bucket; env-configurable thresholds | Developer explicitly wants a *global* demonstration of rate-limiting awareness, not an auth-specific patch. The official Fastify plugin is a one-file addition consistent with the `@fastify/jwt`/`@fastify/cookie` "official plugin over hand-rolled cross-cutting concern" pattern. Skipping it in tests avoids a false failure in the existing and new automated suites, which fire many requests in quick succession via `app.inject()` |

## Patterns & Conventions

- **One contract file per domain** (`contracts/auth.ts` owns this domain's schemas *and* error codes) — Phase 0 convention, followed here.
- **Autoloaded routes/plugins, `fp`-wrapped plugins only** — `auth.ts` (route) and `indexes.ts`/`authenticate.ts` (plugins) are picked up by the existing autoload registration; `app.ts` is not edited.
- **Route-level domain error mapping, one global fallback handler** — established by Phase 1's `engine-errors.ts`, extended here to auth. Applied for the *second* time in this codebase — no longer a one-off.
- **Hand-written frontend mirror, no codegen** — `lib/api/types/auth.ts` mirrors `contracts/auth.ts` by hand, per Phase 0's mirroring rule.
- **Same-origin only, credentials always included** — `lib/api/auth.ts` calls relative `/auth/...` through the existing `apiFetch`, which already sets `credentials: 'include'`.
- **Ownership-first repository pattern** — introduced for the first time here; every later phase's collection repository (Phase 3's `documents`, primarily) is built on `createOwnedRepository`, not reimplemented.
- **Intentionally not applied: role-based access, password reset/verification** — explicit guardrails in the brief (no roles, no reset/verification flow).
- **One deliberate exception to "opt-in, not global": rate limiting.** Unlike `authenticate.ts`, `rate-limit.ts` registers a true global `onRequest` hook — it must cover public routes (signup/login are exactly what a brute-force actor targets) as well as protected ones, so opt-in-per-route would defeat the point.

## Data Models

### `User` (persisted, `users` collection)

**Purpose:** the account record — the only collection this phase creates.

**Key fields:**
| Field | Type / Constraint | Notes |
|----|----|----|
| `_id` | ObjectId | Mongo default; string form is `SessionUser.id` and JWT `sub` |
| `email` | string, lowercased + trimmed, unique index | Normalization happens before the uniqueness check and storage — `A@x.com` and `a@x.com` are one account |
| `passwordHash` | string (argon2id output) | Never serialized into any route response, log line, or error message |
| `createdAt` | Date | Set on insert, never updated |

**Relationships:** none this phase — `documents` (Phase 3) will reference `ownerId` back to this collection's `_id`, but that FK direction is Phase 3's concern.

**Lifecycle:** created on signup, never updated or deleted this phase (no profile edit, no account deletion in scope).

### `SessionUser` (wire type, not persisted as such)

**Purpose:** what `signup`/`login`/`me` return — `User` minus `passwordHash`.

**Key fields:**
| Field | Type / Constraint | Notes |
|----|----|----|
| `id` | string | `User._id.toString()` |
| `email` | string | Normalized form |
| `createdAt` | string (ISO) | Serialized `Date` |

**Relationships:** 1:1 derived from `User`.

**Lifecycle:** request-scoped; never persisted as its own document.

### JWT claims (session token payload)

**Purpose:** the entire content of the session cookie's signed payload.

**Key fields:**
| Field | Type / Constraint | Notes |
|----|----|----|
| `sub` | string | `User._id.toString()` — the only identity carried |
| `iat` | number | Set by `@fastify/jwt` |
| `exp` | number | 7 days from issuance |

**Relationships:** `sub` resolves to a `User` via `findById` on `me`/`authenticate`.

**Lifecycle:** stateless — no server-side revocation list; expiry is the only lifecycle event.

## API Contracts / Interfaces

### Auth routes (HTTP)

**Boundary:** Fastify routes, `apps/backend/src/api/routes/auth.ts`.

| Method/Op | Path | Purpose | Errors / Returns |
|----|----|----|----|
| `POST` | `/auth/signup` | Validate, hash, insert, set session cookie | 200 `SessionUser` · 400 `VALIDATION_FAILED` (shape: `PASSWORD_TOO_SHORT`, `EMAIL_INVALID` via `details[].code`) · 409 `EMAIL_TAKEN` |
| `POST` | `/auth/login` | Verify credentials, set session cookie | 200 `SessionUser` · 401 `INVALID_CREDENTIALS` (unknown email and wrong password, identical shape and timing) |
| `POST` | `/auth/logout` | Clear session cookie | 204 No Content |
| `GET` | `/auth/me` | Current session | 200 `SessionUser` · 401 `UNAUTHENTICATED` |

**Auth requirements:** `signup`/`login` public; `logout`/`me` require a valid session cookie (`app.authenticate` preHandler).

### Global rate limit (cross-cutting, not a route)

Applies to every route, including public ones. `429` response reuses the standard envelope shape
with a code defined locally in the plugin (not added to the frozen `contracts/errors/envelope.ts`,
since it is cross-cutting infrastructure rather than a domain concern):

```ts
// 429, header: Retry-After
{ error: { code: 'RATE_LIMITED', message: 'Too many requests, try again shortly.' } }
```

### Module boundaries (not HTTP)

| Signature | Purpose | Errors / Returns |
|----|----|----|
| `createOwnedRepository<T>(collection: Collection<T>): OwnedRepository<T>` | Base helper — every method takes `ownerId: string` first, merges it into the Mongo filter | Returns the driver's native result/throw for each operation; no error translation at this layer |
| `app.authenticate: preHandlerHookHandler` | Verifies the session JWT, decorates `request.userId` | Throws → mapped to `401 UNAUTHENTICATED` by the attaching route's local catch, same pattern as R11/R12 |
| `services/auth.ts: signup(input): Promise<{user: SessionUser; token: string}>` | Hash + insert + issue token | Throws `{code: 'EMAIL_TAKEN'}` on duplicate key |
| `services/auth.ts: login(input): Promise<{user: SessionUser; token: string}>` | Verify + issue token | Throws `{code: 'INVALID_CREDENTIALS'}` on any failure (unknown email or wrong password, equal-time) |

## Module Boundaries

| Module / Package | Responsibility | Allowed Dependencies |
|----|----|----|
| `apps/backend/src/contracts/auth.ts` | zod schemas, this domain's error codes | zod only |
| `apps/backend/src/persistence/repository.ts` | Ownership-scoped query base — no domain knowledge | `mongodb` types only |
| `apps/backend/src/persistence/users.repository.ts` | `users` collection access, unscoped (identity collection) | `mongodb`, `domain/user.ts` |
| `apps/backend/src/domain/user.ts` | Internal `User` type, framework-agnostic | Nothing (mirrors `src/pricing`'s "imports nothing" discipline for domain types) |
| `apps/backend/src/services/auth.ts` | Hashing, verification, token issuance, domain error throws | `argon2`, `@fastify/jwt`'s sign function (via the app instance, not imported directly — see Open Questions), `persistence/users.repository.ts` |
| `apps/backend/src/api/routes/auth.ts` | HTTP wiring — validate, call service, set/clear cookie, map domain errors to status | `contracts/auth.ts`, `services/auth.ts` |
| `apps/backend/src/api/plugins/authenticate.ts` | Decorates `app.authenticate`; JWT verify + `request.userId` | `@fastify/jwt` (registered here or in a sibling plugin — implementer's call) |
| `apps/backend/src/api/plugins/indexes.ts` | Boot-time idempotent index creation | `mongo` decoration only |
| `apps/backend/src/api/plugins/rate-limit.ts` | Global per-IP request cap; envelope-shaped `429` body | `@fastify/rate-limit` only |
| `apps/frontend/src/lib/api/auth.ts` | Typed `signup`/`login`/`logout`/`me` calls | `lib/api/client.ts` (read-only), `lib/api/types/auth.ts` |
| `apps/frontend/src/lib/auth/**` | Session context, `useSession()`, route guard | `lib/api/auth.ts`, React |
| `apps/frontend/src/components/forms/**`, `app/(auth)/**` | Sign-in/create-account UI, primitives Phase 3 reuses | `lib/auth/**`, `lib/api/auth.ts`, `styles/tokens.css` |

**Rule carried forward from Phase 1:** the HTTP layer never does arithmetic on money (unchanged,
not this phase's concern) — the new equivalent this phase establishes: **no route ever queries a
collection without an `ownerId` in hand**, enforced by `createOwnedRepository`'s required first
parameter.

## Change Footprint

### New files / modules

| Path | Purpose | Pattern reference |
|----|----|----|
| `apps/backend/src/contracts/auth.ts` | Schemas + error codes for this domain | `contracts/pricing.ts` (schema+codes-in-one-file shape) |
| `apps/backend/src/persistence/repository.ts` | Ownership-scoped base helper | new — first file in `persistence/` beyond `mongo.ts` |
| `apps/backend/src/persistence/users.repository.ts` | `create`, `findByEmail`, `findById` | new, deliberately not built on the base helper |
| `apps/backend/src/domain/user.ts` | Internal `User` type | new — first file in `domain/` |
| `apps/backend/src/services/auth.ts` | Hash/verify/issue-token, domain error throws | `services/pricing-preview.ts` (service-layer shape) |
| `apps/backend/src/api/routes/auth.ts` | Four auth routes | `api/routes/pricing.ts` (autoloaded route + local error mapping) |
| `apps/backend/src/api/plugins/authenticate.ts` | `app.authenticate` decorator | `api/plugins/error-handler.ts` (first `fp`-wrapped plugin, pattern-by-example) |
| `apps/backend/src/api/plugins/indexes.ts` | Boot-time index bootstrap | `api/plugins/error-handler.ts` (`fp` shape) |
| `apps/backend/src/api/plugins/rate-limit.ts` | Global per-IP rate limit, no-ops under `NODE_ENV=test` | `api/plugins/error-handler.ts` (`fp` shape) |
| `apps/backend/test/support/db.ts` | Integration test harness | new — no prior integration-test infra exists |
| `apps/backend/test/api/auth.test.ts` | Route-level tests | `test/api/pricing-preview.test.ts` |
| `apps/backend/test/integration/users.test.ts` | Index-level duplicate-key + normalization tests | new — first file in `test/integration/` |
| `docs/contracts/phase-2.md` | Human-readable contract snapshot | `docs/contracts/phase-1.md` |
| `apps/frontend/src/lib/api/types/auth.ts` | Mirrored types + error codes | `lib/api/types/pricing.ts` |
| `apps/frontend/src/lib/api/auth.ts` | Typed auth calls | `lib/api/pricing.ts` |
| `apps/frontend/src/lib/auth/**` | Session context, hook, guard | new |
| `apps/frontend/src/components/forms/**` | Shared form primitives | `components/line-items/**` (styling/token usage) |
| `apps/frontend/src/app/(auth)/**` | Sign-in, create-account pages | `app/(app)/editor/page.tsx` (client component shape), `design/htmls/index.html` (layout/markup) |
| `apps/frontend/src/app/(app)/layout.tsx` | Route guard wrapping the `(app)` group | new — first layout below root |
| `e2e/auth.cy.ts` | J2's Cypress happy path | `e2e/pricing-preview.cy.js` |

### Modified files / modules

| Path | What changes here |
|----|----|
| `apps/backend/package.json` | Add `argon2`, `@fastify/cookie`, `@fastify/jwt`, `@fastify/rate-limit` to `dependencies` — additive, no version bumps to existing deps |
| `apps/frontend/src/components/shell/UserSlot.tsx` | Currently `return null`; gains sign-out button wired to `lib/auth`'s context. **Not listed in 2-B's Owns in the brief** — see amendment note below |
| `apps/backend/src/config/index.ts` | `JWT_SECRET: z.string().default('')` → `z.string().min(1)`; update the file's comment (currently states "empty string at boot is allowed") to reflect boot-fatal-everywhere. **Not listed in G2's Owns in the brief** — same amendment umbrella as `UserSlot.tsx` below |
| `.env.example` | `JWT_SECRET` needs a documented non-empty placeholder (e.g. a comment instructing a generated value) — an empty default no longer boots |

### Deleted / replaced

None.

### Touched but not changed (silent-regression hotspots)

| Path | Why it matters |
|----|----|
| `apps/backend/src/app.ts` | Autoloads the two new plugins and the new route file — no edit, but boot sequence gains index creation and a new decorator; verify boot still succeeds with `skipMongoPlugin` test paths (existing `health.test.ts` builds the app without a real Mongo connection — `indexes.ts` must not assume a live `db` in that path, or must be excluded from the test-mode build the way `mongo.ts`'s test seam already handles) |
| `apps/backend/src/api/plugins/error-handler.ts` | Stays the 500-only fallback; no expected auth error should ever reach it. Existing `health.test.ts` (lines 118–119, per ARCH-2) already pins its zod-fallback behavior — unaffected, since auth adds no zod amendment this phase |
| `apps/frontend/src/components/shell/Topbar.tsx` / `NavSlot.tsx` | Both already render `UserSlot` unconditionally; filling in its previously-empty return is safe, no consumer assumed emptiness (grepped — none) |
| `apps/frontend/src/app/(app)/editor/**` | Now sits behind the new `(app)/layout.tsx` guard for the first time; must still render for an authenticated session exactly as before — regression risk is "the guard breaks the existing editor," not "the editor changes" |

**Amendment notes:**

- The brief's Owns list for Lane 2-B does not include `apps/frontend/src/components/shell/UserSlot.tsx`, but Build step 6 requires editing it, and the repo-wide convention (`docs/parallel-execution.md`) reserves `components/shell/**` for joins-only past a narrow nav-entry carve-out. Resolving this as an explicit addition to 2-B's Owns for this phase: no other lane touches `shell/**` in the same wave (2-A is backend-only, G3 owns only the document contract), so there is no collision risk the convention is protecting against.
- The brief's Owns list for Gate G2 does not include `apps/backend/src/config/index.ts` or `.env.example`, but the developer's "env data is mandatory" decision (R22) requires editing both. G2's Mission is already "fix the auth DTOs and session mechanics" (Build step 4) — extending that to the config file that declares the session secret is the same concern, not a new one. Adding both to G2's Owns for this phase.

## Areas of Impact

| Area | Impact | Risk (L/M/H) | Why |
|----|----|----|----|
| `persistence/repository.ts` (new pattern) | Every collection from Phase 3 onward is built on this helper | M | Foundational — a design mistake here (e.g. an easy way to bypass `ownerId`) propagates to every later phase rather than staying local. Mitigated by the "ownerId is a required first parameter" typecheck-enforced shape |
| `error-handler.ts` / domain error pattern | Second precedent (after pricing) for route-level error mapping instead of the global handler | L | Additive by convention, not by code change — no file here is edited |
| `components/shell/UserSlot.tsx` | First real content in a previously-empty shell slot | L | Single-purpose stub, no other consumer, covered by the amendment note above |
| `apps/backend/package.json` | Three new runtime dependencies | L | Additive; no existing dependency version changes |
| Frontend route structure | First `layout.tsx` below root; first route group (`(auth)`) besides `(app)` | L–M | New file, but must not regress the existing unauthenticated root `/` health page, which stays outside both groups |
| Deployment / build pipeline | `JWT_SECRET` must be set to a real value everywhere, including local dev — `npm run dev-api` now fails to boot until it's set | M | Deliberate (R22): the config module already fails closed on missing `MONGO_URL`/`MONGO_DB`; `JWT_SECRET` now behaves the same way. `.env.example` needs a placeholder/instruction so a fresh clone doesn't silently fail to boot with no explanation |
| Global rate limit | Every route, including ones outside this phase (health, pricing preview), now sits behind a per-IP cap | L–M | Additive and generous by design, but it is genuinely global — worth a manual check that the demo/reviewer flow (`npm run up` + a normal walkthrough) never approaches the cap. No-op under `NODE_ENV=test` protects the automated suites specifically |

**Contract changes:** none to existing contracts (`health.ts`, `pricing.ts`, `envelope.ts` are
unchanged). `auth.ts` is wholly new.

**Cross-cutting ripples:** none into telemetry or feature flags. One migration-adjacent concern:
`JWT_SECRET` moves from "declared, unused" to "required for correct behavior" — see below.

## Cross-Cutting Concerns

- **Errors:** domain errors (`EMAIL_TAKEN`, `INVALID_CREDENTIALS`, `UNAUTHENTICATED`) are caught and mapped to their status inline in `api/routes/auth.ts` and `authenticate.ts`'s attaching routes, mirroring `engine-errors.ts`. Zod validation failures (`PASSWORD_TOO_SHORT`, `EMAIL_INVALID`) flow through the existing, unmodified `envelope-mapper.ts`/global handler — no amendment needed this phase since `params.code` already exists from Phase 1. Unmapped errors (e.g. a Mongo outage) fall through to the global handler as `500 INTERNAL_ERROR`.
- **Logging & metrics:** no password or password hash is ever logged — `req.log.error` (existing, unchanged) logs the error object and code only; a future reviewer should grep logs for `passwordHash`/`argon2` as a regression check, not add one preemptively. No new metrics this phase (out of scope, not requested by the brief).
- **Auth & authz:** this phase *is* the auth layer. Established here: cookie-based JWT, `app.authenticate` as the opt-in check, `ownerId`-scoped queries as the authz mechanism for Phase 3+. No roles, no permission levels — single-tenant-per-user model only.
- **Performance & scale:** argon2id at library defaults costs tens of milliseconds per hash/verify by design (that's the point of a memory-hard KDF) — acceptable for signup/login, not on any hot path. The unique index keeps `findByEmail` O(log n) regardless of collection size.
- **Security:** validation boundary is the zod schema at the route edge, same as pricing. Password never crosses into a response, log, or error message (R10). Timing-safe login via dummy-hash verification (R12) closes the account-enumeration side channel. The unique index — not application logic — closes the concurrent-signup race, so a check-then-insert TOCTOU bug is structurally impossible to reintroduce. A global per-IP rate limit (R23, A10) blunts brute-force credential stuffing and generic API abuse — coarse and uniform by design, not a substitute for a stricter auth-specific tier if that's ever needed (see Out of Scope).
- **Migrations & rollout:** net-new collection, no existing data to migrate. **`JWT_SECRET` is now a required env var in every environment** (R22, A9) — the empty-string default from Phase 0 was fine when nothing consumed it; `config/index.ts`'s existing `InvalidConfigError` boot check now covers it the same way it already covers `MONGO_URL`/`MONGO_DB`. This means local dev now needs a `.env` entry that didn't strictly matter before — `.env.example` must say so. Rollback is a plain deploy revert; no data risk since no prior phase persisted anything user-related. The global rate limit (A10) ships active in dev/prod, disabled in test, so it has no rollback implications of its own.

## Architecture Decisions Log

| # | Decision | Alternatives | Chosen Because | Satisfies REQs |
|----|----|----|----|----|
| A1 | Domain errors caught and mapped inline per route; global handler stays the 500 fallback | Route domain codes through the global handler via a `params.code`-style amendment | `engine-errors.ts` already establishes this exact pattern in this codebase for exactly this situation (a business-rule failure that isn't a zod issue) — reusing it avoids a second, divergent convention | R3, R11, R12, R14 |
| A2 | `authenticate.ts` decorates an opt-in `app.authenticate` preHandler rather than registering a global hook | A global `onRequest` hook, gated by a route-path allowlist | A global hook would need to know which paths are public — an allowlist that grows every phase is exactly the "shared append-target" the project's file-ownership rules exist to avoid. Opt-in per route keeps that knowledge local to each route file | R15 |
| A3 | Base repository helper is a functional factory (`createOwnedRepository`), not a class | Abstract base class with a protected scope method | No class exists anywhere in this codebase; a factory needs no `this`-binding discipline and matches `mongoPlugin`/`src/pricing`'s idiom | R5 |
| A4 | `users.repository.ts` is hand-written and does *not* use `createOwnedRepository` | Force it through the helper with `ownerId` bound to the user's own `_id` | A user is not "owned" by anyone — forcing the pattern would be a fiction that confuses the next reader about what the helper is for. The helper's real job starts at Phase 3 | R5, R9 |
| A5 | Timing-safe login via a fixed dummy-hash verify on unknown email | Fast-path return (skip hashing) on unknown email | The fast path is precisely the side channel that undermines R3's single `INVALID_CREDENTIALS` code — equal work is the only way the code is actually indistinguishable | R3, R12 |
| A6 | Integration test harness connects to the existing `compose.dev.yml` Mongo with per-file unique db names | Testcontainers | Not in G2's fixed dependency list; "no lane installs anything" is explicit, and the dev Mongo already exists | R7 |
| A7 | `UserSlot.tsx` added to 2-B's Owns for this phase (amendment) | Leave it to J2 per the repo-wide shell-ownership convention | Build step 6 already assigns the work to 2-B; no collision risk exists this wave since no other lane touches `shell/**` | R19 |
| A8 | Password max length capped at 128 characters | No stated cap enforced strictly at 12 (min only); a tighter cap (64) | Round, generous number that satisfies the brief's "capped, not unbounded" instruction without a defensible reason to go tighter | R2 |
| A9 | `JWT_SECRET` has no default; boot fails via the existing `InvalidConfigError` path when unset, in every environment | Production-only conditional check | Developer decision: "env data is mandatory." Reuses the config module's existing fail-fast mechanism rather than adding new branching; matches how `MONGO_URL`/`MONGO_DB` already behave | R22 |
| A10 | A global, per-IP rate limit (`@fastify/rate-limit`) applies across the entire API, not just auth routes; no-ops under `NODE_ENV=test` | Auth-endpoint-only limiting; a hand-rolled limiter; leaving it active in tests | Developer decision: wants a global demonstration of rate-limiting awareness, not a narrow patch. Disabling it in tests avoids false failures in suites that fire many requests via `app.inject()` in quick succession | R23 |
| A11 | `POST /auth/logout` returns `204 No Content` | `200` with an empty body; `200` with `{ok: true}` | `204` is the more precise signal for "succeeded, nothing to return" and needs no response schema; the frontend only checks for success | R13 |

## Risk & Stress-Test Scenarios

### Forward — runtime failure scenarios

| Scenario | How the Design Handles It |
|----|----|
| Two concurrent signups, identical (normalized) email | Both attempt insert; the unique index rejects the loser with a driver duplicate-key error (`11000`), mapped to `409 EMAIL_TAKEN` — no `findByEmail`-based check-then-insert race exists (R11) |
| A tampered or expired JWT cookie | `app.authenticate`'s verify step fails → `401 UNAUTHENTICATED`, same route-level mapping pattern as every other domain error here |
| Mongo unreachable for 30s during login | `findByEmail`/insert throws a driver error uncaught by the auth-specific mapper → falls through to the global handler → `500 INTERNAL_ERROR`. No auth-specific retry or fallback is required by the brief; explicitly not a gap, just not this phase's job |
| `users` collection growing to 10M rows | The unique index on `email` keeps every lookup this phase performs O(log n); no full scans exist in the design |
| Rollback after a bad deploy | Net-new collection, no prior user data anywhere in the system — a plain deploy revert, zero data-loss risk |
| `JWT_SECRET` left empty at deploy time | Boot fails immediately via `InvalidConfigError` (A9) — the same mechanism that already covers `MONGO_URL`/`MONGO_DB`. No longer a gap |
| A client (or a misbehaving script) exceeds the global rate limit | `429 RATE_LIMITED` with `Retry-After`, no route-specific bypass — including on `/auth/*` (A10) |

### Backward — regression risk per touched area

| Touched area | What could regress | How we'd know / mitigation |
|----|----|----|
| `apps/backend/src/app.ts` (autoload, unedited) | `indexes.ts` assumes a live `db` decoration; the existing `health.test.ts` build path uses `skipMongoPlugin`/injected stubs — if `indexes.ts` runs unconditionally at boot in that path, tests that build the app without a real Mongo could fail | Verify `indexes.ts` behaves correctly (or is skippable) under the same test-injection seam `mongo.ts` already provides; run the full existing suite as part of this phase's "done when" |
| `components/shell/UserSlot.tsx` | Visual/shell regression if `Topbar`/`NavSlot` assumed the empty-return shape elsewhere | Grepped — no other consumer; both render it unconditionally already |
| `apps/backend/package.json` | A version conflict between the four new deps and existing ones (`fastify@5`, `zod@3.23`) | `npm install` + full typecheck/test suite as part of "done when"; `@fastify/jwt`/`@fastify/cookie`/`@fastify/rate-limit` are official Fastify-5-compatible plugins, low likelihood |
| `apps/backend/src/config/index.ts` | Any test or local setup that relied on `JWT_SECRET`'s empty-string default now fails to boot without an explicit value | Grepped: nothing in the existing suite constructs `buildConfig`/`Env` without a full env object (only `mongo.ts`'s test seam bypasses env parsing entirely via injected `db`/`client`) — low risk, but `test/support/db.ts` and any new auth tests must set `JWT_SECRET` explicitly in their test env |
| Global rate limit | Existing `test/api/health.test.ts` and `test/api/pricing-preview.test.ts` fire many requests via `app.inject()` in a single run | No-op under `NODE_ENV=test` (A10) — verify by running the full existing suite unmodified as part of this phase's "done when" |

## Open Questions

None outstanding. The three items raised during this session were resolved directly by the
developer and are captured in the Architecture Decisions Log:

- `JWT_SECRET` mandatory in every environment → **A9**
- Global (not auth-specific) rate limiting → **A10**
- `POST /auth/logout` response shape → **A11** (`204 No Content`)

## Out of Scope

- Password reset / email verification flows (reason: explicit brief guardrail — unstated requirement, not this phase)
- Roles or permission levels (reason: explicit brief guardrail — single-tenant-per-user model only)
- Endpoint-specific rate limiting (e.g., a tighter cap on `/auth/login` alone to blunt credential stuffing more aggressively than the global cap) (reason: only a single global cap is in scope this phase, per developer decision A10; a stricter auth-specific tier is a reasonable follow-up if brute-force testing surfaces the need)
- Session revocation / server-side session store (reason: stateless JWT with a fixed 7-day expiry is what the brief freezes; no logout-everywhere or revoke-on-password-change requirement stated)
- Document routes, any UI beyond sign-in/create-account/sign-out (reason: explicit Lane 2-A/2-B guardrails — Phase 3 territory)
- Per-client IP accuracy for the global rate limiter (reason: found during PR #10 review — `apps/frontend/next.config.ts`'s same-origin `rewrites()` proxy, which this design relies on for cookie handling, never forwards the true client IP to the backend; every user in the Compose topology shares one bucket. Verified against the installed Next.js version's bundled proxy implementation, which only sets `x-forwarded-host`. Fixing this needs either patching Next's bundled proxy code or a real reverse proxy in front of both services — both are infra changes beyond this phase; see the comment in `api/plugins/rate-limit.ts`. Developer decision, 2026-08-13: document and defer, since the 1000 req/min cap is generous enough that shared bucketing rarely bites in practice)

---

# Tasks

Tasks live in a sibling file, not inline — see `specs/architecture/ARCH-3-auth-ownership-tasks.md`
(same convention as issue #1's `ARCH-1-skeleton-lane-briefs.md` / `ARCH-1-tasks.md` pair).
