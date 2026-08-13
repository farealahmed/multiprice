# Tasks: Summary report (lane briefs)

> **Date:** 2026-08-13
> **Issue:** #6
> **Phase:** 3 of 5 (Task Generation)
> **Architecture:** `specs/architecture/ARCH-6-summary-report-lane-briefs.md` — read that document first; every task below is a slice of its Change Footprint and traces to its Inferred Requirements (R1–R32) and Architecture Decisions Log (A1–A4).

## Execution Plan

```
T1 (contract) ──┬───────────────────────► T4 (service) ─┐
                 │                                        ├─► T5 (routes) ─┐
T2 (repo filter) ┴─► T3 (aggregation) ────────────────────┘                │
T1 ────────────────────────────────────► T6 (evidence, blind/red until T5) ┤──► T9 (join)
T1 ────────────────────────────────────► T7 (fe client) ─► T8 (report UI) ─┘
```

| Wave | Runs | Terminals | Depends on |
|---|---|---|---|
| 1 | T1 · T2 | 2 | — |
| 2 | T3 · T6 · T7 | 3 | Wave 1 (T2 for T3; T1 for T6 and T7) |
| 3 | T4 · T8 | 2 | Wave 2 (T1+T3 for T4; T7 for T8) |
| 4 | T5 | 1 | Wave 3 (T1+T2+T4 for T5) |
| 5 | T9 — join | 1 | Wave 4, plus T6 and T8 |

**Why T1 and T2 can run together:** T1 touches `contracts/report.ts`, `contracts/document.ts`,
`lib/api/types/report.ts`, `docs/contracts/phase-5.md`; T2 touches only
`persistence/documents.repository.ts` (`buildIssueDateFilter` + widened `list()`, typing against
`domain/document.ts` — already frozen since Phase 3, not against anything T1 produces). Disjoint
files, no import relationship.

**Why T3/T6/T7 share wave 2:** T3 needs only T2's `buildIssueDateFilter` export; T6 and T7 need
only T1's contract (error codes and `ReportSummary`/`dateRangeQuerySchema` shapes for T6's
assertions, mirrored types for T7's client). None imports another's output. T6 is written **blind**
against T1 and T3/T4/T5's not-yet-existing implementation, exactly like ARCH-5's T6 and this
project's own `4-B`/`5-A` lane-brief precedent: it stays red until T5 lands, green at the join. That
is the point, not a bug in the schedule.

**Why T4 waits for T3 but T8 doesn't wait for T5:** T4's `summarizeReports` calls T3's
`repository.summarize` directly, so it cannot even typecheck until T3 exists. T8 only imports T7's
`lib/api/reports.ts`/`lib/api/documents.ts` — typed client functions — so its component tests and
range-picker wiring don't need a live backend route; the routes only need to be real by the time
`e2e/report.cy.ts` runs at T9.

**Why T5 is its own wave:** it depends on T1, T2, **and** T4 (the report route calls
`summarizeReports`; the documents-list amendment calls `list(ownerId, range)`), so it cannot start
until both the aggregation and the service line are done — one wave later than either.

**Commit discipline:** every task commits by pathspec, scope = task id, per
`docs/parallel-execution.md` §3 (e.g. `feat(T3): report aggregation --
apps/backend/src/persistence/reports.repository.ts apps/backend/src/persistence/reports.repository.test.ts`).

---

## Task T1: Report contract, list-query amendment, frontend mirror, contract docs

> **Status:** not started
> **Verification:** tdd
> **Effort:** m
> **Priority:** critical
> **Depends on:** None
> **Satisfies REQs:** R1, R2, R3, R4, R5, R6, R7, R31
> **Footprint slice:** New: `apps/backend/src/contracts/report.ts`, `apps/backend/src/contracts/report.test.ts`, `apps/frontend/src/lib/api/types/report.ts`, `docs/contracts/phase-5.md`; Modified: `apps/backend/src/contracts/document.ts`, `apps/backend/src/contracts/document.test.ts`
> **High-risk areas touched:** None individually H/M, but everything downstream (T3, T5, T6, T7) imports this task's output — a shape mistake here blocks four later tasks rather than one

### Description

