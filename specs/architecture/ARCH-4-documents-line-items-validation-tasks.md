# Tasks: Documents, line items, validation

> **Date:** 2026-08-13
> **Issue:** #4
> **Phase:** 3 of 5 (Task Generation)
> **Architecture:** `specs/architecture/ARCH-4-documents-line-items-validation.md` — read that document first; every task below is a slice of its Change Footprint and traces to its Inferred Requirements (R1–R30) and Architecture Decisions Log (A1–A9).

## Execution Plan

```
T1 (contract) ──┬──► T3 (repo) ──┐
T2 (pp exports) ┤                ├──► T4 (service) ──► T5 (routes) ──┐
                 ├──► T6 (backend verification, red until T5) ────────┤
                 ├──► T7 (frontend client) ──┬──► T8 (list UI) ───────┤
                 │                            └──► T9 (editor UI) ────┤──► T10 (join)
```

| Wave | Runs | Terminals | Depends on |
|---|---|---|---|
| 1 | T1 · T2 | 2 | — |
| 2 | T3 · T6 · T7 | 3 | Wave 1 (T1) |
| 3 | T4 | 1 | Wave 2 (T1, T2, T3) |
| 4 | T5 · T8 · T9 | 3 | Wave 3 (T4) for T5; Wave 2 (T7) for T8/T9 |
| 5 | T10 — join | 1 | Wave 4 |

**Why T1 and T2 can run together:** T1 touches `contracts/document.ts`, `domain/document.ts`,
`lib/api/types/document.ts`, `docs/contracts/phase-3.md`; T2 touches only
`services/pricing-preview.ts` (adding three `export` keywords). Disjoint files, no import
relationship between them.

**Why T3/T6/T7 share wave 2:** all three need only T1's contract (`domain/document.ts` for T3's
`StoredDocument` type, `contracts/document.ts` for T6's request shapes and T7's mirrored types) —
none imports another's output. T6 in particular is written **blind** against T1, exactly like
ARCH-3's T6 and this project's `3-B` lane brief: it stays red until T5 lands in wave 4, green at
the join. That is the point, not a bug in the schedule.

**Why T5 waits for T4 but T8/T9 don't:** T5's routes call `services/documents.ts` directly, so it
cannot even typecheck until T4 exists. T8/T9 only import `lib/api/documents.ts` (T7) — a typed
client function, not a live backend — so their component tests can run against it without T5
being done; the routes only need to be real by the time `e2e/documents.cy.ts` runs at T10.

**Commit discipline:** every task commits by pathspec, scope = task id, per
`docs/parallel-execution.md` §3 (e.g. `feat(T4): document recompute-and-persist service --
apps/backend/src/services/documents.ts apps/backend/src/services/documents.test.ts`).

---

## Task T1: Document contract, frontend mirror, and contract docs

> **Status:** not started
> **Verification:** tdd
> **Effort:** m
> **Priority:** critical
> **Depends on:** None
> **Satisfies REQs:** R1, R2, R3, R4, R5, R6, R9, R28, R29
> **Footprint slice:** New: `apps/backend/src/contracts/document.ts`, `apps/backend/src/domain/document.ts`, `apps/frontend/src/lib/api/types/document.ts`, `docs/contracts/phase-3.md`
> **High-risk areas touched:** None

### Description

