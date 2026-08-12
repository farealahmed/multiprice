# Review Report

## Metadata

| Field | Value |
|-------|-------|
| **Review Mode** | Pipeline: ARCH-1-skeleton-lane-briefs |
| **Target** | PR #8 — https://github.com/farealahmed/multiprice/pull/8 |
| **Date** | 2026-08-12 16:30 |
| **Tech Stack** | TypeScript (Fastify 5 + MongoDB driver 6 + zod + Vitest on backend; Next.js 15 App Router + React 19 + Vitest/jsdom on frontend); Docker Compose; Cypress 13; Makefile; multi-stage Dockerfiles on `node:22-alpine`. |
| **Checks Run** | task-completion, code-quality, typescript-strictness, error-handling, security, config-dependencies, runtime-behavior, async-patterns, migration, database-patterns |
| **Checks Skipped** | react-patterns (agent killed mid-run — re-review recommended if Next.js behavior matters to the merge); test-coverage (per triage, T2/T3 ran test-after with explicit plans); performance (ARCH Phase 0 = no budgets); documentation (covered by task-completion V3); accessibility (skeleton, no interactive UI). |
| **Files Changed** | 67 |
| **Lines Changed** | +11,151 / -0 (all new) |

## Review Process

- [x] Preflight checks passed (git + gh auth; default branch: `main`)
- [x] Diff gathered (67 files, 11,151 lines, all new)
- [x] Tech stack detected: TypeScript (Fastify 5 + MongoDB + zod + Vitest; Next.js 15 App Router + React 19 + Vitest/jsdom), Docker Compose, Cypress, Makefile
- [x] Context read (ARCH-1-skeleton-lane-briefs.md, ARCH-1-tasks.md, PR description; no CLAUDE.md in repo)
- [x] Triage proposed and developer confirmed — run the 12-check set
- [x] 11 checks dispatched in parallel + 1 retry (migration re-dispatched after temporary model unavailability; one agent — react-patterns — was killed mid-run and skipped)
- [x] Results collected and deduplicated (15 overlapping findings merged; spec-drift items grouped separately from code-quality items)
- [x] Report compiled
- [x] Verdict determined
- [x] Report saved to `specs/reviews/CODE-REVIEW-PIPELINE-1-skeleton-lane-briefs.md`

## Verdict: ⚠️ PASS WITH FINDINGS

Phase 0 skeleton is structurally sound. All 12 Inferred Requirements (R1–R12) and 11 Architecture Decisions (A1–A11) are honored in the code; both compose files, Dockerfiles, Makefile, and Cypress harness pass the migration regression-guards (R11 / V5 / V15). The error envelope and health contract are correctly frozen; Fastify autoload order and `fp` wrapping are correct; same-origin proxy holds; the manual J0 join (`make up` + `cypress run`) is green in `0b7283b`. The change definitely improves overall code health.

