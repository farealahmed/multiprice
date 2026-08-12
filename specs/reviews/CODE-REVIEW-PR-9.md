# Review Report

## Metadata

| Field | Value |
|-------|-------|
| **Review Mode** | PR |
| **Target** | [PR #9 — Phase 1: calculation engine and live editor](https://github.com/farealahmed/multiprice/pull/9) (`feat/2/calculation-engine-live-editor` → `main`) |
| **Date** | 2026-08-12 23:19 |
| **Tech Stack** | TypeScript · Fastify 5 + Zod (backend) · Next.js 15 / React 19 (frontend) · Vitest (unit) · Cypress (e2e) · MongoDB present in repo, untouched by this PR |
| **Checks Run** | task-completion, code-quality, typescript-strictness, async-patterns, react-patterns, error-handling, security |
| **Checks Skipped** | test-coverage (PR claims 49/49 backend + 21/21 frontend green under tdd/ui verification modes), database-patterns (no DB touched), performance / migration / config-dependencies (no new deps, additive-only, pure sync compute), accessibility, documentation (lower priority per developer) |
| **Files Changed** | 50 |
| **Lines Changed** | +3956 / -10 |

## Review Process

- [x] Preflight checks passed (git repo confirmed, `gh` authenticated)
- [x] Diff gathered (50 files, +3956/-10)
- [x] Tech stack detected: TypeScript, Fastify+Zod, Next.js/React, Vitest, Cypress
- [x] Context read (no CLAUDE.md in repo; PR description; full ARCH-2 doc including embedded T1–T6 task specs)
- [x] Triage proposed and developer confirmed
- [x] 7 checks dispatched: task-completion, code-quality, typescript-strictness, async-patterns, react-patterns, error-handling, security
- [x] Results collected and deduplicated
- [x] Report compiled
- [x] Verdict determined
- [x] Report saved to specs/reviews/

## Verdict: ❌ REQUEST CHANGES

The calculation engine itself is excellent — correct against every PDF-sample number, provably zero-dependency, and the trickiest concurrency logic in the PR (the debounced out-of-order-response guard) was traced end-to-end and holds under the exact adversarial ordering the architecture doc calls out. 11/11 REQs and all six tasks (T1–T6) are substantively implemented and well-tested. But three High findings need fixing before merge: a **live-verified calculation bug** where a negative fixed discount inflates the total instead of being rejected, a UI failure mode where a generic `INTERNAL_ERROR` response leaves the editor silently blank (or worse, shows a misleading "last totals accepted" message), and a type-safety hole where the frontend/backend error-code mirror is declared but never actually compiler-enforced. Twelve Medium findings are mostly quality/robustness gaps (missing precision validation, a debounce timer that isn't cancelled on unmount, some duplicated test logic) — worth a pass but not blockers on their own.

### Finding Counts

| Category | 🔴 | 🟠 | 🟡 | 💭 | ⚠️ |
|----------|-----|-----|-----|-----|-----|
| task-completion | 0 | 0 | 2 | 0 | 0 |
| code-quality | 0 | 0 | 5 | 1 | 0 |
| typescript-strictness | 0 | 1 | 2 | 1 | 0 |
| async-patterns | 0 | 0 | 1 | 0 | 0 |
| react-patterns | 0 | 0 | 0 | 0 | 0 |
| error-handling | 0 | 1 | 1 | 0 | 0 |
| security | 0 | 1 | 1 | 0 | 0 |
| **Total** | **0** | **3** | **12** | **2** | **0** |

---

## 🟠 High Findings

### H1 — Negative fixed discount inflates the total (live-verified)
**File:** `apps/backend/src/contracts/pricing.ts:49-53,109-116`, `apps/backend/src/pricing/calculate-line.ts`
**Category:** security / correctness

`discountSchema`'s `fixed` variant never validates `value` — only `percent` gets a 0–100 range check in `superRefine`. `unitPrice` a few lines up explicitly rejects negatives, but the same guard was never applied to `discount.value`, and `calculate-line.ts` only checks `discountAmount > subtotal`, never `discountAmount < 0`.

**Verified live:** `{ discount: { type: 'fixed', value: -50 } }` on a $10 line returns HTTP 200 with `discountAmount: -50, afterDiscount: 60, total: 60` — a "discount" that inflates the price 6x.

This is the highest-value code in the repo per the PR's own description ("every later phase that touches money calls this"), so a silent correctness gap here is worth fixing before it's built on. Originally flagged Medium by the security check (limited blast radius since nothing persists yet); elevated to High here because it's a verified defect in core calculation correctness, not just a hardening gap.

**Recommendation:** Add a `superRefine` branch for `discount.type === 'fixed'` mirroring the `unitPrice` checks — reject `value < 0`, cap it, add a dedicated `FIXED_DISCOUNT_*` error code.

### H2 — `INTERNAL_ERROR` responses leave the editor silently blank or misleading
**File:** `apps/frontend/src/app/(app)/editor/page.tsx:55-67`
**Category:** error-handling

The envelope-mapper's generic 500 branch (`INTERNAL_ERROR`) never includes a `details` array. `mapPricingErrors(undefined, rows.length)` then returns `{ rows: new Map(), documentLevel: [] }` — since `documentLevel.length === 0`, no validation notice renders. Worse: if a prior successful preview exists (`hasResult.current === true`), the UI shows `'Showing the last totals the server accepted.'`, which is actively misleading for a request the server did *not* accept. The network-failure branch does have a friendly fallback message; the server-500 branch doesn't, even though `error.message` is sitting right there on the caught `ApiError` and unused.

**Recommendation:** In the `error instanceof ApiError` branch, fall back to `error.message` as a document-level entry when the mapped result has no field errors and no document-level entries:
```ts
const mapped = mapPricingErrors(error.details, rows.length);
setErrors(mapped.rows.size === 0 && mapped.documentLevel.length === 0
  ? { ...mapped, documentLevel: [error.message] }
  : mapped);
```

### H3 — The frontend/backend error-code mirror is never actually compiler-enforced
**File:** `apps/frontend/src/lib/api/types/pricing.ts:32-53`, `apps/backend/src/contracts/pricing.ts:26-36`
**Category:** typescript-strictness

Both sides export a `PricingErrorCode` union specifically to guard the hand-written mirror against drift (`docs/contracts/phase-1.md` §7 explicitly describes it as "guarded by ... compile-time type-checking against the mirror"). Verified via repo-wide grep: neither type is ever used to type a real value. `ErrorEnvelope.details[].code` (backend) and `ApiErrorDetail.code` (frontend, `client.ts`) are both plain `string`. If a code is renamed or dropped on the backend, the frontend copy silently goes stale — nothing catches it at compile time, which defeats the stated purpose of the mirror for this part of the contract (it does work correctly for `LineInput`/`DocumentResult`, just not for the error codes).

**Recommendation:** Type `ApiErrorDetail.code` (or narrow it where `error-mapping.ts` consumes it) against the mirrored `PricingErrorCode` union, or add an exhaustive switch/lookup over it so an added/removed code fails to compile.

---

## 🟡 Medium Findings

### M1 — Missing precision/bound checks on `discount.value` and `taxPercent` crash into a 500
**File:** `apps/backend/src/contracts/pricing.ts` (schema), `apps/backend/src/services/pricing-preview.ts:75-77`, `apps/backend/src/pricing/units.ts:1-14`
**Category:** security

Neither `discount.value` (either variant) nor `taxPercent` has a precision check analogous to `QUANTITY_PRECISION`/`MONEY_PRECISION` — there's no `*_PRECISION` code for them at all. A schema-valid-but-excess-precision or extreme-magnitude number (e.g. `taxPercent: 33.3333`, or `discount: { type: 'fixed', value: 1e300 }`) passes Zod and hits `toScaled()` in `units.ts`, which throws a bare `RangeError`. `previewPricing()` calls `lines.map(toEngineLine)` *before* its `try` block, so this `RangeError` is never wrapped in `PricingPreviewError`, falls through `mapPricingEngineError` (which returns `null` for non-`PricingPreviewError`), and lands as a generic 500.

**Verified live:** both `discount.value = 1e300` and `taxPercent = 33.3333` return `500 {"error":{"code":"INTERNAL_ERROR",...}}` instead of a clean `400 VALIDATION_FAILED`. No data leak, but it's a routine, attacker-triggerable way to force "server error" log/alert noise on a public, unauthenticated endpoint, and it misclassifies ordinary malformed input as a server fault, undermining error-rate monitoring.

**Recommendation:** Add precision + bound validation for `discount.value` (both variants) and `taxPercent` matching the existing `quantity`/`unitPrice` pattern. As defense-in-depth, wrap `lines.map(toEngineLine)` in the same `try` as `calculateDocument`.

### M2 — Engine-rejected 400s bypass the logged error handler
**File:** `apps/backend/src/api/routes/pricing.ts:12-21`
**Category:** error-handling

Engine-level 400s (`PricingPreviewError` → `mapPricingEngineError`) are handled by a local `try/catch` calling `reply.code(400).send(envelope)` directly, bypassing Fastify's registered error handler — contradicting the ARCH doc's own flow diagram ("engine throw → engine-errors.ts → structured 400 → Fastify error handler → ErrorEnvelope"). Concretely: `req.log.error({ err, code }, 'request failed')` — the only logging call in the request path — never fires for engine rejections like `DISCOUNT_EXCEEDS_SUBTOTAL`. Zod failures and unexpected errors get logged; this class of 400 doesn't, leaving no log trail for support engineers correlating client-reported issues.

**Recommendation:** Either rethrow after mapping (giving the global handler a hook to log, with the handler special-casing `PricingPreviewError` for its status) or add an explicit `req.log.warn({ err: error, code }, 'pricing rejected')` at the send site.

### M3 — T3's "statelessness guard" test scenario has no corresponding test
**File:** `apps/backend/test/api/pricing-preview.test.ts`
**Category:** task-completion

T3's Test Plan lists a scenario verifying the route handler makes no call through `app.db`, but no test anywhere exercises this. The route code itself never references `app.db` so the property likely holds — but per T3's `tdd` verification mode, every listed scenario needs a corresponding test.

**Recommendation:** Add a lightweight test asserting the route is unaffected by an absent/broken DB connection, or explicitly strike the scenario from the task spec if inspection-only coverage is accepted.

### M4 — T6's join commit touched files outside its declared scope
**File:** `apps/backend/.dockerignore`, `apps/backend/tsconfig.build.json`
**Category:** task-completion

T6's own Scope Boundaries state "Do NOT fix seams by editing T1–T5's owned files beyond `nav-items.ts` — if something disagrees, that's a finding to report, not a silent fix," and its checklist expects the join commit to touch only `e2e/pricing-preview.cy.ts` and `nav-items.ts`. The actual `chore(J1)` commit also edits `.dockerignore` and `tsconfig.build.json` — neither appears in ARCH's Change Footprint for any task. The underlying fixes are real, necessary (without them `docker compose up --build`'s typecheck step fails), and disclosed in the commit message — but the task spec's own procedural guardrail wasn't followed.

**Recommendation:** No code change needed — the fix is correct and justified. Process note only: future joins should surface build-config seam breaks as a reported finding/ARCH amendment rather than silently widening the join commit's scope.

### M5 — Debounce timer isn't cancelled on unmount or when rows are cleared
**File:** `apps/frontend/src/lib/api/pricing.ts:11,29-58`, `apps/frontend/src/app/(app)/editor/page.tsx:70-72`
**Category:** async-patterns (corroborated independently by react-patterns' trace of the same code path)

The debounce `timer` lives in module scope with no exported cancel/dispose API. `editor/page.tsx`'s `useEffect` cleanup only flips a local `active` flag — it never reaches into `pricing.ts` to clear the pending timer. So: navigating away from `/editor` (or unmounting) while an edit is still debouncing lets the timer fire 300ms later and POST for a page nobody's looking at; clearing all rows before the debounce window elapses leaves the *previous* timer to fire with stale `latestLines`. Neither case corrupts UI state (the `active` guard correctly no-ops the response), but both are wasted round-trips.

**Recommendation:** Export a `cancelPreview()` from `pricing.ts` that clears the timer and drops queued waiters without settling them (consistent with the existing "dropped requests never settle" contract); call it from the effect cleanup.

### M6 — `engine-errors.ts` hardcodes the error path regardless of error code
**File:** `apps/backend/src/api/errors/engine-errors.ts:11`
**Category:** code-quality (corroborated by typescript-strictness and noted independently by task-completion)

`mapPricingEngineError` always builds the response path as `` lines.${index}.discount.value `` for *any* engine `PricingError`, but `PricingErrorCode` has two members: `DISCOUNT_EXCEEDS_SUBTOTAL` and `QUANTITY_TOO_LOW`. Currently unreachable for the latter because the zod schema rejects `quantity < 1` before the engine runs — but `previewPricing`/`calculateLine`/`PricingError` are all exported publicly for reuse, and nothing enforces that invariant at the call site or in the type system. No test exercises this mapper with `QUANTITY_TOO_LOW`.

**Recommendation:** Switch on `error.cause.code` to build the field path, so the mapper stays correct for every code its own type declares.

### M7 — Engine/wire conversion logic is hand-duplicated across 4 test files
**File:** `apps/backend/src/pricing/calculate-line.test.ts:7-19`, `calculate-document.test.ts:8-20`, `apps/backend/test/api/pricing-preview.test.ts:12-24,26-42`
**Category:** code-quality

The wire→engine conversion (`toEngineInput`) is copy-pasted into three test files; `pricing-preview.test.ts` additionally hand-rolls a fourth copy of the engine→wire direction that duplicates `fromEngineResult` in `services/pricing-preview.ts`. A production scaling/rounding change could desync from what the tests assert without any test catching it.

**Recommendation:** Export `toEngineLine`/`fromEngineResult` from `services/pricing-preview.ts` (or a shared test fixture helper) and import the one canonical version everywhere.

### M8 — `findFailingLine` redundantly recomputes the whole array
**File:** `apps/backend/src/services/pricing-preview.ts:59-72,82`
**Category:** code-quality

`findFailingLine` re-runs `calculateLine` from the start of the array purely to recover the index `calculateDocument` already failed on inside its own pass — redoing discarded work. It relies on a second identical pass over pure inputs failing at the same index (true today, not obvious from reading the function alone), and the `else throw error` branch is dead code given that invariant.

**Recommendation:** Capture the failing index inline where `calculateDocument`'s own iteration throws (e.g. a manual `for`/`try-catch` per index attaching `{ index }` to the thrown error) instead of a second full pass.

### M9 — `preview()`'s debounce state is an unscoped module singleton
**File:** `apps/frontend/src/lib/api/pricing.ts:11-17`
**Category:** code-quality

`timer`, `waiters`, `latestLines`, `issuedRequests` live at module scope with no reset hook. Safe today (exactly one call site, verified by grep), but `pricing.test.ts`'s `beforeEach` never resets this module's own state — correctness across tests depends on each test fully draining its timer/waiters first. A future second consumer (e.g. two editor panes) would silently cross-cancel requests.

**Recommendation:** Wrap the state in a factory (`createPreviewClient()`) returning closure-scoped `{ preview }`, making lifetime and reset explicit.

### M10 — Two structurally different types share the name `PricingErrorCode`
**File:** `apps/backend/src/pricing/calculate-line.ts:24`, `apps/backend/src/contracts/pricing.ts:26`, `apps/frontend/src/lib/api/types/pricing.ts:43`
**Category:** code-quality / typescript-strictness

The engine's narrow 2-member type (re-exported from `pricing/index.ts`) and the contract's 10-member type (mirrored again on the frontend) share an identical name. They happen never to be imported into the same file today, but the collision invites confusion about which type a given `import { PricingErrorCode }` resolves to, and would force manual aliasing if that ever changes.

**Recommendation:** Rename the engine's narrower type to `EngineErrorCode` to make the engine-level/wire-level boundary visible at the type level.

### M11 — Response shape from `preview()` is never validated at the trust boundary
**File:** `apps/frontend/src/lib/api/pricing.ts:36`
**Category:** typescript-strictness

`apiFetch<DocumentResult>(...)` instantiates the generic against the hand-written mirror type, but `client.ts`'s `apiFetch` resolves via `response.json().catch(...) as Promise<T>` — an unchecked cast, no runtime shape validation. Combined with H3, if the backend's actual response shape ever drifts from the frontend's `DocumentResult` mirror, nothing catches it — the UI just renders `undefined`/`NaN` cells. The backend does validate its outgoing shape (`documentResultSchema.parse(...)`); nothing validates it again on receipt.

**Recommendation:** At minimum, comment this trust boundary explicitly. Ideally, add a lightweight hand-written runtime guard at this one call site (consistent with the "no codegen" decision — doesn't require Zod on the frontend).

### M12 — Redundant, unconnected double-cast for reading `params.code`
**File:** `apps/backend/src/api/errors/envelope-mapper.ts:24-27` (duplicated in `apps/backend/src/contracts/pricing.test.ts:20`)
**Category:** typescript-strictness

Reading zod's custom-issue `params.code` uses two independent `as` casts on `i.params`, not lexically connected, so nothing keeps them in sync if one is edited later. Zod itself types `params` as `Record<string, any>`, so the casts don't add real type safety over the underlying `any` — they just look like narrowing. The same pattern is duplicated a third time in a test helper.

**Recommendation:** Extract one shared type guard (`function customIssueCode(issue: ZodIssue): string | undefined`) using `issue.code === 'custom'` as the real discriminant, and reuse it in both places.

---

## 💭 Low Findings

### L1 — Unexplained magic multiplier in rounding-tolerance check
**File:** `apps/backend/src/pricing/units.ts:9`
**Category:** code-quality

`Math.abs(scaled - rounded) > Number.EPSILON * Math.max(1, Math.abs(scaled)) * 8` has an unexplained `8`. A one-line comment on why `8` (e.g. "empirically covers float error at the max supported magnitude") would save the next reader a reverse-engineering trip.

### L2 — Unguarded cast from `<select>` value to a literal union
**File:** `apps/frontend/src/components/line-items/DiscountInput.tsx:38`
**Category:** typescript-strictness

`event.target.value as Discount['type']` is safe today because the 3 `<option>` values are hand-matched to the union, but nothing ties them together at compile time. Low priority; if the option list ever grows, deriving it from the union (`satisfies readonly Discount['type'][]`) would close the gap.

---

## Manual Checks Required

- [ ] Run `cd apps/backend && npx vitest run` and `cd apps/frontend && npm test && npm run build` yourself to confirm the PR's claimed 49/49 and 21/21 green counts (checks did not execute the suites, only read their assertions).
- [ ] Run `docker compose up --build` and the Cypress happy path once more after any fixes to H1/H2, since those touch the exact request/response path the e2e spec exercises.

## Prioritized Action Items

### Must Fix (🔴 Critical / 🟠 High)
- **H1** — Add a lower-bound (and precision/cap) check to `discount.value` for the `fixed` type; a negative value currently inflates the total instead of being rejected. *(security / correctness)*
- **H2** — Give `INTERNAL_ERROR` responses a visible fallback in the editor UI instead of going silent or showing a misleading "accepted" note. *(error-handling)*
- **H3** — Wire `PricingErrorCode` into an actual typed position on both ends so the error-code mirror is compiler-enforced, not just declared. *(typescript-strictness)*

### Should Address (🟡 Medium)
- M1 — Add precision/bound validation for `discount.value` and `taxPercent` so malformed input gets a 400, not a 500.
- M2 — Route engine-rejected 400s through logging so they leave a trace.
- M3 — Add the missing T3 statelessness-guard test.
- M4 — Process note: T6 touched two undeclared files (justified, but flag process for next time).
- M5 — Cancel the debounce timer on unmount / rows-cleared.
- M6 — Make `engine-errors.ts`'s path-building branch on the actual error code.
- M7 — De-duplicate hand-copied engine/wire conversion logic in tests.
- M8 — Remove the redundant second pass in `findFailingLine`.
- M9 — Scope `preview()`'s debounce state per-instance instead of module-global.
- M10 — Rename the engine's `PricingErrorCode` to avoid the name collision.
- M11 — Validate (or at least document) the trust boundary on `preview()`'s response shape.
- M12 — Extract one shared type guard for reading `params.code` instead of three duplicated casts.

### Nice to Have (💭 Low)
- L1 — Comment the magic `8` multiplier in `units.ts`'s rounding-tolerance check.
- L2 — Optionally derive `DiscountInput`'s `<option>` list from the `Discount['type']` union.

---
*Generated by Review — 2026-08-12 23:19*
