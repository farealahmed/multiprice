# Tasks: Authentication and ownership

> **Date:** 2026-08-13
> **Issue:** #3
> **Phase:** 3 of 5 (Task Generation)
> **Architecture:** `specs/architecture/ARCH-3-auth-ownership.md` — read that document first; every task below is a slice of its Change Footprint and traces to its Inferred Requirements (R1–R23) and Architecture Decisions Log (A1–A11).

## Execution Plan

```
T1 (contract) ──┬──► T4 (service) ──► T5 (routes) ──┐
T2a (repo base) ┤                                    │
T2b (boot infra)┤                                    │
T3 (test harness)┤──► T6 (backend verification) ─────┤──► T9 (join)
                 │                                    │
                 └──► T7 (frontend client) ──► T8 (auth UI) ┘
```

| Wave | Runs | Terminals | Depends on |
|---|---|---|---|
| 1 | T1 · T2a · T2b · T3 | 4 | — |
| 2 | T4 · T7 · T6 | 3 | Wave 1 |
| 3 | T5 · T8 | 2 | Wave 2 |
| 4 | T9 — join | 1 | Wave 3 |

**Why four terminals can run wave 1 without stepping on each other:** T1 (`contracts/auth.ts`,
`lib/api/types/auth.ts`, `docs/contracts/phase-2.md`), T2a (`persistence/repository.ts`), T2b
(`api/plugins/indexes.ts`, `api/plugins/rate-limit.ts`, `config/index.ts`, `.env.example`,
`package.json`), and T3 (`test/support/db.ts`) touch four disjoint file sets — none imports code
another lane in the same wave is writing. `git commit -m "..." -- <paths>` (pathspec, never
`git add -A`) keeps the shared index safe per `docs/parallel-execution.md`.

**Why T6 is a separate lane from T5:** T6 owns `test/integration/users.test.ts` and
`test/api/auth.test.ts` — files T5 never touches. T6 writes those tests against T1's frozen
contract in wave 2, before T5's routes exist; they run red until T5 lands in wave 3, green at
join. This mirrors Phase 3's `3-B validation & isolation tests` lane and the `test-engineer` role
already defined in `.claude/agents/`.

