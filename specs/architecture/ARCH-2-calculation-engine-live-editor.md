# Architecture: Calculation engine and live editor

> **Date:** 2026-08-12
> **Issue:** #2
> **Phase:** 2 of 5 (System Architecture)
> **Requirements source:** Standalone brief — see Inferred Requirements (`specs/context/2.md`, `docs/phases/phase-1-issue-2.md`, `docs/implementation-phases.md` § Phase 1, § Decisions)
> **Type:** feature

## Architecture Summary

A pure, dependency-free calculation module (`apps/backend/src/pricing`) computes line and
document totals over integer cents/thousandths/basis-points, applying discount-before-tax with
half-up-away-from-zero rounding at four points per line. A stateless
`POST /api/v1/pricing/preview` route validates a `{ lines: LineInput[] }` request against a zod
contract, calls the engine, and returns `DocumentResult` in major units — no persistence exists
yet. A new editor page renders an line-item table wired to that endpoint through a debounced,
out-of-order-safe client call; every number on screen is server output, never client arithmetic.
The three pieces share one frozen contract (`contracts/pricing.ts` + its frontend mirror) so they
can be built independently and only have to agree at the HTTP boundary. The one deviation from
"contracts are additive-only": `api/errors/envelope-mapper.ts`, frozen since Phase 0, gets a
small backward-compatible amendment so zod validation failures can carry pricing's specific
error codes instead of zod's generic issue codes.

## Inferred Requirements

No REQ doc exists for this issue; the GitHub issue body (`specs/context/2.md`) is itself a
complete lane-brief specification. Requirements below are restated from it and from
`docs/implementation-phases.md` for traceability by `generate-tasks`.

| ID | Inferred Requirement | Source |
|----|----|----|
| R1 | Money stored as integer cents, quantity as integer thousandths, percent as integer basis points; none of these ever leak past the engine's boundary. | Brief G1 step 2 |
| R2 | Quantity is `≥ 1` (not `> 0`), ≤3dp, ≤1,000,000; unit price is `≥ 0`, ≤2dp, ≤1,000,000 — bounds sized so `qty×1000 × price×100` stays under `Number.MAX_SAFE_INTEGER`. | Brief G1 step 1 |
| R3 | `calculateLine`/`calculateDocument` signatures are frozen; the engine imports nothing (no zod, no logger, no DB, no money library). | Brief G1 step 3, Lane 1-A step 1 |
| R4 | Rounding: half-up away from zero, 2dp, applied at 4 points per line in order (subtotal → discount → after-discount → tax); document totals sum already-rounded line figures. | Brief G1 rounding policy |
| R5 | A fixed discount exceeding the line subtotal is rejected (`DISCOUNT_EXCEEDS_SUBTOTAL`), never clamped. | Brief Lane 1-A step 5 |
| R6 | `POST /api/v1/pricing/preview` is stateless: validates input, calls the engine, converts units at the boundary; no DB, no session. | Brief Lane 1-B |
| R7 | Every rejection carries a specific `SCREAMING_SNAKE` code and a `details[].path` field path the UI can key off of. | Brief Lane 1-B step 2 |
| R8 | The editor renders totals from server responses only — no client-side multiplication/summation, not even in a pending state. | Brief Lane 1-C step 4 |
| R9 | Debounced preview calls must discard out-of-order responses (an older reply landing last must not overwrite a newer total). | Brief Lane 1-C step 3 |
| R10 | Discount input is a type-select (`none`/`percent`/`fixed`) that makes "both at once" structurally unrepresentable in the UI, mirroring the discriminated union on the wire. | Brief Lane 1-C step 2 |
| R11 | `docs/contracts/phase-1.md` documents the endpoint, schemas, and rounding policy — the source Phase 6's README is written from. | Brief G1 step 8 |

## High-Level Structure

```
Browser (editor page)
   │  debounced POST /api/v1/pricing/preview  { lines: LineInput[] }
   ▼
Next.js rewrite (same-origin, unchanged from Phase 0)
   ▼
Fastify route  src/api/routes/pricing.ts
   │  1. zod-validate against contracts/pricing.ts (attaches domain codes on failure)
   │  2. src/services/pricing-preview.ts: major units → cents/thousandths/basis-points
   ▼
src/pricing (pure, zero imports)
   │  calculateDocument(inputs) → DocumentResult (all cents)
   │  throws { code: 'DISCOUNT_EXCEEDS_SUBTOTAL', ... } — never HTTP-aware
   ▼
src/services/pricing-preview.ts: cents → major units
   │  engine throw → src/api/errors/engine-errors.ts → structured 400
   ▼
Fastify error handler (Phase 0, unchanged) → ErrorEnvelope
   ▼
Browser: renders DocumentResult.lines[i] against row i (positional match)
```

**Added to the existing system:** `src/pricing/**`, `src/contracts/pricing.ts`, the preview
route/service/error-mapping trio, the editor page and its components, the frontend pricing types
and client.

**Modified in the existing system:** `envelope-mapper.ts` (additive amendment, see Tech Choices),
`nav-items.ts` (one new entry, join-owned per repo convention).

**Untouched:** `app.ts`, `error-handler.ts`, `config/`, `persistence/mongo.ts`, the shell
components, `lib/api/client.ts`. No database, no auth — deliberately, per the phase plan (this
phase retires Correctness/Calculation design/Tests without needing persistence to do it).

## Tech Choices

| Area | Decision | Alternatives Considered | Rationale |
|----|----|----|----|
| Money/quantity/percent representation | Integer cents / thousandths / basis points, `bigint` not used | `bigint`, decimal library (`decimal.js`), floats with epsilon comparisons | Brief's own bound analysis: at the fixed caps, worst-case product is ~`10^14`, two orders of magnitude inside `Number.MAX_SAFE_INTEGER` (`10^15.9`). `bigint` solves a problem that doesn't exist here at the cost of JSON-serialization and comparison-operator friction throughout the engine. |
| Rounding | One explicit `roundHalfUp` over integer arithmetic | `Math.round` (rounds half toward +∞, wrong for "away from zero" on the policy as stated — though irrelevant here since inputs are non-negative, brief mandates an explicit helper), `toFixed` (binary floating-point, drifts intermittently) | Correctness must be provable and testable in one place; a reviewer can read one function and the arithmetic comment beside its test. |
| Validation | zod, at the route boundary only | Manual validators, `class-validator`, `yup` | zod is already the project's stack choice (Phase 0); reusing it keeps one validation idiom across every domain. |
| Domain error codes through zod | `superRefine` + `ctx.addIssue({ code: 'custom', params: { code: 'QUANTITY_TOO_LOW' } })`, read by an amended `envelope-mapper.ts` | (a) Hand-rolled validation bypassing zod for business-rule checks; (b) a second, pricing-specific error mapper | (a) means two validation mechanisms (shape via zod, business rules by hand) that can silently diverge on which rejects first. (b) violates "exactly one error handler" (Phase 0 §5.3). The chosen approach keeps zod as the single validation surface and the mapper as the single HTTP-shaping point; the amendment is additive (`params.code` is optional, absent everywhere else) so no existing behavior (verified: `health.test.ts:118-119`) changes. |
| Engine's internal error type | A plain typed throwable defined inside `src/pricing` (e.g. `{ code: string; message: string }`, thrown as an `Error` subtype) | Throwing zod errors, throwing HTTP-aware errors | `src/pricing` imports nothing — it cannot know about zod or HTTP status codes. `src/api/errors/engine-errors.ts` (1-B's file) is the only place that translates the engine's code into a 400. |
| API versioning | `/api/v1/pricing/preview`; `/api/health` stays unversioned | Version everything including health; version nothing | Confirmed with developer: liveness/infra endpoints are unversioned by convention, business-domain endpoints version from Phase 1 onward. No route code changes for Phase 0 either way — the Next.js rewrite is a wildcard. |
| Line identity across the wire | No `id`/`description` in `LineInput`; frontend matches `DocumentResult.lines[i]` to row `i` positionally | Client-generated row id round-tripped to the server | Confirmed with developer. The frozen wire representation (brief G1 step 1) lists only the 4 calculation fields; there is no persistence yet for an id to be meaningful against. React key stability is a component-level concern local to Lane 1-C, not a contract concern. |