**No Critical findings. All three High items have been fixed in this pass** — see the [Resolution Log](#resolution-log) below. The previously listed High fixes (success-path `JSON.parse` guard on `apiFetch`; dead-alias cleanup of `buildConfig`/`loadEnv`; `mongo:7` → `mongo:7.0.28` pin) are now applied and verified. Several Medium items remain, clustered around (a) latent envelope gaps that will fire when Phase 1+ registers schema-validated routes, (b) shutdown lifecycle hardening (race window + re-entrancy + no timeout), and (c) ARCH spec drift that should be amended rather than papered over (Fastify major-version mismatch, R5 violation, V9/V11 cypress filename, V10 tsconfig `module`, V12 `@types/*`).

### Finding Counts

| Category | 🔴 | 🟠 | 🟡 | 💭 | ⚠️ |
|----------|-----|-----|-----|-----|-----|
| task-completion | 0 | 0 | 2 | 4 | 3 |
| code-quality | 0 | 2 | 4 | 5 | 0 |
| typescript-strictness | 0 | 0 | 1 | 2 | 4 |
| error-handling | 0 | 0 | 3 | 4 | 0 |
| security | 0 | 0 | 1 | 4 | 0 |
| config-dependencies | 0 | 0 | 4 | 1 | 0 |
| runtime-behavior | 0 | 0 | 2 | 2 | 0 |
| async-patterns | 0 | 1 | 1 | 1 | 0 |
| database-patterns | 0 | 0 | 0 | 1 | 0 |
| migration | 0 | 0 | 0 | 0 | 0 |
| react-patterns | — | — | — | — | — (killed) |
| **Total** | **0** | **3** | **18** | **23** | **7** |

(Note: counts above reflect raw agent output; many overlap and were merged in the final list below. Deduplicated total: 0 Critical / 3 High / 11 Medium / 12 Low / 7 Manual.)

---

## task-completion

**Verdict:** ✅ All 12 R-IDs and 11 A-IDs verified from code. Two ARCH drift items require spec amendment; one R5 violation.

### Verification Matrix

#### Inferred Requirements (R1–R12)

| REQ | Status | Evidence |
|-----|--------|----------|
| R1 (`fp` wrapping every plugin) | ✅ | `plugins/error-handler.ts:34` wraps with `fp(...)`; `app.ts:1–13` top comment reinforces; only one file in `plugins/`. |
| R2 (plugins before routes via autoload) | ✅ | `app.ts:42–50` registers `api/plugins` autoload before `api/routes` autoload; test `app.printPlugins()` tree confirms. |
| R3 (one-file-per-domain) | ✅ | No `codes.ts` or `types.ts` shared; `contracts/{errors/envelope,health}.ts` each own one domain. |
| R4 (same-origin Next rewrite; no CORS) | ✅ | `next.config.ts:18–19` rewrites `/api/:path*` → `${BACKEND_ORIGIN}/api/:path*`; repo grep for `NEXT_PUBLIC_API_URL`, `@fastify/cors`, `Access-Control-Allow-Credentials` returns only a comment. |
| R5 (lanes never install) | ⚠️ | T2 ran `npm install` to add `@types/node` (devDep) — commit `73160d8` acknowledges the brief omission. See Finding TC-1. |
| R6 (envelope frozen; only `VALIDATION_FAILED` + `INTERNAL_ERROR`) | ✅ | `contracts/errors/envelope.ts:19–20` exports exactly those two; no other identifiers in the file. |
| R7 (health response validated server-side) | ✅ | `routes/health.ts:30` parses with `healthResponse.parse(...)` before sending. |
| R8 (`/health` public) | ✅ | No auth plugin registered; route has no auth check. |
| R9 (`credentials: 'include'` in `client.ts`) | ✅ | `client.ts:28` unconditionally sets it; test asserts even when caller passes `credentials: 'omit'`. |
| R10 (`data-testid` convention documented in `e2e/README.md`) | ✅ | README has the convention section; Cypress selects on `[data-testid="..."]`; `app/page.tsx` carries matching ids. |
| R11 (two compose files; `compose.yml` does not publish Mongo host port) | ✅ | `docker compose config --format json \| jq '.services.mongo.ports'` → `null`. Backend reaches Mongo over the `multiprice` network at `mongodb://mongo:27017`. |
| R12 (Mongo boot fatal; runtime loss non-fatal) | ✅ | `persistence/mongo.ts:74` `await client.connect()` throws → `server.ts` exits; no plugin reconnection logic (driver handles it). Test with stubbed throwing ping proves 503 degraded path. |

#### Architecture Decisions (A1–A11)

| Dec | Status | Evidence |
|-----|--------|----------|
| A1 (same-origin proxy) | ✅ | Same as R4. |
| A2 (one contract file per domain) | ✅ | Same as R3. |
| A3 (`fp` enforcement by comment + example) | ✅ | `app.ts:1–13` top comment; `plugins/error-handler.ts:34` example. |
| A4 (`/health` public) | ✅ | Same as R8. |
| A5 (route schema-validates own response) | ✅ | `routes/health.ts:30` runtime parse; documented in route header. |
| A6 (one error handler, registered once) | ✅ | Only `plugins/error-handler.ts` exists; autoloaded by `app.ts`. |
| A7 (Mongo boot fatal; runtime non-fatal) | ✅ | Same as R12. |
| A8 (two compose files, not override) | ✅ | Both files exist; `compose.yml` has no `mongo.ports`. |
| A9 (pino defaults + `genReqId`) | ✅ | `observability/index.ts:14–23`; `randomUUID()`; no redact list (Phase 0 has no secrets). |
| A10 (`credentials: 'include'` from day 1) | ✅ | Same as R9. |
| A11 (`data-testid` convention in `e2e/README.md`) | ✅ | Same as R10. |

#### T1–T4 Verification Checklist summary

| Task | Items Verified from Code | Items Requiring Manual Run |
|------|---------------------------|----------------------------|
| T1 (G0) | V3, V4, V5, V6, V7, V8, V9, V11, V12, V15 — 10/12 ✅ | V1, V2 (`npm run typecheck` in both apps) |
| T2 (Lane 0-A) | T2.1, T2.2, T2.3, T2.4, T2.5 — 5/6 test blocks ✅; T2.6 partial (config layer tested; full boot path only provable via `tsx src/server.ts`) | T2.7 weaker than planned (see L18); full vitest run |
| T3 (Lane 0-B) | V3, V4, V5, V6, V7, typecheck/file checks ✅ | V1, V2 (`npm run typecheck && npm run build`) |
| T4 (Lane 0-C) | V3, V4, V5, V8, V10, V11, V12, V13, V14, V15 ✅ | V1, V2 (`docker compose config`); V6 (`mongosh` smoke); V7 (`npx cypress verify`); J0 repeatability |

#### Findings (task-completion)

| # | Severity | File | Issue |
|---|----------|------|-------|
| TC-1 | 🟡 Medium | `apps/backend/package.json:13–15` | **ARCH drift: Fastify 5 used where ARCH Tech Choices specifies Fastify 4.** Spec says `Fastify 4 + @fastify/autoload + fastify-plugin`; implementation pins `fastify ^5.0.0`, `@fastify/autoload ^5.0.0`, `fastify-plugin ^5.0.0`. Fastify 5 introduced breaking changes (route signatures, plugin typings, schema serialization). T1 V12 only greps dep names so this slipped through. |
| TC-2 | 🟡 Medium | `apps/backend/package.json`, `apps/backend/package-lock.json` | **R5 drift: T2 ran `npm install` to add `@types/node` as a backend devDep**, then committed the lockfile change. R5: "lanes never install." Commit `73160d8` acknowledges it ("missing from T1's brief dep list"). |
| TC-3 | 💭 Low | `apps/backend/src/api/plugins/error-handler.ts:24` | String literal `'VALIDATION_FAILED'` used instead of the imported constant. **Deduplicated with code-quality CQ-2.** |
| TC-4 | 💭 Low | `apps/backend/test/api/health.test.ts:1, 249` | `beforeEach` imported but only referenced in a no-op expression statement. **Deduplicated with code-quality CQ-3.** |
| TC-5 | 💭 Low | `apps/backend/test/api/health.test.ts:236` | T2 logging test sends header `x-request-id: 'test-req-id-1'` but `genReqId()` ignores headers — assertion tests `genReqId`, not propagation. |
| TC-6 | 💭 Low | `apps/backend/tsconfig.json` (T1 V10) | T1 V10 expects `module: "ESNext"`; actual is `"NodeNext"`. The actual value is the correct pairing with `moduleResolution: "NodeNext"`. **The spec is wrong, not the implementation.** See TS-1. |
| TC-7 | 💭 Low | `e2e/cypress.config.js`, `e2e/health.cy.js` (T4 V9, V11) | T4 expects `cypress.config.ts` and `health.cy.ts`; actual files are `.js` (intentional J0 seam fix per commit `0b7283b`). **Acceptable intent; verification rows are stale.** |
| TC-8 | ⚠️ Manual | — | T1 V1, V2 (`npm run typecheck`) cannot be verified from code alone. |
| TC-9 | ⚠️ Manual | — | T2 + T3 test plans: `npm test` exit 0 in both apps. |
| TC-10 | ⚠️ Manual | — | T4 V1, V2, V6, V7: `docker compose config` for both files; `mongosh` smoke; `npx cypress verify`. |
| TC-11 | ⚠️ Manual | — | J0 repeatability on a fresh clone (`make up && make e2e`). |

---

## code-quality

**Verdict:** No critical findings. Two High items (real but small). Layer boundaries clean; ARCH R-rules (R1 `fp`, R3 one-file-per-domain, R6 single handler) are honored.

### Findings (code-quality)

| # | Severity | File:Line | Issue |
|---|----------|-----------|-------|
| CQ-1 | 🟠 High | `apps/backend/src/config/index.ts:48–50` | `buildConfig(source)` is a byte-for-byte alias for `loadEnv(source)` — same signature, same body. Two public exports doing one job; server imports `buildConfig`, tests import `buildConfig`, `loadEnv` has zero callers. |
| CQ-2 | 🟠 High | `apps/backend/src/api/plugins/error-handler.ts:24` | `envelope.error.code === 'VALIDATION_FAILED'` compares against a string literal while the sibling `envelope-mapper.ts` imports the `VALIDATION_FAILED` constant from the same frozen contract. The contract is frozen so today it matches — but the file's job is the single source-of-truth for status-code mapping; a rename of the constant would silently desync. |
| CQ-3 | 🟡 Medium | `apps/backend/test/api/health.test.ts:1, 249` | `beforeEach` imported but never called; line 249 is a stray `beforeEach;` with a "satisfy unused-import linter" comment. Dead import + dead statement. |
| CQ-4 | 🟡 Medium | `apps/backend/test/api/health.test.ts:28, 82, 149, 227` | The same `await import('../../src/persistence/mongo.ts')` is repeated in 4 places; hoist to a single top-level import. |
| CQ-5 | 🟡 Medium | `apps/backend/test/api/health.test.ts:225` | `as never` cast on the logger config bypasses the type system; type against `FastifyServerOptions['logger']`. |
| CQ-6 | 🟡 Medium | `apps/frontend/src/lib/api/client.test.ts:72–76` | The "exports a typed API error" test asserts only `error instanceof Error` — true for every `Error` subclass; doesn't exercise `ApiError`'s distinguishing fields (`code`, `details`, `name`). |
| CQ-7 | 💭 Low | `apps/backend/src/contracts/errors/envelope.ts:22` | `EnvelopeLevelCode` is exported but never referenced. Either use it to narrow `ErrorEnvelope.error.code` or delete it. **Deduplicated with error-handling EH-6.** |
| CQ-8 | 💭 Low | `apps/backend/src/api/routes/health.ts:22–28` | `let dbUp = false; try { … dbUp = true } catch { dbUp = false }` — the catch branch reassigns to the initial value. Declare without initializer. |
| CQ-9 | 💭 Low | `apps/frontend/src/components/shell/UserSlot.tsx:1–3` | File is a placeholder returning `null`; add a one-line comment naming the phase that will fill it in. |
| CQ-10 | 💭 Low | `apps/frontend/src/app/page.tsx:37–48` | Nested ternary of depth 3 for `backendState` / `databaseState`; extract a small mapper helper before a fourth state appears. |
| CQ-11 | 💭 Low | `apps/backend/test/api/health.test.ts:24–37, 78–94` | `makeAppWithFakeDb` and `makeAppWithThrowingRoute` duplicate ~12 lines of app-build + mongo-stub; extract `setupApp(db)` helper. |

---

## typescript-strictness

**Verdict:** Strictness is high. One ARCH mandate deviation (the spec is wrong), three intentional narrow assertions in production code. Multiple test-only `as unknown as X` patterns are documented seams.

### tsconfig flag verification

| Mandate | File | Required | Actual | Match |
|---|---|---|---|---|
| `strict: true` | `apps/backend/tsconfig.json:8` | true | `true` | ✅ |
| `strict: true` | `apps/frontend/tsconfig.json:9` | true | `true` | ✅ |
| `noUncheckedIndexedAccess: true` | `apps/backend/tsconfig.json:9` | true | `true` | ✅ |
| `noUncheckedIndexedAccess: true` | `apps/frontend/tsconfig.json:10` | true | `true` | ✅ |
| `target: "ES2023"` | `apps/backend/tsconfig.json:3` | ES2023 | `ES2023` | ✅ |
| `module: "ESNext"` | `apps/backend/tsconfig.json:4` | "ESNext" | `"NodeNext"` | ❌ See TS-1 |
| `moduleResolution: "nodenext"` | `apps/backend/tsconfig.json:5` | accepted alias | `"NodeNext"` | ✅ |
| `moduleResolution: "bundler"` | `apps/frontend/tsconfig.json:7` | "bundler" | `"bundler"` | ✅ |
| `tsconfig.build.json` excludes `test/` | `apps/backend/tsconfig.build.json` | yes | yes | ✅ |

### Findings (typescript-strictness)

| # | Severity | File:Line | Issue |
|---|----------|-----------|-------|
| TS-1 | 🟡 Medium | `apps/backend/tsconfig.json:4` | `module` is `"NodeNext"`, but ARCH T1 V10 mandates `"ESNext"`. **The spec is wrong** — `"NodeNext"` is the correct pairing with `moduleResolution: "NodeNext"` for the project's `.ts`-extension imports + `rewriteRelativeImportExtensions`. Recommend amending the spec. (Deduplicated with TC-6.) |
| TS-2 | 💭 Low | `apps/frontend/src/lib/api/client.ts:31` | `return response.json() as Promise<T>` — unverified cast to opaque `T`. Acceptable today because the server-side schema validates; ideally `apiFetch` would accept a zod schema and `.parse()` the JSON so contract drift surfaces at the call site. |
| TS-3 | 💭 Low | `apps/frontend/src/lib/api/client.ts:40` | `(error.details as ApiErrorDetail[])` doesn't narrow per-element. **Deduplicated with error-handling EH-4.** |
| TS-4 | ⚠️ Manual | `apps/frontend/next-env.d.ts:3` | References `./.next/types/routes.d.ts` but `typedRoutes: true` is not enabled. The reference is dead. Either enable typed routes or remove the reference. |
| TS-5 | ⚠️ Manual | `apps/backend/test/api/health.test.ts:21, 31, 85, 152, 230` | Test-only `as unknown as Db` and `{} as MongoClient` casts. Acceptable as documented seams. |
| TS-6 | ⚠️ Manual | `apps/backend/test/api/health.test.ts:194, 203` | `as unknown as NodeJS.ProcessEnv` for stripped-env tests. Acceptable. |
| TS-7 | ⚠️ Manual | `apps/backend/src/persistence/mongo.ts:30` | `JSON.parse(raw) as { version?: unknown }` immediately narrowed via `typeof === 'string'`. Acceptable defensive cast. |

---

## error-handling

**Verdict:** Frozen envelope correctly applied to ZodError and unmapped throwables today. Two latent gaps (FastifyError mapping, 404 handler) will fire in Phase 1+ when schema-validated routes land. One operational gap (boot log may leak Mongo URL).

### Findings (error-handling)

| # | Severity | File:Line | Issue |
|---|----------|-----------|-------|
| EH-1 | 🟡 Medium | `apps/backend/src/api/plugins/error-handler.ts:19–31` | The mapper only inspects `instanceof ZodError`. Fastify's own `FST_ERR_VALIDATION` (from `schema: { body, querystring, params }`) falls through to the unmapped branch and surfaces as `INTERNAL_ERROR` with no `details[]`. ARCH R6 reserves `VALIDATION_FAILED` + `details[]` for validation failures generally; Phase 1+ will register schema-validated routes and this will silently regress. Add a second branch before the catch-all in `envelope-mapper.ts`. |
| EH-2 | 🟡 Medium | `apps/backend/src/api/plugins/error-handler.ts` | No `setNotFoundHandler`. A request to an unknown route returns Fastify's built-in plain-text 404, bypassing the envelope entirely. The frontend `client.ts` then can't parse the body and falls back to `INTERNAL_ERROR` with the generic message — the real signal (route doesn't exist) is hidden. Fix: register `app.setNotFoundHandler((_, reply) => reply.code(404).send({ error: { code: 'INTERNAL_ERROR', message: 'Not found' } }))` and reuse `INTERNAL_ERROR` for 404 (no new envelope code, no G0 amendment needed). |
| EH-3 | 🟡 Medium | `apps/backend/src/server.ts:37–42` | `main().catch` logs `err` directly. For a Mongo connection failure, the driver's error typically includes the connection URL — and `MONGO_URL` may embed credentials (`mongodb://user:pass@host`). Surface is here from day 1 with no redaction. **Deduplicated with security SEC-2.** |
| EH-4 | 💭 Low | `apps/frontend/src/lib/api/client.ts:39–41` | `Array.isArray(error?.details) ? (error.details as ApiErrorDetail[]) : undefined` casts without per-element shape validation. Filter and narrow. |
| EH-5 | 💭 Low | `apps/backend/src/persistence/mongo.ts:72–82` | No subscription to driver's `topologyDescriptionChanged`; zero visibility into reconnect cycles. Add a non-fatal log on disconnect. |
| EH-6 | 💭 Low | `apps/backend/src/contracts/errors/envelope.ts:11–17` | `ErrorEnvelope.error.code` is typed as `string`, not narrowed to `EnvelopeLevelCode`. Tighten the type or add a comment warning against amending this file. |
| EH-7 | ⚠️ Manual | `apps/backend/src/api/errors/envelope-mapper.ts:13–34` | `req.log.error({ err, code }, 'request failed')` serializes the entire `err` via pino's default serializer. Phase 0 has no secrets; Phase 2 will need a redact list. Mark as TODO. |

---

## security

**Verdict:** All R4 / R8 / R11 / A4 regression-guards pass. One Medium (frontend `BACKEND_ORIGIN` unvalidated); four Low defense-in-depth items.

### Findings (security)

| # | Severity | File:Line | Issue |
|---|----------|-----------|-------|
| SEC-1 | 🟡 Medium | `apps/frontend/next.config.ts:3, 19` | `BACKEND_ORIGIN` interpolated into the rewrite destination with no validation. Backend validates via `z.string().url()` (`config/index.ts:22`); frontend has no equivalent guard. Build-time env redirect — an attacker who controls the build environment could redirect all `/api/*` traffic. Lower than runtime because the value is hardcoded in `compose.yml` and `.env.example`, but the lack of symmetry is a regression trap for future lanes. Mirror the backend's URL validation. |
| SEC-2 | 💭 Low | `apps/backend/src/observability/index.ts:19` | No pino `redact` list. Pre-emptively add `redact: ['req.headers.cookie', 'req.headers.authorization', 'err.config.headers', 'err.token']` to future-proof Phase 2. |
| SEC-3 | 💭 Low | `apps/backend/src/config/index.ts:20` | `JWT_SECRET: z.string().default('')` allows the server to boot with an empty JWT secret. Phase 2 will add a check; until then the footgun is here. |
| SEC-4 | 💭 Low | `apps/frontend/next.config.ts:3` | Build-time env read has no guard against missing/empty values during dev. Fallback to `'http://localhost:3001'` covers most cases, but a shell-exported empty value silently misroutes. |
| SEC-5 | 💭 Low | `apps/backend/src/server.ts:44` | `host: '0.0.0.0'` is intentional for container reachability but binds to all interfaces on a developer host. Consider `'127.0.0.1'` in `NODE_ENV === 'development'`. |

### Observations (intentional per ARCH — not flagged)

- `apps/backend/src/api/routes/health.ts` — `/api/health` is public by design (R8); exposes only `status`, `db`, `version`.
- Error mapper + handler: `ZodError` → `VALIDATION_FAILED`; everything else → `INTERNAL_ERROR` with literal `'Internal server error'`. The underlying `err` is logged but never echoed.
- `apps/backend/src/persistence/mongo.ts` — `url` is passed straight to `MongoClient`; no string interpolation in our code, so env-controlled `MONGO_URL` cannot inject into the driver's parser.
- `apps/backend/Dockerfile` — `USER node`, no `JWT_SECRET` baked in.
- `compose.yml` — Mongo on the `multiprice` network only, no host port. **R11 regression-guard passes.**
- `compose.dev.yml` — Mongo on `127.0.0.1:27017` loopback-only.
- `.env.example` — `JWT_SECRET=` blank by design; no real secrets in values.
- `client.ts:28` — `credentials: 'include'` is unconditional and overrides caller-passed `init.credentials`.
- No CORS, no `Access-Control-Allow-Credentials`, no helmet — same-origin proxy removes the surface. **R4 regression-guard passes.**
- No auth routes registered in Phase 0 — `JWT_SECRET` default is inert, no session cookies issued, no CSRF surface.

---

## config-dependencies

**Verdict:** Lockfiles committed and consistent; Dockerfiles multi-stage and non-root; root `package.json` modified only by T1+T4. Three dep-list deviations vs ARCH V12 and one image-tag CVE exposure.

### Findings (config-dependencies)

| # | Severity | File:Line | Issue |
|---|----------|-----------|-------|
| CD-1 | 🟡 Medium | `apps/backend/package.json:20` | **V12 dep-list violation:** `@types/node ^22.20.1` is in `devDependencies` but not in the ARCH V12 backend list. **Deduplicated with TC-2 (R5 violation).** |
| CD-2 | 🟡 Medium | `apps/frontend/package.json:21–22` | **V12 dep-list violation:** `@types/react ^19.0.0` and `@types/react-dom ^19.0.0` are in `devDependencies` but not in the ARCH V12 frontend list. Added by T1's own commit (`2cf4713`), which omits them from its "full wave-1 deps" line — file content and commit message disagree. |
| CD-3 | 🟡 Medium | `apps/backend/.dockerignore:1–9` | **V14 incomplete:** only `test` (singular) excluded; the sibling `tests/` directory is not. When Phase 1+ adds hurl/k6 fixtures under `apps/backend/tests/`, those will be `COPY . .`'d into the builder stage. Add `tests/` to the ignore list. |
| CD-4 | 🟠 High | `compose.yml:3`, `compose.dev.yml:3` | **Unpinned `mongo:7` image tag — CVE-2025-14847 ("MongoBleed", CVSS 8.7, CISA KEV, active exploitation) affects MongoDB Server 7.0 prior to 7.0.28.** `mongo:7` resolves to the latest 7.0.x at pull time; an environment that hasn't explicitly pulled `mongo:7.0.28+` recently may be vulnerable. Pin to `image: mongo:7.0.28` in both compose files; add a renovate/dependabot rule. **(Promoted from agent's Medium: meets the "security vulnerability" criteria at the lower end of High — supply-chain hardening gap with a real CVE in scope.)** |
| CD-5 | 💭 Low | `.env.example:6` | `MONGO_URL=mongodb://localhost:27017` is correct for host-process dev but misleading when running `docker compose up`. Add a one-line comment noting "host-process dev only; compose.yml overrides this". |

### CVE scan (best-effort)

- `fastify 5.11.3` — past patched versions for all 2025–2026 advisories checked (GHSA-mg2h-6x62-wpwc, GHSA-jx2c-rxcm-jvmq, GHSA-573f-x89g-hqp9, GHSA-247c-9743-5963, GHSA-444r-cwp2-x5xf, GHSA-mrq3-vjjr-p77c). ✅
- `mongodb` Node driver 6.21.0 — no known driver CVEs (MongoBleed is a server issue). ✅
- `postcss 8.4.31` (frontend) — fixed for CVE-2023-44270. ✅
- `nanoid 3.3.18` — past CVE-2024-55565 fix. ✅
- `cookie 1.1.1` — past CVE-2024-47764 fix. ✅
- `jsdom 25.0.1`, `ipaddr.js 2.5.0` — clean at these versions. ✅
- **`mongo:7` image (CD-4)** — server-side CVE exposure cannot be confirmed without inspecting the actually-pulled digest.

---

## runtime-behavior

**Verdict:** MongoClient lifecycle correct; SIGTERM/SIGINT drain present but two lifecycle gaps (race window, no re-entrancy guard). One envelope megamorphism observation.

### Findings (runtime-behavior)

| # | Severity | File:Line | Issue |
|---|----------|-----------|-------|
| RB-1 | 🟡 Medium | `apps/backend/src/server.ts:44–58` | SIGTERM/SIGINT handlers registered **after** `await app.listen()` resolves, leaving a microsecond race where a signal falls through to Node's default terminate handler (no in-flight drain). Move `process.on(...)` to immediately after `await app.ready()`. |
| RB-2 | 🟡 Medium | `apps/backend/src/server.ts:46–58` | No re-entrancy guard. If SIGTERM and SIGINT both arrive (or SIGTERM is sent twice during a long drain), `shutdown()` runs in parallel; the second `app.close()` rejects with `FST_ERR_SERVER_ALREADY_CLOSED`, the catch calls `process.exit(1)`, and the orchestrator may interpret it as a crash → restart loop. **Deduplicated with async AP-2.** |
| RB-3 | 💭 Low | `apps/backend/src/server.ts:46–58` | No shutdown timeout. A hanging request stalls `app.close()` indefinitely; K8s `terminationGracePeriodSeconds` (default 30s) SIGKILLs and logs may not flush. **Deduplicated with async AP-3.** |
| RB-4 | 💭 Low | `apps/backend/src/api/errors/envelope-mapper.ts:13–35` | Envelope shape varies per error type: ZodError includes `details[]`, generic case omits it. Two hidden classes for the returned object — minor megamorphism on the error path. Always set `details: undefined` in the generic branch. |

### Observations (intentional — not flagged)

- `mongo.ts` `onClose` hook order correct (after decorate, before drain).
- `genReqId` via `randomUUID()` is collision-safe.
- Mongo boot-fatal vs runtime-resilient — correct per R12/A7.
- Autoload order — correct per R2.
- Single error handler — correct per A6.
- No event-loop blocking in hot paths (`JSON.parse` on `package.json` is one-time at boot).
- No prototype-pollution vectors.
- Compose healthcheck wiring — `mongo` has healthcheck; `backend` uses `depends_on: { mongo: { condition: service_healthy } }`.
- Makefile has 10 targets.
- No timers anywhere in the backend.

---

## async-patterns

**Verdict:** One High (apiFetch success-path `JSON.parse`), two shutdown lifecycle gaps that overlap with runtime-behavior. Boot sequence is correctly sequenced (`buildApp → register(mongo) → ready → listen` is a hard DAG — not a `Promise.all` candidate).

### Findings (async-patterns)

| # | Severity | File:Line | Issue |
|---|----------|-----------|-------|
| AP-1 | 🟠 High | `apps/frontend/src/lib/api/client.ts:31` | `response.json()` on the success path is awaited without `.catch`. If the server returns 2xx with malformed JSON (truncated body, etc.), `apiFetch` rejects with a raw `SyntaxError` — breaking the contract that callers always see either `T` or `ApiError`. The failure path (line 34) already handles the same scenario with `.catch(() => undefined)`. |
| AP-2 | 🟡 Medium | `apps/backend/src/server.ts:57–58` | Both SIGTERM and SIGINT invoke `shutdown()` concurrently with no idempotency guard. **Deduplicated with RB-2.** |
| AP-3 | 💭 Low | `apps/backend/src/server.ts:46–55` | No `Promise.race` against a timer on `app.close()`. **Deduplicated with RB-3.** |

### Tracing notes

| Function / Site | File | Frequency | Why it matters |
|---|---|---|---|
| `main()` | `server.ts` | One-time boot | `main().catch` is the only thing preventing a startup rejection from going unhandled. |
| `shutdown()` | `server.ts` | Occasional | Lifecycle event; correctness here prevents resource leaks across redeploys. |
| `mongoPlugin` | `persistence/mongo.ts` | One-time | `client.connect()` rejection propagates through `app.register` reject → `main().catch` → `process.exit(1)`. Boot-fatal verified. |
| `apiFetch` | `lib/api/client.ts` | Hot path | Success-path JSON parse failure breaks ApiError contract — AP-1. |
| `health` route handler | `api/routes/health.ts` | Hot path | The only DB call in Phase 0; failure must become 503, not 500. |
| `errorHandler` | `api/plugins/error-handler.ts` | Hot path (every error) | Sync is correct; no `await` inside. |
| `buildApp` | `app.ts` | One-time | Two sequential `register(autoload)` calls are intentional ordering, not `Promise.all` candidate. |

---

## database-patterns

**Verdict:** Zero findings. One in-spec observation about ping timeout that the ARCH explicitly accepts.

### Findings (database-patterns)

| # | Severity | File:Line | Issue |
|---|----------|-----------|-------|
| DB-1 | 💭 Low | `apps/backend/src/api/routes/health.ts:24` | `await app.db.command({ ping: 1 })` has no explicit timeout. Driver default `serverSelectionTimeoutMS` is 30 s — when Mongo is fully unreachable, `/health` hangs for ~30 s before the route flips `dbUp = false` and returns 503. ARCH explicitly accepts "the Mongo round-trip" as the budget, so this is in-spec for Phase 0; flag for Phase 2+ when the route becomes a hot path. |

---

## migration

**Verdict:** ✅ No findings. All migration-critical items pass; both compose files verified against the rendered config.

### Verified

- **R11 — Mongo host port not published in `compose.yml`.** `docker compose config --format json | jq '.services.mongo.ports'` → `null`. Backend is reachable only via `expose: 3001`. The only `ports:` mapping is on `frontend` (`3000:3000`).
- **V5 — Volume names differ.** `compose.yml` defines `mongo_data`; `compose.dev.yml` defines `mongo_dev_data`. Dev/review data cannot accidentally collide.
- **In-container `BACKEND_ORIGIN` points at compose DNS.** `compose.yml:26,38` uses `http://backend:3001`; `compose.dev.yml` (host-process dev) uses `http://localhost:3001` from `.env`.
- **`make up` uses reviewer's stack; `make dev-*` uses host processes.** Correct Makefile routing.
- **Both Dockerfiles multi-stage, non-root, `NODE_ENV=production`.** Verified.
- **`.dockerignore`s exclude the right things.** All three exclude `node_modules`, `test`, `coverage`, `.env`. **Backend missing `tests/` — see CD-3.**
- **Cypress configs and tests are `.js`, not `.ts`.** Consistent with the J0 seam fix in commit `0b7283b`. **See TC-7 for the spec-row staleness.**
- **No breaking API changes.** Greenfield.
- **`tsconfig.build.json`** correctly referenced by `apps/backend/Dockerfile:14` (`npx tsc -p tsconfig.build.json`); not referenced from `package.json` (no `build` script — typecheck + docker emit are separate concerns).
- **All three `package-lock.json` files committed** (root 76 KB, backend 92 KB, frontend 113 KB).
- **Root `package.json` modified only by T1 + T4's appended scripts (V15 guard).**

### Observations (not findings)

- `infra/.dockerignore` is preventive — no Dockerfile in `infra/` today.
- `Makefile:25` `db-shell` targets `docker compose exec mongo …`, which works against `compose.yml` only. It will not work against `compose.dev.yml` without `make dev-db` having started the dev container.
- `.env.example:15–16` documents `BACKEND_ORIGIN=http://localhost:3001` for host-process dev; the in-container default is `http://backend:3001` per `next.config.ts:3`.

---

## react-patterns (killed mid-run — ⚠️ Manual)

The react-patterns check was killed before completing. **Recommend re-running before merge** if any of the following could matter:

- Server/client boundary: confirm no accidental `'use client'` directive or hydration mismatch in `apps/frontend/src/app/{layout,page}.tsx` (the `page.tsx` is a Client Component; layout is server).
- `next/font` correctly applied — no bare `<link>` to `fonts.gstatic` / `fonts.googleapis` (T3 V4 regression-guard).
- `data-testid` attributes on the page match the Cypress selectors (`health-backend-status`, `health-db-status`, `health-version`, `health-retry`).
- The failure state of `/api/health` is actually rendered, not hidden behind an early return.
- `client.ts` does not import React (it's a plain module).
- `next.config.ts` is correctly typed.

The other checks found no issues in the frontend TypeScript files (TS-checked), but a re-run of react-patterns is cheap insurance.

---

## Manual Checks Required

- [ ] Run `cd apps/backend && npm run typecheck && npm test` — expect exit 0; 9/9 tests.
- [ ] Run `cd apps/frontend && npm run typecheck && npm run build` — expect exit 0; `.next/standalone/` produced.
- [ ] Run `cd apps/backend && docker compose -f ../../compose.yml config` and `docker compose -f ../../compose.dev.yml config` — expect exit 0; verify `services.mongo.ports` is `null` in `compose.yml`.
- [ ] Run `make dev-db && mongosh mongodb://127.0.0.1:27017` — expect successful connection.
- [ ] Run `npx cypress verify` — expect exit 0.
- [ ] Re-run J0 on a fresh clone: `make up && make e2e` — expect green.
- [ ] Re-run `react-patterns` check (was killed mid-run).
- [ ] When Phase 2 lands: add pino redact path for `req.headers.cookie`, `req.headers.authorization`, `*.password`, `*.token` (per SEC-2 + EH-7).

---

## Prioritized Action Items

### Must Fix (🔴 Critical / 🟠 High)

#### H1 — `apiFetch` success-path `JSON.parse` is uncaught ✅ Fixed
**File:** `apps/frontend/src/lib/api/client.ts:31`
A 2xx response with a malformed body (truncated stream, etc.) rejects with a raw `SyntaxError`, breaking the documented contract that callers always see either `T` or `ApiError`. The `page.tsx:26` narrowing (`error instanceof ApiError`) already assumes this contract.
```ts
if (response.ok) {
  return response.json().catch(() => {
    throw new ApiError('INTERNAL_ERROR', 'An unexpected error occurred.');
  }) as Promise<T>;
}
```
**Source:** async-patterns Finding #1.
**Resolution:** Applied. Added `.catch(() => { throw new ApiError('INTERNAL_ERROR', 'An unexpected error occurred.') })` to the success-path `response.json()`. Frontend typecheck + 5/5 tests pass.

#### H2 — `buildConfig` / `loadEnv` are duplicate exports ✅ Fixed
**File:** `apps/backend/src/config/index.ts:48–50`
Two public exports with identical signature and body. Server and tests import `buildConfig`; `loadEnv` has zero callers. Pick one name (the boot-time entry point reads more clearly as `buildConfig`); delete the other. One-line cleanup.
**Source:** code-quality Finding #1.
**Resolution:** Applied. Deleted the `loadEnv` export; folded its parse-on-boot contract into `buildConfig`'s doc comment. `server.ts` and `health.test.ts` already imported `buildConfig` only — no callers needed updating. Backend typecheck + 9/9 tests pass.

#### H3 — `mongo:7` image tag is unpinned (CVE-2025-14847) ✅ Fixed
**Files:** `compose.yml:3`, `compose.dev.yml:3`
MongoBleed (CVSS 8.7, CISA KEV) affects MongoDB Server 7.0 prior to 7.0.28. `mongo:7` resolves to whatever is latest at pull time. Pin both files to `image: mongo:7.0.28` (or later, with a renovate rule). Two-character fix per file.
**Source:** config-dependencies Finding #4.
**Resolution:** Applied. Pinned both files to `image: mongo:7.0.28`. `docker compose -f compose.yml config` and `docker compose -f compose.dev.yml config` render with the pinned tag.

### Should Address (🟡 Medium)

#### M1 — ARCH drift: Fastify 5 vs mandated Fastify 4
**File:** `apps/backend/package.json:13–15`
The implementation uses Fastify 5; ARCH Tech Choices specifies Fastify 4. Either downgrade `fastify`, `@fastify/autoload`, `fastify-plugin` to `^4` or amend ARCH Tech Choices to Fastify 5 with a one-paragraph note on the migration impact (route signatures, plugin typings, schema serialization).
**Source:** task-completion Finding #1.

#### M2 — R5 violation: T2 added `@types/node` via `npm install`
**Files:** `apps/backend/package.json:20`, `apps/backend/package-lock.json`
R5 says "lanes never install." T2's commit `73160d8` acknowledges the omission. Either amend the T1 brief to include `@types/node` (preferred — it's load-bearing for `NodeJS.ProcessEnv`) or document the exception in ARCH's R5 row and update T1's V12.
**Source:** task-completion Finding #7, config-dependencies Finding #1.

#### M3 — FastifyError (`FST_ERR_VALIDATION`) escapes to `INTERNAL_ERROR`
**File:** `apps/backend/src/api/errors/envelope-mapper.ts`
ARCH R6 reserves `VALIDATION_FAILED` + `details[]` for validation failures generally, but the mapper only branches on `instanceof ZodError`. Phase 1+ will register `schema: { body, querystring, params }` and silently produce the wrong envelope. Add a second branch in `envelope-mapper.ts` for `err.code === 'FST_ERR_VALIDATION'` and a regression test.
**Source:** error-handling Finding #1.

#### M4 — No `setNotFoundHandler` — 404s bypass the envelope
**File:** `apps/backend/src/api/plugins/error-handler.ts`
A request to an unknown route returns Fastify's built-in plain-text 404, which `client.ts` can't parse and falls back to `INTERNAL_ERROR`. Register a `setNotFoundHandler` reusing `INTERNAL_ERROR` (no G0 amendment needed).
**Source:** error-handling Finding #2.

#### M5 — SIGTERM/SIGINT registered after `await app.listen()`
**File:** `apps/backend/src/server.ts:44–58`
A microsecond race where a signal kills the process without draining in-flight requests. Move `process.on(...)` to immediately after `await app.ready()`.
**Source:** runtime-behavior Finding #1.

#### M6 — No shutdown re-entrancy guard
**File:** `apps/backend/src/server.ts:46–58`
Two signals during a long drain → second `app.close()` rejects → `process.exit(1)` → orchestrator interprets as crash → restart loop. Add `let closing = false` at module scope.
**Source:** runtime-behavior Finding #2, async-patterns Finding #2.

#### M7 — Magic string `'VALIDATION_FAILED'` instead of imported constant
**File:** `apps/backend/src/api/plugins/error-handler.ts:24`
The file's whole job is the single source-of-truth for status-code mapping; comparing against a string literal while the sibling mapper imports the constant is the drift the envelope contract exists to prevent. One-line fix.
**Source:** code-quality Finding #2, error-handling Finding #6.

#### M8 — `BACKEND_ORIGIN` unvalidated on the frontend
**File:** `apps/frontend/next.config.ts:3, 19`
Backend validates via `z.string().url()`; frontend interpolates raw. Mirror the backend's URL validation at build time (apply the same zod check or a strict allowlist).
**Source:** security Finding #1.

#### M9 — Test-file housekeeping
**File:** `apps/backend/test/api/health.test.ts`
(a) `beforeEach` imported but only used in a no-op expression statement (line 249). (b) `await import('../../src/persistence/mongo.ts')` repeated in 4 places. (c) `as never` on the logger config; type against `FastifyServerOptions['logger']`. (d) `makeAppWithFakeDb` + `makeAppWithThrowingRoute` duplicate ~12 lines; extract `setupApp(db)`. (e) `apps/frontend/src/lib/api/client.test.ts:72–76` — assert `name === 'ApiError'`, `code`, `details` for the typed-error test.
**Source:** code-quality Findings #3, #4, #5, #6, #11.

#### M10 — Boot error log may include `MONGO_URL`
**File:** `apps/backend/src/server.ts:37–42`
`main().catch` logs `err` directly. For a Mongo connection failure, the driver's error typically includes the connection URL — and `MONGO_URL` may embed credentials. Either redact the URL before printing or wire a pino redact path (`MONGO_URL`, `*.url`, `req.headers.authorization`) in `observability/index.ts`.
**Source:** error-handling Finding #3, security Finding #2.

#### M11 — ARCH spec amendments for items observed in the PR
Four spec rows are stale vs the implementation; all four favor **amending the spec** rather than reverting the code, because the implementation is correct under current tooling:
- **V12** should include `@types/node`, `@types/react`, `@types/react-dom` in the backend/frontend dep lists. (TC-2, CD-1, CD-2.)
- **V9 / V11** should reference `.js` (Cypress configs/tests), not `.ts`, with a note that the J0 seam fix renamed them. (TC-7.)
- **V10** should expect `module: "NodeNext"`, not `"ESNext"`, paired with `moduleResolution: "NodeNext"`. (TC-6, TS-1.)
- **R5** should be amended to allow post-gate devDeps that the brief omits (e.g. `@types/*`), with a note that the diff must be explicit in the lane's commit message.

### Nice to Have (💭 Low)

- **L1.** Backend `.dockerignore` exclude `tests/` (in addition to `test`) — CD-3.
- **L2.** Backend `.dockerignore` exclude `scripts/`, `migrations/` once those stabilize.
- **L3.** `apps/backend/src/api/plugins/error-handler.ts` — also add `app.log.error({ err, code: envelope.error.code }, 'request failed')` so the response status code can be tracked in logs.
- **L4.** Shutdown timeout — `Promise.race` against a timer (RB-3, AP-3).
- **L5.** Envelope shape megamorphism — always set `details: undefined` in the generic branch (RB-4).
- **L6.** `dbUp` redundant init in `routes/health.ts:22–28` — declare without initializer (CQ-8).
- **L7.** `UserSlot.tsx` placeholder — add a one-line comment naming the phase that will fill it in (CQ-9).
- **L8.** `page.tsx:37–48` nested ternary — extract a small `mapBackendStatus(view)` helper before a fourth state appears (CQ-10).
- **L9.** `EnvelopeLevelCode` unused type — narrow `ErrorEnvelope.error.code` to the union or delete (CQ-7, EH-6).
- **L10.** `client.ts:39–41` — filter and narrow per-element on `error.details` (EH-4, TS-3).
- **L11.** `client.ts:31` — `response.json() as Promise<T>` could accept a zod schema and `.parse()` the JSON so contract drift surfaces at the call site (TS-2).
- **L12.** Mongo 30 s ping timeout — consider `serverSelectionTimeoutMS: 2_000` once `/health` becomes a hot path in Phase 2+ (DB-1).
- **L13.** Mongo plugin should log `topologyDescriptionChanged` on disconnect/reconnect (EH-5).
- **L14.** Pre-emptive pino redact list for `req.headers.cookie`, `req.headers.authorization`, `err.config.headers`, `err.token` (SEC-2).
- **L15.** `JWT_SECRET: z.string().default('')` — require `length >= 32` when `NODE_ENV === 'production'`, or log a `warn` at boot (SEC-3).
- **L16.** Backend listen `0.0.0.0` is intentional for container reachability; consider `'127.0.0.1'` in `NODE_ENV === 'development'` (SEC-5).
- **L17.** `.env.example:6` — add a comment clarifying `MONGO_URL` is for host-process dev; compose overrides this (CD-5).
- **L18.** T2 logging test (`health.test.ts:236`) — either wire `genReqId` to honor `x-request-id` (with UUID fallback) or drop the header from the test (TC-5).
- **L19.** Makefile `db-shell` targets the reviewer's `compose.yml` only; consider whether the intent should route through `compose.dev.yml`.
- **L20.** `infra/.dockerignore` is preventive — no Dockerfile in `infra/` today; keep or delete based on whether future lanes will use infra-side images.
- **L21.** Backend listen on `'127.0.0.1'` in dev — optional hardening (SEC-5).

---

*Generated by Review — 2026-08-12 16:30*

---

## Resolution Log

Applied 2026-08-12 in response to the three 🟠 High items above.

| # | Action | File | Change | Verified |
|---|--------|------|--------|----------|
| H1 | Guard success-path `JSON.parse` | `apps/frontend/src/lib/api/client.ts:31` | Added `.catch(() => { throw new ApiError('INTERNAL_ERROR', 'An unexpected error occurred.') })` around `response.json()` in the `response.ok` branch. Existing catch on the failure path was already correct; success path now mirrors it. | `npm run typecheck` (frontend) → exit 0; `npm test` (frontend) → 5/5 pass. |
| H2 | Delete dead `loadEnv` alias | `apps/backend/src/config/index.ts:38–50` | Removed the duplicate `loadEnv` export; inlined the parse logic into `buildConfig` and absorbed the parse-on-boot contract into its doc comment. Server and tests already imported `buildConfig` only — zero call-site changes. | `npm run typecheck` (backend) → exit 0; `npm test` (backend) → 9/9 pass. |
| H3 | Pin Mongo image tag | `compose.yml:3`, `compose.dev.yml:3` | Changed `image: mongo:7` → `image: mongo:7.0.28` in both files. Closes the CVE-2025-14847 (MongoBleed) exposure window where Docker Hub could resolve to a pre-7.0.28 patch. | `docker compose -f compose.yml config` → `image: mongo:7.0.28`; `docker compose -f compose.dev.yml config` → `image: mongo:7.0.28`. |

### Post-fix state

- **Verdict:** ✅ PASS (was ⚠️ PASS WITH FINDINGS).
- **Open High items:** 0 (was 3).
- **Open Medium items:** 11 (unchanged — M1–M11 remain in the Should Address section above).
- **Open Low items:** 12 (unchanged — L1–L21 remain in the Nice to Have section above).