Freezes `dateRangeQuerySchema` (both `from`/`to` optional, independently — reused by both the
report route and the amended document-list route, per the brief's own instruction to add the query
schema to `contracts/document.ts` while keeping one validator), the two error codes
`DATE_RANGE_INVALID`/`DATE_RANGE_INVERTED` (the latter attaching `path: ['to']`, per Developer
Decision A3), and the `ReportSummary` response schema. `contracts/document.ts` gains one new export,
`documentListQuerySchema`, aliasing `report.ts`'s `dateRangeQuerySchema` rather than redeclaring
equivalent validation (Tech Choices: cross-domain schema reuse, mirroring `document.ts`'s own
existing reuse of `pricing.ts`'s `lineInputSchema`). Mirrors `ReportSummary` and the codes to the
frontend, and writes `docs/contracts/phase-5.md` carrying the three policy statements verbatim
(both-ends-inclusive, the plain-string-comparison timezone rule, and the draft-inclusion assumption)
— the brief's own "Done when" criterion for this gate.

### Test Plan

#### Test File(s)
- `apps/backend/src/contracts/report.test.ts` (new, following `contracts/document.test.ts`'s
  pattern — a local `domainCode()` helper reading `params.code` off custom zod issues, same shape)
- `apps/backend/src/contracts/document.test.ts` (existing, extended with one new `describe` block
  for the amendment)

#### Test Scenarios

##### `dateRangeQuerySchema` acceptance

- **accepts a full range where `from <= to`** — GIVEN `{from:'2026-07-01', to:'2026-07-31'}` WHEN
  parsed THEN it succeeds _(verifies R3)_
- **accepts `from === to`** — GIVEN `{from:'2026-07-15', to:'2026-07-15'}` WHEN parsed THEN it
  succeeds — a single-day range is not an inversion _(verifies R3)_
- **accepts an empty query (`{}`)** — GIVEN no `from`/`to` WHEN parsed THEN it succeeds, both
  undefined _(verifies R2 — both are optional)_
- **accepts a one-sided range** — GIVEN only `from` or only `to` WHEN parsed THEN it succeeds
  _(verifies R2's "both optional" independently)_

##### `DATE_RANGE_INVALID`

- **rejects a malformed `from`** — GIVEN `{from:'07/01/2026'}` WHEN parsed THEN it fails with
  domain code `DATE_RANGE_INVALID` at path `['from']` _(verifies R6)_
- **rejects a malformed `to`** — symmetric, path `['to']` _(verifies R6)_

##### `DATE_RANGE_INVERTED` (A3: `path: ['to']`)

- **rejects `from > to`** — GIVEN `{from:'2026-08-01', to:'2026-07-01'}` WHEN parsed THEN it fails
  with domain code `DATE_RANGE_INVERTED` at path `['to']` _(verifies R6, R31)_

##### Error code completeness

- **lists every `ReportErrorCode` in the code array** — mirrors `document.test.ts`'s
  `DOCUMENT_ERROR_CODES` exhaustiveness assertion _(verifies R6)_

##### `ReportSummary` shape

- **schema's fields are exactly `from`, `to`, `documentCount`, `totalGrandTotal`, `totalTax`,
  `totalDiscount`** — mirrors `document.test.ts`'s "excludes `ownerId`" shape assertion, applied
  here as a positive exact-keys check _(verifies R1)_

##### `contracts/document.ts` amendment (in `document.test.ts`)

- **`documentListQuerySchema` is `report.ts`'s `dateRangeQuerySchema`, reused not redeclared** —
  GIVEN both exports WHEN compared THEN they are reference-equal (or, if re-exported by value,
  behaviorally identical on the same inverted-range input, asserting the same domain code at the
  same path) — proves the "one shared validator" tech choice, not just a same-shaped duplicate
  _(verifies R2, guards against the exact kind of two-independent-date-comparisons drift R13 warns
  about one layer down)_

### Implementation Notes

- **Module(s):** `contracts/report.ts` (schema + codes, following `contracts/document.ts`'s
  schema-and-codes-in-one-file shape), `contracts/document.ts` (one-line amendment)
- **Pattern reference:** `contracts/document.ts`'s existing `superRefine`/`ctx.addIssue({code:
  'custom', params:{code}})` style for `DATE_RANGE_INVALID` (per-field); this task's
  `DATE_RANGE_INVERTED` check is the project's **first cross-field** `superRefine` (compares `from`
  against `to`) — model it on the same `ctx.addIssue` call, just attached to the object schema's own
  `superRefine` rather than a single field's
- **Key decisions:** A3 (`DATE_RANGE_INVERTED` → `path: ['to']`), Tech Choices row 2
  (`document.ts` imports `report.ts`'s schema rather than re-validating)
- **Libraries:** `zod` only
- **High-risk callouts:** none individually, but this is the task every other task's typecheck
  depends on first — get the shape right before anything downstream starts

### Scope Boundaries

- Do NOT implement the aggregation, the service, or either route — schema/types/docs only
- Do NOT add a status filter anywhere in the schema (R5 — drafts included is a documented
  assumption, not a query parameter)
- Do NOT redeclare `dateRangeQuerySchema`'s validation logic inside `contracts/document.ts` —
  import and reuse it

### Files Expected

**New files:**
- `apps/backend/src/contracts/report.ts` (pattern: `contracts/document.ts`)
- `apps/backend/src/contracts/report.test.ts` (pattern: `contracts/document.test.ts`)
- `apps/frontend/src/lib/api/types/report.ts` (pattern: `lib/api/types/lifecycle.ts`)
- `docs/contracts/phase-5.md` (pattern: `docs/contracts/phase-4.md`) — must carry the
  both-ends-inclusive rule, the plain-string-comparison timezone sentence, and the draft-inclusion
  assumption verbatim

**Modified files:**
- `apps/backend/src/contracts/document.ts` (adds `documentListQuerySchema`, reusing `report.ts`'s
  `dateRangeQuerySchema`)
- `apps/backend/src/contracts/document.test.ts` (adds the reuse-assertion scenario above; existing
  assertions unmodified)

**Must NOT modify:**
- `apps/backend/src/contracts/pricing.ts`, `apps/backend/src/contracts/lifecycle.ts`
- `apps/backend/src/contracts/errors/envelope.ts` (frozen since Phase 0)

---

## Task T2: Shared date filter + `documents.repository.ts` `list()` amendment

> **Status:** done
> **Verification:** tdd
> **Effort:** s
> **Priority:** high
> **Depends on:** None
> **Satisfies REQs:** R13, R29
> **Footprint slice:** Modified: `apps/backend/src/persistence/documents.repository.ts`, `apps/backend/src/persistence/documents.repository.test.ts`
> **High-risk areas touched:** `persistence/documents.repository.ts` (M) — T3's `reports.repository.ts` will import this task's `buildIssueDateFilter`; a mismatch between the list filter and the aggregation `$match` is the exact "scored failure" the brief names by name (5-A step 6)

### Description

`buildIssueDateFilter(range?: {from?: string; to?: string}): Filter<StoredDocument>` — a pure
function, exported so T3 can import it. Returns `{}` when `range` is absent or has neither field set
(so `list()`'s existing zero-argument behavior is preserved exactly), `{issueDate: {$gte, $lte}}`
when both are present, and a one-sided `{$gte}`/`{$lte}` when only one is given (mirrors T1's schema
allowing independent optionality). `list(ownerId, range?)` merges this into the existing
`base.find(ownerId, {})` call's filter argument.

### Test Plan

#### Test File(s)
- `apps/backend/src/persistence/documents.repository.test.ts` (existing, extended)

#### Test Scenarios

##### `buildIssueDateFilter`

- **returns `{}` for `undefined`** — GIVEN no argument WHEN called THEN it returns `{}` _(verifies
  R29 — the "no range ⇒ unfiltered" contract both `list()` and T3 depend on)_
- **returns `{}` for an empty range object** — GIVEN `{}` WHEN called THEN it returns `{}` (defensive
  — the schema from T1 can produce this exact shape) _(verifies R29)_
- **returns `{$gte, $lte}` for a full range** — GIVEN `{from:'2026-07-01', to:'2026-07-31'}` WHEN
  called THEN it returns `{issueDate: {$gte:'2026-07-01', $lte:'2026-07-31'}}` — plain strings, no
  `Date` object _(verifies R3, R4)_
- **returns a one-sided filter for `from` only** — GIVEN `{from:'2026-07-01'}` WHEN called THEN it
  returns `{issueDate: {$gte:'2026-07-01'}}` with no `$lte` key
- **returns a one-sided filter for `to` only** — symmetric

##### `list()` range-aware

- **`list(ownerId)` with no range is unchanged** — GIVEN no second argument WHEN `list` runs THEN
  the fake collection's `find` filter is exactly `{ownerId}` — the same assertion as the file's
  existing "list scopes to ownerId" test, now proving the widened signature is backward compatible
  _(verifies R29; this is the exact regression test the ARCH's Open Questions section asked for)_
- **`list(ownerId, range)` merges owner scope and date filter in one call** — GIVEN a range WHEN
  `list` runs THEN the fake collection's `find` filter is `{ownerId, issueDate:{$gte,$lte}}` — one
  call, `ownerId` inside it, never a post-filter _(verifies R13)_
- **sort is unaffected by a range** — GIVEN a range WHEN `list` runs THEN `findSorts` is still
  `[{issueDate:-1, createdAt:-1}]` — the existing "list sorts newest-first" assertion continues
  passing unmodified

### Implementation Notes

- **Module(s):** `persistence/documents.repository.ts`
- **Pattern reference:** the file's own `find`/`findOne` filter-merging shape; `createOwnedRepository`'s
  `withOwner` is the conceptual model though not directly reusable (unexported)
- **Key decisions:** A1/R29 (helper lives here, not in `persistence/repository.ts`)
- **Libraries:** `mongodb` types only
- **High-risk callouts:** M risk per ARCH — T3 imports this function directly, so a bug here
  propagates into the aggregation's `$match` too. That's also the mitigation: one function, one bug
  surface, not two independently-drifting date comparisons

### Scope Boundaries

- Do NOT add `buildIssueDateFilter` to `persistence/repository.ts` (A1)
- Do NOT add a status filter to `list()` (R5 — no status parameter anywhere in this task)
- Do NOT modify `findById`, `insert`, `update`, `remove`, or `finalizeIfDraft` — additive only

### Files Expected

**Modified files:**
- `apps/backend/src/persistence/documents.repository.ts` (adds `buildIssueDateFilter`, widens
  `list()`)
- `apps/backend/src/persistence/documents.repository.test.ts` (adds the scenarios above; existing
  assertions for `findById`/`insert`/`update`/`remove`/`finalizeIfDraft` unmodified)

**Must NOT modify:**
- `apps/backend/src/persistence/repository.ts`

---

## Task T3: `reports.repository.ts` aggregation

> **Status:** not started
> **Verification:** tdd
> **Effort:** m
> **Priority:** critical
> **Depends on:** T2
> **Satisfies REQs:** R3, R4, R8, R9, R10
> **Footprint slice:** New: `apps/backend/src/persistence/reports.repository.ts`, `apps/backend/src/persistence/reports.repository.test.ts`
> **High-risk areas touched:** `persistence/reports.repository.ts` (H) — this is the scored claim's core mechanism; first `.aggregate()` call in the project

### Description

`summarize(ownerId, range): Promise<ReportAggregate>` (cents-scale, internal type — never exported
past this file) — one `collection.aggregate([...]).toArray()` call: a `$match` stage on
`{ownerId, ...buildIssueDateFilter(range)}` (T2's export — `ownerId` inside the match, never a
post-filter, R8), then a `$group` stage summing `totals.grandTotal`/`totals.totalTax`/
`totals.totalDiscount` and counting documents via `$sum: 1` (R9 — sums the **persisted** fields
directly; this file imports nothing from `src/pricing`). An empty `.toArray()` result is mapped to
`{documentCount:0, totalGrandTotal:0, totalTax:0, totalDiscount:0}` here, at the repository
boundary, rather than propagating `undefined`/`[]` upward (R10) — cents conversion to major units is
explicitly **not** done here; that's T4's job at the service boundary (R11).

### Test Plan

#### Test File(s)
- `apps/backend/src/persistence/reports.repository.test.ts` (new, following
  `documents.repository.test.ts`'s fake-collection pattern, extended with a fake `aggregate`
  returning `{toArray: async () => [...]}`)

#### Test Scenarios

##### Aggregation pipeline shape (R8)

- **calls `aggregate` with a `$match` scoping `ownerId` and the shared date filter, then a `$group`
  summing persisted totals** — GIVEN a range WHEN `summarize` runs THEN the fake collection's
  `aggregate` is called once with a pipeline whose first stage is
  `{$match:{ownerId, issueDate:{$gte,$lte}}}` and whose second stage `$group`s
  `totals.grandTotal`/`totals.totalTax`/`totals.totalDiscount` via `$sum` and counts documents via
  `$sum: 1` _(verifies R8)_
- **`ownerId` is inside `$match`, never a post-filter** — GIVEN the captured pipeline WHEN inspected
  THEN `ownerId` appears only inside the `$match` stage, never as a separate stage after `$group`
  _(verifies R8)_

##### Sums persisted totals only, never re-derives them (R9)

- **returned figures equal the fake `$group` output unchanged** — GIVEN a fake aggregate result WHEN
  `summarize` maps it THEN the returned `ReportAggregate`'s fields equal the fake's raw output
  verbatim — this file has no import from `../pricing` _(verifies R9)_

##### Empty range / no match (R10)

- **returns zeros and `documentCount: 0` when `toArray()` resolves `[]`** — GIVEN an empty
  aggregate result WHEN `summarize` runs THEN it returns
  `{documentCount:0, totalGrandTotal:0, totalTax:0, totalDiscount:0}`, never `null`/`undefined`, and
  no error is thrown _(verifies R10)_

##### Owner isolation (unit-level guard, mirrors R16 which T6 proves end-to-end)

- **a mismatched-owner result zero-fills the same way as a genuinely empty range** — GIVEN the fake
  aggregate returns `[]` for a range where only another owner has documents WHEN `summarize` runs
  THEN the same zero-fill applies, not a leaked total _(verifies R10; guards the isolation property
  T6 exercises against real data)_

### Implementation Notes

- **Module(s):** `persistence/reports.repository.ts`
- **Pattern reference:** `persistence/documents.repository.ts` (repository shape; extend the
  fake-collection test with a fake `aggregate` the same way `documents.repository.test.ts` extended
  it with a fake `findOneAndUpdate` for `finalizeIfDraft`)
- **Key decisions:** A1 (imports `buildIssueDateFilter` from `documents.repository.ts`, not
  `persistence/repository.ts`), A2 (no index — this repository's query is the one that would benefit
  from one; noted, not built)
- **Libraries:** `mongodb` types only (`Filter`, `Document` for the pipeline stage types)
- **High-risk callouts:** H risk per ARCH — mitigated at this layer by the pipeline-shape assertions
  above, and at the integration layer by T6's exact-cents reconciliation test. This task's tests
  prove the pipeline is *shaped* correctly; T6 proves the numbers it produces are *correct*
  end-to-end against real Mongo

### Scope Boundaries

- Do NOT import anything from `src/pricing` — sums persisted totals only (R9)
- Do NOT add a status filter to the `$match` stage (R5)
- Do NOT add an index (A2, Out of Scope)
- Do NOT convert cents to major units here — that's T4's job (R11)

### Files Expected

**New files:**
- `apps/backend/src/persistence/reports.repository.ts` (pattern: `persistence/documents.repository.ts`)
- `apps/backend/src/persistence/reports.repository.test.ts`

**Must NOT modify:**
- `apps/backend/src/persistence/documents.repository.ts` (T2's output — read-only import of
  `buildIssueDateFilter`)
- `apps/backend/src/persistence/repository.ts`

---

## Task T4: `services/reports.ts` orchestration

> **Status:** not started
> **Verification:** tdd
> **Effort:** s
> **Priority:** high
> **Depends on:** T1, T3
> **Satisfies REQs:** R1, R11
> **Footprint slice:** New: `apps/backend/src/services/reports.ts`, `apps/backend/src/services/reports.test.ts`
> **High-risk areas touched:** None beyond what T3 already carries

### Description

`summarizeReports(ownerId, range): Promise<ReportSummary>` — calls T3's `repository.summarize`,
converts each cents field to major units by dividing by 100 exactly once (mirroring
`services/documents.ts`'s `toTotalsResponse` boundary-conversion pattern), and echoes `from`/`to`
back from the already-validated input rather than re-deriving them. No validation logic lives here —
by the time this function runs, the route (T5) has already parsed the query through T1's zod schema.

### Test Plan

#### Test File(s)
- `apps/backend/src/services/reports.test.ts` (colocated, following `services/auth.test.ts`'s
  fake-repository pattern)

#### Test Scenarios

##### Cents → major conversion (R11)

- **converts each summed money field, dividing once** — GIVEN a fake repository resolving
  `{documentCount:2, totalGrandTotal:742678, totalTax:27458, totalDiscount:40180}` (the report
  mockup's own July figures, in cents) WHEN `summarizeReports` runs THEN the result's money fields
  are `{totalGrandTotal:7426.78, totalTax:274.58, totalDiscount:401.80}` _(verifies R11)_
- **`documentCount` is never divided** — GIVEN a fake repository resolving an all-zero
  `ReportAggregate` WHEN `summarizeReports` runs THEN `documentCount` stays `0`, not corrupted by a
  copy-pasted `/100` (defensive — it's a count, not money)

##### Echoes the validated range (R1)

- **`from`/`to` in the response equal the input verbatim** — GIVEN `{from:'2026-07-01',
  to:'2026-07-31'}` WHEN `summarizeReports` runs THEN the result's `from`/`to` equal exactly those
  strings, not re-derived from the repository call _(verifies R1)_

##### Delegates to the repository unchanged

- **calls `repository.summarize(ownerId, range)` exactly once with unmodified arguments** — GIVEN
  `ownerId` and `range` WHEN `summarizeReports` runs THEN the fake repository receives exactly those
  two values, once — this task doesn't second-guess or re-derive the repository's inputs

### Implementation Notes

- **Module(s):** `services/reports.ts`
- **Pattern reference:** `services/documents.ts`'s `toTotalsResponse` (cents→major conversion shape,
  dividing by 100 once at the boundary)
- **Key decisions:** R11 (conversion happens exactly once, here — not in the repository, not in the
  route)
- **Libraries:** none new
- **High-risk callouts:** none beyond what T3 already carries

### Scope Boundaries

- Do NOT validate `from`/`to` here — already done by T1's schema before this function is called
- Do NOT call the pricing engine — sums are already computed by T3
- Do NOT round again — the repository's cents values are exact integers; dividing by 100 is the
  only arithmetic this file does

### Files Expected

**New files:**
- `apps/backend/src/services/reports.ts` (pattern: `services/documents.ts`)
- `apps/backend/src/services/reports.test.ts` (pattern: `services/auth.test.ts`)

**Must NOT modify:**
- `apps/backend/src/persistence/reports.repository.ts` (T3's output — read-only)
- `apps/backend/src/services/documents.ts` (pattern reference only, not imported)

---

## Task T5: Routes — `reports.ts` (new) + `documents.ts` amendment

> **Status:** done
> **Verification:** test-after (no colocated test file of its own — verified by T6's integration suite, mirrors ARCH-5's finalize-route task)
> **Effort:** s
> **Priority:** critical
> **Depends on:** T1, T2, T4
> **Satisfies REQs:** R2, R5, R12, R13
> **Footprint slice:** New: `apps/backend/src/api/routes/reports.ts`; Modified: `apps/backend/src/api/routes/documents.ts`
> **High-risk areas touched:** `api/routes/documents.ts` (M) — existing document-list behavior for callers that omit `from`/`to` must be unchanged

### Description

`GET /api/v1/reports/summary` parses `request.query` with T1's `dateRangeQuerySchema` (a `ZodError`
here surfaces as 400 `VALIDATION_FAILED` with the domain code through the existing, unmodified
`envelope-mapper.ts` — no new error-handling path), attaches `app.authenticate`, and calls T4's
`summarizeReports`. `GET /api/v1/documents` gains the same query parse (via `contracts/document.ts`'s
`documentListQuerySchema`) and passes the result to T2's `repository.list(ownerId, range)` — an
empty query parses to `{}`, so the existing zero-argument behavior is preserved exactly (R29's
contract, now exercised at the route).

### Test Plan

#### Test File(s)
- None owned by this task. Per the project's lane-ownership convention
  (`docs/parallel-execution.md`), route-level and reconciliation behavior for this domain is owned by
  **T6** (`test/integration/reports.test.ts`), written blind against T1's contract. T5 is verified
  when T6's suite — already written by wave 2 — goes green against these two routes.

#### Test Scenarios (verified via T6, cross-referenced here for completeness)

- Valid range → 200 `ReportSummary`; empty range → zeros, not 404; `from > to` → 400
  `DATE_RANGE_INVERTED`; malformed date → 400 `DATE_RANGE_INVALID` — verified by T6
- `GET /documents?from=&to=` returns exactly the documents `GET /reports/summary` aggregates over
  the same range — the reconciliation itself, verified by T6
- `GET /documents` with no range still returns everything — verified by T6

##### Wiring self-check (this task's own responsibility, not delegated)

- **routes autoload with no `app.ts` edit** — expected: `git diff -- apps/backend/src/app.ts` shows
  no changes after this task
- **typecheck passes** — expected: `cd apps/backend && npx tsc --noEmit` exits 0
- **neither route is added to `GUARDED_ROUTES`** — expected: `git diff -- apps/backend/src/api/routes/registry.ts`
  shows no changes (both routes are `GET`, non-mutating)

### Implementation Notes

- **Module(s):** `api/routes/reports.ts`, `api/routes/documents.ts` (amended)
- **Pattern reference:** `api/routes/documents.ts`'s own existing `GET /documents` handler
  (route-local shape, `app.authenticate` preHandler)
- **Key decisions:** A3 (`DATE_RANGE_INVERTED`'s path is already baked into T1's schema; this task
  just lets the `ZodError` bubble to the existing envelope-mapper unchanged)
- **Libraries:** none new
- **High-risk callouts:** M risk per ARCH — this is where the documents-list route amendment must
  prove backward compatible; T6's suite includes the explicit "no range ⇒ everything" case the
  ARCH's Open Questions flagged as previously untested

### Scope Boundaries

- Do NOT write files under `test/` — T6 owns the evidence suite
- Do NOT add a status filter query param (R5)
- Do NOT compute anything in either route handler — call `services/reports.ts` or the repository,
  never do arithmetic inline

### Files Expected

**New files:**
- `apps/backend/src/api/routes/reports.ts` (pattern: `api/routes/documents.ts`)

**Modified files:**
- `apps/backend/src/api/routes/documents.ts` (`GET /documents` parses the optional range query,
  passes it to `repository.list`)

**Must NOT modify:**
- `apps/backend/src/app.ts` (autoload only)
- `apps/backend/src/api/routes/registry.ts` (neither route is guarded)
- `apps/backend/src/api/routes/document-lines.ts`, `apps/backend/src/api/routes/documents-lifecycle.ts`

---

## Task T6: Reconciliation & aggregation evidence suite (the deliverable)

> **Status:** done
> **Verification:** tdd (written blind against T1's contract, red until T5 lands — mirrors ARCH-5's evidence-suite task)
> **Effort:** l
> **Priority:** critical
> **Depends on:** T1
> **Satisfies REQs:** R10, R14, R15, R16, R17, R18, R19
> **Footprint slice:** New: `apps/backend/test/integration/reports.test.ts`
> **High-risk areas touched:** `persistence/reports.repository.ts` (H, via independent evidence), `api/routes/documents.ts` (M, via the no-range regression check)

### Description

The scored acceptance suite — verbatim: *"summary totals match individual documents in range."*
Seeds documents via the real HTTP API (factories), lists them through `GET /documents?from=&to=`,
sums their `grandTotal`/`totalTax`/`totalDiscount` **in the test itself**, and asserts exact equality
(to the cent) against `GET /reports/summary`'s response for the identical range. Written against
`docs/contracts/phase-5.md` and `contracts/report.ts` (T1), not against T3/T4/T5's implementation —
**expected red until T5 lands**, by design, the same pattern this project's own ARCH-5 `T6` already
establishes. Treat this as a deliverable, not incidental coverage.

### Test Plan

#### Test File(s)
- `apps/backend/test/integration/reports.test.ts`

#### Test Scenarios

##### Reconciliation (the deliverable, verbatim from the criterion)

- **report totals exactly equal the sum of the documents listed for the same range** — GIVEN N
  documents seeded across a range, including the PDF sample's lines for non-trivial numbers, WHEN
  both `GET /documents?from=&to=` and `GET /reports/summary?from=&to=` are called with the identical
  range THEN summing the listed documents' `grandTotal`/`totalTax`/`totalDiscount` in the test
  equals the report's `totalGrandTotal`/`totalTax`/`totalDiscount` exactly (to the cent), and
  `documentCount` equals the listed array's length _(verifies R14)_

##### Boundaries

- **a document issued exactly on `from` is included** — _(verifies R3, R15)_
- **a document issued exactly on `to` is included** — _(verifies R3, R15)_
- **a document issued the day before `from` is excluded** — _(verifies R15)_
- **a document issued the day after `to` is excluded** — _(verifies R15)_

##### Isolation

- **another user's documents never contribute to count or sums** — GIVEN a second user with
  strictly larger totals in the same range (so a leak is unmistakable, per the brief's own
  instruction) WHEN the first user's report runs THEN neither count nor any sum reflects the second
  user's data _(verifies R16)_

##### Draft inclusion

- **drafts are included, and a mixed draft/finalized range still reconciles** — GIVEN a range
  containing both a draft and a finalized document WHEN the report and list run THEN both
  contribute, and the reconciliation assertion above still holds for the mixed set _(verifies R5,
  R17)_

##### Overlapping ranges

- **a single document in two overlapping ranges contributes fully to each** — GIVEN one document
  issued inside the overlap of ranges `[A,B]` and `[C,D]` (`B >= C`) WHEN both reports run THEN it is
  fully counted and summed in both, not split or discounted _(verifies R18)_

##### Empty range

- **an empty range returns zeros, not 404** — GIVEN a range with no documents WHEN the report runs
  THEN 200 with `documentCount:0` and every sum `0` _(verifies R10, R19)_

##### No-range regression guard (ARCH Open Questions item)

- **`GET /documents` with no range still returns every document, unfiltered** — GIVEN documents
  across multiple months WHEN `GET /documents` is called with no `from`/`to` THEN all of them come
  back — pins the "no range ⇒ unfiltered" behavior the ARCH flagged as previously untested _(guards
  backward-regression risk for `api/routes/documents.ts` and `persistence/documents.repository.ts`'s
  widened `list()`)_

### Implementation Notes

- **Module(s):** none of production code — test-only
- **Pattern reference:** `test/integration/ownership.test.ts` (table-driven shape,
  `isMongoReachable`/`describe.skipIf` guard, `setupTestDb` usage, `twoUsers()`-style multi-user
  helper reused/adapted), `test/fixtures/pdf-sample.ts` (the fixture the "non-trivial numbers"
  scenario uses, read-only), `test/support/factories.ts` (`createAuthenticatedUser`,
  `buildCreatePayload`, `buildLinePayload` — reused unmodified)
- **Key decisions:** none — this task verifies others' decisions
- **Libraries:** none new — `vitest`, existing `test/support/db.ts`
- **High-risk callouts:** the mitigation for T3's H-risk footprint entry — independent,
  contract-blind coverage of the aggregation's actual correctness against real Mongo. T3's own unit
  tests prove the pipeline is *shaped* right; this proves the numbers it produces are *right*

### Scope Boundaries

- Do NOT write any source file outside `test/` — if the contract can't express a needed test, that's
  an amendment request to T1's author
- Do NOT wait for T3/T4/T5 to be done before writing these tests — write against
  `docs/contracts/phase-5.md` and `contracts/report.ts` now; red is the expected interim state
- Do NOT re-implement the aggregation in the test to "check" it — sum the listed documents' figures
  in plain TS and compare against the report's response; that asymmetry (list-then-sum vs. aggregate)
  is the entire point

### Files Expected

**New files:**
- `apps/backend/test/integration/reports.test.ts` (pattern: `test/integration/ownership.test.ts`)

**Must NOT modify:**
- `apps/backend/test/support/factories.ts`, `apps/backend/test/support/db.ts`
- `apps/backend/test/fixtures/pdf-sample.ts`
- `docs/contracts/phase-5.md`

---

## Task T7: Frontend API client

> **Status:** done
> **Verification:** tdd
> **Effort:** xs
> **Priority:** high
> **Depends on:** T1
> **Satisfies REQs:** R2, R20, R26
> **Footprint slice:** New: `apps/frontend/src/lib/api/reports.ts`, `apps/frontend/src/lib/api/reports.test.ts`; Modified: `apps/frontend/src/lib/api/documents.ts`, `apps/frontend/src/lib/api/documents.test.ts`
> **High-risk areas touched:** `lib/api/documents.ts` (L) — `documents/page.tsx`'s existing call site must be unaffected

### Description

`summary(from, to): Promise<ReportSummary>` — a thin `apiFetch` wrapper building a query string
from the two dates, mirroring `lib/api/lifecycle.ts`'s shape. `documents.ts`'s `list()` gains an
optional range parameter: it appends the same query-string shape when present, and calls
`apiFetch('/api/v1/documents')` with no query string at all when absent — the exact backward
compatibility the ARCH's Open Questions flagged, now covered at the client layer (T6 covers the
server side of the same guarantee).

### Test Plan

#### Test File(s)
- `apps/frontend/src/lib/api/reports.test.ts` (new, following `lib/api/documents.test.ts`'s
  `apiFetch`-mock pattern)
- `apps/frontend/src/lib/api/documents.test.ts` (existing, extended)

#### Test Scenarios

##### `summary(from, to)` request shape

- **calls `GET /api/v1/reports/summary` with `from`/`to` as query params** — WHEN
  `summary('2026-07-01','2026-07-31')` is called THEN `apiFetch` is invoked with
  `'/api/v1/reports/summary?from=2026-07-01&to=2026-07-31'` _(verifies R20)_

##### `list(range)` request shape

- **`list()` with no argument calls the bare path, unchanged** — WHEN `list()` is called with no
  argument THEN `apiFetch` is invoked with exactly `'/api/v1/documents'` (no query string) — the
  existing test, now proving the widened signature stays backward compatible _(verifies R2; guards
  backward-regression risk for `documents/page.tsx`'s existing call site)_
- **`list({from, to})` appends the range as a query string** — WHEN
  `list({from:'2026-07-01', to:'2026-07-31'})` is called THEN `apiFetch` is invoked with
  `'/api/v1/documents?from=2026-07-01&to=2026-07-31'` _(verifies R2, R23)_

##### Error propagation

- **a rejected `apiFetch` call surfaces as `ApiError` unchanged for `summary()`** — GIVEN `apiFetch`
  rejects with an `ApiError` WHEN `summary()` is called THEN the same error propagates, not wrapped
  or swallowed — the shape T8's error state depends on _(verifies R26)_

### Implementation Notes

- **Module(s):** `lib/api/reports.ts`, `lib/api/documents.ts` (amended)
- **Pattern reference:** `lib/api/lifecycle.ts` (thin-wrapper shape); `lib/api/documents.ts`'s own
  existing functions for the query-string-building addition
- **Key decisions:** none new
- **Libraries:** none new — `URLSearchParams` (built-in) for the query string
- **High-risk callouts:** L risk per ARCH — purely additive optional parameter; a TypeScript build
  failure would catch an accidental breaking change immediately

### Scope Boundaries

- Do NOT add any UI-facing logic — this file is API plumbing only, consumed by T8
- Do NOT validate `from`/`to` client-side here — that's T8's `RangePicker` (R21)

### Files Expected

**New files:**
- `apps/frontend/src/lib/api/reports.ts` (pattern: `lib/api/lifecycle.ts`)
- `apps/frontend/src/lib/api/reports.test.ts`

**Modified files:**
- `apps/frontend/src/lib/api/documents.ts` (`list(range?)` — widened, backward compatible)
- `apps/frontend/src/lib/api/documents.test.ts` (adds the range-query scenario; existing assertions
  unmodified)

**Must NOT modify:**
- `apps/frontend/src/lib/api/client.ts`
- `apps/frontend/src/lib/api/types/report.ts` (T1's output — read-only)

---

## Task T8: Report UI

> **Status:** not started
> **Verification:** ui
> **Effort:** l
> **Priority:** high
> **Depends on:** T7
> **Satisfies REQs:** R21, R22, R23, R24, R25, R26, R27, R32
> **Footprint slice:** New: `apps/frontend/src/components/report/**` (`RangePicker`, `StatCards`, `ReportTable` + colocated tests), `apps/frontend/src/app/(app)/report/page.tsx` (+ module CSS)
> **High-risk areas touched:** None — new screen, no existing component touched (A4: dedicated components, not an extension of `DocumentsList`)

### Description

The report screen from `design/htmls/report.html`. `RangePicker` defaults to the current month and
validates `from <= to` inline before either request fires (R21). `StatCards` renders `ReportSummary`'s
four figures verbatim at 2dp via `components/money/format-money.ts` (R22). `ReportTable` renders
`documents.list({from,to})`'s rows beneath the cards — server rows only, no arithmetic (R23). The
page states on screen, not in a tooltip, that both draft and finalized documents are included and
both range ends are inclusive (R24); shows a range-echoing empty state (R25); and handles loading and
error-with-retry (R26).

### Verification Checklist

- **`RangePicker` defaults to the current month and blocks `from > to` before any request** —
  expected: on mount, the from/to inputs show the first/last day of the current month; entering
  `to < from` shows an inline message and neither `summary()` nor `list()` fires — component test:
  drive the invalid-range path and assert both mocked API calls are never called
- **Four stat cards render the server's exact figures, following the project's existing money
  formatting convention** — expected: given a `ReportSummary` fixture (the report mockup's July
  figures: `documentCount:2, totalGrandTotal:7426.78, totalTax:274.58, totalDiscount:401.80`), the
  cards show `formatMoney`'s output for each money field (no thousands separator — `formatMoney`
  already omits grouping, the same convention `DocumentsRow`'s grand-total cell uses; the mockup's
  comma-grouped `"$7,426.78"` display is **not** followed, for consistency with the rest of the app)
  and the raw `documentCount`
- **In-range table renders exactly the listed documents, no client-side arithmetic** — expected:
  given a `DocumentSummary[]` fixture, `ReportTable` renders one row per document with
  Subtotal/Discount/Tax/Grand total columns (a distinct column set from `DocumentsList`, per A4) and
  no row actions (no edit/delete links) — component test: cell text matches the fixture's totals
  verbatim, never recomputed
- **Both-inclusive and draft-inclusion are stated visibly, not in a tooltip** — expected: static text
  near the range inputs, visible in the rendered DOM (not a `title` attribute or hover-only element),
  states both draft and finalized documents are included and both dates are inclusive
- **Empty state echoes the range** — expected: given `documentCount:0`, the page shows "no documents
  issued between `<from>` and `<to>`" with the actual selected values interpolated
- **Loading and error states, with retry** — expected: while either request is pending, a loading
  indicator shows; on a rejected `apiFetch` call, an error message renders with a retry button that
  re-fires both requests
- **`from > to` inline validation is component-tested** — expected: `RangePicker.test.tsx` drives the
  invalid-range path directly, per R27 (this logic lives in the component, not a shared validator)
- **Existing documents-list page and its components are untouched** — expected: `git status --short`
  shows no changes under `apps/frontend/src/app/(app)/documents/**` or
  `apps/frontend/src/components/documents/**` (guards A4's zero-regression-risk claim)
- **Full suite and build pass** — expected: `cd apps/frontend && npm test && npm run build` exits 0

#### Testable Seams

- `RangePicker`'s `from > to` validation and current-month default initialization
- `StatCards`' render of a `ReportSummary` fixture (four figures, no arithmetic)
- `ReportTable`'s render of a `DocumentSummary[]` fixture (column set, no actions, no arithmetic)
- Empty/loading/error state branches on the page component

### Implementation Notes

- **Module(s):** `components/report/RangePicker.tsx`, `StatCards.tsx`, `ReportTable.tsx`,
  `app/(app)/report/page.tsx`
- **Pattern reference:** `design/htmls/report.html` (layout/markup for cards, filter panel, in-range
  table), `app/(app)/documents/page.tsx` (loading/error/empty-state `PageState` union pattern),
  `components/money/format-money.ts` (reused as-is for every money figure)
- **Key decisions:** A4 (dedicated components, not an extension of `DocumentsList`/`DocumentsRow`)
- **Libraries:** none new
- **High-risk callouts:** none — new, isolated screen

### Scope Boundaries

- Do NOT do arithmetic on any figure — cards render `ReportSummary` verbatim, the table renders
  `DocumentSummary[]` verbatim (R23's guardrail: "no summing in the browser")
- Do NOT add the nav entry to `components/shell/nav-items.ts` — that's T9, join-only
- Do NOT render a document-number field (Out of Scope, same exclusion prior phases made)
- Do NOT touch `components/documents/**` or `app/(app)/documents/**` — A4's whole point is zero risk
  to that screen

### Files Expected

**New files:**
- `apps/frontend/src/components/report/RangePicker.tsx` (+ `.test.tsx`)
- `apps/frontend/src/components/report/StatCards.tsx` (+ `.test.tsx`)
- `apps/frontend/src/components/report/ReportTable.tsx` (+ `.test.tsx`)
- `apps/frontend/src/app/(app)/report/page.tsx` (+ module CSS)

**Must NOT modify:**
- `apps/frontend/src/lib/api/reports.ts`, `apps/frontend/src/lib/api/documents.ts` (T7's output —
  read-only)
- `apps/frontend/src/components/shell/nav-items.ts` (join-only)
- `apps/frontend/src/components/documents/**` (not owned this wave)

---

## Task T9: Join J5

> **Status:** not started
> **Verification:** checklist
> **Effort:** m
> **Priority:** critical
> **Depends on:** T5, T6, T8
> **Satisfies REQs:** R28
> **Footprint slice:** New: `e2e/report.cy.ts`; Modified: `apps/frontend/src/components/shell/nav-items.ts`
> **High-risk areas touched:** None new — reconciliation only

### Description

Adds the `/report` nav entry (join-only, per the convention every prior join has followed), writes
the Cypress happy path seeding documents across two months and asserting each range's cards equal
the sum of the rows displayed beneath them, confirms a boundary date by hand, and closes the phase
with the join commit.

### Verification Checklist

- **Full backend suite green** — expected: `cd apps/backend && npx vitest run` exits 0, including
  T6's `test/integration/reports.test.ts` (now green against T3/T4/T5's implementation)
- **Full frontend suite and build green** — expected: `cd apps/frontend && npm test && npm run build`
  exits 0
- **`docker compose up --build` (`make up`) boots clean** — expected: all services healthy, no crash
  loop
- **`report` added to `components/shell/nav-items.ts`** — expected: the nav renders a link to
  `/report`
- **`e2e/report.cy.ts` happy path** — expected: seed documents across two calendar months (via
  `cy.request()`, reusing existing specs' pattern), run each month's range through the UI, and assert
  the four stat cards equal the sum of the rows displayed in the table beneath them — the
  reconciliation, verified by eye through the same adjacency R23 built for exactly this
- **Manual boundary-date check** — expected: a document issued exactly on a range's `from` or `to`
  appears in that range's table and contributes to its cards; recorded in the join report or commit
  message
- **Committed as `chore(J5): join phase 5`** — expected: `git log` shows the commit, scoped to this
  task's own file changes (the new e2e spec + `nav-items.ts`)

### Implementation Notes

- **Module(s):** none new beyond `e2e/report.cy.ts` and the nav entry — reconciliation and evidence
  only
- **Pattern reference:** `e2e/documents.cy.ts`, `e2e/lifecycle.cy.ts` (Cypress spec shape),
  `docs/parallel-execution.md` § "Running a join"
- **Key decisions:** none new — confirms decisions already made by T1–T8
- **Libraries:** none new — `cypress` (already a dependency)
- **High-risk callouts:** none — by this point every M/H-risk footprint entry has its own task-level
  mitigation; this task's job is proving they compose

### Scope Boundaries

- Do NOT add a Mongo index (A2, Out of Scope)
- Do NOT filter the report by status (R5, Out of Scope)
- Where something disagrees between tasks, `docs/contracts/phase-5.md` decides; fix the contract
  first if it's the one that's wrong, then both sides

### Files Expected

**New files:**
- `e2e/report.cy.ts` (pattern: `e2e/documents.cy.ts`)

**Modified files:**
- `apps/frontend/src/components/shell/nav-items.ts` (adds the `/report` entry — join-only)

**Must NOT modify:**
- Any file already owned and completed by T1–T8 beyond the specific seam-fixes a join implies
