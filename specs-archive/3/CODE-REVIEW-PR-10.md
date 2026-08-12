# Review Report

## Metadata

| Field | Value |
|-------|-------|
| **Review Mode** | PR #10 |
| **Target** | https://github.com/farealahmed/multiprice/pull/10 |
| **Date** | 2026-08-13 08:56 |
| **Tech Stack** | TypeScript; Fastify 5 + MongoDB; Next.js 15 + React 19; Vitest; Cypress |
| **Checks Run** | Code Quality, Test Coverage, Security, Error Handling, Config & Dependencies, TypeScript Strictness, Runtime Behavior, Async Patterns, React Patterns, Database Patterns, Migration, Accessibility |
| **Checks Skipped** | Performance — no complex hot-path work beyond covered auth/database operations; Documentation — no public API-doc convention found and migration check covers deployment-facing documentation; Express Patterns — Fastify project |
| **Files Changed** | 58 |
| **Lines Changed** | +4992 / -11 |

## Review Process

- [x] Preflight checks passed
- [x] Diff gathered (58 files, 5003 lines)
- [x] Tech stack detected: TypeScript, Fastify 5, MongoDB, Next.js 15, React 19, Vitest, Cypress
- [x] Context read (no CLAUDE.md; PR description and commit summary read)
- [x] Triage proposed and developer confirmed
- [x] 12 checks dispatched: Code Quality, Test Coverage, Security, Error Handling, Config & Dependencies, TypeScript Strictness, Runtime Behavior, Async Patterns, React Patterns, Database Patterns, Migration, Accessibility
- [x] Results collected and deduplicated
- [x] Report compiled
- [x] Verdict determined
- [x] Report saved to specs/reviews/

## Verdict: ❌ REQUEST CHANGES

The PR establishes a sound baseline: HttpOnly JWT cookies, argon2id password handling, normalized-email uniqueness, opt-in authentication, and ownership-scoped query filters are all implemented with strong test coverage. However, it introduces a publicly known JWT signing credential, breaks the clean-clone Compose startup contract, and makes normal logout fail on its intentional `204` response. Fix the must-fix items before merge; the remaining findings cover redirect safety, correct failure classification, and behavioral regression coverage.

### Finding Counts

| Category | 🔴 | 🟠 | 🟡 | 💭 | ⚠️ |
|----------|-----|-----|-----|-----|-----|
| Code Quality | 0 | 0 | 2 | 0 | 0 |
| Test Coverage | 0 | 0 | 3 | 0 | 0 |
| Security | 0 | 0 | 1 | 0 | 0 |
| Error Handling | 0 | 0 | 3 | 0 | 0 |
| Config & Dependencies | 1 | 2 | 0 | 0 | 0 |
| TypeScript Strictness | 0 | 0 | 0 | 0 | 0 |
| Runtime Behavior | 0 | 1 | 0 | 0 | 0 |
| Async Patterns | 0 | 0 | 1 | 2 | 0 |
| React Patterns | 0 | 0 | 0 | 0 | 0 |
| Database Patterns | 0 | 0 | 2 | 1 | 0 |
| Migration | 0 | 0 | 0 | 0 | 0 |
| Accessibility | 0 | 0 | 0 | 0 | 0 |
| **Total** | **1** | **3** | **12** | **3** | **0** |

## Config & Dependencies

| # | Severity | Finding | Evidence and impact |
|---|----------|---------|---------------------|
| F-01 | 🔴 Critical | Public JWT placeholder is accepted as a signing secret | `.env.example:11` sets `JWT_SECRET=replace-with-a-generated-secret`, while `apps/backend/src/config/index.ts:19` accepts every non-empty value. Copying the documented template creates a production JWT key known to every repository reader, allowing forged cookies with an attacker-selected `sub`. Leave the sample value unset/commented and require a generated value, or explicitly reject the sentinel. |
| F-02 | 🟠 High | Clean-clone Compose boot is broken by mandatory `JWT_SECRET` | `compose.yml:27` still defaults an absent secret to `""`; the new `z.string().min(1)` at `apps/backend/src/config/index.ts:19` then aborts the backend. Existing project documentation promises bare `docker compose up` works on a clean clone. Require and document a generated local `.env` before that command, or provide a safe non-public local-development provisioning path. |
| F-03 | 🟠 High | Global per-IP limiting resolves all proxied users to the frontend | `apps/backend/src/api/plugins/rate-limit.ts:12-34` keys limits by Fastify's default `request.ip`; `buildApp` does not configure `trustProxy`. In Compose, requests reach the backend through the Next frontend rewrite, so users share the frontend service address and a single 1,000-request bucket. Configure an explicit trusted-proxy policy and forward the original client address before applying the global IP limiter. |

