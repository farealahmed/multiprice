# Architecture: Summary report (lane briefs)

> **Date:** 2026-08-13
> **Issue:** #6
> **Phase:** 2 of 5 (System Architecture)
> **Requirements source:** Standalone brief — see Inferred Requirements (`specs/context/6.md`, `docs/phases/phase-5-issue-6.md`, `docs/implementation-phases.md` § Phase 5)
> **Type:** feature

## Architecture Summary

Phase 5 adds one read-only aggregation on top of the `documents` collection Phase 3
already writes: a Mongo `$match`/`$group` pipeline scoped to `ownerId` and an
inclusive `issueDate` range, returning document count and the sum of each
persisted total (grand total, tax, discount) in major units. The aggregation sums
the totals Phase 3 already recomputed and persisted on every write — it never
re-runs the pricing engine — so the scored claim ("summary totals match individual
documents in range") reduces to one property: the aggregation's `$match` and the
existing document-list route's filter must agree on exactly which documents are
"in range." That agreement is enforced structurally by one shared filter function,
`buildIssueDateFilter`, added to `documents.repository.ts` and imported by a new
`reports.repository.ts`, rather than by two independently-written date comparisons
that could drift. The existing `GET /api/v1/documents` route gains the same
optional `from`/`to` query so the frontend report screen can render the exact rows
the cards summarize, beneath them, from one shared range. On the frontend, a new
`/report` screen (range picker, four stat cards, an in-range document table) is
built from three new components; no arithmetic happens in the browser — the cards
render server figures and the table renders server rows, so any disagreement
between them is a backend bug the screen is designed to reveal, not one the
frontend reconciles.

## Inferred Requirements

No REQ doc exists for this issue; `specs/context/6.md` (= `docs/phases/phase-5-issue-6.md`)
is itself a complete lane-brief specification, this project's established pattern
(see ARCH-3, ARCH-4, ARCH-5). Requirements below are restated from it, from
`docs/implementation-phases.md` § Phase 5, and from judgment calls confirmed with
the developer in this session, for traceability by `generate-tasks`.

| ID | Inferred Requirement | Source |
|----|----|----|
| R1 | `GET /api/v1/reports/summary?from=&to=` → `ReportSummary { from, to, documentCount, totalGrandTotal, totalTax, totalDiscount }` — exactly the four figures the PDF asks for. | Brief G5 step 1 |
| R2 | Amend the document list to accept the same range: `GET /api/v1/documents?from=&to=`, both optional. Query schema added to `contracts/document.ts`; parameters added to `lib/api/documents.ts`. | Brief G5 step 2 |
| R3 | Both range ends inclusive — a document issued on `from` or `to` counts. | Brief G5 step 3 |
| R4 | `issueDate` is a calendar-date string (`YYYY-MM-DD`, Phase 3's decision); comparison is a plain string range on that field. No `Date` object, no UTC conversion, no server locale. | Brief G5 step 4 |
| R5 | Scope: all documents in range, drafts included — no status filter. Documented as an assumption (contract, UI, README). | Brief G5 step 5 |
| R6 | Error codes, exported from `contracts/report.ts` itself: `DATE_RANGE_INVALID` (unparseable or not `YYYY-MM-DD`) and `DATE_RANGE_INVERTED` (`from > to`). Both are 400 with the offending parameter's path. | Brief G5 step 6 |
| R7 | `ReportSummary` and the codes mirrored to `lib/api/types/report.ts`; `docs/contracts/phase-5.md` written with the endpoint, the inclusivity rule, the timezone sentence, and the draft-inclusion assumption, verbatim. | Brief G5 step 7 |
| R8 | One Mongo aggregation: `$match` on `{ ownerId, issueDate: { $gte, $lte } }`, then `$group` summing persisted `totals` fields and counting documents. `ownerId` is inside `$match`, never a post-filter. | Brief 5-A step 1 |
| R9 | Sum the **persisted** totals only; never re-run the pricing engine per document inside the aggregation. | Brief 5-A step 2 |
| R10 | Empty range returns zeros and `documentCount: 0`, not 404. | Brief 5-A step 3 |
| R11 | Aggregation sums integer cents; convert to major units once, at the service boundary. | Brief 5-A step 4 |
| R12 | Validate `from`/`to` with G5's schema; `from > to` is 400 `DATE_RANGE_INVERTED`. Attach `app.authenticate`. | Brief 5-A step 5 |
| R13 | Implement the list-route amendment: `GET /documents?from=&to=` filters `issueDate` with the same inclusive bounds and owner scoping. **One shared date-filter helper** between the list query and the aggregation `$match`. | Brief 5-A step 6 |
| R14 | Reconciliation test (**the deliverable**): seed N documents across a range, list them through `GET /documents?from=&to=` with the same range, sum grand total/tax/discount in the test, assert exact equality (in cents) against the report. | Brief 5-A tests 1 |
| R15 | Boundary tests: documents on `from` and `to` included; day-before/day-after excluded. | Brief 5-A tests 2 |
| R16 | Isolation: another user's documents never contribute, in either count or sums. | Brief 5-A tests 3 |
| R17 | Drafts included; a mixed draft/finalized range reconciles. | Brief 5-A tests 4 |
| R18 | A single document in two overlapping ranges contributes fully to each. | Brief 5-A tests 5 |
| R19 | Empty range returns zeros (integration-tested, not just unit-asserted). | Brief 5-A tests 6 |
| R20 | `lib/api/reports.ts`: typed `summary(from, to)` through the shared client. | Brief 5-B step 1 |
| R21 | Range inputs with sensible defaults (current month); `from > to` caught client-side before the request, shown inline. | Brief 5-B step 2 |
| R22 | Four stat cards (document count, sum of grand totals, sum of tax, sum of discount): tabular numerals, mockup's card treatment, 2 decimal places. | Brief 5-B step 3 |
| R23 | In-range document table beneath the cards, from `documents.list({ from, to })` — same adjacency the criterion depends on. | Brief 5-B step 4 |
| R24 | State on screen (not a tooltip) that both draft and finalized documents are included, and both range ends are inclusive. | Brief 5-B step 5 |
| R25 | Empty state: "no documents issued between X and Y," range echoed back. | Brief 5-B step 6 |
| R26 | Loading and error states; a failed request offers a retry. | Brief 5-B step 7 |
| R27 | Component test for `from > to` inline validation, if that logic lives in the component rather than a shared validator. | Brief 5-B step 8 |
| R28 | Join J5: add `report` to `components/shell/nav-items.ts`; `e2e/report.cy.ts` seeding documents across two months and asserting cards equal the sum of displayed rows; manual boundary-date check; `chore(J5)` commit. | Brief Join J5 |
| R29 | `buildIssueDateFilter(range?)` lives in `apps/backend/src/persistence/documents.repository.ts` (exported), imported by `reports.repository.ts` — not added to the shared `persistence/repository.ts` base helper. | Developer decision, 2026-08-13 |
| R30 | No new index on `documents` this phase. | Developer decision, 2026-08-13 |
| R31 | `DATE_RANGE_INVERTED` attaches `path: ['to']`. | Developer decision, 2026-08-13 |
| R32 | The in-range table is a new `ReportTable` component in `components/report/`, not an extension of `components/documents/DocumentsList.tsx`. | Developer decision, 2026-08-13 |

## High-Level Structure

```
GET /api/v1/reports/summary?from=&to=         GET /api/v1/documents?from=&to=
        │                                              │
        ▼                                              ▼
api/routes/reports.ts (NEW)                   api/routes/documents.ts (amended,
  parses+validates query via                    transferred from 3-A for this wave)
  contracts/report.ts's                          parses the same optional range query
  dateRangeQuerySchema                                  │
        │                                              ▼
        ▼                                    repository.list(ownerId, range?)
services/reports.ts (NEW)                              │
  summarizeReports(ownerId, range)                      ▼
        │                                    persistence/documents.repository.ts
        ▼                                      (amended, transferred from 3-A)
persistence/reports.repository.ts (NEW)         + buildIssueDateFilter(range?) (NEW,
  summarize(ownerId, range):                      exported — the one shared helper)
    db.documents.aggregate([                             │
      { $match: { ownerId,                               ▼
          ...buildIssueDateFilter(range) } },   base.find(ownerId, buildIssueDateFilter(range))
      { $group: { _id: null,
          documentCount: { $sum: 1 },
          totalGrandTotal: { $sum: '$totals.grandTotal' },
          totalTax:        { $sum: '$totals.totalTax' },
          totalDiscount:   { $sum: '$totals.totalDiscount' } } },
    ])
        │
        ▼
  convert cents → major units once, at the
  service boundary (services/reports.ts) —
  same pattern services/documents.ts already
  uses for toTotalsResponse
```

**Frontend:**

```
app/(app)/report/page.tsx (NEW)
  ├─ RangePicker    — from/to inputs, current-month default, from>to caught
  │                    inline (R21) before either request fires
  ├─ StatCards      — renders ReportSummary verbatim (server figures only)
  └─ ReportTable    — renders documents.list({ from, to }) verbatim (server
                       rows only) — the adjacency R23 calls out: a reviewer
                       checks the cards against the rows by eye
```

**Added to the existing system:** `contracts/report.ts`, `persistence/reports.repository.ts`,
`services/reports.ts`, `api/routes/reports.ts`, `docs/contracts/phase-5.md`; frontend
`lib/api/types/report.ts`, `lib/api/reports.ts`, `components/report/**`,
`app/(app)/report/page.tsx`.

**Modified in the existing system:** `contracts/document.ts` (one amendment — the
list query schema), `persistence/documents.repository.ts` (`list` widened + new
exported `buildIssueDateFilter`), `api/routes/documents.ts` (parses the range
query), `lib/api/documents.ts` (`list` widened), `components/shell/nav-items.ts`
(join-only, per the established convention).

**Untouched:** `app.ts` (new route file autoloads, same as every prior phase),
`contracts/lifecycle.ts`, `contracts/pricing.ts`, `api/plugins/immutability.ts`,
`api/routes/registry.ts` / `GUARDED_ROUTES` (neither new/amended route mutates a
document), `persistence/repository.ts` (the shared base helper — `buildIssueDateFilter`
goes around it, not through it, per R29), `services/documents.ts`,
`components/documents/**` (the documents-list page and its table are not touched —
see A4).

## Tech Choices

| Area | Decision | Alternatives Considered | Rationale |
|----|----|----|----|
| Aggregation mechanism | One Mongo `$match`/`$group` pipeline in `reports.repository.ts` | Fetch all in-range documents in Node and sum with `reduce` | The brief is explicit (R8, R9): fetching-and-summing in Node would make the reconciliation test compare the aggregation against itself, not against an independent code path. The `$match`/`$group` pipeline is the thing being proven correct |
| Query-schema reuse | `contracts/report.ts` owns `dateRangeQuerySchema` + its codes; `contracts/document.ts` imports it for the list route | Duplicate the from/to validation logic in both contract files | Mirrors the project's existing cross-domain reuse pattern (`document.ts` importing `pricing.ts`'s `lineInputSchema` via `z.intersection`); a second independent date-range validator is exactly the kind of drift R13's shared-filter requirement exists to prevent one layer down |
| Shared date-filter helper location | `documents.repository.ts` (exported `buildIssueDateFilter`), imported by `reports.repository.ts` | Add a `findOneAndUpdate`-style passthrough or filter builder to `persistence/repository.ts`, the shared base every repository imports | Smaller blast radius — one file, two consumers, mirrors ARCH-5's A2 (keeping `finalizeIfDraft` local rather than extending the shared base). Confirmed with the developer (R29) |
| Index on `documents` for `{ownerId, issueDate}` | None added this phase | Add a compound index via `plugins/indexes.ts` | Consistent with ARCH-4/ARCH-5's explicit "not needed at this project's scale" finding; this is the first range-scan query pattern in the project, but seed-data volume doesn't exercise it. Confirmed with the developer (R30); flagged in Open Questions |
| `DATE_RANGE_INVERTED` error path | `path: ['to']` | `path: ['from']`; `path: []` (root) | `to` is the field that fails the constraint relative to `from` (must be `>= from`) — same convention typical date-range validators use. Confirmed with the developer (R31) |
| In-range report table | New `ReportTable` component in `components/report/` | Add a `variant` prop to the existing `components/documents/DocumentsList.tsx`/`DocumentsRow.tsx` | The mockup's columns differ meaningfully (adds Subtotal/Discount/Tax, drops row actions); a shared component would couple the documents-list page to a second screen's requirements. Confirmed with the developer (R32) |

## Patterns & Conventions

- **Domain error codes live in the domain's own contract file** — `contracts/report.ts`
  owns `DATE_RANGE_INVALID`/`DATE_RANGE_INVERTED`, the fourth domain to follow the
  Phase 0 convention (`pricing.ts`, `document.ts`, `lifecycle.ts` before it).
- **Cross-domain schema reuse via `z.intersection`** — `document.ts` importing
  `report.ts`'s `dateRangeQuerySchema` is the second instance of this pattern
  (after `document.ts` importing `pricing.ts`'s `lineInputSchema`), and the first
  where the *importing* file is the older, already-frozen contract rather than the
  newer one.
- **Cross-field `superRefine`** — `DATE_RANGE_INVERTED` is the project's first
  cross-field validation issue (comparing `from` against `to`); every prior
  `ctx.addIssue({ code: 'custom', params: { code } })` use has been single-field.
- **Repository is the sole Mongo access point** — `reports.repository.ts` preserves
  this; it is the second repository (after `documents.repository.ts`'s
  `finalizeIfDraft`) to call the driver directly rather than through
  `createOwnedRepository`'s wrapper, because `.aggregate()` isn't one of the
  methods the wrapper exposes.
- **Ownership is per-wave** — 5-A's edits to `api/routes/documents.ts` and
  `persistence/documents.repository.ts` are exactly the transfer
  `parallel-execution.md` describes (3-A/3-D are not running this wave).
- **Nav wiring is join-only** — 5-B may not edit `components/shell/nav-items.ts`;
  J5 adds the `/report` entry, the same convention every prior join has followed
  for a new screen.
- **Intentionally not applied this phase:** an index on `documents` (R30, A2);
  status filtering on the report (R5 — the PDF's silence on status would make
  filtering an unstated narrowing); a generated/shared types package (project-wide
  decision, unchanged).

## Data Models

No new persisted entity. This phase only *reads* `StoredDocument.totals`
(`subtotal`, `totalDiscount`, `totalTax`, `grandTotal` — Phase 1/3, integer cents,
unchanged) via aggregation; nothing new is written to the `documents` collection.

### `ReportSummary` (computed response, not persisted)

**Purpose:** the wire shape of `GET /reports/summary`'s 200 response.

**Key fields:**
| Field | Type / Constraint | Notes |
|----|----|----|
| `from`, `to` | `string`, `YYYY-MM-DD` | Echoed back from the validated query, not re-derived |
| `documentCount` | `number`, integer ≥ 0 | `$sum: 1` over matched documents |
| `totalGrandTotal`, `totalTax`, `totalDiscount` | `number`, major units, 2 dp | Sums of the matched documents' persisted totals, converted from cents once at the service boundary (R11) |

**Lifecycle:** computed fresh on every request; never stored, never cached.

## API Contracts / Interfaces

### Report and document-list routes (HTTP)

**Boundary:** Fastify routes, `apps/backend/src/api/routes/reports.ts` (new) and
`apps/backend/src/api/routes/documents.ts` (amended). Both attach
`app.authenticate`, same as every existing route.

| Method | Path | Purpose | Errors / Returns |
|----|----|----|----|
| `GET` | `/api/v1/reports/summary?from=&to=` | Aggregate report over a date range | 200 `ReportSummary` (zeros on an empty range) · 400 `DATE_RANGE_INVALID` / `DATE_RANGE_INVERTED` |
| `GET` | `/api/v1/documents?from=&to=` | List the caller's documents, optionally scoped to a date range | 200 `DocumentSummary[]` (unchanged shape) · 400 `DATE_RANGE_INVALID` / `DATE_RANGE_INVERTED` (same codes, imported from `report.ts`) |

**Auth requirements:** unchanged from Phase 3/4 — session required; results are
always scoped to `request.userId`, never a post-filter (R8, R13).

### Module boundaries (not HTTP)

| Signature | Purpose | Errors / Returns |
|----|----|----|
| `buildIssueDateFilter(range?: { from: string; to: string }): Filter<StoredDocument>` | Single source of truth for "which documents are in range," used by both `list()` and the aggregation's `$match` | Pure, no I/O; `{}` when `range` is absent |
| `DocumentsRepository.list(ownerId, range?): Promise<StoredDocument[]>` | Now range-aware; existing zero-argument callers unaffected | Unchanged error semantics |
| `ReportsRepository.summarize(ownerId, range): Promise<ReportAggregate>` | One aggregation call; `ReportAggregate` (cents-scale) is internal, never exported past the repository boundary | Zeros/`0` count on no match, never `null` |
| `services/reports.ts: summarizeReports(ownerId, range): Promise<ReportSummary>` | Orchestrates the repository call and the cents→major conversion | Throws nothing new — `from`/`to` validation already happened in the route via zod |

## Module Boundaries

| Module / Package | Responsibility | Allowed Dependencies |
|----|----|----|
| `apps/backend/src/contracts/report.ts` | `DATE_RANGE_INVALID`/`DATE_RANGE_INVERTED` codes, `dateRangeQuerySchema`, `ReportSummary` schema | `zod` only |
| `apps/backend/src/contracts/document.ts` (amended) | Imports `dateRangeQuerySchema` from `report.ts` for the list query | `zod`, `contracts/report.ts` (read-only import) |
| `apps/backend/src/persistence/documents.repository.ts` (amended) | `+ buildIssueDateFilter` (exported); `list()` range-aware | `mongodb` driver, `domain/document.ts` |
| `apps/backend/src/persistence/reports.repository.ts` (new) | `summarize()` aggregation | `mongodb` driver, `documents.repository.ts` (`buildIssueDateFilter` import only) |
| `apps/backend/src/services/reports.ts` (new) | Orchestration, cents→major conversion | `persistence/reports.repository.ts`, `contracts/report.ts` (types only) |
| `apps/backend/src/api/routes/reports.ts` (new) | HTTP wiring for the summary endpoint | `contracts/report.ts`, `services/reports.ts` |
| `apps/backend/src/api/routes/documents.ts` (amended) | Parses the optional range query, passes to `repository.list` | `contracts/document.ts` (amended), `persistence/documents.repository.ts` |
| `apps/frontend/src/lib/api/types/report.ts` (new) | Mirrored types + codes | none (leaf) |
| `apps/frontend/src/lib/api/reports.ts` (new) | `summary(from, to)` typed call | `lib/api/client.ts` (read-only), `lib/api/types/report.ts` |
| `apps/frontend/src/lib/api/documents.ts` (amended) | `list(range?)` typed call | `lib/api/client.ts`, `lib/api/types/report.ts` (range type import) |
| `apps/frontend/src/components/report/**` | Range picker, stat cards, in-range table | `lib/api/reports.ts`, `lib/api/documents.ts`, `components/money/format-money.ts` (existing) |
| `apps/frontend/src/app/(app)/report/page.tsx` | Orchestrates the screen: loading/error/empty states, wires both API calls to one shared range | `components/report/**`, `lib/api/reports.ts`, `lib/api/documents.ts` |

**Rule carried forward from Phases 1–4:** the HTTP layer never does arithmetic on
money; no route queries `documents` without an `ownerId` in hand; and now: the
list query and the report aggregation never independently decide what "in range"
means — both call `buildIssueDateFilter`.

## Change Footprint

### New files / modules

| Path | Purpose | Pattern reference |
|----|----|----|
| `apps/backend/src/contracts/report.ts` | Range query schema, error codes, `ReportSummary` schema | `contracts/lifecycle.ts` (schema+codes-in-one-file) |
| `apps/backend/src/contracts/report.test.ts` | Colocated unit test | `contracts/document.test.ts` |
| `apps/backend/src/persistence/reports.repository.ts` | `summarize()` aggregation | `persistence/documents.repository.ts` (repository shape); first `.aggregate()` call in the project |
| `apps/backend/src/persistence/reports.repository.test.ts` | Colocated unit test | `persistence/documents.repository.test.ts` |
| `apps/backend/src/services/reports.ts` | `summarizeReports` orchestration | `services/documents.ts` (boundary-mapper shape) |
| `apps/backend/src/services/reports.test.ts` | Colocated unit test | `services/auth.test.ts` (`documents.ts` still has no colocated test, per ARCH-5's same note) |
| `apps/backend/src/api/routes/reports.ts` | `GET /reports/summary` | `api/routes/documents.ts` (route-local error mapping, `authenticate` preHandler) |
| `apps/backend/test/integration/reports.test.ts` | Reconciliation suite (**the deliverable**, R14–R19) | `test/integration/ownership.test.ts` (table-driven, factory-seeded) |
| `docs/contracts/phase-5.md` | Human-readable contract snapshot | `docs/contracts/phase-4.md` |
| `apps/frontend/src/lib/api/types/report.ts` | Mirrored types + codes | `lib/api/types/lifecycle.ts` |
| `apps/frontend/src/lib/api/reports.ts` | `summary(from, to)` | `lib/api/lifecycle.ts` |
| `apps/frontend/src/lib/api/reports.test.ts` | Colocated unit test | `lib/api/lifecycle.test.ts` |
| `apps/frontend/src/components/report/RangePicker.tsx` (+ test) | From/to inputs, current-month default, inline `from>to` validation | `design/htmls/report.html`'s filter panel; no existing range-input component to mirror |
| `apps/frontend/src/components/report/StatCards.tsx` | Four stat cards | `design/htmls/report.html`'s `.statrow`/`.stat` markup; reuses `components/money/format-money.ts` |
| `apps/frontend/src/components/report/ReportTable.tsx` | In-range document table | `components/documents/DocumentsList.tsx`'s table shape, distinct column set per A4 |
| `apps/frontend/src/app/(app)/report/page.tsx` (+ module.css) | The report screen | `app/(app)/documents/page.tsx`'s loading/error/empty-state phase pattern |
| `e2e/report.cy.ts` | J5's Cypress happy path | `e2e/lifecycle.cy.ts` |

### Modified files / modules

| Path | What changes here |
|----|----|
| `apps/backend/src/contracts/document.ts` | Imports `dateRangeQuerySchema` from `report.ts`; the list route's query type gains optional `from`/`to` |
| `apps/backend/src/persistence/documents.repository.ts` | `list(ownerId, range?)` — signature widened, backward compatible; adds exported `buildIssueDateFilter` |
| `apps/backend/src/api/routes/documents.ts` | `GET /documents` parses the optional range query and passes it to `repository.list` |
| `apps/frontend/src/lib/api/documents.ts` | `list(range?)` — signature widened, backward compatible |
| `apps/frontend/src/components/shell/nav-items.ts` | J5 adds the `/report` nav entry (join-only) |

### Deleted / replaced

None this phase.

### Touched but not changed (silent-regression hotspots)

| Path | Why it matters |
|----|----|
| `apps/frontend/src/app/(app)/documents/page.tsx` | Calls `documents.list()` with zero arguments (Phase 3); must keep returning every document once `list()` gains an optional second parameter — the existing call site's correctness now depends on the new parameter truly defaulting to "unfiltered" |
| `apps/backend/test/integration/ownership.test.ts` | Already exercises `repository.list(ownerId)` with no range argument; a signature change here must not alter that call site's behavior (see Open Questions — no test currently pins "list() with no range returns everything" explicitly) |
| `apps/backend/src/api/plugins/immutability.ts` / `apps/backend/src/api/routes/registry.ts` (`GUARDED_ROUTES`) | Neither new/amended route mutates a document, so neither belongs in the registry — confirmed by inspection; 4-B's existing parameterized suite needs no changes |
| `apps/backend/src/persistence/repository.ts` (`createOwnedRepository`) | Not modified, but `reports.repository.ts`'s `.aggregate()` call bypasses it entirely (aggregation isn't one of the wrapper's methods) — the same "not every method goes through `base`" pattern ARCH-5's A2 established for `finalizeIfDraft`, now true of a second file |
| `apps/backend/src/domain/document.ts` (`StoredTotals`) | `reports.repository.ts`'s `$group` stage reads `totals.grandTotal`/`totalTax`/`totalDiscount` as Mongo field-path **strings**, not through TypeScript's type system — a future rename here would silently break the aggregation with no compiler error; only R14's reconciliation test would catch it |

## Areas of Impact

| Area | Impact | Risk (L/M/H) | Why |
|----|----|----|----|
| `persistence/reports.repository.ts` (new, first `.aggregate()` use) | This *is* the scored claim — reported totals must equal the individual documents in range | H | A `$match`/`$group` mistake produces numbers that merely look plausible. Mitigated by R14's exact-cents reconciliation test and R18's overlapping-range test being deliverables in their own right, not incidental coverage |
| `persistence/documents.repository.ts` (`list()` widened + `buildIssueDateFilter`) | Second consumer (`reports.repository.ts`) now depends on this file's filter logic | M | Divergence between the list filter and the aggregation `$match` is the exact "scored failure" the brief names (5-A step 6) — mitigated structurally by both paths sharing one function (R29) rather than by test coverage alone |
| `api/routes/documents.ts` (amended, transferred from 3-A) | Existing document-list behavior for callers that omit `from`/`to` must be unchanged | M | No test currently pins "list with no range returns everything" as an explicit case (see Open Questions); worth confirming at J5 |
| Frontend `documents.list()` signature (transferred from 3-C/3-D) | `documents/page.tsx`'s existing call site | L | Purely additive optional parameter; a TypeScript build failure would catch an accidental breaking change immediately |
| `docs/contracts/phase-5.md` | Read by the Phase 6 README's reporting section | L | Documentation-only |

**Contract changes:** `document.ts`'s list-query contract gains an optional
`from`/`to` (additive; no existing response shape changes). No changes to
`lifecycle.ts`, `pricing.ts`, `auth.ts`, or `envelope.ts` — all frozen and
unmodified.

**Cross-cutting ripples:** none into telemetry, feature flags, or the build
pipeline. No new collection or index (R30). First use of `collection.aggregate()`
in the project (every prior repository method uses `find`/`findOne`/
`findOneAndUpdate`/`findOneAndDelete`) — worth naming since it's a new code shape
a future phase might copy.

## Cross-Cutting Concerns

- **Errors:** range-validation errors funnel through the existing
  `ZodError → VALIDATION_FAILED` path (`envelope-mapper.ts`, unmodified) —
  `DATE_RANGE_INVALID`/`DATE_RANGE_INVERTED` surface as `details[]` entries with
  domain codes, exactly like every existing per-field document error. No new
  error-handling mechanism is introduced.
- **Logging & metrics:** no new fields beyond what `error-handler.ts` already
  logs. A slow aggregation is visible through Fastify's existing request-duration
  log; no metric-specific instrumentation added, matching ARCH-4/ARCH-5's
  "not needed at this project's scale" finding.
- **Auth & authz:** unchanged mechanism (`app.authenticate` + `request.userId`).
  `ownerId` is inside the aggregation's `$match` and inside `buildIssueDateFilter`'s
  caller, never a post-filter — the same rule G2 established for every repository
  method.
- **Performance & scale:** both the list-range query and the aggregation's
  `$match` are unindexed beyond whatever `_id`/default indexing Mongo provides
  (R30/A2) — acceptable at this project's scale, flagged as an Open Question and
  a README "what I'd improve" item rather than built.
- **Security:** no new input surface beyond two date strings; same anti-enumeration
  posture as Phase 3/4 (results scoped by `ownerId`, never leaked across users —
  R16 tests this directly with a second, larger-totals user).
- **Migrations & rollout:** no schema change, no new collection. Rollback is a
  plain deploy revert; this is the first phase that mutates nothing at all, so a
  rollback simply stops the new routes from being called.

## Architecture Decisions Log

| # | Decision | Alternatives | Chosen Because | Satisfies REQs |
|----|----|----|----|----|
| A1 | `buildIssueDateFilter` lives in `documents.repository.ts` (exported), imported by `reports.repository.ts` | Add the filter/passthrough to `persistence/repository.ts`, the shared base every repository imports | Smaller blast radius — one file, two consumers — mirrors ARCH-5's A2 precedent of keeping a one-off query local rather than growing the shared base every repository depends on | R13, R29 |
| A2 | No new index on `documents` this phase | Add a compound `{ownerId: 1, issueDate: 1}` index via `plugins/indexes.ts` | Consistent with ARCH-4/ARCH-5's explicit "not needed at this project's scale" finding; this is the first range-scan query pattern in the project, but seed-data volume doesn't exercise it | R8, R13, R30 |
| A3 | `DATE_RANGE_INVERTED` attaches `path: ['to']` | `path: ['from']`; `path: []` (root) | `to` is the field that fails the constraint relative to `from` (must be `>= from`) — same convention typical date-range validators use; `document.ts`'s existing per-field `superRefine` pattern expects a single path, and this is the project's first cross-field use of it | R6, R12, R31 |
| A4 | New `ReportTable`/`StatCards`/`RangePicker` components in `components/report/`, not an extension of `DocumentsList`/`DocumentsRow` | Add a `variant` prop to the existing documents-list components | Matches the brief's `Owns` list literally; the mockup's columns differ meaningfully (adds Subtotal/Discount/Tax, drops row actions); keeps the documents-list page's component at zero regression risk from a second screen's requirements | R23, R24, R32 |

## Risk & Stress-Test Scenarios

### Forward — runtime failure scenarios

| Scenario | How the Design Handles It |
|----|----|
| Mongo unreachable for 30s during the aggregation or the range-filtered list query | Uncaught driver error falls through to the global handler → 500 `INTERNAL_ERROR`, same as every existing route's equivalent gap. The read is a single atomic call either way; no partial state |
| Two callers requesting overlapping or identical date ranges concurrently | The report is read-only — no write, no lock, no race. Each call independently aggregates whatever is currently persisted |
| `documents` grows from seed-data scale toward millions of rows | Both the list-range query and the aggregation's `$match` are unindexed beyond `_id` (A2) — acceptable at this project's scale per precedent, but this is exactly the scenario the deferred index would address. Recorded as a GAP in Open Questions rather than silently assumed away |
| Rollback after a bad deploy | No schema change to roll back, and this phase mutates nothing — the new/amended routes simply stop being called once the frontend build reverts. The safest phase to roll back of the five so far |
| A document's persisted totals were computed by a since-fixed pricing-engine bug (Phase 1–4) | The report faithfully sums whatever is persisted — 5-A step 2 explicitly forbids re-running the engine here, so a stale-totals bug surfaces as "the report agrees with the (wrong) documents," not as a report/document mismatch. This is by design: R14's reconciliation test proves internal consistency between the two read paths, not correctness against a hypothetical re-computation |

### Backward — regression risk per touched area

| Touched area | What could regress | How we'd know / mitigation |
|----|----|----|
| `persistence/documents.repository.ts` `list()` (widened signature) | Existing zero-argument callers (`api/routes/documents.ts`'s `GET /documents`, `test/integration/ownership.test.ts`) must keep returning every document | `range` is optional and defaults to `{}` inside `buildIssueDateFilter`, so both compile and behave unchanged — but no current test explicitly pins "no range ⇒ unfiltered," so a future accidental default-range change could regress silently (see Open Questions) |
| `apps/frontend/src/lib/api/documents.ts` `list()` (widened signature) | `documents/page.tsx`'s existing call site (`documents.list()`, Phase 3) | Purely additive optional parameter; a TypeScript build failure would catch an accidental breaking change immediately, same reasoning ARCH-5 used for the equivalent backend case |
| `apps/backend/src/domain/document.ts` (`StoredTotals` field names) | `reports.repository.ts`'s `$group` stage references `totals.grandTotal`/`totalTax`/`totalDiscount` as Mongo field-path strings, invisible to the TypeScript compiler | A future rename during cleanup would silently break the aggregation with no compile error — R14's reconciliation test must keep running in CI, not just once at J5, to catch this class of regression |
| `api/plugins/immutability.ts` / `GUARDED_ROUTES` | Neither new route mutates a document, so neither should ever be added to the registry | Confirmed by inspection this session; 4-B's existing parameterized suite requires no changes — worth a one-line note in `docs/contracts/phase-5.md` so a future phase doesn't "helpfully" add `GET /reports/summary` to the registry |

## Open Questions

- Should `documents`/`reports` queries get a compound index (`{ownerId, issueDate}`),
  now that this phase introduces the project's first range-scan query pattern?
  - **Impact if unresolved:** acceptable at this project's take-home scale;
    would matter under production data volume.
  - **Suggested default:** skip (A2); note it in the README's "what I'd improve"
    section, same treatment ARCH-4/ARCH-5 gave their own deferred items.
- Does `DATE_RANGE_INVERTED`'s error path belong on `'to'`, `'from'`, or the root?
  - **Impact if unresolved:** one test assertion needs a concrete path to check
    against; a wrong guess is a one-line test fix, not a design change.
  - **Suggested default:** `'to'` (A3); `generate-tasks`/G5 should confirm this
    against `docs/contracts/phase-5.md` once written, same as ARCH-4/ARCH-5
    deferred their own contract-detail questions to that phase's contract doc.
- Should `list()`'s "no range ⇒ every document" behavior get an explicit
  regression test, given nothing currently pins it?
  - **Impact if unresolved:** a future accidental default-range change could
    silently narrow the unfiltered documents-list view with no test failing.
  - **Suggested default:** yes — one assertion added to either
    `reports.test.ts` or `documents.repository.test.ts`, whichever the
    implementing lane finds more natural; not large enough to warrant its own
    file.

## Out of Scope

- Any index on `documents` (reason: A2, same finding as ARCH-4/ARCH-5)
- Filtering the report by document status (reason: R5 — the PDF's silence on
  status makes filtering an unstated narrowing; the plan's own decision,
  unchanged by this ARCH)
- Any range field other than `issueDate` (e.g. `createdAt`/`updatedAt`-based
  filtering) — `issueDate` is the only range field per the plan's decision table
- Lane 4-D (duplicate) and any Phase 6 stretch goals (printable view, seed
  script) — unrelated to this phase
- A generated/shared types package (reason: project-wide decision, unchanged)

---

# Tasks

Tasks live in a sibling file, not inline — see
`specs/architecture/ARCH-6-summary-report-lane-briefs-tasks.md` (same convention
as issue #1's `ARCH-1-skeleton-lane-briefs.md` / `ARCH-1-tasks.md` pair, issue #3's
`ARCH-3-auth-ownership.md` / `-tasks.md` pair, issue #4's
`ARCH-4-documents-line-items-validation.md` / `-tasks.md` pair, and issue #5's
`ARCH-5-lifecycle-immutability.md` / `-tasks.md` pair).