Freezes the wire representation every other task builds against: `Document`/`LineItem`
zod schemas (the `LineItem` line-input schema is a `z.intersection` reusing Phase 1's
`lineInputSchema` object, per ARCH decision A5), this domain's error codes, and the
`StoredDocument`/`StoredLineItem`/`StoredTotals` persisted types. Mirrors the shape to the
frontend by hand (Phase 0's mirroring rule) and writes the human-readable contract snapshot.
Nothing here touches persistence, the engine, or routes — every wave-2 task depends on this one
for types alone.

### Test Plan

#### Test File(s)
- `apps/backend/src/contracts/document.test.ts` (colocated, following `contracts/auth.test.ts` /
  `contracts/pricing.test.ts`'s pattern)

#### Test Scenarios

##### Schema acceptance

- **accepts a valid create input** — GIVEN `{title, customer, issueDate}` with no `lines` WHEN
  parsed THEN it succeeds with an empty lines array default _(verifies R5)_
- **accepts a valid create input with lines, including an echoed `id`** — GIVEN a line with
  `id`, `description`, and Phase 1's PDF-sample numeric fields WHEN parsed THEN it succeeds
  _(verifies R1, R28)_
- **accepts a line with no `id`** — GIVEN a line omitting `id` WHEN parsed THEN it succeeds (id is
  optional on input — minted server-side by T4) _(verifies R27)_
- **accepts a partial update input** — GIVEN `{title}` only WHEN parsed against the update schema
  THEN it succeeds _(verifies R5)_

##### Document-level validation

- **rejects a missing/empty title** — GIVEN `title: ''` or absent on create WHEN parsed THEN
  `TITLE_REQUIRED` at path `title` _(verifies R6)_
- **rejects a missing/empty customer** — GIVEN `customer: ''` WHEN parsed THEN `CUSTOMER_REQUIRED`
  at path `customer` _(verifies R6)_
- **rejects a malformed issueDate** — GIVEN `issueDate: '08/13/2026'` (not `YYYY-MM-DD`) WHEN
  parsed THEN `ISSUE_DATE_INVALID` at path `issueDate` _(verifies R3, R6)_

##### Line-level validation

- **rejects an empty line description** — GIVEN a line with `description: ''` WHEN parsed THEN
  `DESCRIPTION_REQUIRED` at path `lines.0.description` _(verifies R6)_
- **still enforces Phase 1's per-line codes through the intersection** — GIVEN a line with
  `quantity: 0` WHEN parsed THEN `QUANTITY_TOO_LOW` at path `lines.0.quantity`, proving the
  intersection preserves `lineInputSchema`'s own `superRefine` _(guards backward-regression risk:
  the composed schema must not silently drop Phase 1's validation — verifies R1, R28)_

##### Server-managed fields

- **rejects `totals` on create input** — GIVEN a create payload including a `totals` object WHEN
  parsed THEN `SERVER_MANAGED_FIELD` at path `totals` _(verifies R5, R29)_
- **rejects `status` on create input** — GIVEN a create payload including `status: 'finalized'`
  WHEN parsed THEN `SERVER_MANAGED_FIELD` at path `status` _(verifies R5, R29)_

##### Error code completeness

- **every `DocumentErrorCode` member is listed in the code array** — mirrors `pricing.ts`'s
  `satisfies readonly PricingErrorCode[]` compile-time exhaustiveness check _(verifies R6)_

### Implementation Notes

- **Module(s):** `contracts/document.ts` (schemas + codes only), `domain/document.ts` (types only,
  imports nothing but `mongodb`'s `ObjectId`, mirroring `domain/user.ts`)
- **Pattern reference:** `contracts/pricing.ts` (schema+codes-in-one-file, `superRefine` →
  `params.code`), `contracts/auth.ts` (same pattern for document-level fields), `domain/user.ts`
  (domain type discipline)
- **Key decisions:** A5 (`z.intersection(lineInputSchema, {id, description})` — import
  `lineInputSchema` from `contracts/pricing.ts`, do not redeclare its fields), A6
  (`SERVER_MANAGED_FIELD` via explicit optional-forbidden fields + `superRefine`, not reliance on
  default key-stripping)
- **Libraries:** `zod` only (no new dependency)
- **High-risk callouts:** None — this task is additive, no existing file is edited

### Scope Boundaries

- Do NOT implement the repository, service, or routes — types and validation only
- Do NOT add a `Q-2026-015`-style document number field (Out of Scope — not in the frozen shape)
- Do NOT add an optimistic-concurrency/version field (Out of Scope)
- Only implement the route table's request/response shapes as frozen in the ARCH's API Contracts
  section — no speculative fields

### Files Expected

**New files:**
- `apps/backend/src/contracts/document.ts` — schemas + error codes (pattern: `contracts/pricing.ts`)
- `apps/backend/src/contracts/document.test.ts`
- `apps/backend/src/domain/document.ts` — `StoredDocument`/`StoredLineItem`/`StoredTotals` (pattern: `domain/user.ts`)
- `apps/frontend/src/lib/api/types/document.ts` — hand-written mirror (pattern: `lib/api/types/auth.ts`)
- `docs/contracts/phase-3.md` — route table, both schemas, error codes, 404-not-403 rule (pattern: `docs/contracts/phase-2.md`)

**Must NOT modify:**
- `apps/backend/src/contracts/pricing.ts` (read-only — `lineInputSchema` is imported, not copied)
- `apps/backend/src/contracts/errors/envelope.ts` (frozen since Phase 0)

---

## Task T2: Export pricing-preview's wire↔engine helpers

> **Status:** not started
> **Verification:** checklist
> **Effort:** xs
> **Priority:** high
> **Depends on:** None
> **Satisfies REQs:** R25, R26
> **Footprint slice:** Modified: `apps/backend/src/services/pricing-preview.ts`
> **High-risk areas touched:** `services/pricing-preview.ts` (L) — additive export only, see ARCH Areas of Impact

### Description

Adds `export` to `toEngineLine`, `fromEngineResult`, and `findFailingLine` in
`services/pricing-preview.ts` — currently module-private. No behavior or signature change. This
is the precondition for T4 reusing the wire↔engine unit conversion instead of re-deriving it
(ARCH decision A2).

### Verification Checklist

- **`toEngineLine`, `fromEngineResult`, `findFailingLine` are exported** — expected: `grep export
  apps/backend/src/services/pricing-preview.ts` shows all three; no other line in the file changes
- **Existing unit suite unaffected** — expected: `cd apps/backend && npx vitest run
  src/services/pricing-preview.test.ts` exits 0, same assertions as before this task
- **Existing API suite unaffected** — expected: `cd apps/backend && npx vitest run
  test/api/pricing-preview.test.ts` exits 0
- **Typecheck passes** — expected: `cd apps/backend && npx tsc --noEmit` exits 0

### Implementation Notes

- **Module(s):** `services/pricing-preview.ts`
- **Pattern reference:** none needed — this is a minimal, mechanical change
- **Key decisions:** A2 (export rather than duplicate)
- **Libraries:** none
- **High-risk callouts:** Two call sites will exist after T4 lands (the original `/pricing/preview`
  route and `services/documents.ts`) — this task itself carries no risk, but flags for T4's
  reviewer that a future change to these functions now affects two routes' behavior at once
  (see ARCH backward-regression row for this file)

### Scope Boundaries

- Do NOT change any function's signature or internal logic — export only
- Do NOT touch `api/routes/pricing.ts` or any other consumer

### Files Expected

**Modified files:**
- `apps/backend/src/services/pricing-preview.ts` (add three `export` keywords, no other change)

**Must NOT modify:**
- `apps/backend/src/services/pricing-preview.test.ts` (existing assertions must keep passing unmodified — proves the change is truly behavior-neutral)
- `apps/backend/src/api/routes/pricing.ts`

---

## Task T3: DocumentsRepository

> **Status:** not started
> **Verification:** tdd
> **Effort:** s
> **Priority:** high
> **Depends on:** T1
> **Satisfies REQs:** R8, R10
> **Footprint slice:** New: `apps/backend/src/persistence/documents.repository.ts`
> **High-risk areas touched:** `persistence/documents.repository.ts` (M) — second real consumer of `createOwnedRepository`, first mutable multi-field collection

### Description

`DocumentsRepository`, built on Phase 2's `createOwnedRepository<StoredDocument>` base helper
(ARCH decision A1) plus one custom sorted `list`. Every method takes `ownerId` first. This is the
base helper's intended first real consumer beyond its own unit tests.

### Test Plan

#### Test File(s)
- `apps/backend/src/persistence/documents.repository.test.ts` (colocated, following
  `persistence/repository.test.ts`'s fake-collection pattern)

#### Test Scenarios

##### Ownership scoping

- **`list` scopes to ownerId** — GIVEN two owners' documents in the fake collection WHEN
  `list('owner-1')` is called THEN only owner-1's filter is used _(verifies R8)_
- **`list` sorts newest-first by issueDate then createdAt** — GIVEN documents with varying
  `issueDate`/`createdAt` WHEN listed THEN the sort spec passed to the fake `find` is
  `{issueDate: -1, createdAt: -1}` _(verifies R8 / ARCH R16)_
- **`findById` filters `{_id, ownerId}` in one call** — GIVEN an id and an ownerId WHEN
  `findById` is called THEN the fake collection receives one `findOne` call with both fields in
  the same filter object, never a separate compare step _(verifies R10)_
- **`insert` stamps ownerId** — GIVEN a document without `ownerId` WHEN inserted THEN the fake
  collection receives it with `ownerId` merged in _(verifies R8)_
- **`update` scopes to owner** — GIVEN an id/ownerId/patch WHEN `update` is called THEN the fake
  collection's filter includes `ownerId` _(verifies R8)_
- **`remove` scopes to owner** — GIVEN an id/ownerId WHEN `remove` is called THEN the fake
  collection's filter includes `ownerId` _(verifies R8)_
- **independent owners stay scoped separately** — GIVEN two sequential calls with different
  ownerIds WHEN both run THEN each filter reflects only its own owner (mirrors
  `repository.test.ts`'s last case) _(verifies R8)_

### Implementation Notes

- **Module(s):** `persistence/documents.repository.ts` (wraps `persistence/repository.ts`)
- **Pattern reference:** `persistence/users.repository.ts` (file shape), `persistence/repository.ts`
  (the `createOwnedRepository` factory being wrapped, not reimplemented)
- **Key decisions:** A1 (build on the base helper, not hand-written — `users.repository.ts` was
  the deliberate exception, not the template)
- **Libraries:** `mongodb` types only
- **High-risk callouts:** M risk per ARCH Areas of Impact — a gap in the ownership filter here is
  a cross-user data leak. Mitigated by the `ownerId`-first-parameter shape (typecheck-enforced)
  plus T6's independent, contract-blind isolation tests as the real backstop

### Scope Boundaries

- Do NOT add a Mongo index — Out of Scope this phase (flagged as a Phase 5 candidate in ARCH)
- Do NOT implement `findById`-then-compare — the filter must always be one combined query (R10)
- Only implement the five methods `DocumentsRepository` needs; do not extend `createOwnedRepository`
  itself

### Files Expected

**New files:**
- `apps/backend/src/persistence/documents.repository.ts` (pattern: `persistence/users.repository.ts`)
- `apps/backend/src/persistence/documents.repository.test.ts` (pattern: `persistence/repository.test.ts`)

**Must NOT modify:**
- `apps/backend/src/persistence/repository.ts` (the base helper — consumed, not changed; guards ARCH backward-regression risk for this file)
- `apps/backend/src/persistence/users.repository.ts`

---

## Task T4: services/documents.ts — recompute-and-persist

> **Status:** done
> **Verification:** tdd
> **Effort:** m
> **Priority:** critical
> **Depends on:** T1, T2, T3
> **Satisfies REQs:** R2, R7, R12, R13, R15, R19, R21, R25, R26, R27, R30
> **Footprint slice:** New: `apps/backend/src/services/documents.ts`
> **High-risk areas touched:** `services/documents.ts` (M) — every mutating route funnels through this one function

### Description

The central write path (ARCH decision A8): one `recomputeAndPersist` function that always
recomputes the whole document via `calculateDocument` (reusing T2's exported helpers) before
writing, preserves/mints line ids, and maps `StoredDocument` ↔ `DocumentResponse` (the one mapper
the brief calls for, R2). Domain errors (`DOCUMENT_NOT_FOUND`) and engine errors (reused
`PricingPreviewError`) are thrown here, not in the routes.

### Test Plan

#### Test File(s)
- `apps/backend/src/services/documents.test.ts` (colocated, following `services/auth.test.ts`'s
  pattern of a fake repository)

#### Test Scenarios

##### Recompute on write

- **recomputes totals from the full lines array on create** — GIVEN the PDF's 3-line fixture WHEN
  `recomputeAndPersist` runs on create THEN the persisted `StoredTotals` (converted back to major
  units) equal `450.00 / 40.00 / 11.50 / 421.50` _(verifies R12, R19)_
- **recomputes totals on every update, not just create** — GIVEN an existing document and a
  lines-array patch WHEN update runs THEN totals reflect the new array in full, not a delta
  _(verifies R12)_

##### Line identity

- **preserves an echoed line id** — GIVEN a lines array where one line carries an existing id WHEN
  persisted THEN that line's stored id is unchanged _(verifies R13, R27)_
- **mints an id for a line with none** — GIVEN a line with no `id` WHEN persisted THEN it receives
  a fresh `crypto.randomUUID()`-shaped id _(verifies R13, R27)_
- **editing one line leaves others' ids unchanged** — GIVEN a 3-line document WHEN one line is
  patched THEN the other two lines' stored ids are byte-for-byte the same as before _(verifies R21)_

##### Error propagation

- **engine rejection throws the reused `PricingPreviewError`** — GIVEN a fixed discount exceeding
  its line's subtotal WHEN recompute runs THEN a `PricingPreviewError` is thrown with `cause.code
  === 'DISCOUNT_EXCEEDS_SUBTOTAL'` and the correct `lineIndex` _(verifies R15)_
- **missing/foreign document id throws `DOCUMENT_NOT_FOUND`** — GIVEN a repository whose `findById`
  returns null (simulating a missing or not-owned document) WHEN update/remove is called THEN the
  service throws `{code: 'DOCUMENT_NOT_FOUND'}` _(verifies R7)_

##### Response shape

- **response `LineItem` carries no computed fields** — GIVEN a persisted document WHEN mapped to
  `DocumentResponse` THEN each line has exactly `{id, description, quantity, unitPrice, discount,
  taxPercent}` and nothing else _(verifies R30)_
- **`ownerId` never appears in the response** — GIVEN a persisted `StoredDocument` WHEN mapped
  THEN the response object has no `ownerId` key _(verifies ARCH R1)_

##### Regression guard

- **matches `pricing-preview.test.ts`'s pinned values for the same fixture** — GIVEN the PDF
  sample lines WHEN run through this service's reused `toEngineLine`/`fromEngineResult` THEN the
  per-line figures match what `services/pricing-preview.test.ts` already asserts for the identical
  input, proving T2's export didn't change behavior when called from a second site _(guards
  backward-regression risk for `services/pricing-preview.ts`)_

### Implementation Notes

- **Module(s):** `services/documents.ts`
- **Pattern reference:** `services/pricing-preview.ts` (service-layer shape: convert in, calculate,
  convert out, wrap engine errors)
- **Key decisions:** A2 (reuse `toEngineLine`/`fromEngineResult`/`findFailingLine` from T2, do not
  re-derive), A3 (reuse `PricingPreviewError` + the existing `mapPricingEngineError` — do not write
  a second mapper), A4 (`crypto.randomUUID()` for line ids), A7 (never persist per-line computed
  values), A8 (one recompute funnel for all callers)
- **Libraries:** Node built-in `crypto.randomUUID()` — no new dependency
- **High-risk callouts:** M risk per ARCH Areas of Impact — this function is a single point of
  failure for every mutating route in the phase. Mitigated by this task's own broad scenario
  coverage plus T6's independent contract-level tests catching anything this task's own tests miss

### Scope Boundaries

- Do NOT implement HTTP routing — that is T5
- Do NOT persist a `LineResult` per line (Out of Scope / A7) — only the document-level `totals`
- Do NOT add an optimistic-concurrency/version check (Out of Scope)
- Do NOT reimplement `toEngineLine`/`fromEngineResult` — import T2's exports

### Files Expected

**New files:**
- `apps/backend/src/services/documents.ts` (pattern: `services/pricing-preview.ts`)
- `apps/backend/src/services/documents.test.ts` (pattern: `services/auth.test.ts`)

**Must NOT modify:**
- `apps/backend/src/services/pricing-preview.ts` (T2's output — consumed only; guards backward-regression risk for this file)
- `apps/backend/src/api/errors/engine-errors.ts` (reused unmodified — guards ARCH backward-regression risk for this file)

---

## Task T5: Document and line-item routes

> **Status:** not started
> **Verification:** test-after
> **Effort:** m
> **Priority:** critical
> **Depends on:** T1, T4
> **Satisfies REQs:** R4, R11, R14, R16
> **Footprint slice:** New: `apps/backend/src/api/routes/documents.ts`, `apps/backend/src/api/routes/document-lines.ts`
> **High-risk areas touched:** `api/plugins/authenticate.ts` (attached by 8 new routes — first use outside Phase 2's own auth routes)

### Description

The full route table from `docs/contracts/phase-3.md`, wired to `services/documents.ts`. Every
route attaches `app.authenticate`. HTTP-level concerns only — validation and business logic live
in T1/T4; this task's job is status codes, request/response marshaling, and mapping thrown domain
and engine errors to the right HTTP response, mirroring `api/routes/auth.ts`'s route-local catch
pattern.

### Test Plan

#### Test File(s)
- None owned by this task. Per the project's lane-ownership convention (`docs/parallel-execution.md`),
  route-level and integration behavior for this domain is owned by **T6**
  (`test/api/documents.test.ts`, `test/api/document-lines.test.ts`, `test/integration/ownership.test.ts`),
  written blind against T1's contract. T5 is verified when T6's suite — already written by wave 2 —
  goes green against these routes.

#### Test Scenarios (verified via T6, cross-referenced here for completeness)

- Every route in the frozen table responds with the ARCH-specified status code and shape (R4) —
  verified by T6's `documents.test.ts`/`document-lines.test.ts`
- Every route attaches `app.authenticate` — a request with no session cookie gets `401
  UNAUTHENTICATED` on all 8 routes — verified by T6's isolation table
- `details[]` carries a specific code and field path for every validation failure (R14) — verified
  by T6's `validation-codes.test.ts`
- List response omits `lines` (R16) — verified by T6's `documents.test.ts`

##### Wiring self-check (this task's own responsibility, not delegated)

- **routes autoload with no `app.ts` edit** — expected: `git diff -- apps/backend/src/app.ts`
  shows no changes after this task
- **typecheck passes** — expected: `cd apps/backend && npx tsc --noEmit` exits 0

### Implementation Notes

- **Module(s):** `api/routes/documents.ts`, `api/routes/document-lines.ts`
- **Pattern reference:** `api/routes/auth.ts` (route-local domain-error catch-and-map, cookie/session
  handling not applicable here but the catch structure is), `api/routes/pricing.ts` (engine-error
  catch via `mapPricingEngineError`)
- **Key decisions:** A3 (reuse `mapPricingEngineError` unmodified), A9 (list response omits `lines`)
- **Libraries:** none new — `fastify`, `zod` (already dependencies)
- **High-risk callouts:** L–M risk — first extension of `app.authenticate` beyond Phase 2's own
  routes; T6's per-route 401 checks are the regression backstop if the preHandler doesn't attach
  correctly on a route

### Scope Boundaries

- Do NOT write files under `test/api/**` or `test/integration/**` — that is T6's ownership, and
  writing there would collide with a lane already producing those files against the same contract
- Do NOT implement finalize, lock, or duplicate endpoints (Out of Scope — Phase 4)
- Do NOT compute anything — call `services/documents.ts`, never do arithmetic in a route handler

### Files Expected

**New files:**
- `apps/backend/src/api/routes/documents.ts` (pattern: `api/routes/auth.ts`)
- `apps/backend/src/api/routes/document-lines.ts` (pattern: `api/routes/auth.ts`)

**Must NOT modify:**
- `apps/backend/src/app.ts` (autoload only — guards ARCH backward-regression risk for this file)
- `apps/backend/src/api/plugins/authenticate.ts` (consumed, not changed)
- `apps/backend/src/api/errors/engine-errors.ts`

---

## Task T6: Validation and isolation tests

> **Status:** not started
> **Verification:** tdd
> **Effort:** l
> **Priority:** critical
> **Depends on:** T1
> **Satisfies REQs:** R4, R6, R7, R13, R14, R17, R18, R19, R20, R21
> **Footprint slice:** New: `apps/backend/test/api/documents.test.ts`, `test/api/document-lines.test.ts`, `test/api/validation-codes.test.ts`, `test/integration/ownership.test.ts`, `test/support/factories.ts`
> **High-risk areas touched:** `persistence/documents.repository.ts` (M, via integration coverage), `services/documents.ts` (M, via API-level coverage)

### Description

The scored acceptance suite for this phase: proves errors are specific (one test per code +
path) and that users cannot see each other's data (table-driven isolation over every id-scoped
route). Written against `docs/contracts/phase-3.md`, not against T5's implementation — this suite
is expected to be **red** until T5 lands, by design, since it pins the contract independently.

### Test Plan

#### Test File(s)
- `apps/backend/test/support/factories.ts`
- `apps/backend/test/api/documents.test.ts`
- `apps/backend/test/api/document-lines.test.ts`
- `apps/backend/test/api/validation-codes.test.ts`
- `apps/backend/test/integration/ownership.test.ts`

#### Test Scenarios

##### Factories (support, not itself a test file)

- `test/support/factories.ts` exports a helper to create an authenticated user with a session
  cookie, and helpers to build valid document/line payloads with overrides — reused unmodified by
  Phases 4–5, per the brief

##### Ownership isolation (`test/integration/ownership.test.ts`)

- **each of the 6 id-scoped routes returns 404 for another owner's document** —
  table-driven over `[GET/PATCH/DELETE /documents/:id, POST/PATCH/DELETE
  /documents/:id/lines[/:lineId]]` GIVEN user A's document and user B's session WHEN B calls each
  route THEN 404 `DOCUMENT_NOT_FOUND`, never 403 or 200 _(verifies R7, R17)_
- **list route never leaks another owner's documents** — GIVEN A has documents and B has none WHEN
  B lists THEN B's response is empty; GIVEN both have documents WHEN each lists THEN neither sees
  the other's _(verifies R17)_

##### Error codes (`test/api/validation-codes.test.ts`)

- **one test per code, asserting code and path** — `TITLE_REQUIRED`, `CUSTOMER_REQUIRED`,
  `ISSUE_DATE_INVALID`, `QUANTITY_TOO_LOW`, `UNIT_PRICE_NEGATIVE`, `TAX_PERCENT_OUT_OF_RANGE`,
  `DISCOUNT_PERCENT_OUT_OF_RANGE`, `DISCOUNT_TYPE_CONFLICT`, `DISCOUNT_EXCEEDS_SUBTOTAL`,
  `SERVER_MANAGED_FIELD`, `DOCUMENT_NOT_FOUND`, `LINE_NOT_FOUND` — each GIVEN a payload that
  should trigger exactly that code WHEN submitted THEN the response's `details[].code` (or root
  `error.code` for `DOCUMENT_NOT_FOUND`/`LINE_NOT_FOUND`) matches, with the right field path
  _(verifies R6, R18)_

##### Round-trip correctness (`test/api/documents.test.ts`)

- **PDF sample round-trips to the documented totals** — GIVEN the 3-line fixture WHEN created and
  then read back THEN stored/returned totals equal `450.00 / 40.00 / 11.50 / 421.50` _(verifies R19)_

##### Server-managed fields (`test/api/documents.test.ts`)

- **a payload with `totals` is rejected** — GIVEN a create/update payload including `totals` WHEN
  submitted THEN `400 SERVER_MANAGED_FIELD` at path `totals` _(verifies R20)_
- **a normal payload persists server-computed values matching the engine** — GIVEN a payload with
  no `totals`/`status` WHEN submitted THEN the persisted totals equal `calculateDocument`'s output
  for those lines exactly _(verifies R20)_

##### Line identity (`test/api/document-lines.test.ts`)

- **a PATCH editing one line leaves the other lines' ids unchanged** — GIVEN a 3-line document
  WHEN one line is patched THEN a follow-up GET shows the other two lines' ids byte-identical to
  before _(verifies R13, R21)_

##### Route table completeness

- **every route in the frozen table is exercised** — a table-driven structure over the full route
  list (not one-off calls) so a route added later without a matching test is visible as a gap
  _(verifies R4, R17)_

### Implementation Notes

- **Module(s):** none of production code — test-only, per this lane's explicit guardrail
- **Pattern reference:** `test/api/auth.test.ts` (route-test shape), `test/integration/users.test.ts`
  (integration-test shape, `setupTestDb` usage), `test/fixtures/pdf-sample.ts` (the fixture this
  task's round-trip tests consume, read-only)
- **Key decisions:** none — this task verifies others' decisions, doesn't make new ones
- **Libraries:** none new — `vitest`, existing `test/support/db.ts`
- **High-risk callouts:** This *is* the mitigation for T3's and T4's M-risk footprint entries —
  independent, contract-blind coverage of the ownership filter and the recompute-on-write
  guarantee

### Scope Boundaries

- Do NOT write any source file outside `test/` — if the contract as written can't express a needed
  test, that's an amendment request to T1's author, not a reason to guess or adapt the test to
  whatever T5 happens to have produced
- Do NOT wait for T5 to be done before writing these tests — write against `docs/contracts/phase-3.md`
  now; red is the expected interim state

### Files Expected

**New files:**
- `apps/backend/test/support/factories.ts` (pattern: new — first file beyond `test/support/db.ts`)
- `apps/backend/test/api/documents.test.ts` (pattern: `test/api/auth.test.ts`)
- `apps/backend/test/api/document-lines.test.ts` (pattern: `test/api/auth.test.ts`)
- `apps/backend/test/api/validation-codes.test.ts` (pattern: `test/api/pricing-preview.test.ts`)
- `apps/backend/test/integration/ownership.test.ts` (pattern: `test/integration/users.test.ts`)

**Must NOT modify:**
- `apps/backend/test/support/db.ts` (reused unmodified — guards ARCH backward-regression risk)
- `apps/backend/test/fixtures/pdf-sample.ts` (read-only fixture)
- `apps/backend/src/contracts/document.ts` (frozen for the phase — an amendment goes through T1's owner)

---

## Task T7: Frontend typed client

> **Status:** done
> **Verification:** tdd
> **Effort:** s
> **Priority:** high
> **Depends on:** T1
> **Satisfies REQs:** R9
> **Footprint slice:** New: `apps/frontend/src/lib/api/documents.ts`
> **High-risk areas touched:** None

### Description

The whole route table as a typed client — `list`, `get`, `create`, `update`, `remove`, plus the
three line calls — each a thin wrapper over `apiFetch` from `lib/api/client.ts`. Owned as its own
task (rather than folded into T8/T9) because both UI tasks import it in the same wave; writing it
once here avoids either page task blocking on the other.

### Test Plan

#### Test File(s)
- `apps/frontend/src/lib/api/documents.test.ts` (colocated, following `lib/api/auth.test.ts` /
  `lib/api/pricing.test.ts`'s pattern of asserting the underlying `fetch` call)

#### Test Scenarios

##### Request shape

- **`list` calls `GET /api/v1/documents`** — WHEN `list()` is called THEN `apiFetch` is invoked
  with that path and no body _(verifies R9)_
- **`get(id)` calls `GET /api/v1/documents/:id`** _(verifies R9)_
- **`create(input)` calls `POST /api/v1/documents` with the input as JSON body** _(verifies R9)_
- **`update(id, patch)` calls `PATCH /api/v1/documents/:id` with the patch as JSON body**
  _(verifies R9)_
- **`remove(id)` calls `DELETE /api/v1/documents/:id`** _(verifies R9)_
- **`addLine`/`updateLine`/`removeLine` call the three nested line routes with the right
  method/path** _(verifies R9)_

##### Error propagation

- **a rejected `apiFetch` call surfaces as `ApiError` unchanged** — GIVEN `apiFetch` rejects with
  an `ApiError` WHEN any client function is called THEN the same error propagates, not wrapped or
  swallowed _(verifies R9)_

### Implementation Notes

- **Module(s):** `lib/api/documents.ts`
- **Pattern reference:** `lib/api/pricing.ts` (simplest thin-wrapper shape), `lib/api/auth.ts`
  (multiple-endpoint client shape)
- **Key decisions:** none new — straightforward mirror of the route table
- **Libraries:** none new
- **High-risk callouts:** None

### Scope Boundaries

- Do NOT add debouncing or client-side caching (that's `lib/api/pricing.ts`'s own concern for
  `/pricing/preview`, not this client's job)
- Do NOT add any UI-facing logic — this file is API plumbing only, consumed by T8/T9

### Files Expected

**New files:**
- `apps/frontend/src/lib/api/documents.ts` (pattern: `lib/api/pricing.ts`, `lib/api/auth.ts`)
- `apps/frontend/src/lib/api/documents.test.ts`

**Must NOT modify:**
- `apps/frontend/src/lib/api/client.ts` (consumed, not changed)
- `apps/frontend/src/lib/api/types/document.ts` (T1's output — read-only)

---

## Task T8: Documents list UI

> **Status:** not started
> **Verification:** ui
> **Effort:** m
> **Priority:** high
> **Depends on:** T7
> **Satisfies REQs:** R22
> **Footprint slice:** New: `apps/frontend/src/app/(app)/documents/page.tsx`, `apps/frontend/src/components/documents/**`
> **High-risk areas touched:** None

### Description

The documents index from `design/htmls/documents.html`: empty state, status pill, right-aligned
totals, create flow, delete with confirmation, loading/failure states. The first screen a reviewer
sees after signing in, so the empty state matters as much as the populated one.

### Verification Checklist

- **Empty state shows a create CTA** — expected: with zero documents, the page renders an empty
  state with a visible "New document" action, not a blank table
- **List matches the mockup's columns** — expected: title, customer, issue date, status pill,
  grand total right-aligned with tabular numerals, per `design/htmls/documents.html`
- **Draft vs. finalized status pills are visually distinct** — expected: two different pill
  styles render for `status: 'draft'` vs `'finalized'` (forward-looking; this phase never writes
  `'finalized'`, but the pill must already handle it as an input)
- **Create flow surfaces field errors** — expected: submitting an invalid create form renders
  `details[]` messages next to the right fields (component test: `TITLE_REQUIRED` → title field)
- **Delete dialog: confirm calls the API, cancel does not** (component test) — expected: clicking
  confirm invokes `documents.remove`, clicking cancel does not, dialog names the document by title
- **Loading and failure states render distinctly** — expected: a pending list shows a loading
  indicator; a failed fetch shows a retry action, not an infinite skeleton
- **Full suite and build pass** — expected: `cd apps/frontend && npm test && npm run build` exits 0

#### Testable Seams

- Empty-state render (no documents)
- Delete-dialog confirm/cancel handlers
- Create-form field-error rendering from `details[]`
- Loading/failure conditional render branches

### Implementation Notes

- **Module(s):** `documents/page.tsx`, `components/documents/**`
- **Pattern reference:** `design/htmls/documents.html` (markup/layout), `components/forms/**`
  (create-flow field primitives, reused not reimplemented), `app/(auth)/**` (client-component shape
  under the `(app)` guard)
- **Key decisions:** none new — pure UI implementation of R22
- **Libraries:** none new
- **High-risk callouts:** None

### Scope Boundaries

- Do NOT implement arithmetic — display server totals as received, never compute a total
  client-side
- Do NOT implement the editor — that is T9
- Do NOT implement finalize, duplicate, or the `Q-2026-015`-style document number (Out of Scope —
  Phase 4/5, and not in the frozen `Document` shape at all)
- Do NOT edit `components/shell/**` — that's T10's job (nav entry only, at the join)

### Files Expected

**New files:**
- `apps/frontend/src/app/(app)/documents/page.tsx`
- `apps/frontend/src/components/documents/**` (list, row, empty state, delete dialog, colocated `*.test.tsx`)

**Must NOT modify:**
- `apps/frontend/src/lib/api/documents.ts` (T7's output — read-only; a missing method is a request
  to T7's owner, not something to add here)
- `apps/frontend/src/components/shell/**` (join-only, per project convention)

---

## Task T9: Editor persistence UI

> **Status:** done
> **Verification:** ui
> **Effort:** l
> **Priority:** high
> **Depends on:** T7
> **Satisfies REQs:** R23, R30
> **Footprint slice:** New: `apps/frontend/src/app/(app)/documents/[id]/page.tsx`, `apps/frontend/src/components/document-editor/**`; Modified: `apps/frontend/src/components/line-items/row-state.ts`, `LineItemRow.tsx`, `LineItemsTable.tsx`
> **High-risk areas touched:** `components/line-items/**` (L — extended, not replaced; only remaining consumer once T10 deletes `/editor`)

### Description

Takes Phase 1's stateless editor components and gives them a document: load by id, edit, save,
reload, still correct. Per-row figures (subtotal, discount amount, tax amount, line total) are
**always** sourced from the existing `/pricing/preview` endpoint — before save and after — while
the four document-level totals switch from live-preview to the persisted document's `totals` only
once a save succeeds (ARCH decision A7, R30). This is the one place in the phase where getting
"which number is source-of-truth right now" wrong would be silently visible to a user as flickering
or stale totals, so the component's state must make the switch explicit, not implicit in render
order.

### Verification Checklist

- **Loads a document by id and renders metadata + lines** — expected: title, customer, issue date,
  status above a line-items table pre-populated from `GET /documents/:id`
- **Per-row figures always come from `/pricing/preview`** — expected: on initial load (before any
  edit) and after every keystroke, the row-level subtotal/discount/tax/total columns reflect the
  live preview response, not a value read off the loaded document
- **Document-level totals switch source on save** — expected: before the first successful save,
  the four totals reflect the live preview; immediately after a successful save, they reflect the
  response's persisted `totals` — verify via component state, not just visual inspection (the ARCH
  calls this out as "explicit in state, not implicit in render order")
- **Save never sends `totals` or `status`** — expected: inspect the outgoing PATCH body in a
  component test; neither key is present
- **`details[]` path mapping is component-tested** (real parsing logic, not delegation) — expected:
  `lines.2.quantity` maps to row index 2's quantity field; an unmapped path surfaces at document
  level rather than vanishing
- **Unsaved-changes guard** — expected: navigating away with a pending edit prompts/blocks; saving
  clears the guard
- **Line ids round-trip through the editor** — expected: a loaded line's `id` is echoed back on
  save (manual or component-test check against T7's `update` call payload)
- **Full suite and build pass** — expected: `cd apps/frontend && npm test && npm run build` exits 0

#### Testable Seams

- `details[]` → row/field mapping function (real logic — gets a unit/component test)
- Totals-source switch (live preview vs. persisted) as explicit component state
- Save payload construction (never includes `totals`/`status`)
- Unsaved-changes guard trigger/clear

### Implementation Notes

- **Module(s):** `documents/[id]/page.tsx`, `components/document-editor/**`,
  `components/line-items/**` (extended — this task owns these files now per
  `docs/parallel-execution.md`'s "ownership is per-wave" rule; Phase 1's lane no longer runs)
- **Pattern reference:** `app/(app)/editor/page.tsx` (direct structural ancestor — being retired at
  T10, this is its replacement), `design/htmls/document-edit.html` (layout/markup),
  `components/line-items/error-mapping.ts` (existing path-mapping pattern to extend for document
  paths, which reuse the same `lines.N.field` shape Phase 1 already established)
- **Key decisions:** A7 (per-line values never persisted — always live via preview, both pre- and
  post-save), A4 (line ids are opaque strings from the server, carried through `RowState.id`)
- **Libraries:** none new
- **High-risk callouts:** L risk per ARCH Areas of Impact on `components/line-items/**` — once T10
  deletes `/editor`, this page is the sole remaining consumer of these components, so an accidental
  behavior change here has nowhere else to be caught except this task's own tests and T10's ported
  Cypress spec

### Scope Boundaries

- Do NOT implement read-only/locked state for finalized documents (Out of Scope — Phase 4)
- Do NOT add a new function to `lib/api/documents.ts` — if something's missing, that's a request
  back to T7's owner, not something to add inline (T8 imports the same file)
- Do NOT persist per-line computed values anywhere, including local component state that outlives
  a render (Out of Scope / A7)

### Files Expected

**New files:**
- `apps/frontend/src/app/(app)/documents/[id]/page.tsx` (pattern: `app/(app)/editor/page.tsx`)
- `apps/frontend/src/components/document-editor/**` (colocated `*.test.tsx`)

**Modified files:**
- `apps/frontend/src/components/line-items/row-state.ts` (`RowState` gains optional `id?: string`;
  `toLineInputs` unchanged)
- `apps/frontend/src/components/line-items/LineItemRow.tsx` (forwards the optional row id)
- `apps/frontend/src/components/line-items/LineItemsTable.tsx` (forwards the optional row id)

**Must NOT modify:**
- `apps/frontend/src/lib/api/documents.ts` (T7's output — read-only)
- `apps/frontend/src/lib/api/pricing.ts` (`preview` — consumed unchanged; guards ARCH
  backward-regression risk for this file, since this task is the reason it keeps being called
  post-Phase-3)
- `apps/frontend/src/components/line-items/DiscountInput.tsx` (no change needed — already generic)

---

## Task T10: Join J3

> **Status:** done
> **Verification:** checklist
> **Effort:** m
> **Priority:** critical
> **Depends on:** T5, T6, T8, T9
> **Satisfies REQs:** R24
> **Footprint slice:** Deleted: `apps/frontend/src/app/(app)/editor/**`; Modified: `apps/frontend/src/components/shell/nav-items.ts`; New/ported: `e2e/documents.cy.ts` (replaces `e2e/pricing-preview.cy.ts`)
> **High-risk areas touched:** `apps/frontend/src/app/(app)/editor/**` (L, deletion — see ARCH Areas of Impact)

### Description

Proves every lane's pieces agree, retires the Phase 1 demo route in favor of the real editor, and
wires the new screen into navigation — the one task with no per-lane file-ownership restriction,
since every other task has already reported done by the time this runs.

### Verification Checklist

- **Full backend suite green** — expected: `cd apps/backend && npx vitest run` exits 0, including
  T6's suite (now green against T5's routes, not red as it was through waves 2–3)
- **Full frontend suite and build green** — expected: `cd apps/frontend && npm test && npm run
  build` exits 0
- **`/editor` retired** — expected: `apps/frontend/src/app/(app)/editor/` no longer exists;
  `git status` shows the deletion
- **`e2e/pricing-preview.cy.ts` ported to `e2e/documents.cy.ts`** — expected: the `421.50`
  assertion survives, now driving the document editor's create/save/reload flow instead of the
  standalone editor
- **Nav gains a `documents` entry** — expected: `components/shell/nav-items.ts` includes
  `{href: '/documents', label: 'Documents'}`
- **`docker compose up --build` boots clean** — expected: all services healthy, no crash loop
- **`e2e/documents.cy.ts` passes against the live stack** — expected: create a document, add the
  PDF's sample lines, save, reload, see `421.50` persisted (verifies R19, R24)
- **Manual check: a specific validation message appears on the right row** — expected: submitting
  a negative quantity shows a message tied to that row, not a generic banner
- **Committed as `chore(J3): join phase 3`** — expected: `git log` shows the commit with that
  message, scoped to this task's file changes

### Implementation Notes

- **Module(s):** none new — reconciliation and wiring only
- **Pattern reference:** ARCH-3's Join J2 process (`docs/parallel-execution.md` §"Running a join")
- **Key decisions:** none new — enforces decisions already made
- **Libraries:** none new
- **High-risk callouts:** L risk — the `/editor` deletion has no remaining consumer once this task
  completes (T9 is `/documents/[id]`'s replacement), but confirm `e2e/pricing-preview.cy.ts`'s
  assertions are fully carried over before deleting it, not after

### Scope Boundaries

- Do NOT add finalize/lock/duplicate functionality (Out of Scope — Phase 4)
- Do NOT add a Mongo index or aggregation (Out of Scope — Phase 5)
- Where something disagrees between lanes, the contract (`docs/contracts/phase-3.md`) decides;
  fix the contract first if it's the one that's wrong, then both sides — do not silently patch
  around a disagreement in only one place

### Files Expected

**Modified files:**
- `apps/frontend/src/components/shell/nav-items.ts` (add the `documents` nav entry)
- `e2e/documents.cy.ts` (new, ported from `e2e/pricing-preview.cy.ts`)

**Deleted files:**
- `apps/frontend/src/app/(app)/editor/page.tsx`, `editor.module.css`, `page.test.tsx`

**Must NOT modify:**
- Any file already owned and completed by T1–T9 beyond the specific seam-fixes this checklist
  calls for — the join fixes seams, it does not re-implement