**Coverage:** added package versions are Fastify-5-compatible and lockfile-coherent. The explicit architectural choice of one coarse global limiter, rather than an endpoint-specific credential limiter, is not reported as a missing feature.

## Runtime Behavior

| # | Severity | Finding | Evidence and impact |
|---|----------|---------|---------------------|
| F-04 | 🟠 High | Successful logout is always treated as an internal client failure | `apps/backend/src/api/routes/auth.ts` returns `204 No Content`; `apps/frontend/src/lib/api/auth.ts:18-20` calls `apiFetch<void>`, whose success path at `apps/frontend/src/lib/api/client.ts:30-33` always parses JSON. Parsing the empty body throws `ApiError(INTERNAL_ERROR)`, so `SessionProvider.signOut()` never clears client state and `UserSlot` never redirects. Support no-content successes before JSON parsing. |

**Coverage:** plugin lifecycle and ordinary Fastify/Next runtime paths were otherwise sound. The logout defect is also the central React and async-path failure, recorded once here.

## Security

| # | Severity | Finding | Evidence and impact |
|---|----------|---------|---------------------|
| F-05 | 🟡 Medium | Return URL validation permits slash-backslash open redirect | `apps/frontend/src/components/forms/AuthForm.tsx:46-49` accepts any value starting with `/` except `//`, then passes it to `router.replace` at line 76. `/%5Cevil.example` decodes to `/\\evil.example`, passes that predicate, and URL normalization resolves it as `http://evil.example/`. Resolve the candidate against the app origin and require the same origin; add encoded-backslash regression coverage. |

**Coverage:** JWT validation, HttpOnly/SameSite cookie settings, argon2id use, email normalization, generic credential errors, dummy-hash timing work, protected endpoints, and ownership filter application passed static review.

## Error Handling

| # | Severity | Finding | Evidence and impact |
|---|----------|---------|---------------------|
| F-06 | 🟡 Medium | Database failures in `/auth/me` are misreported as unauthenticated | `apps/backend/src/persistence/users.repository.ts:30-36` catches both `new ObjectId(id)` and the awaited `findOne`. A Mongo timeout or disconnect therefore becomes `null`, and `/auth/me` returns `401 UNAUTHENTICATED` instead of the server error path. Catch only invalid `ObjectId` construction; allow query failures to propagate. |
| F-07 | 🟡 Medium | Session hydration signs users out on every API failure | `apps/frontend/src/lib/auth/session-context.tsx:27-43` converts every rejected `me()` call—not only `401 UNAUTHENTICATED`—to `signed-out`. Network and backend failures therefore redirect users with a valid cookie to sign-in. Classify unauthenticated errors specifically and retain/report a recoverable error state for other failures. |
| F-08 | 🟡 Medium | Failed sign-out requests become unhandled rejections | `apps/frontend/src/components/shell/UserSlot.tsx:19-32` invokes `void handleSignOut()` and has no `catch`; a network/server rejection from `signOut()` escapes the click handler. Handle the rejection and expose a retryable state rather than only re-enabling the button. |

## Database Patterns

| # | Severity | Finding | Evidence and impact |
|---|----------|---------|---------------------|
| F-09 | 🟡 Medium | Ownership helper permits ownership transfer through updates | `apps/backend/src/persistence/repository.ts:15-16` scopes the update filter but accepts an unrestricted `UpdateFilter<T>`. A caller can match an owner-A document then `$set` its `ownerId` to owner-B (or unset/rename it), undermining the foundational invariant. Exclude owner-field mutations from the update API or validate/rewrite them before passing the update to MongoDB. |
| F-10 | 🟡 Medium | Signup returns a creation time different from the persisted user | `apps/backend/src/services/auth.ts:60-64` persists one `new Date()`, but lines 73-78 construct the returned `User` with another. `/auth/me` can therefore return a different `createdAt` for the same account. Allocate once and reuse it for persistence and `SessionUser`. |
| F-11 | 💭 Low | Failed test teardown can leak a Mongo client | `apps/backend/test/support/db.ts:64-67` closes the client only after `dropDatabase()` succeeds. Put the close in `finally` so failure paths do not retain an integration-test connection pool. |

## Code Quality