**Note on scope beyond the original brief:** T2b and (per T6's third scenario group) the
rate-limit test file are not itemized as their own entries in ARCH's Change Footprint table —
they cover the developer's mandatory-`JWT_SECRET` (A9) and global-rate-limit (A10) decisions,
made after the ARCH doc's first draft. Confirmed with the developer before writing this file.

---

## Task T1: Auth contract, frontend mirror, and contract docs

> **Status:** done
> **Verification:** tdd
> **Effort:** m
> **Priority:** critical
> **Depends on:** None
> **Satisfies REQs:** R2, R3, R8, R9
> **Footprint slice:** New: `apps/backend/src/contracts/auth.ts`, `apps/frontend/src/lib/api/types/auth.ts`, `docs/contracts/phase-2.md`

### Description

Freezes the wire representation every other task builds against: `SignupInput`, `LoginInput`,
`SessionUser`, and this domain's error codes (`EMAIL_TAKEN`, `INVALID_CREDENTIALS`,
`UNAUTHENTICATED`, `PASSWORD_TOO_SHORT`, `EMAIL_INVALID`). Mirrors the shape to the frontend by
hand (Phase 0's mirroring rule) and writes the human-readable contract snapshot. Nothing here
touches persistence, hashing, or routes — this task is the gate every wave-2 task depends on for
types alone.

### Test Plan

#### Test File(s)
- `apps/backend/src/contracts/auth.test.ts` (colocated, following `contracts/pricing.test.ts`'s
  pattern)

#### Test Scenarios

##### Schema acceptance

- **accepts a valid SignupInput/LoginInput at each boundary** — GIVEN password length 12
  (minimum) and 128 (cap) WHEN parsed THEN both succeed _(verifies R2, A8)_
- **accepts a well-formed email in any case** — GIVEN `Test@Example.com` WHEN parsed THEN it
  succeeds (normalization itself is R9, owned by T4 — this schema test only confirms the shape
  is accepted, not that it's stored lowercased)

##### Schema rejection

- **rejects a password under 12 characters** — GIVEN an 11-character password WHEN parsed THEN
  rejected with `PASSWORD_TOO_SHORT` _(verifies R2)_
- **rejects a password over the 128-character cap** — GIVEN a 129-character password WHEN
  parsed THEN rejected (shape constraint) _(verifies A8)_
- **rejects a malformed email** — GIVEN `not-an-email` WHEN parsed THEN rejected with
  `EMAIL_INVALID` _(verifies R2, R3)_

##### Shape guarantees

- **SessionUser has no password field** — GIVEN the `sessionUser` schema/type WHEN inspected
  THEN it has exactly `id`, `email`, `createdAt` — no `passwordHash`, structurally, not just by
  convention _(verifies R3's "hash never leaves the repository layer" at the type level)_

### Implementation Notes

- **Module(s):** `apps/backend/src/contracts/auth.ts` (Module Boundaries: zod-only dependency);
  `apps/frontend/src/lib/api/types/auth.ts` (hand mirror, header comment naming the backend file
  it mirrors, per Phase 0 §6)
- **Pattern reference:** `contracts/pricing.ts` for the schema+codes-in-one-file shape;
  `docs/contracts/phase-1.md` for the human-readable snapshot's structure
- **Key decisions:** A8 (128-char password cap)
- **Libraries:** zod
- **High-risk callouts:** none — this task is pure type/schema definition with no runtime side
  effects

---

## Task T2a: Ownership-scoped repository base helper

> **Status:** done
> **Verification:** tdd
> **Effort:** s
> **Priority:** critical
> **Depends on:** None
> **Satisfies REQs:** R1, R5
> **Footprint slice:** New: `apps/backend/src/persistence/repository.ts`
> **High-risk areas touched:** `persistence/repository.ts` (new pattern) (M risk, ARCH Areas of Impact) — foundational for every collection from Phase 3 onward; a design mistake here propagates rather than staying local

### Description

The base helper every future ownership-scoped repository builds on (starting with Phase 3's
`documents.repository.ts` — nothing in Phase 2 itself consumes it, since `users.repository.ts`
is deliberately hand-written per ARCH Decision A4). A functional factory over a `Collection<T>`
that requires `ownerId` as the first argument to every read/write method and merges it into the
Mongo filter, so an unscoped call is a missing argument, not a runtime leak.

### Test Plan

#### Test File(s)
- `apps/backend/src/persistence/repository.test.ts` (colocated)

#### Test Scenarios

##### Scoping behavior

- **findOne merges ownerId into the filter** — GIVEN a fake `Collection` and a call
  `findOne('owner-1', {status: 'draft'})` WHEN executed THEN the underlying `findOne` is called
  with `{status: 'draft', ownerId: 'owner-1'}` _(verifies R5)_
- **find merges ownerId into the filter** — same shape, for `find` _(verifies R5)_
- **insertOne stamps ownerId onto the document** — GIVEN `insertOne('owner-1', {title: 'x'})`
  WHEN executed THEN the inserted document includes `ownerId: 'owner-1'` _(verifies R5)_
- **updateOne and deleteOne merge ownerId into the filter** — same shape as `findOne`/`find`
  _(verifies R5)_
- **two different ownerIds never collide** — GIVEN the same base filter WHEN called with
  `'owner-1'` and `'owner-2'` THEN the two resulting filters differ only in `ownerId` _(verifies
  R1)_

### Implementation Notes

- **Module(s):** `apps/backend/src/persistence/repository.ts` (Module Boundaries: `mongodb`
  types only — no domain knowledge)
- **Pattern reference:** none in this codebase yet — this file sets the pattern. Functional style
  matches `mongo.ts`/`src/pricing`'s "no classes" idiom (ARCH Decision A3)
- **Key decisions:** A3 (functional factory, not a class), A4 (`users.repository.ts` explicitly
  does *not* build on this — do not "fix" that in a later task)
- **Libraries:** `mongodb` (types only; test against a hand-rolled fake, not a real connection —
  this task has no dependency on T3's harness)
- **High-risk callouts:** this is the foundation Phase 3 inherits; keep the method surface
  minimal (`findOne`, `find`, `insertOne`, `updateOne`, `deleteOne`) rather than anticipating
  Phase 3 needs not yet specified

---

## Task T2b: Boot infra — index bootstrap, rate limiting, mandatory secret

> **Status:** done
> **Verification:** test-after
> **Effort:** m
> **Priority:** critical
> **Depends on:** None
> **Satisfies REQs:** R6, R22, R23
> **Footprint slice:** New: `apps/backend/src/api/plugins/indexes.ts`, `apps/backend/src/api/plugins/rate-limit.ts`; Modified: `apps/backend/src/config/index.ts`, `.env.example`, `apps/backend/package.json`
> **High-risk areas touched:** Deployment/build pipeline (M risk, ARCH Areas of Impact) — `JWT_SECRET` becomes required in every environment; Global rate limit (L–M risk) — applies to every route including ones outside this phase

### Description

Three independent hardening pieces bundled into one task because none of them depend on each
other or on anything else in wave 1, and each is too small to justify its own lane: the
idempotent `users.email` unique-index bootstrap (the mechanism that closes the concurrent-signup
race), a global per-IP rate limit across the whole API, and the `JWT_SECRET` config amendment
that makes an empty secret a boot-time failure instead of a silent footgun. This task also adds
the three new backend dependencies to `package.json` (`argon2`, `@fastify/cookie`, `@fastify/jwt`
are consumed by T4/T5; `@fastify/rate-limit` is consumed here).

### Test Plan

#### Test File(s)
- `apps/backend/src/config/index.test.ts` (colocated — new, first test for this file)
- `apps/backend/src/api/plugins/rate-limit.test.ts` (colocated)
- Index bootstrap has no isolated unit test — verified indirectly by T6's duplicate-key
  integration test, which only passes if the index actually exists at boot

#### Test Scenarios

##### Config — mandatory JWT_SECRET (A9)

- **boots with a valid JWT_SECRET** — GIVEN a full valid env WHEN `buildConfig` runs THEN it
  succeeds _(verifies R22)_
- **fails boot when JWT_SECRET is empty or missing** — GIVEN env with `JWT_SECRET: ''` or absent
  WHEN `buildConfig` runs THEN it throws `InvalidConfigError`, in every `NODE_ENV` value tested
  (`development`, `test`, `production`) _(verifies R22, A9)_
- **COOKIE_NAME keeps its default** — GIVEN env without `COOKIE_NAME` WHEN `buildConfig` runs
  THEN it defaults to `mp_session` (regression guard — confirms the amendment didn't
  accidentally tighten the non-secret var too)

##### Rate limit (A10)

- **returns 429 past the cap** — GIVEN a built app with the plugin registered and an injected
  "active" mode WHEN requests exceed the configured cap from one IP THEN the next response is
  `429` with body `{error: {code: 'RATE_LIMITED', ...}}` and a `Retry-After` header _(verifies
  R23)_
- **no-ops under test mode** — GIVEN the plugin built with an injected test-mode flag (not a
  global `process.env` read — inject it so both branches are testable without mutating global
  state) WHEN the same request volume is sent THEN no `429` is ever returned _(verifies A10;
  regression guard for T6 and the existing `health`/`pricing-preview` suites, which must not trip
  the limiter)_

##### Index bootstrap (verified via T6, noted here for traceability)

- **`users.email` unique index exists after boot** — proven by T6's "duplicate email rejected by
  the index" integration test, not duplicated here _(verifies R6)_

### Implementation Notes

- **Module(s):** `apps/backend/src/api/plugins/indexes.ts`, `apps/backend/src/api/plugins/rate-limit.ts` (both `fp`-wrapped, autoloaded — Phase 0 §5.2/§5.3), `apps/backend/src/config/index.ts`
- **Pattern reference:** `api/plugins/error-handler.ts` — the `fp`-wrapping pattern-by-example
- **Key decisions:** A9 (mandatory secret, every environment), A10 (global rate limit, no-op in
  test — inject the mode rather than reading `process.env.NODE_ENV` inline, so both branches are
  unit-testable)
- **Libraries:** `@fastify/rate-limit`
- **High-risk callouts:** this task's config change is a real behavior change for local dev —
  `npm run dev-api` now fails to boot without a `JWT_SECRET` in `.env`. `.env.example` must carry
  a clear instruction, not just a blank line, or the next `git clone` looks broken with no
  explanation

---

## Task T3: Integration test harness

> **Status:** done
> **Verification:** test-after
> **Effort:** m
> **Priority:** critical
> **Depends on:** None
> **Satisfies REQs:** R7
> **Footprint slice:** New: `apps/backend/test/support/db.ts`

### Description

Connects to the existing `compose.dev.yml` Mongo instance and hands each test file its own
uniquely-named database, so tests can run with real Mongo semantics (real duplicate-key errors,
real index behavior) without colliding with each other or requiring Testcontainers (ARCH Decision
A6 — not in G2's original dependency list). Every Phase 3+ integration test reuses this file
unmodified.

### Test Plan

#### Test File(s)
- `apps/backend/test/support/db.test.ts` — the brief's own "smoke test that the harness connects
  and cleans up"

#### Test Scenarios

- **connects to the configured Mongo instance** — GIVEN `MONGO_URL` from env WHEN the harness
  connects THEN the connection succeeds _(verifies R7)_
- **hands out a uniquely-named database per test file** — GIVEN two calls to the harness's setup
  function WHEN compared THEN their database names differ _(verifies R7 — per-test isolation)_
- **teardown drops the database** — GIVEN a harness instance with data written WHEN teardown runs
  THEN the database no longer exists (or is empty, whichever the implementation guarantees) —
  confirmed by attempting to list its collections afterward

### Implementation Notes

- **Module(s):** `apps/backend/test/support/db.ts`
- **Pattern reference:** none existing — first integration-test infra in the repo
- **Key decisions:** A6 (reuse `compose.dev.yml` Mongo, unique db name per file, not
  Testcontainers)
- **Libraries:** `mongodb` (already a dependency, no new install)
- **High-risk callouts:** none directly, but T6 has a hard runtime dependency on this file being
  correct — a flaky teardown here surfaces as flaky tests two tasks away, not locally

---

## Task T4: User domain, repository, and auth service

> **Status:** done
> **Verification:** tdd
> **Effort:** l
> **Priority:** critical
> **Depends on:** T1
> **Satisfies REQs:** R9, R10, R11, R12, R4
> **Footprint slice:** New: `apps/backend/src/domain/user.ts`, `apps/backend/src/persistence/users.repository.ts`, `apps/backend/src/services/auth.ts`

### Description

The core business logic: password hashing/verification (argon2id, library defaults), the
`users` collection's own repository (unscoped — a user is not owned by another user, ARCH
Decision A4), and the service layer that ties them together plus issues the session JWT. This is
the most security-sensitive task in the phase — the dummy-hash timing defense and the
duplicate-key-to-`EMAIL_TAKEN` mapping both live here.

### Test Plan

#### Test File(s)
- `apps/backend/src/services/auth.test.ts` (colocated)
- `apps/backend/src/persistence/users.repository.test.ts` (colocated)

#### Test Scenarios

##### Repository

- **create() stores a normalized, lowercased+trimmed email** — GIVEN `' Test@Example.com '`
  WHEN stored THEN the persisted value is `'test@example.com'` _(verifies R9)_
- **create() on a duplicate (normalized) email surfaces the driver's duplicate-key error** —
  GIVEN two inserts with the same normalized email, called directly at the repository level
  (bypassing the service) WHEN the second runs THEN it throws the raw Mongo `11000` error — this
  test requires a real Mongo connection via T3's harness, not a fake _(verifies R11, R6 — this is
  the proof the index does its job)_
- **findByEmail is case/whitespace-insensitive** — GIVEN a stored `'test@example.com'` WHEN
  queried with `'Test@Example.com'` THEN it matches _(verifies R9)_

##### Service — signup

- **signup() hashes with argon2id and never returns the hash** — GIVEN valid input WHEN signup
  succeeds THEN the returned `SessionUser` has no `passwordHash`/hash-shaped field anywhere
  _(verifies R10)_
- **signup() maps a duplicate-key error to EMAIL_TAKEN** — GIVEN the repository throws a
  duplicate-key error WHEN signup catches it THEN it re-throws `{code: 'EMAIL_TAKEN'}` _(verifies
  R11)_

##### Service — login

- **login() with the correct password succeeds** — GIVEN a stored user and the right password
  WHEN login runs THEN it returns `{user, token}` _(verifies R10)_
- **login() with the wrong password throws INVALID_CREDENTIALS** — GIVEN a stored user and a
  wrong password WHEN login runs THEN it throws `{code: 'INVALID_CREDENTIALS'}` _(verifies R12)_
- **login() with an unknown email throws the identical INVALID_CREDENTIALS** — GIVEN no matching
  user WHEN login runs THEN it throws the same `{code: 'INVALID_CREDENTIALS'}` shape as the
  wrong-password case — assert the two error objects are indistinguishable by shape _(verifies
  R12)_
- **login() does comparable work on both failure paths** — GIVEN a spy/timer around the
  argon2 verify call WHEN comparing the unknown-email path and the wrong-password path THEN both
  invoke a verify call (the unknown-email path against the fixed dummy hash, not a fast-path
  return) — assert the call happened, not that timing is statistically indistinguishable (that's
  not reliably assertable in a unit test) _(verifies A5)_

##### Token issuance

- **issued JWT payload is exactly {sub, iat, exp}** — GIVEN a successful signup or login WHEN the
  token is decoded THEN its payload has no `email`, no `role`, only `sub`/`iat`/`exp` _(verifies
  R4)_

### Implementation Notes

- **Module(s):** `apps/backend/src/domain/user.ts` (Module Boundaries: imports nothing, mirrors
  `src/pricing`'s domain-type discipline), `persistence/users.repository.ts` (hand-written, not
  built on `createOwnedRepository`), `services/auth.ts` (`argon2`, token signing, both
  repositories' errors)
- **Pattern reference:** `services/pricing-preview.ts` for the service-layer shape
- **Key decisions:** A4 (users repository doesn't use the T2a base helper), A5 (dummy-hash
  timing defense), A8 (128-char cap, enforced upstream by T1's schema — this task doesn't
  re-validate it)
- **Libraries:** `argon2`, `@fastify/jwt`'s sign function (via the app instance in T5's route
  layer, or a standalone `jsonwebtoken`-equivalent call here — implementer's call on whether
  token signing lives in the service or the route; either is fine as long as the service doesn't
  import Fastify types)
- **High-risk callouts:** the dummy-hash constant must be a real, precomputed argon2 hash (not a
  placeholder string) or the "equal work" property silently breaks — verify by timing manually
  once, even though the unit test can't assert wall-clock equality reliably

---

## Task T5: Auth HTTP routes and authenticate preHandler

> **Status:** done
> **Verification:** tdd
> **Effort:** m
> **Priority:** critical
> **Depends on:** T4, T1
> **Satisfies REQs:** R11, R12, R13, R14, R15
> **Footprint slice:** New: `apps/backend/src/api/routes/auth.ts`, `apps/backend/src/api/plugins/authenticate.ts`
> **High-risk areas touched:** none new — reuses the route-level error-mapping pattern `engine-errors.ts` already established (ARCH Decision A1)

### Description

Wires T4's service onto four HTTP endpoints and provides the `app.authenticate` decorator every
protected route from Phase 3 onward attaches explicitly. Domain errors are caught and mapped to
their status codes inline, mirroring `api/errors/engine-errors.ts` — the global error handler is
never touched and stays the 500 fallback.

### Test Plan

#### Test File(s)
- Route-level behavior is covered by T6's `test/api/auth.test.ts` (separate verification lane,
  per the Execution Plan) — this task's own test file covers only the `authenticate` decorator in
  isolation, since T6 needs the routes to already exist to test them end-to-end

- `apps/backend/src/api/plugins/authenticate.test.ts` (colocated)

#### Test Scenarios

##### authenticate preHandler (isolated)

- **decorates request.userId on a valid token** — GIVEN a request with a valid session cookie
  WHEN `app.authenticate` runs THEN `request.userId` equals the token's `sub` _(verifies R15)_
- **rejects a missing cookie** — GIVEN no cookie WHEN `app.authenticate` runs THEN it responds
  `401 UNAUTHENTICATED` _(verifies R14, R15)_
- **rejects a tampered/invalid token** — GIVEN a cookie with a corrupted signature WHEN
  `app.authenticate` runs THEN it responds `401 UNAUTHENTICATED` _(verifies R15)_
- **does not apply to routes that don't attach it** — GIVEN `POST /auth/signup` (no
  `preHandler: app.authenticate`) WHEN called without any cookie THEN it is not rejected for lack
  of a session — this is the regression guard against A2 (the decorator must stay opt-in, never
  a global hook) _(verifies A2)_

##### Route wiring (smoke-level only — full matrix is T6's)

- **signup sets the session cookie with the correct attributes** — GIVEN a successful signup WHEN
  the response is inspected THEN `Set-Cookie` has `HttpOnly`, `SameSite=Lax`, name matches
  `COOKIE_NAME` _(verifies R4)_
- **logout clears the cookie with matching attributes** — GIVEN a logout call WHEN the response
  is inspected THEN the cookie is cleared with the same `HttpOnly`/`SameSite`/name it was set
  with, and the route returns `204` _(verifies R13, A11)_

### Implementation Notes

- **Module(s):** `apps/backend/src/api/routes/auth.ts` (Module Boundaries: `contracts/auth.ts`,
  `services/auth.ts`), `apps/backend/src/api/plugins/authenticate.ts` (`fp`-wrapped, decorates
  rather than hooks globally)
- **Pattern reference:** `api/routes/pricing.ts` + `api/errors/engine-errors.ts` for the
  local-catch-and-map shape
- **Key decisions:** A1 (route-level error mapping, not a global-handler amendment), A2
  (`authenticate.ts` decorates, doesn't hook globally), A11 (`logout` → `204`)
- **Libraries:** `@fastify/jwt`, `@fastify/cookie`
- **High-risk callouts:** cookie attributes on `logout`'s clear call must byte-for-byte match
  what `signup`/`login` set, or some browsers keep the cookie — this is exactly the failure mode
  R13 calls out

---

## Task T6: Backend verification lane — integration and API tests

> **Status:** done
> **Verification:** tdd
> **Effort:** l
> **Priority:** critical
> **Depends on:** T1, T3
> **Satisfies REQs:** R6, R9, R11, R12, R13, R14, R23
> **Footprint slice:** New: `apps/backend/test/integration/users.test.ts`, `apps/backend/test/api/auth.test.ts`, `apps/backend/test/api/rate-limit.test.ts` (suggested addition, confirmed with developer)

### Description

Writes the comprehensive test suite against T1's frozen contract, independently of T4/T5's
implementation — this lane starts in wave 2, alongside T4, and its tests run red until T5 lands
in wave 3. It never edits `api/routes/`, `services/`, or `persistence/`; it only asserts against
their observable behavior through `app.inject()` and the real test-database harness from T3. This
is the "different lane doing verification" the developer asked for, mirroring Phase 3's `3-B`.

### Test Plan

#### Test File(s)
- `apps/backend/test/integration/users.test.ts`
- `apps/backend/test/api/auth.test.ts`
- `apps/backend/test/api/rate-limit.test.ts` (suggested addition — not itemized in ARCH's
  Change Footprint, covers A10; confirmed with developer before including it)

#### Test Scenarios

##### Integration — index-level (bypasses the service, hits the repository directly)

- **duplicate email rejected by the index, not application logic** — GIVEN two inserts with the
  same normalized email at the repository level WHEN the second runs THEN it throws the driver's
  `11000` duplicate-key error — proves `api/plugins/indexes.ts` actually created the index at
  boot _(verifies R6, R11)_
- **email normalization is enforced at storage time** — GIVEN `'  A@X.com  '` and `'a@x.com'`
  inserted as two separate signups WHEN the second runs THEN it collides with the first
  (normalized to the same value) _(verifies R9)_

##### API — signup

- **signup → cookie set → me returns the user** — full happy path, three chained requests
  _(verifies R11, R14)_
- **signup with a taken email returns 409 EMAIL_TAKEN** _(verifies R11)_
- **signup with a short password returns 400 PASSWORD_TOO_SHORT with a field path** _(verifies
  R2, R3 — traced back to T1's contract)_

##### API — login

- **login with the right password succeeds and sets a cookie** _(verifies R10, R12)_
- **login with the wrong password returns 401 INVALID_CREDENTIALS** _(verifies R12)_
- **login with an unknown email returns 401 INVALID_CREDENTIALS with the identical code and
  body shape as the wrong-password case** — byte-for-byte comparison of the two error bodies
  _(verifies R12 — this is the scored requirement's actual test)_

##### API — me / logout

- **me without a cookie returns 401 UNAUTHENTICATED** _(verifies R14)_
- **me with a tampered token returns 401 UNAUTHENTICATED** _(verifies R14, R15)_
- **logout then me returns 401** — proves the cookie was actually cleared, not just that logout
  returned success _(verifies R13)_

##### Rate limit (suggested addition, covers A10)

- **exceeding the global cap returns 429 RATE_LIMITED** — GIVEN more requests than the configured
  cap from one client WHEN the cap is exceeded THEN the next response is `429` with the envelope
  shape and a `Retry-After` header _(verifies R23)_
- **the rate limit does not fire during this suite's normal run** — implicit regression guard:
  if T2b's no-op-under-test wiring is wrong, every other test in this file becomes flaky, which
  is itself the signal

### Implementation Notes

- **Module(s):** none owned — this lane only reads `contracts/auth.ts`, calls the running app via
  `app.inject()`, and uses `test/support/db.ts`
- **Pattern reference:** `test/api/pricing-preview.test.ts` for the API-test shape;
  `docs/phases/phase-2-issue-3.md`'s own "Tests" section for Lane 2-A, which lists this exact
  scenario set almost verbatim
- **Key decisions:** none made here — this lane enforces T1–T5's decisions, it doesn't make new
  ones
- **Libraries:** `vitest`, the app's own `inject()`, `test/support/db.ts`
- **High-risk callouts:** this lane's tests are expected to be **red** for most of wave 2 (T5
  doesn't exist yet) — that's by design, not a bug to fix. Do not adjust the tests to match an
  incomplete implementation; the contract (T1) and the brief's own test list are the authority

---

## Task T7: Frontend auth client and session context

> **Status:** done
> **Verification:** tdd
> **Effort:** m
> **Priority:** critical
> **Depends on:** T1
> **Satisfies REQs:** R17, R20
> **Footprint slice:** New: `apps/frontend/src/lib/api/auth.ts`, `apps/frontend/src/lib/auth/**`

### Description

The typed client (`signup`/`login`/`logout`/`me`) through the existing `apiFetch`, plus the
session context, `useSession()` hook, and the route guard that Phase 3+'s protected pages will
also rely on indirectly (via `(app)/layout.tsx`, built in T8). This task owns all the
behavior-with-real-logic the brief calls out; T8 is markup and layout consuming this.

### Test Plan

#### Test File(s)
- `apps/frontend/src/lib/api/auth.test.ts` (colocated, following `lib/api/pricing.test.ts`)
- `apps/frontend/src/lib/auth/session-context.test.tsx` (or equivalent — colocated with whatever
  file holds the context/hook)
- `apps/frontend/src/lib/auth/guard.test.tsx` (colocated with the guard component)

#### Test Scenarios

##### Client

- **signup/login/logout/me call the correct endpoints with credentials included** — GIVEN each
  function is called WHEN inspected THEN each request includes `credentials: 'include'` (already
  the default in `apiFetch`, but assert it's not bypassed) _(verifies R17, R20)_
- **a server error maps to the typed ApiError** — GIVEN a mocked 409 EMAIL_TAKEN response WHEN
  `signup()` rejects THEN the caught error has `code === 'EMAIL_TAKEN'` _(verifies R18 — sets up
  T8's field-mapping)_

##### Session context / useSession()

- **pending is distinct from signed-out** — GIVEN the hook mounts WHEN `me` hasn't resolved yet
  THEN the state is `pending`, not `signed-out` _(verifies R17 — the anti-flicker requirement)_
- **hydrates from me on mount** — GIVEN a valid session cookie WHEN the hook mounts THEN it
  resolves to `authenticated` with the `SessionUser` _(verifies R17)_
- **resolves to signed-out on a 401 from me** — GIVEN no valid session WHEN `me` rejects with
  `UNAUTHENTICATED` THEN the state resolves to `signed-out`, not stuck in `pending` _(verifies
  R17)_

##### Guard

- **redirects an unauthenticated visitor to sign-in, preserving the attempted path** — GIVEN
  `signed-out` state and a request for `/editor` WHEN the guard renders THEN it redirects to
  sign-in with the attempted path retained for post-login return _(verifies R17)_
- **renders children once resolved authenticated** — GIVEN `authenticated` state WHEN the guard
  renders THEN it renders its children, not a redirect _(verifies R17)_
- **does not redirect while pending** — GIVEN `pending` state WHEN the guard renders THEN it
  shows neither the redirect nor the protected content prematurely (a loading state, or nothing)
  — this is the flicker guard from the brief _(verifies R17)_

### Implementation Notes

- **Module(s):** `apps/frontend/src/lib/api/auth.ts` (Module Boundaries: `lib/api/client.ts`
  read-only, `lib/api/types/auth.ts`), `lib/auth/**` (context, hook, guard — React only)
- **Pattern reference:** `lib/api/pricing.ts` for the client shape
- **Key decisions:** none new — implements R17/R20 as specified
- **Libraries:** React only (no new frontend dependency)
- **High-risk callouts:** never read or write `document.cookie` anywhere in this task — the
  session state comes entirely from calling `me`, never from inspecting the cookie client-side
  (R20)

---

## Task T8: Auth UI and shell sign-out

> **Status:** done
> **Verification:** ui
> **Effort:** l
> **Priority:** high
> **Depends on:** T7
> **Satisfies REQs:** R16, R18, R19
> **Footprint slice:** New: `apps/frontend/src/app/(auth)/**`, `apps/frontend/src/components/forms/**`, `apps/frontend/src/app/(app)/layout.tsx`; Modified: `apps/frontend/src/components/shell/UserSlot.tsx`
> **High-risk areas touched:** `components/shell/UserSlot.tsx` (L risk, ARCH Areas of Impact, ownership amendment) — first content in a previously-empty stub; Frontend route structure (L–M risk) — first `layout.tsx` below root

### Description

Sign-in and create-account pages built from `design/htmls/index.html`'s split layout, using
shared form primitives Phase 3 reuses; the `(app)/layout.tsx` guard wraps the existing `editor`
route for the first time; `UserSlot.tsx` gets its sign-out button. All logic (validation
triggers, error-to-field mapping, guard behavior) lives in T7 — this task is markup, layout, and
wiring T7's pieces into visible UI.

### Verification Checklist

#### Human-verified (screenshots or a live walkthrough)

- [ ] Sign-in page matches `design/htmls/index.html`'s split layout (brand aside + form) at
      desktop and mobile widths
- [ ] Create-account page uses the same split layout and the same form primitives as sign-in
- [ ] `EMAIL_TAKEN` on create-account visually attaches to the email field (inline, at that
      input)
- [ ] `INVALID_CREDENTIALS` on sign-in renders as a form-level message, not attached to either
      field
- [ ] Visiting `/editor` while signed out redirects to sign-in; signing in then returns to
      `/editor`, not to a default landing page
- [ ] `UserSlot` shows a sign-out control when authenticated; clicking it returns to sign-in
- [ ] No flash of the sign-in page for an already-authenticated user reloading `/editor`

#### Component tests (the testable seams within this UI work)

- **client-side validation blocks submit below 12 characters** — GIVEN a password under 12
  chars WHEN submit is attempted THEN no request fires and an inline message appears _(verifies
  R18)_
- **client-side validation blocks a malformed email before any request** — same shape _(verifies
  R18)_
- **EMAIL_TAKEN from the server (via T7's client) renders on the email field** — GIVEN a mocked
  `ApiError{code: 'EMAIL_TAKEN'}` WHEN the form catches it THEN the email field shows the
  message, no other field does _(verifies R18)_
- **INVALID_CREDENTIALS renders at form level, not on a field** — GIVEN a mocked
  `ApiError{code: 'INVALID_CREDENTIALS'}` WHEN the sign-in form catches it THEN the message
  appears outside any field's error slot _(verifies R18)_
- **UserSlot sign-out calls logout, clears context, redirects** — GIVEN an authenticated session
  WHEN sign-out is clicked THEN `logout()` is called, the session context resolves to
  `signed-out`, and the app redirects to sign-in _(verifies R19)_

#### Regression guard

- `Topbar`/`NavSlot` still render correctly with `UserSlot` filled in (previously always
  rendered an empty component — grepped, no consumer assumed emptiness, per ARCH)
- `(app)/editor` still renders identically for an authenticated session now that it sits behind
  the new layout guard — no visual or behavioral change from before this phase

### Implementation Notes

- **Module(s):** `app/(auth)/**`, `components/forms/**`, `app/(app)/layout.tsx`,
  `components/shell/UserSlot.tsx`
- **Pattern reference:** `app/(app)/editor/page.tsx` for the client-component shape;
  `design/htmls/index.html` for markup/layout (illustration, not authority — data shapes and
  rules come from the contract, per `.claude/agents/frontend-engineer.md`)
- **Key decisions:** the `UserSlot.tsx` amendment (ARCH Change Footprint note) — this task is the
  one that exercises it
- **Libraries:** none new
- **High-risk callouts:** design tokens come from `src/styles/tokens.css` only — do not
  re-derive colors from the mockup's own CSS or hardcode a hex, per the frontend-engineer
  charter

---

## Task T9: Join J2

> **Status:** done
> **Verification:** checklist
> **Effort:** m
> **Priority:** critical
> **Depends on:** T1, T2a, T2b, T3, T4, T5, T6, T7, T8
> **Satisfies REQs:** R21
> **Footprint slice:** New: `e2e/auth.cy.ts`

### Verification Checklist

- [ ] `npm test` (root) — both apps' full suites green, including T6's now-passing tests
- [ ] `docker compose up --build` boots clean with `JWT_SECRET` set in the environment (A9 — this
      is now a required step, not optional)
- [ ] `e2e/auth.cy.ts` passes: sign up → land in the protected app → sign out → attempt the
      protected route directly → redirected to sign-in
- [ ] Devtools: the session cookie is `HttpOnly`, absent from `document.cookie` (R20)
- [ ] `apps/frontend/src/components/shell/nav-items.ts` is unchanged — this phase adds no new
      nav destination (`/editor` was already listed); confirm rather than assume
- [ ] `docs/contracts/phase-2.md` (from T1) matches landed behavior — spot-check against T5's
      actual responses
- [ ] Commit `chore(J2): join phase 2`

### Implementation Notes

- **Pattern reference:** `e2e/pricing-preview.cy.js` for the Cypress happy-path shape
- **High-risk callouts:** this is the first point every prior task's work runs together against
  a real, containerized stack — the M-risk deployment item (`JWT_SECRET` mandatory) and the
  rate-limit no-op-in-test wiring are exactly the two things most likely to surface here rather
  than in any single task's own tests