## Patterns & Conventions

- **One contract file per domain** (`contracts/pricing.ts` owns pricing's schemas *and* error codes) — established in Phase 0, followed here; no shared `codes.ts` to append to.
- **Autoloaded routes/plugins** — `src/api/routes/pricing.ts` is picked up by the existing `@fastify/autoload` registration in `app.ts`; that file is not edited.
- **`fp`-wrapped plugins only** — not applicable this phase (no new plugin), noted for completeness since `error-handler.ts` is the pattern reference.
- **Hand-written frontend mirror, no codegen** — `lib/api/types/pricing.ts` mirrors `contracts/pricing.ts` by hand, per Phase 0's mirroring rule.
- **Same-origin only** — the editor's `lib/api/pricing.ts` calls relative `/api/v1/pricing/preview` through the existing `apiFetch`/rewrite; no new cross-origin surface.
- **Server is the sole source of truth for money** — applied for the first time here; every later phase (3, 4) that touches money reuses `src/pricing` rather than reimplementing it.
- **Intentionally not applied: persistence, auth, idempotency keys** — this phase has none of the three by design (no DB exists yet).

## Data Models

### `LineInput` (wire + internal boundary type)

**Purpose:** one line's calculation inputs, both as the HTTP request shape and the engine's parameter type (after unit conversion).

**Key fields:**
| Field | Type / Constraint | Notes |
|----|----|----|
| `quantity` | number, ≥1, ≤3dp, ≤1,000,000 | Rejected below 1 with `QUANTITY_TOO_LOW`, above the cap with `QUANTITY_TOO_LARGE`, over-precision with `QUANTITY_PRECISION`. |
| `unitPrice` | number, ≥0, ≤2dp, ≤1,000,000, major units | Negative → `UNIT_PRICE_NEGATIVE`; over cap → `UNIT_PRICE_TOO_LARGE`; over-precision → `MONEY_PRECISION`. |
| `discount` | `{type:'none'}\|{type:'percent',value}\|{type:'fixed',value}` | Discriminated union; `value` for `percent` is 0–100 (`DISCOUNT_PERCENT_OUT_OF_RANGE` otherwise), `value` for `fixed` is a major-unit amount that must not exceed the line subtotal (`DISCOUNT_EXCEEDS_SUBTOTAL`, raised by the engine, not the schema). |
| `taxPercent` | number \| null, 0–100 | `null`/absent and `0` are distinct on input, identical in effect (`TAX_PERCENT_OUT_OF_RANGE` if out of range). |

**Relationships:** none — Phase 1 has no persistence; a `LineInput[]` array is the entire request body.

**Lifecycle:** request-scoped only. Not stored.

### `LineResult` / `DocumentResult` (response types, engine output)

**Purpose:** computed totals, in cents internally, converted to major units at the HTTP boundary.

**Key fields:**
| Field | Type / Constraint | Notes |
|----|----|----|
| `LineResult.{subtotal,discountAmount,afterDiscount,taxAmount,total}` | integer cents (engine) / major-unit number (wire) | `total = afterDiscount + taxAmount`, both already rounded. |
| `DocumentResult.lines` | `LineResult[]` | Same order and length as the request's `LineInput[]` — the only correlation mechanism (see Tech Choices). |
| `DocumentResult.{subtotal,totalDiscount,totalTax,grandTotal}` | integer cents (engine) / major-unit (wire) | `grandTotal` must equal `subtotal − totalDiscount + totalTax`, asserted as an identity in 1-A's tests. |

**Relationships:** `DocumentResult.lines[i]` corresponds to request `lines[i]`.

**Lifecycle:** computed per-request, never persisted.

## API Contracts / Interfaces

### `POST /api/v1/pricing/preview` (HTTP)

**Boundary:** Fastify route, public (no auth exists yet).

| Method/Op | Path | Purpose | Errors / Returns |
|----|----|----|----|
| `POST` | `/api/v1/pricing/preview` | Compute totals for a set of lines, no persistence | 200 `DocumentResult` (major units) · 400 `ErrorEnvelope` with one of: `QUANTITY_TOO_LOW`, `QUANTITY_TOO_LARGE`, `QUANTITY_PRECISION`, `UNIT_PRICE_NEGATIVE`, `UNIT_PRICE_TOO_LARGE`, `MONEY_PRECISION`, `TAX_PERCENT_OUT_OF_RANGE`, `DISCOUNT_PERCENT_OUT_OF_RANGE`, `DISCOUNT_TYPE_CONFLICT`, `DISCOUNT_EXCEEDS_SUBTOTAL` — each with a `details[].path` (e.g. `lines.1.taxPercent`) |

**Auth requirements:** none this phase.

### `src/pricing` (module boundary, not HTTP)

| Signature | Purpose | Errors / Returns |
|----|----|----|
| `calculateLine(input: LineInput): LineResult` | Single-line calculation | Throws `{code: 'DISCOUNT_EXCEEDS_SUBTOTAL', ...}` on invalid discount; otherwise returns cents |
| `calculateDocument(inputs: LineInput[]): DocumentResult` | Per-line results + document rollups | Same throw as above, surfaced with the offending line's index |

## Module Boundaries

| Module / Package | Responsibility | Allowed Dependencies |
|----|----|----|
| `apps/backend/src/pricing/**` | Pure calculation — units, rounding, line/document totals | Nothing outside itself (not even the contract types — it defines its own input/output shapes structurally compatible with `contracts/pricing.ts`) |
| `apps/backend/src/contracts/pricing.ts` | zod schemas, this domain's error codes | zod only |
| `apps/backend/src/services/pricing-preview.ts` | Unit conversion (major↔cents), calls the engine | `src/pricing`, `src/contracts/pricing.ts` |
| `apps/backend/src/api/routes/pricing.ts` | HTTP wiring — validate, call service, respond | `contracts/pricing.ts`, `services/pricing-preview.ts` |
| `apps/backend/src/api/errors/engine-errors.ts` | Map engine throws → structured 400 | `src/pricing`'s error shape, `contracts/pricing.ts` codes |
| `apps/frontend/src/lib/api/pricing.ts` | Typed `preview(lines)` call, debounce, out-of-order guard | `lib/api/client.ts` (read-only), `lib/api/types/pricing.ts` |
| `apps/frontend/src/components/line-items/**`, `components/money/**` | Editor table, discount input, money formatting | `lib/api/pricing.ts`, `lib/api/types/pricing.ts`, `styles/tokens.css` |

**Rule carried forward from Phase 0:** the HTTP layer never does arithmetic on money — any `*`/`+` on a money value outside `src/pricing` is a bug (Lane 1-B guardrail, `.claude/agents/backend-engineer.md`).

## Change Footprint

### New files / modules

| Path | Purpose | Pattern reference |
|----|----|----|
| `apps/backend/src/contracts/pricing.ts` | Schemas + error codes for this domain | `contracts/health.ts` (schema+type export shape) |
| `apps/backend/test/fixtures/pdf-sample.ts` | The PDF's 3-line sample as executable data | new — no prior fixture file exists |
| `docs/contracts/phase-1.md` | Human-readable contract snapshot | `docs/contracts/phase-0.md` |
| `apps/backend/src/pricing/units.ts` | `toCents`/`fromCents`/`toThousandths`/`toBasisPoints` + inverses | new |
| `apps/backend/src/pricing/rounding.ts` | `roundHalfUp` | new |
| `apps/backend/src/pricing/calculate-line.ts` | `calculateLine` | new |
| `apps/backend/src/pricing/calculate-document.ts` | `calculateDocument` | new |
| `apps/backend/src/pricing/index.ts` | Public exports of the module | new |
| `apps/backend/src/pricing/*.test.ts` (colocated) | Unit tests per brief's list | `apps/backend/test/api/health.test.ts` (assertion style) |
| `apps/backend/src/api/routes/pricing.ts` | `POST /api/v1/pricing/preview` | `api/routes/health.ts` (autoloaded route shape) |
| `apps/backend/src/services/pricing-preview.ts` | Unit conversion + engine call | new (first file in `src/services/`) |
| `apps/backend/src/api/errors/engine-errors.ts` | Engine-throw → 400 mapping | `api/errors/envelope-mapper.ts` (sibling pattern) |
| `apps/backend/test/api/pricing-preview.test.ts` | Route-level tests | `test/api/health.test.ts` |
| `apps/frontend/src/lib/api/types/pricing.ts` | Mirrored types + code enum | `lib/api/types/health.ts` |
| `apps/frontend/src/app/(app)/editor/page.tsx` | Editor page | `app/page.tsx` (client component + `Topbar` usage) |
| `apps/frontend/src/components/line-items/**` | Table, row, discount-type-select | `components/shell/*` (styling/token usage) |
| `apps/frontend/src/components/money/**` | Money formatting helper (display only) | new |
| `apps/frontend/src/lib/api/pricing.ts` | Typed `preview()`, debounce, stale-response guard | `lib/api/client.ts` (wraps `apiFetch`) |
| `e2e/pricing-preview.cy.ts` | J1's Cypress happy path | `e2e/health.cy.js` |

### Modified files / modules

| Path | What changes here |
|----|----|
| `apps/backend/src/api/errors/envelope-mapper.ts` | Add: when a zod issue is `code: 'custom'` and carries `params.code` (a string), use that as `details[].code`; otherwise keep the existing fallback to `i.code`. Additive — no existing call site sets `params.code` today. |
| `apps/frontend/src/components/shell/nav-items.ts` | J1 adds one entry pointing at `/editor` (repo-wide join convention: "no page lane may edit the shell, wiring nav is always the join's job" — `docs/parallel-execution.md` §Definition of done). |

### Deleted / replaced

None.

### Touched but not changed (silent-regression hotspots)

| Path | Why it matters |
|----|----|
| `apps/backend/test/api/health.test.ts` | Asserts `details[].code` equals zod's raw issue code (`too_small`, `invalid_type`) on a synthetic schema with no `params.code` set (lines 118-119). Verified: the mapper amendment's fallback path preserves this exactly — re-run this suite after the amendment to confirm. |
| `apps/backend/src/api/plugins/error-handler.ts` | Reads `envelope.error.code` (the top-level code, e.g. `VALIDATION_FAILED`) to pick a status code — untouched by the amendment, which only changes `details[].code`. |
| `apps/frontend/src/components/shell/NavSlot.tsx` | Maps over `NAV_ITEMS`; currently renders nothing since the array is empty. No test found asserting emptiness (checked via grep) — adding one entry is safe but worth a visual check. |
| `apps/frontend/src/lib/api/client.ts` | 1-C's `lib/api/pricing.ts` wraps this and must not edit it — already a documented "reads, never edits" dependency in the brief. |

## Areas of Impact

| Area | Impact | Risk (L/M/H) | Why |
|----|----|----|----|
| `envelope-mapper.ts` / error contract | Every future domain gate (Phase 2+) can now attach specific codes via `params.code` instead of relying on zod's generic issue codes | L | Additive, backward-compatible, verified against the one existing test that exercises it |
| Frontend navigation shell | First real page added to `NAV_ITEMS` | L | Empty→one-entry array change, no consumers assert on emptiness |
| `docs/contracts/phase-1.md` | New public contract snapshot; Phase 6's README derives from it later | L | New file, no existing consumers yet |
| Deployment / build pipeline | None | — | No new env vars, no new service, no Dockerfile changes |
| Auth / persistence | None | — | Phase deliberately has neither |

**Contract changes:** none to existing contracts (`health.ts`, `envelope.ts`'s *shape* are unchanged); `envelope-mapper.ts`'s *behavior* gains an optional new code path.

**Cross-cutting ripples:** none into telemetry, feature flags, or migrations — this phase ships no DB schema and no flags.

## Cross-Cutting Concerns

- **Errors:** engine throws typed, HTTP-agnostic errors → `engine-errors.ts` maps to a 400 with the domain code and offending line's path → the existing global error handler renders the envelope and logs the cause server-side only (never echoed to the client, unchanged Phase 0 behavior). Zod validation failures flow through the amended `envelope-mapper.ts`.
- **Logging & metrics:** no change to the existing `req.log.error({ err, code }, 'request failed')` call; no new metrics this phase (out of scope — no observability work is listed in the brief).
- **Auth & authz:** none — the route is public. Revisited in Phase 2.
- **Performance & scale:** pure synchronous computation over a small in-memory array; no caching needed. Open question below on an unbounded `lines[]` array length.
- **Security:** validation boundary is the zod schema at the route edge; `z.number()` already rejects `NaN`/`Infinity`/non-numeric input before it reaches the engine. No secrets, no PII in this domain.
- **Migrations & rollout:** none — net-new, stateless endpoint; rollback is a plain deploy revert with zero data risk (nothing is persisted).

## Architecture Decisions Log

| # | Decision | Alternatives | Chosen Because | Satisfies REQs |
|----|----|----|----|----|
| A1 | Money/quantity/percent as integer cents/thousandths/basis points, capped so products stay under `MAX_SAFE_INTEGER` | `bigint`, decimal library | Brief's own bound math proves floats-as-integers stay safe at the fixed caps; `bigint` adds friction without solving a real problem here | R1, R2 |
| A2 | One explicit `roundHalfUp` helper, integer arithmetic only | `Math.round`, `toFixed` | Both alternatives are wrong or drift-prone for a documented, defensible rounding policy | R4 |
| A3 | `src/pricing` imports nothing, including the zod contract types | Importing `contracts/pricing.ts` types for convenience | The brief's hardest constraint — the engine must be usable by any future caller (Phase 3+) without pulling in zod/HTTP | R3 |
| A4 | Fixed discount over subtotal throws, not clamps | Clamp to subtotal | Matches the plan's decision table: rejecting produces a specific, scored error; clamping silently rewrites input | R5 |
| A5 | Domain error codes ride through zod's `superRefine`/`params.code`, read by an amended `envelope-mapper.ts` | Hand-rolled validation bypassing zod; a second error mapper | Keeps one validation mechanism and one error handler (Phase 0 invariant); amendment verified additive against the one existing consuming test | R7 |
| A6 | `/api/v1/pricing/preview`; health stays unversioned at `/api/health` | Version everything; version nothing | Developer-confirmed: infra endpoints unversioned, business domains versioned from this phase forward | R6 |
| A7 | No `id`/`description` in `LineInput`; frontend matches results to rows positionally by array index | Client-generated id round-tripped through the wire | Developer-confirmed: nothing persists yet, so an id has no destination; the frozen field list already excludes it | R6, R8 |
| A8 | Frontend renders only server-computed totals; a pending state shows the previous server value while a request is in flight | Optimistic client-side calculation with a "pending" flag | The PDF's central claim under test — the client must never be shown to compute money | R8, R9 |

## Risk & Stress-Test Scenarios

### Forward — runtime failure scenarios

| Scenario | How the Design Handles It |
|----|----|
| Two debounced preview requests race; the older reply arrives after the newer one | `lib/api/pricing.ts` tags each request with a sequence token and drops any response whose token isn't the latest issued (R9) — implementation detail for Lane 1-C, contract-level requirement here |
| Backend/DB dependency down for 30s | `/pricing/preview` has no DB dependency at all — statelessness means a Mongo outage doesn't affect this endpoint, unlike `/health` |
| Concurrent identical requests | `calculateDocument` is a pure function over its arguments with no shared mutable state — no idempotency concern |
| Fractional quantity pushing subtotal past 2dp (`2.5 × 10.01`) | Explicitly covered by 1-A's rounding-order test; subtotal rounds before discount applies |
| Rollback after a bad deploy | Zero data risk — nothing is persisted, so rollback is a plain revert |
| Unbounded `lines[]` array length | **Gap — not resolved by the brief.** See Open Questions. |

### Backward — regression risk per touched area

| Touched area | What could regress | How we'd know / mitigation |
|----|----|----|
| `envelope-mapper.ts` amendment | A future domain relying on zod's raw issue code sees a different `details[].code` if it accidentally sets `params.code` | `health.test.ts:118-119` pins the no-`params.code` fallback behavior exactly; re-run it as part of this phase's "done when" |
| `nav-items.ts` | Visual/shell regression if `NavSlot` assumed an empty array somewhere else | Grepped for all `NAV_ITEMS` consumers — only `NavSlot.tsx`, which already maps safely over any length |

## Open Questions

- Should `POST /api/v1/pricing/preview` cap the number of lines per request?
  - **Impact if unresolved:** an unbounded array is a minor DoS/perf surface (large payload, O(n) computation) with no test coverage either way.
  - **Suggested default:** cap at a generous round number (e.g. 500 lines) via the zod schema (`z.array(lineInput).max(500)`), rejected as a plain `VALIDATION_FAILED` (not a new domain code — this is a shape constraint, not a business rule). Revisit if the PDF or a later phase implies a real document-size expectation.

## Out of Scope

- Persistence of any kind (reason: deferred to Phase 3 by design — this phase proves calculation correctness without a database)
- Auth/session on the preview endpoint (reason: Phase 2)
- Document metadata (title, customer, issue date), save/finalize actions from the mockup (reason: explicit Lane 1-C guardrail — Phase 3 territory)
- OpenAPI/swagger generation for the new route (reason: not mentioned in this phase's brief; deferred to Phase 6 if it falls out naturally)

---

# Tasks

## Execution Plan

```
T1 (contract) ──┬──► T2 (engine) ──────┐
                │                       ├──► T3 (route) ──┐
                └──► T4 (client) ──┬────┼                  ├──► T6 (join)
                                   └────┴──► T5 (UI) ──────┘
```

| Wave | Runs | Terminals | Then |
|---|---|---|---|
| 1 | T1 — contract | 1 | — |
| 2 | T2 (engine) · T4 (client) | 2 | — |
| 3 | T3 (route, needs T2 landed) · T5 (UI, needs T4 landed) | 2 | — |
| 4 | T6 — join | 1 | done |

**Note on parallelism vs. the original brief:** the brief's Lane 1-C bundled the client
(debounce/stale-response logic) and the UI (table, discount input) into one lane, running fully
parallel with 1-A (the engine) in wave 2. This task breakdown splits that lane into T4 (`tdd`)
and T5 (`ui`) by verification mode — cleaner test discipline, at the cost of pushing T5 into
wave 3 since it depends on T4's client existing. If you'd rather preserve the original
parallelism, merge T4 and T5 back into one task before implementing.


## Task T1: Pricing contract — schemas, codes, fixtures, mapper amendment

> **Status:** done
> **Verification:** tdd
> **Effort:** m
> **Priority:** critical
> **Depends on:** None
> **Satisfies REQs:** R1, R2, R7, R11
> **Footprint slice:** New: `contracts/pricing.ts`, `test/fixtures/pdf-sample.ts`, `lib/api/types/pricing.ts`, `docs/contracts/phase-1.md`; Modified: `api/errors/envelope-mapper.ts`
> **High-risk areas touched:** `envelope-mapper.ts` / error contract (L risk, ARCH Areas of Impact) — additive amendment, guarded by a regression test against the existing no-`params.code` path

### Description

Freezes the wire representation for pricing (quantity/unitPrice/discount/taxPercent), this
domain's error codes, the PDF's sample fixture, and the frontend's hand-written type mirror.
Also carries the one infrastructure amendment this phase needs: `envelope-mapper.ts` learns to
read a zod issue's `params.code` (when a schema attaches one) so pricing's specific codes
(`QUANTITY_TOO_LOW`, etc.) reach the client instead of zod's generic issue codes. Everything
downstream — the engine, the route, the UI — builds against this without waiting on each other.

### Test Plan

#### Test File(s)
- `apps/backend/src/contracts/pricing.test.ts` (colocated, alongside the schema — no prior
  schema-test precedent exists in this repo, so this establishes the convention for future
  contract files)
- `apps/backend/src/api/errors/envelope-mapper.test.ts` (colocated, extending coverage of the
  existing mapper)

#### Test Scenarios

##### Schema acceptance

- **accepts a valid LineInput at each boundary** — GIVEN qty=1, qty=1,000,000, unitPrice=0,
  unitPrice=1,000,000, taxPercent=0, taxPercent=100, taxPercent=null WHEN parsed THEN each
  succeeds _(verifies R2)_
- **accepts each discount shape** — GIVEN `{type:'none'}`, `{type:'percent',value}`,
  `{type:'fixed',value}` WHEN parsed THEN each succeeds and the union narrows correctly
  _(verifies R1)_

##### Schema rejection — quantity and price

- **rejects quantity below the minimum** — GIVEN qty=0 or qty=0.999 WHEN parsed THEN rejected
  with `QUANTITY_TOO_LOW` _(verifies R2)_
- **rejects quantity above the cap** — GIVEN qty=1,000,001 WHEN parsed THEN rejected with
  `QUANTITY_TOO_LARGE` _(verifies R2)_
- **rejects over-precision quantity** — GIVEN qty=1.2345 (4dp) WHEN parsed THEN rejected with
  `QUANTITY_PRECISION` _(verifies R2)_
- **rejects negative unit price** — GIVEN unitPrice=-1 WHEN parsed THEN rejected with
  `UNIT_PRICE_NEGATIVE` _(verifies R2)_
- **rejects unit price above the cap** — GIVEN unitPrice=1,000,000.01 WHEN parsed THEN rejected
  with `UNIT_PRICE_TOO_LARGE` _(verifies R2)_
- **rejects over-precision unit price** — GIVEN unitPrice=1.005 (3dp) WHEN parsed THEN rejected
  with `MONEY_PRECISION` _(verifies R2)_

##### Schema rejection — discount and tax

- **rejects out-of-range percent discount** — GIVEN `{type:'percent', value:101}` or `value:-1`
  WHEN parsed THEN rejected with `DISCOUNT_PERCENT_OUT_OF_RANGE` _(verifies R7)_
- **rejects out-of-range tax** — GIVEN taxPercent=101 or -1 WHEN parsed THEN rejected with
  `TAX_PERCENT_OUT_OF_RANGE` _(verifies R7)_
- **documents DISCOUNT_TYPE_CONFLICT as reserved** — GIVEN a malformed discount object with an
  unrecognized `type` WHEN parsed THEN rejected with a generic shape error, confirming the code
  is not reachable through this schema (per ARCH Tech Choices note) _(REQ edge case)_

##### Array bound

- **rejects a request over 500 lines** — GIVEN a `lines` array of 501 entries WHEN parsed THEN
  rejected with `VALIDATION_FAILED` (shape constraint, not a domain code)

##### Mapper regression guard

- **passes through a domain code via params.code** — GIVEN a ZodError issue with
  `code: 'custom'` and `params: { code: 'QUANTITY_TOO_LOW' }` WHEN `mapToEnvelope` runs THEN
  `details[].code` is `'QUANTITY_TOO_LOW'` _(verifies R7)_
- **falls back to zod's native code when no params.code is set** — GIVEN a plain ZodError issue
  with no `params` (the exact shape `health.test.ts:118-119` already exercises: `too_small`,
  `invalid_type`) WHEN `mapToEnvelope` runs THEN `details[].code` is unchanged from today
  _(guards backward-regression risk for `envelope-mapper.ts`)_

### Implementation Notes

- **Module(s):** `apps/backend/src/contracts/pricing.ts` (Module Boundaries: zod-only
  dependency), `apps/backend/src/api/errors/envelope-mapper.ts`
- **Pattern reference:** `contracts/health.ts` for schema+type export shape;
  `envelope-mapper.ts`'s existing `ZodError` branch for the amendment site
- **Key decisions:** A1 (integer representations), A5 (domain codes via `superRefine`/
  `params.code`), A6 (`/api/v1/` prefix — the route itself is T3's job, but the schema doesn't
  care about the path)
- **Libraries:** zod (`superRefine`/`ctx.addIssue` for attaching `params.code`)
- **High-risk callouts:** the mapper amendment must stay additive — the fallback test above is
  the guard; do not change behavior for issues without `params.code`.

### Scope Boundaries

- Do NOT write any `src/pricing/*.ts` implementation — T2 owns that directory (ARCH Out of
  Scope carries the brief's own guardrail forward).
- Do NOT add a route — T3's job.
- Only implement schemas, codes, the fixture, the frontend mirror, the docs snapshot, and the
  mapper amendment.

### Files Expected

**New files:**
- `apps/backend/src/contracts/pricing.ts` — schemas + error codes (pattern: `contracts/health.ts`)
- `apps/backend/src/contracts/pricing.test.ts` — schema tests, colocated
- `apps/backend/test/fixtures/pdf-sample.ts` — the PDF's 3-line sample as data
- `apps/frontend/src/lib/api/types/pricing.ts` — hand-written mirror (pattern: `lib/api/types/health.ts`)
- `docs/contracts/phase-1.md` — endpoint, schemas, rounding-policy paragraph, sample table
  (pattern: `docs/contracts/phase-0.md`) — completion checked by reading the file for the
  required content, not a unit test
- `apps/backend/src/api/errors/envelope-mapper.test.ts` — mapper regression coverage, colocated

**Modified files:**
- `apps/backend/src/api/errors/envelope-mapper.ts` (read `params.code` off custom zod issues,
  fall back to `i.code` otherwise — additive)

**Must NOT modify:**
- `apps/backend/src/contracts/errors/envelope.ts` (frozen since Phase 0 — only the mapper's
  internal logic changes, not the envelope shape)
- `apps/backend/src/api/plugins/error-handler.ts` (out of scope — reads the top-level code only,
  unaffected by this change)

---

## Task T2: Pricing engine

> **Status:** done
> **Verification:** tdd
> **Effort:** m
> **Priority:** critical
> **Depends on:** T1 (naming/shape reference only — the engine still imports nothing from it)
> **Satisfies REQs:** R1, R3, R4, R5
> **Footprint slice:** New: `src/pricing/{units,rounding,calculate-line,calculate-document,index}.ts` + colocated tests; Modified: `apps/backend/vitest.config.ts`
> **High-risk areas touched:** None

### Description

The single shared calculation module: pure functions over integer cents/thousandths/basis
points, correct against the PDF's sample and defensible on rounding. This is the highest-value
code in the repository — every later phase that touches money calls this rather than
reimplementing it. Also fixes the backend test runner so colocated `src/pricing/*.test.ts` files
are actually discovered (currently only `test/**/*.test.ts` is scanned).

### Test Plan

#### Test File(s)
- `apps/backend/src/pricing/units.test.ts`
- `apps/backend/src/pricing/rounding.test.ts`
- `apps/backend/src/pricing/calculate-line.test.ts`
- `apps/backend/src/pricing/calculate-document.test.ts`

#### Test Scenarios

##### Units

- **round-trips cleanly** — GIVEN a major-unit value WHEN converted to cents/thousandths/basis
  points and back THEN the original value is recovered exactly _(verifies R1)_
- **rejects out-of-precision input** — GIVEN a value with more decimal places than the unit
  allows WHEN converted THEN it throws rather than silently truncating _(verifies R1)_

##### Rounding

- **rounds half-up away from zero** — GIVEN a value exactly on a half-cent (e.g. the arithmetic
  behind Widget A's tax: comment showing the exact half-cent case) WHEN rounded THEN it rounds
  away from zero, not toward +∞ or via `toFixed` _(verifies R4)_

##### calculateLine — PDF sample

- **Widget A** — GIVEN qty=2, unitPrice=100.00, discount=10%, tax=5% WHEN calculated THEN
  subtotal/discount/afterDiscount/tax/total = 200.00/20.00/180.00/9.00/189.00 _(verifies R4)_
- **Widget B** — GIVEN qty=1, unitPrice=50.00, no discount, tax=5% WHEN calculated THEN
  50.00/0.00/50.00/2.50/52.50 _(verifies R4)_
- **Service fee** — GIVEN qty=1, unitPrice=200.00, discount=$20 fixed, no tax WHEN calculated
  THEN 200.00/20.00/180.00/0.00/180.00 _(verifies R4)_

##### calculateLine — discount edge cases

- **100% discount** — GIVEN a percent discount of 100 WHEN calculated THEN afterDiscount is 0
  and total reflects only tax on zero _(REQ edge case)_
- **fixed discount equal to subtotal** — GIVEN a fixed discount exactly equal to the line
  subtotal WHEN calculated THEN it's allowed, total is 0 _(verifies R5)_
- **fixed discount over subtotal throws** — GIVEN a fixed discount greater than the subtotal
  WHEN calculated THEN it throws `DISCOUNT_EXCEEDS_SUBTOTAL` _(verifies R5)_
- **tax absent vs. tax 0** — GIVEN `taxPercent: null` and `taxPercent: 0` WHEN calculated THEN
  both produce identical results _(REQ edge case)_

##### calculateLine — quantity bounds and rounding order

- **quantity lower bound** — GIVEN qty=0 or qty=0.999 WHEN calculated THEN throws
  `QUANTITY_TOO_LOW`; GIVEN qty=1, 1.5, or 2.5 THEN accepted _(verifies R2 at the engine layer)_
- **subtotal rounds before discount applies** — GIVEN qty=2.5, unitPrice=10.01 WHEN calculated
  THEN the subtotal rounds to 25.03 before the discount is computed _(verifies R4)_
- **boundary values** — GIVEN qty at its minimum, unitPrice=0, tax at 0 and 100 WHEN calculated
  THEN all resolve without error _(REQ edge case)_
- **floating-point traps** — GIVEN qty=3, unitPrice=0.1 (a classic `0.1+0.2`-class input) WHEN
  calculated THEN the result is exact cents, no drift _(verifies R1)_

##### calculateDocument

- **full PDF sample** — GIVEN the fixture's 3 lines WHEN calculated THEN document
  subtotal/discount/tax/grandTotal = 450.00/40.00/11.50/421.50 _(verifies R4)_
- **grand total identity** — GIVEN any set of lines WHEN calculated THEN
  `grandTotal === subtotal - totalDiscount + totalTax` _(verifies R4)_

##### Resilience

- **repeated calls are stable** — GIVEN identical input WHEN `calculateDocument` is called twice
  THEN both calls return identical output (no shared mutable state) _(verifies ARCH
  forward-stress: concurrent calls)_

### Implementation Notes

- **Module(s):** `apps/backend/src/pricing/**` (Module Boundaries: imports nothing outside
  itself)
- **Pattern reference:** none in-repo for a zero-dependency module; `test/api/health.test.ts`
  for assertion style only
- **Key decisions:** A1 (integer representations, safe under `MAX_SAFE_INTEGER`), A2
  (`roundHalfUp`, not `Math.round`/`toFixed`), A3 (imports nothing, not even contract types), A4
  (discount over subtotal throws, not clamps)
- **Libraries:** none — the point of this module
- **High-risk callouts:** None flagged in ARCH for this footprint slice.

### Scope Boundaries

- Do NOT import zod, the logger, the database, or any money library (ARCH Out of Scope / A3).
- Do NOT add a route or touch `src/api/**` (brief's own guardrail).
- Only implement `units.ts`, `rounding.ts`, `calculate-line.ts`, `calculate-document.ts`,
  `index.ts`, and the `vitest.config.ts` include fix.

### Files Expected

**New files:**
- `apps/backend/src/pricing/units.ts` — `toCents`/`fromCents`/`toThousandths`/`toBasisPoints` + inverses
- `apps/backend/src/pricing/rounding.ts` — `roundHalfUp`
- `apps/backend/src/pricing/calculate-line.ts` — `calculateLine`
- `apps/backend/src/pricing/calculate-document.ts` — `calculateDocument`
- `apps/backend/src/pricing/index.ts` — public exports
- `apps/backend/src/pricing/*.test.ts` — colocated, per file above

**Modified files:**
- `apps/backend/vitest.config.ts` (`include` gains `'src/**/*.test.ts'` alongside the existing
  `'test/**/*.test.ts'`)

**Must NOT modify:**
- `apps/backend/src/contracts/pricing.ts` (T1's — read the fixture and shape, never edit)
- `apps/backend/test/fixtures/pdf-sample.ts` (read-only source of truth for these tests)

### TDD Sequence (optional)

`units.ts` → `rounding.ts` → `calculate-line.ts` → `calculate-document.ts`. Each layer's tests
depend on the one before existing and being correct — the PDF sample assertions in
`calculate-line.test.ts` will not pass until unit conversion and rounding are both solid.

---

## Task T3: Preview endpoint

> **Status:** done
> **Verification:** tdd
> **Effort:** m
> **Priority:** high
> **Depends on:** T1, T2
> **Satisfies REQs:** R6, R7
> **Footprint slice:** New: `api/routes/pricing.ts`, `services/pricing-preview.ts`, `api/errors/engine-errors.ts`, `test/api/pricing-preview.test.ts`
> **High-risk areas touched:** None

### Description

A stateless `POST /api/v1/pricing/preview` that validates a request against T1's contract,
converts major units to the engine's internal representation, calls T2's `calculateDocument`,
and converts the result back. Maps the engine's thrown `DISCOUNT_EXCEEDS_SUBTOTAL` to a 400 with
the offending line's field path. No arithmetic happens in this layer — it only validates,
converts, and delegates.

### Test Plan

#### Test File(s)
- `apps/backend/test/api/pricing-preview.test.ts` (pattern: `test/api/health.test.ts`'s
  `app.inject()` usage)

#### Test Scenarios

##### Happy path

- **PDF sample through HTTP** — GIVEN the fixture's 3 lines POSTed to
  `/api/v1/pricing/preview` WHEN the request completes THEN the response matches the fixture's
  numbers exactly (450.00/40.00/11.50/421.50, per-line totals too) _(verifies R6)_
- **route matches direct engine call** — GIVEN the same input WHEN calculated via HTTP and via
  `calculateDocument` directly THEN the two agree bit-for-bit _(verifies R6)_

##### Validation rejections

- **one test per rejection code** — GIVEN a request with money over 2dp, quantity over 3dp,
  quantity ≤0, negative unit price, percent outside 0–100, or both discount types at once WHEN
  posted THEN each returns 400 with its specific code and a `details[].path` matching the
  field (e.g. `lines.1.taxPercent`) _(verifies R7)_

##### Engine error mapping

- **discount exceeds subtotal** — GIVEN a fixed discount greater than a line's subtotal WHEN
  posted THEN the response is 400 `DISCOUNT_EXCEEDS_SUBTOTAL` with that line's path _(verifies
  R5 via R7)_

##### Resilience

- **statelessness guard** — GIVEN the route handler's implementation WHEN inspected/exercised
  THEN it makes no call through `app.db` _(verifies ARCH forward-stress: DB outage doesn't
  affect this endpoint)_

### Implementation Notes

- **Module(s):** `api/routes/pricing.ts`, `services/pricing-preview.ts`,
  `api/errors/engine-errors.ts` (Module Boundaries table)
- **Pattern reference:** `api/routes/health.ts` for the autoloaded-route shape and response
  validation habit; `api/errors/envelope-mapper.ts` as the sibling pattern for
  `engine-errors.ts`
- **Key decisions:** A6 (`/api/v1/` prefix), A5 (specific codes flow through the amended
  mapper for schema-level rejections; engine-level `DISCOUNT_EXCEEDS_SUBTOTAL` is mapped
  separately in `engine-errors.ts` since it's a thrown error, not a zod issue)
- **Libraries:** Fastify route registration (autoloaded, no manual wiring in `app.ts`)
- **High-risk callouts:** None flagged in ARCH for this footprint slice.

### Scope Boundaries

- Do NOT perform arithmetic on money in this layer — if it needs `*` or `+` on a money value,
  that belongs in T2's engine (brief's own guardrail).
- Do NOT add database access, sessions, or persistence (ARCH Out of Scope).
- Do NOT add a second error handler (Phase 0 invariant — use the existing one).
- Only implement the route, the conversion service, and the engine-error mapping.

### Files Expected

**New files:**
- `apps/backend/src/api/routes/pricing.ts` — the route (pattern: `api/routes/health.ts`)
- `apps/backend/src/services/pricing-preview.ts` — unit conversion + engine call
- `apps/backend/src/api/errors/engine-errors.ts` — engine-throw → 400 mapping
- `apps/backend/test/api/pricing-preview.test.ts`

**Modified files:**
_None — all of this task's changes are new files._

**Must NOT modify:**
- `apps/backend/src/contracts/pricing.ts` (T1's — read-only)
- `apps/backend/src/pricing/**` (T2's — call it, never edit it)
- `apps/backend/test/fixtures/pdf-sample.ts` (read-only)
- `apps/backend/src/app.ts` (autoloader registers the route; never edited by hand)

---

## Task T4: Typed preview client

> **Status:** done
> **Verification:** tdd
> **Effort:** s
> **Priority:** medium
> **Depends on:** T1
> **Satisfies REQs:** R9
> **Footprint slice:** New: `apps/frontend/src/lib/api/pricing.ts` + colocated test
> **High-risk areas touched:** None

### Description

A typed `preview(lines)` wrapper over the existing `apiFetch` client that debounces rapid calls
and discards responses that arrive out of order — the mechanism that makes the editor's live
totals trustworthy even when a slow reply for an earlier edit arrives after a fast reply for a
later one.

### Test Plan

#### Test File(s)
- `apps/frontend/src/lib/api/pricing.test.ts` (pattern: `lib/api/client.test.ts`)

#### Test Scenarios

##### Request shaping

- **calls apiFetch with the right shape** — GIVEN a set of lines WHEN `preview()` is called
  THEN it POSTs to `/api/v1/pricing/preview` with `{ lines }` as the body _(verifies R6 at the
  client boundary)_

##### Debounce and ordering

- **debounces rapid calls** — GIVEN several calls within the debounce window WHEN they fire
  THEN only the last one reaches `apiFetch` _(verifies R9)_
- **drops an out-of-order response** — GIVEN an older request's response resolving after a
  newer request's response WHEN both settle THEN the caller only ever observes the newer result
  _(verifies R9 / ARCH forward-stress: race condition)_

##### Error passthrough

- **surfaces ApiError unchanged** — GIVEN `apiFetch` rejects with an `ApiError` (code, message,
  details) WHEN `preview()` propagates it THEN the caller receives the same three fields
  _(verifies R7 at the client boundary)_

### Implementation Notes

- **Module(s):** `apps/frontend/src/lib/api/pricing.ts` (Module Boundaries: depends on
  `lib/api/client.ts` read-only, `lib/api/types/pricing.ts`)
- **Pattern reference:** `lib/api/client.ts` / `client.test.ts` for the `apiFetch` wrapping
  style
- **Key decisions:** A7 (no id/description on the wire — this client only ever sends the 4
  calculation fields), A8 (server-only totals — this is the layer that makes dropping stale
  responses possible)
- **Libraries:** none new
- **High-risk callouts:** None flagged in ARCH for this footprint slice.

### Scope Boundaries

- Do NOT edit `lib/api/client.ts` (brief's own guardrail — read-only dependency).
- Do NOT render anything — this is the data layer only; T5 owns rendering.
- Only implement `preview()`, its debounce, and its stale-response guard.

### Files Expected

**New files:**
- `apps/frontend/src/lib/api/pricing.ts`
- `apps/frontend/src/lib/api/pricing.test.ts`

**Modified files:**
_None._

**Must NOT modify:**
- `apps/frontend/src/lib/api/client.ts` (silent-regression hotspot per ARCH — read-only)
- `apps/frontend/src/lib/api/types/pricing.ts` (T1's mirror — read-only)

---

## Task T5: Editor UI

> **Status:** done
> **Verification:** ui
> **Effort:** m
> **Priority:** high
> **Depends on:** T1, T4
> **Satisfies REQs:** R8, R10
> **Footprint slice:** New: `app/(app)/editor/page.tsx`, `components/line-items/**`, `components/money/**`
> **High-risk areas touched:** Frontend navigation shell (L risk, ARCH Areas of Impact) — the
> new nav entry itself is T6's job, but this task's page is what it points to

### Description

The line-item editing surface from `design/htmls/document-edit.html`: a table for
description/quantity/unit price/discount/tax/line-total with add/remove row, wired to T4's
`preview()` client. Renders server-computed totals only — no arithmetic in the browser, even
during the pending state while a request is in flight.

### Verification Checklist

- **table columns match the mockup** — description, qty, unit price, discount, tax, line total
  render using `styles/tokens.css` tokens, no re-derived colors — expected: visual match to
  `document-edit.html`'s table structure
- **add row / remove row work** — click "+ Add line" adds an empty row; "Remove" removes a row
  — expected: row count updates, remaining rows keep their values
- **discount type-select structurally prevents "both"** — switching between none/percent/fixed
  shows only the relevant value input and clears the stale value from the previous mode —
  expected: no way to have two discount values present at once _(verifies R10)_
- **an invalid discount value keeps its inline error** — expected: switching type away and back
  doesn't silently clear a still-relevant validation error — component test if this state
  proves non-trivial (brief's own guardrail: skip if the component stays a thin controlled
  form)
- **totals render server output only** — enter the PDF's sample lines, confirm every number
  shown (subtotal, discount, tax, line totals, grand total) came from the last
  `/pricing/preview` response — expected: grand total reads 421.50 for the sample; grep
  confirms no `useMemo`/inline multiplication over money fields in this footprint _(verifies
  R8)_
- **pending state shows the previous total, never a guess** — trigger a new debounced request
  and observe the UI while it's in flight — expected: the prior server value stays visible in a
  visually distinct pending state, no locally computed number appears
- **unmatched API error path falls back gracefully** — GIVEN a `details[].path` that doesn't
  match any rendered field WHEN it's returned WHEN THEN a document-level message appears rather
  than the error disappearing — component test
- **money formatting** — all money values show 2 decimal places with tabular numerals via the
  one formatting helper in `components/money/` — expected: no `toFixed` arithmetic anywhere
  else in this footprint (grep check)

#### Testable Seams
initial render with sample data, discount-mode switch (both directions), inline field-error
rendering against a matched and an unmatched path, pending-state visual during an in-flight
request.

### Implementation Notes

- **Module(s):** `app/(app)/editor/**`, `components/line-items/**`, `components/money/**`
  (Module Boundaries)
- **Pattern reference:** `app/page.tsx` for the client-component + `Topbar` usage pattern;
  `components/shell/*` for token usage conventions
- **Key decisions:** A7 (no id/description crosses the wire — description is local row state
  only), A8 (server-only totals, pending-state rule)
- **Libraries:** none new — plain CSS Modules with existing tokens, per Phase 0 stack
  conventions
- **High-risk callouts:** none direct; the nav entry that will point here is T6's L-risk change.

### Scope Boundaries

- Do NOT add persistence, a save button, or document metadata (title/customer/issue date) — ARCH
  Out of Scope, Phase 3 territory.
- Do NOT use `useMemo` to compute a total, or any other local arithmetic over money (brief's own
  guardrail).
- Do NOT edit `lib/api/client.ts` or `lib/api/types/pricing.ts` (read-only dependencies).
- Only implement the editor page and its line-item/money components.

### Files Expected

**New files:**
- `apps/frontend/src/app/(app)/editor/page.tsx` (pattern: `app/page.tsx`)
- `apps/frontend/src/components/line-items/**` (table, row, discount-type-select)
- `apps/frontend/src/components/money/**` (formatting helper + display, plus its component test
  if the discount-mode state proves non-trivial per the brief's own guardrail)

**Modified files:**
_None — this task does not touch the shell; the nav entry is T6's job._

**Must NOT modify:**
- `apps/frontend/src/lib/api/client.ts` (read-only)
- `apps/frontend/src/lib/api/types/pricing.ts` (read-only)
- `apps/frontend/src/components/shell/**` (join-only per repo convention — this task's page
  exists before it's wired into navigation)

---

## Task T6: Join J1

> **Status:** not started
> **Verification:** checklist
> **Effort:** s
> **Priority:** high
> **Depends on:** T1, T2, T3, T4, T5
> **Satisfies REQs:** N/A — integration verification across R1–R11
> **Footprint slice:** New: `e2e/pricing-preview.cy.ts`; Modified: `apps/frontend/src/components/shell/nav-items.ts`
> **High-risk areas touched:** Frontend navigation shell (L risk, ARCH Areas of Impact) — the
> nav-items.ts change itself

### Description

Proves every task in this phase agrees with every other: full suite green in both apps, the
Cypress happy path exercising the real endpoint end-to-end, the editor wired into navigation,
and the seam commit that closes the phase.

### Verification Checklist

- **`cd apps/backend && npx vitest run`** — expected: exits 0, all suites green (including T1's
  and T2's colocated tests, now discoverable after T2's `vitest.config.ts` fix)
- **`cd apps/frontend && npm test && npm run build`** — expected: exits 0
- **`make up`** (or `docker compose up --build`), then run `e2e/pricing-preview.cy.ts` — expected:
  entering the PDF's 3 sample lines in the editor produces a grand total reading **421.50**
- **browser network tab inspection during the Cypress run** — expected: the total is visibly
  populated by the `/api/v1/pricing/preview` response, not computed client-side
- **`nav-items.ts` has one new entry** pointing at `/editor` — expected: `NavSlot.tsx` renders it
  without regressing (no existing test asserted the array's emptiness, confirmed by grep in
  ARCH's Change Footprint)
- **commit** — expected: `chore(J1): join phase 1`, touching only `e2e/pricing-preview.cy.ts`
  and `nav-items.ts`

### Implementation Notes

- **Module(s):** `e2e/**` (join-owned per repo convention), `components/shell/nav-items.ts`
  (join-only per repo convention)
- **Pattern reference:** `e2e/health.cy.js` for the Cypress happy-path structure
- **Key decisions:** none new — this task verifies T1–T5's decisions hold together
- **Libraries:** Cypress (already in the stack, Phase 0)
- **High-risk callouts:** the nav-items.ts change is the one L-risk footprint entry this task
  owns directly; the checklist item above is its guard.

### Scope Boundaries

- Do NOT fix seams by editing T1–T5's owned files beyond `nav-items.ts` — if something disagrees,
  that's a finding to report, not a silent fix (no multi-agent lane fiction here, but the
  discipline of "the contract decides" still applies).
- Only implement the Cypress spec and the nav entry.

### Files Expected

**New files:**
- `e2e/pricing-preview.cy.ts` (pattern: `e2e/health.cy.js`)

**Modified files:**
- `apps/frontend/src/components/shell/nav-items.ts` (adds one entry for `/editor`)

**Must NOT modify:**
- Any file owned by T1–T5 beyond what's listed above.