| # | Severity | Finding | Evidence and impact |
|---|----------|---------|---------------------|
| F-12 | 🟡 Medium | Changing auth tabs loses the intended protected destination | An auth redirect such as `/sign-in?returnTo=/documents/123` reaches `apps/frontend/src/app/(auth)/sign-in/page.tsx:16`; the Create account link is the bare `/create-account`, so the query is dropped. The registration flow then defaults to `/editor`, violating attempted-path preservation. Carry the validated `returnTo` to the sibling tab link. |
| F-13 | 🟡 Medium | A form submission can overwrite later navigation | `apps/frontend/src/components/forms/AuthForm.tsx:72-86` neither aborts nor invalidates its request when the user switches auth tabs. A late success can still call `setAuthenticated` and `router.replace`, overriding the new page. Abort or ignore stale submissions during unmount/navigation. |

## Async Patterns

| # | Severity | Finding | Evidence and impact |
|---|----------|---------|---------------------|
| F-14 | 💭 Low | A transient dummy-hash failure is cached permanently | `apps/backend/src/services/auth.ts:45-49` retains a rejected `argon2.hash` promise in `dummyHashPromise`. Every later unknown-email login then reuses the rejection rather than retrying after recovery. Clear the cache on rejection before rethrowing. |

## Test Coverage

| # | Severity | Finding | Evidence and impact |
|---|----------|---------|---------------------|
| F-15 | 🟡 Medium | Production Secure-cookie branch lacks an assertion | `apps/backend/test/api/auth.test.ts:113-136` forces test mode and asserts HttpOnly/SameSite, but never exercises production's `secure: isProduction` branch. Add a production-mode signup/login assertion for `Secure`. |
| F-16 | 🟡 Medium | Successful sign-in handoff is not tested | `apps/frontend/src/components/forms/AuthForm.test.tsx:78-94` covers validation and rejected calls, while E2E covers only signup. Add a successful login test asserting submitted input, `setAuthenticated(sessionUser)`, and `router.replace` of the selected destination. |
| F-17 | 🟡 Medium | Return-to preservation through account switching has no regression test | `e2e/auth.cy.ts:27-44` verifies a default editor redirect but not a non-default attempted path carried through the sign-in/create-account tabs. Add that path, including a query string, to catch F-12 and F-05-class validation regressions. |

## TypeScript Strictness

No patch-introduced `any`, unsafe assertions, non-null assertions, `ts-ignore`, or generic-boundary defect with a provable runtime impact was found.

## React Patterns

No additional React/Next finding remains after deduplicating the logout response-contract defect (F-04), auth-tab destination loss (F-12), stale submission (F-13), and session failure classification (F-07).

## Migration

No separate finding after deduplicating the clean-clone deployment regression (F-02). The new auth endpoints are additive and the cookie contract is documented; rollout requires a non-public generated `JWT_SECRET` before boot.

## Accessibility

No patch-introduced accessibility defect met the reporting threshold. The new UI uses native form controls and landmarks, associates labels/errors, announces form-level errors, and retains visible keyboard focus.

## Manual Checks Required

- [ ] With a generated, non-public `JWT_SECRET`, exercise the production Compose topology: sign up, sign out, then revisit a protected route. Confirm the browser cannot access the HttpOnly cookie and that `Secure` is set.
- [ ] Verify the trusted-proxy configuration against the actual deployment ingress. Confirm distinct browser clients produce distinct rate-limit keys without allowing a client-controlled forwarded-IP header.
- [ ] Run the full backend/frontend suites and the auth Cypress flow after fixes; this static review did not execute them.

## Prioritized Action Items

### Must Fix (🔴 Critical / 🟠 High)
1. F-01 — reject the repository-public JWT placeholder; never accept a known signing key.
2. F-02 — restore a documented, secure clean-clone startup path with a generated secret.
3. F-03 — configure trusted proxy/IP forwarding before enforcing a global per-IP limiter.
4. F-04 — handle `204 No Content` in the frontend logout path.

### Should Address (🟡 Medium)
1. F-05 — make post-auth redirects same-origin only.
2. F-06 through F-10 — preserve backend failures, session state correctness, ownership invariants, and timestamp consistency.
3. F-12 and F-13 — preserve `returnTo` across tabs and prevent stale submissions from navigating users.
4. F-15 through F-17 — cover production cookie attributes, successful sign-in, and non-default return destinations.

### Nice to Have (💭 Low)
1. F-11 — always close test Mongo clients during teardown.
2. F-14 — clear a rejected dummy-hash promise to allow recovery.

---
*Generated by Review — 2026-08-13 08:56*
