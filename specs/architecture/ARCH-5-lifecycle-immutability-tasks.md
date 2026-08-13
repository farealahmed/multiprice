# Tasks: Lifecycle and immutability

> **Date:** 2026-08-13
> **Issue:** #5
> **Phase:** 3 of 5 (Task Generation)
> **Architecture:** `specs/architecture/ARCH-5-lifecycle-immutability.md` — read that document first; every task below is a slice of its Change Footprint and traces to its Inferred Requirements (R1–R23) and Architecture Decisions Log (A1–A5).

## Execution Plan

```
T1 (contract+registry) ──┬──► T3 (service) ──┐
T2 (repo method) ────────┤                    ├──► T5 (route) ──┐
                          ├──► T4 (guard) ─────┤                 │
                          ├──► T6 (evidence, blind/red until T5) ┤
                          └──► T7 (fe client) ──► T8 (locked UI) ┤──► T9 (join)
```

| Wave | Runs | Terminals | Depends on |
|---|---|---|---|
| 1 | T1 · T2 | 2 | — |
| 2 | T3 · T4 · T6 · T7 | 4 | Wave 1 (T1 for T3/T4/T6/T7; T2 additionally for T3) |
| 3 | T5 · T8 | 2 | Wave 2 (T3+T4 for T5; T7 for T8) |
| 4 | T9 — join | 1 | Wave 3 |

**Why T1 and T2 can run together:** T1 touches `contracts/lifecycle.ts`, `api/routes/registry.ts`,
`docs/contracts/phase-4.md`, `lib/api/types/lifecycle.ts`; T2 touches only
`persistence/documents.repository.ts` (`finalizeIfDraft`, which types against `domain/document.ts`
— already frozen since Phase 3, not against anything T1 produces). Disjoint files, no import
relationship.

**Why T3/T4/T6/T7 share wave 2:** all four need only T1's contract (error codes for T3/T6, the
registry for T4/T6, the frontend types for T7); T3 additionally needs T2's repository method.
None imports another's output. T6 is written **blind** against T1 and T4/T5's not-yet-existing
implementation, exactly like ARCH-4's T6 and this project's `4-B` lane brief: it stays red until
T4 and T5 both land, green at the join. That is the point, not a bug in the schedule.

**Why T5 waits for T3+T4 but T8 doesn't:** T5's route calls `services/lifecycle.ts` directly, so
it cannot even typecheck until T3 exists; and T5's own registration is what the guard (T4) has to
reach without an `app.ts` edit, so T4 needs to exist first for the ordering guarantee to mean
anything for this specific route. T8 only imports `lib/api/lifecycle.ts` (T7) — a typed client
function — so its component tests and confirm-dialog wiring don't need a live backend route; the
route only needs to be real by the time `e2e/lifecycle.cy.ts` runs at T9.

**Commit discipline:** every task commits by pathspec, scope = task id, per
`docs/parallel-execution.md` §3 (e.g. `feat(T4): finalized-document guard --
apps/backend/src/api/plugins/immutability.ts apps/backend/src/api/plugins/immutability.test.ts`).

---

## Task T1: Lifecycle contract, guarded-route registry, frontend mirror, contract docs

> **Status:** not started
> **Verification:** tdd
> **Effort:** m
> **Priority:** critical
> **Depends on:** None
> **Satisfies REQs:** R2, R3, R5, R6, R21
> **Footprint slice:** New: `apps/backend/src/contracts/lifecycle.ts`, `apps/backend/src/api/routes/registry.ts`, `apps/frontend/src/lib/api/types/lifecycle.ts`, `docs/contracts/phase-4.md`
> **High-risk areas touched:** `api/routes/registry.ts` (M) — single source of truth read by 3 consumers (guard, boot check, T6's evidence suite); wrong by omission is a silent security gap, wrong by inclusion rejects a legitimate route

### Description

Freezes this domain's error codes (`DOCUMENT_FINALIZED`, `DOCUMENT_HAS_NO_LINES`) and the
`GUARDED_ROUTES` registry every later task reads from — the guard (T4) applies from it, T6's
evidence suite iterates it instead of hand-listing routes. Finalize and duplicate responses
deliberately declare **no new zod schema**: both reuse `contracts/document.ts`'s
`documentResponseSchema` unchanged (R1, R5 — a distinct response type would invite the UI to
drift). Mirrors the codes to the frontend and writes the human-readable contract snapshot. Every
wave-2 task depends on this one for the codes and/or registry alone.

### Test Plan

#### Test File(s)
- `apps/backend/src/contracts/lifecycle.test.ts` (colocated, following `contracts/document.test.ts` /
  `contracts/pricing.test.ts`'s pattern — not explicitly named in the ARCH's Change Footprint table,
  but required by the Patterns & Conventions section's own claim that this file is "third domain to
  follow the Phase 0 convention," which for `pricing.ts`/`document.ts` includes a colocated test)

#### Test Scenarios

##### Error codes

- **`DOCUMENT_FINALIZED` and `DOCUMENT_HAS_NO_LINES` are correctly-cased constants** — GIVEN the
  exported constants WHEN read THEN each equals its own SCREAMING_SNAKE name, correcting the
  brief's lowercase prose _(verifies R2)_
- **every `LifecycleErrorCode` member is listed in the code array** — mirrors `document.ts`'s
  `satisfies readonly LifecycleErrorCode[]` compile-time exhaustiveness check _(verifies R6)_

##### `GUARDED_ROUTES` registry

- **lists exactly the six existing-document mutation routes** — GIVEN `GUARDED_ROUTES` WHEN
  inspected THEN it contains `PATCH /api/v1/documents/:id`, `DELETE /api/v1/documents/:id`,
  `POST /api/v1/documents/:id/lines`, `PATCH /api/v1/documents/:id/lines/:lineId`,
  `DELETE /api/v1/documents/:id/lines/:lineId`, `POST /api/v1/documents/:id/finalize`, and nothing
  else _(verifies R3)_
- **excludes the creation route** — GIVEN `GUARDED_ROUTES` WHEN checked THEN
  `POST /api/v1/documents` is absent (it creates, not mutates) _(verifies R3)_
- **excludes the not-yet-implemented duplicate route** — GIVEN `GUARDED_ROUTES` WHEN checked THEN
  `POST /api/v1/documents/:id/duplicate` is absent — it creates a new document and never mutates
  the source, per R21 _(verifies R21)_

### Implementation Notes

- **Module(s):** `contracts/lifecycle.ts` (codes only — no request/response schemas, per A5/R1/R5),
  `api/routes/registry.ts` (data only, no I/O)
- **Pattern reference:** `contracts/pricing.ts` / `contracts/document.ts` (schema+codes-in-one-file
  and the `satisfies readonly X[]` exhaustiveness pattern, applied here to codes only since there
  are no new schemas), `docs/contracts/phase-3.md` (contract-doc shape)
- **Key decisions:** A3 (`DOCUMENT_HAS_NO_LINES` is 400 with a bespoke top-level code, not grouped
  into 409 — the code's *shape* is declared here, its HTTP status is applied at T5's route), A5 (no
  new `StoredDocument` field — nothing in this contract references an audit field)
- **Libraries:** none new
- **High-risk callouts:** M risk on the registry per ARCH Areas of Impact — mitigated by T4's boot
  check and T6's independent evidence suite both reading this exact export, never a hand-copied list

### Scope Boundaries

- Do NOT declare a distinct finalize or duplicate response schema — both reuse
  `documentResponseSchema` from `contracts/document.ts` unchanged (R1, R5)
- Do NOT add `finalizedAt`/`finalizedBy` or any audit field to any schema (Out of Scope, A5)
- Do NOT implement the guard, the service, or the route — codes and registry data only

### Files Expected

**New files:**
- `apps/backend/src/contracts/lifecycle.ts` (pattern: `contracts/pricing.ts`)
- `apps/backend/src/contracts/lifecycle.test.ts`
- `apps/backend/src/api/routes/registry.ts` (data only)
- `apps/frontend/src/lib/api/types/lifecycle.ts` — hand-written mirror of the two error codes
  (pattern: `lib/api/types/document.ts`)
- `docs/contracts/phase-4.md` — route table (incl. the registry table), the two new error codes,
  the "no new response type" note (pattern: `docs/contracts/phase-3.md`)

**Must NOT modify:**
- `apps/backend/src/contracts/document.ts` (frozen — `documentResponseSchema` is reused, not
  redeclared)
- `apps/backend/src/contracts/errors/envelope.ts` (frozen since Phase 0)

---

## Task T2: `DocumentsRepository.finalizeIfDraft`

> **Status:** not started
> **Verification:** tdd
> **Effort:** s
> **Priority:** high
> **Depends on:** None
> **Satisfies REQs:** R11, R23
> **Footprint slice:** Modified: `apps/backend/src/persistence/documents.repository.ts`
> **High-risk areas touched:** `persistence/documents.repository.ts` (M) — first method in this
> repository that bypasses `createOwnedRepository`'s wrapper

### Description

One atomic conditional write — `collection.findOneAndUpdate({_id, ownerId, status:'draft'},
{$set:{status:'finalized', updatedAt}}, {returnDocument:'after'})` (A2) — called directly against
the collection handle the module already computes, rather than through `createOwnedRepository`'s
narrower `updateOne`. Returns the post-image on a match, `null` on no match (already finalized,
concurrently or otherwise), so the caller never needs to re-read and retry (R11).

### Test Plan

#### Test File(s)
- `apps/backend/src/persistence/documents.repository.test.ts` (existing file, extended — same
  fake-collection pattern already used for `list`/`findById`/`insert`/`update`/`remove`, now with a
  fake `findOneAndUpdate`)

#### Test Scenarios

##### Atomic write shape

- **calls `findOneAndUpdate` with the conditional filter, `$set` update, and post-image option** —
  GIVEN an ownerId and id WHEN `finalizeIfDraft` runs THEN the fake collection receives one
  `findOneAndUpdate` call with filter `{_id, ownerId, status:'draft'}`, update
  `{$set:{status:'finalized', updatedAt: expect.any(Date)}}`, and `{returnDocument:'after'}`
  _(verifies R11, R23, A2)_
- **returns the post-image on a match** — GIVEN the fake `findOneAndUpdate` resolves with a
  finalized document WHEN `finalizeIfDraft` runs THEN it returns that document _(verifies R23)_

##### No-match cases

- **returns `null` when the document is already finalized** — GIVEN the fake `findOneAndUpdate`
  resolves with no match (simulating `status !== 'draft'`) WHEN `finalizeIfDraft` runs THEN it
  returns `null`, and the caller does not re-read or retry _(verifies R11)_
- **returns `null` for a foreign `ownerId`** — GIVEN a draft owned by a different owner WHEN
  `finalizeIfDraft` is called with the wrong `ownerId` THEN it returns `null`, not the document
  (guards against a hand-rolled owner filter drifting from the rest of the file's pattern)
  _(verifies R23, mitigates the M-risk Area of Impact)_

##### Atomicity intent (backward-regression pin)

- **exactly one of two concurrent calls against the same draft succeeds** — GIVEN two simulated
  concurrent `finalizeIfDraft` calls against the same draft id WHEN both resolve THEN exactly one
  returns the post-image and the other returns `null` — pins the *reason* this method bypasses
  `base`'s `updateOne` (a read-then-write race) as a test, not just a comment _(guards
  backward-regression risk for `persistence/documents.repository.ts`: a future "simplify by routing
  everything through `base`" refactor would silently reintroduce the race this method exists to
  avoid)_

### Implementation Notes

- **Module(s):** `persistence/documents.repository.ts` (extends the existing `DocumentsRepository`
  interface with one method; calls `collection.findOneAndUpdate` directly, not through
  `createOwnedRepository`)
- **Pattern reference:** the file's own existing `findById`/`update` methods for the
  owner-filter shape; `persistence/repository.test.ts`'s fake-collection style extended with a fake
  `findOneAndUpdate`
- **Key decisions:** A2 (direct `findOneAndUpdate` call, smaller blast radius than extending
  `createOwnedRepository`'s base helper for one caller)
- **Libraries:** `mongodb` types only
- **High-risk callouts:** M risk per ARCH Areas of Impact — a hand-rolled owner filter here could
  drift from `withOwner`'s pattern (not exported, so it can't be reused directly); mitigated by the
  foreign-`ownerId` scenario above

### Scope Boundaries

- Do NOT route this method through `createOwnedRepository`'s `updateOne` — that reintroduces the
  read-then-write race this method exists to avoid (A2)
- Do NOT add a version/optimistic-lock field to `StoredDocument` (Out of Scope, A5)
- Do NOT modify `list`, `findById`, `insert`, `update`, or `remove` — additive only

### Files Expected

**Modified files:**
- `apps/backend/src/persistence/documents.repository.ts` (adds `finalizeIfDraft`; existing methods
  unchanged)
- `apps/backend/src/persistence/documents.repository.test.ts` (adds the scenarios above; existing
  assertions for `list`/`findById`/`insert`/`update`/`remove` must keep passing unmodified)

**Must NOT modify:**
- `apps/backend/src/persistence/repository.ts` (the base helper — consumed, not extended; guards
  ARCH backward-regression risk for this file)

---

## Task T3: `services/lifecycle.ts` — finalize orchestration

> **Status:** not started
> **Verification:** tdd
> **Effort:** m
> **Priority:** critical
> **Depends on:** T1, T2
> **Satisfies REQs:** R4, R10, R11, R12
> **Footprint slice:** New: `apps/backend/src/services/lifecycle.ts`
> **High-risk areas touched:** `services/documents.ts` (`toDocumentResponse`, M) — new consumer
> outside the file it was written for; this task reads it but cannot edit it

### Description

`finalizeDocument(ownerId, id)` — the precondition chain from R10, in order: look up the document
(owner-scoped; missing/foreign → reused `DocumentNotFoundError`), reject an empty document
(`DocumentHasNoLinesError`, new), re-run `calculateDocument` over the *persisted* lines and reuse
`mapPricingEngineError`'s underlying `PricingPreviewError` to reject invalid stored data with the
ordinary specific codes (A4 — this is G4's stretch-goal-2, defensive reuse not a second validation
path), then call T2's `finalizeIfDraft` and map a lost race to `DocumentAlreadyFinalizedError`
(new). The recompute here is validation-only — it never rewrites `totals` (which
`services/documents.ts` already keeps fresh on every prior save); `finalizeIfDraft`'s signature
takes no totals argument (R23).

### Test Plan

#### Test File(s)
- `apps/backend/src/services/lifecycle.test.ts` (colocated, following `services/auth.test.ts`'s
  fake-repository pattern)

#### Test Scenarios

##### Preconditions, in order (R10)

- **throws `DocumentNotFoundError` for a missing or foreign document** — GIVEN a fake repository
  whose `findById` returns `null` WHEN `finalizeDocument` runs THEN it throws `{code:
  'DOCUMENT_NOT_FOUND'}` and never calls `finalizeIfDraft` _(verifies R10)_
- **throws `DocumentHasNoLinesError` before any recompute for an empty document** — GIVEN a draft
  with `lines: []` WHEN `finalizeDocument` runs THEN it throws `{code: 'DOCUMENT_HAS_NO_LINES'}`
  without invoking `calculateDocument` or `finalizeIfDraft` _(verifies R4, R10, A3)_
- **rejects invalid persisted lines with the specific field code, not a generic 409** — GIVEN a
  draft whose persisted lines would fail `calculateDocument` (e.g. a fixed discount exceeding its
  line's subtotal) WHEN `finalizeDocument` runs THEN it throws the reused `PricingPreviewError`
  with the correct `lineIndex`/code, and `finalizeIfDraft` is never called — this is the case a
  since-tightened validation rule on old data would hit _(verifies R4, R10, A4)_

##### Happy path and the lost-race case (R11, R12)

- **flips status via the atomic write and returns the mapped response** — GIVEN a valid draft with
  ≥1 valid line WHEN `finalizeDocument` runs THEN `finalizeIfDraft` is called with `(ownerId, id)`
  and the resolved `DocumentResponse` has `status: 'finalized'` _(verifies R1, R10, R12)_
- **loses a concurrent finalize race** — GIVEN the fake `finalizeIfDraft` returns `null` WHEN
  `finalizeDocument` runs THEN it throws `DocumentAlreadyFinalizedError` (mapped to 409
  `DOCUMENT_FINALIZED` at the route in T5) _(verifies R11)_
- **stored totals are reported, never rewritten by the finalize write itself** — GIVEN a draft
  whose persisted totals already match `calculateDocument`'s output for its lines WHEN
  `finalizeDocument` runs THEN the returned response's totals equal the pre-finalize stored totals,
  and `finalizeIfDraft` is called with no totals argument — the recompute above is validation-only
  _(verifies R12)_

##### Regression guard

- **`toDocumentResponse` reuse matches `services/documents.ts`'s own mapping** — GIVEN the
  post-image `finalizeIfDraft` returns WHEN mapped THEN the result is identical to what
  `services/documents.ts`'s `toDocumentResponse` produces for the same `StoredDocument`, proving
  this task's reuse hasn't diverged from a file it cannot edit _(guards backward-regression risk for
  `services/documents.ts`)_

### Implementation Notes

- **Module(s):** `services/lifecycle.ts`
- **Pattern reference:** `services/documents.ts` (service-layer shape: load, recompute, map;
  `toEngineLineWire`-equivalent conversion reused conceptually, not copied — import
  `toDocumentResponse` directly rather than re-deriving it)
- **Key decisions:** A4 (reuse `calculateDocument` + the existing engine-error mapping, no second
  validation path), A2/R23 (`finalizeIfDraft`'s signature takes no totals — this task must not try
  to pass any)
- **Libraries:** none new
- **High-risk callouts:** M risk — `services/documents.ts`'s `toDocumentResponse` is read-only here
  (R7's "reads, never edits"); a future signature change there breaks this file silently unless both
  suites run together (the regression-guard scenario above is a same-input compile/runtime pin, not
  a substitute for running both test files)

### Scope Boundaries

- Do NOT rewrite `totals` as part of the finalize write — `finalizeIfDraft` only ever sets `status`
  and `updatedAt` (R23)
- Do NOT implement HTTP routing — that is T5
- Do NOT add an un-finalize path or any admin override (Out of Scope)
- Do NOT re-derive `toEngineLineWire`/`toDocumentResponse` — import from `services/documents.ts`

### Files Expected

**New files:**
- `apps/backend/src/services/lifecycle.ts` (pattern: `services/documents.ts`)
- `apps/backend/src/services/lifecycle.test.ts` (pattern: `services/auth.test.ts`)

**Must NOT modify:**
- `apps/backend/src/services/documents.ts` (`toDocumentResponse` consumed, not changed — guards
  ARCH backward-regression risk for this file)
- `apps/backend/src/api/errors/engine-errors.ts` (`mapPricingEngineError`/`PricingPreviewError`
  reused unmodified)

---

## Task T4: Immutability guard and boot check

> **Status:** not started
> **Verification:** tdd
> **Effort:** l
> **Priority:** critical
> **Depends on:** T1
> **Satisfies REQs:** R7, R8, R9, R22
> **Footprint slice:** New: `apps/backend/src/api/plugins/immutability.ts`,
> `apps/backend/src/api/plugins/immutability.test.ts`
> **High-risk areas touched:** `api/plugins/immutability.ts` (H) — this *is* the scored claim;
> `app.ts` autoloader/plugin ordering (M, touched-but-not-changed — first time two plugins
> coordinate on one route's `preHandler` array)

### Description

An `fp()`-wrapped plugin using Fastify's `onRoute` hook (A1/R22, not a bare
`app.addHook('preHandler', ...)`, which would run *before* the per-route `app.authenticate` and see
`request.userId` unset): for every autoloaded route it records `{method, path}`, and for every
route matching a `GUARDED_ROUTES` entry it appends a guard handler to that route's own
`preHandler` array — landing structurally after `authenticate` in the same array Fastify already
executes in order. The guard does an owner-scoped lookup (foreign/missing → 404, never 409 — R9)
and replies 409 `DOCUMENT_FINALIZED` directly (never throws — it protects handlers it doesn't own)
when the document's status is `'finalized'`. A companion `onReady` hook cross-checks recorded
routes against `GUARDED_ROUTES`, failing boot loudly on a mismatch (R8), mirroring
`plugins/indexes.ts`'s established `onReady` idiom.

### Test Plan

#### Test File(s)
- `apps/backend/src/api/plugins/immutability.test.ts` (colocated, following
  `api/plugins/authenticate.test.ts`'s pattern: `buildApp()` + ad hoc routes registered via
  `app.inject()`, with `app.db` decorated to a fake `Db`/`Collection` exposing `findOne` like
  `persistence/documents.repository.test.ts`'s fake, and a real signed session token via
  `app.jwt.sign`)

#### Test Scenarios

##### Guard behavior (R7, R9)

- **rejects a write to a finalized, owned document with 409 `DOCUMENT_FINALIZED`** — GIVEN an
  authenticated request to a route in `GUARDED_ROUTES` targeting a `'finalized'` document owned by
  the caller WHEN the request runs THEN the response is 409, `code: 'DOCUMENT_FINALIZED'`, the
  message names the document and states finalization is irreversible, and the route's own handler
  never executes _(verifies R2, R7)_
- **allows a write to a draft document through to the handler** — GIVEN the same route targeting a
  `'draft'` document owned by the caller WHEN the request runs THEN the guard's `preHandler`
  completes without replying and the route's own handler executes _(verifies R7)_
- **a foreign or missing document is 404, never 409** — GIVEN a guarded route targeting either a
  finalized document not owned by the caller, or an id that doesn't exist, WHEN the request runs
  THEN the response is 404, never 409 (anti-enumeration) _(verifies R9)_

##### Ordering (R22, and the `app.ts` backward-regression row)

- **an unauthenticated request to a guarded route on a finalized document still gets 401, not
  409** — GIVEN no/invalid session cookie WHEN a guarded route is called against a finalized
  document THEN the response is 401 `UNAUTHENTICATED`, proving the guard runs strictly after
  `app.authenticate` rather than before it — the exact ordering bug A1/R22 exists to prevent, and
  the first real exercise of two plugins coordinating on one route's `preHandler` array _(verifies
  R7, R22)_

##### Reach (R8)

- **a non-guarded route is unaffected** — GIVEN a route not present in `GUARDED_ROUTES` WHEN called
  THEN the guard never runs for it (no owner-scoped lookup performed, verified via a spy on the
  fake collection's `findOne`) _(verifies R8)_

##### Boot-time cross-check (R8)

- **boots cleanly when every mutating existing-document route has a registry entry** — GIVEN the
  full app with all Phase 3 routes plus this phase's finalize route registered WHEN it reaches
  `ready()` THEN no error is thrown (the current 6-route reality) _(verifies R8)_
- **fails to boot when a candidate mutating route has no registry entry** — GIVEN an ad hoc extra
  route registered at a path/method shaped like an existing-document mutation (e.g. `PUT
  /api/v1/documents/:id/archive`) that is absent from `GUARDED_ROUTES` WHEN the app reaches
  `ready()` THEN it throws, naming the unregistered route _(verifies R8; forward stress-test: "a
  route added later without an entry")_
- **fails to boot when a `GUARDED_ROUTES` entry has no matching registered route** — GIVEN a
  registry override with a typo'd path (test-local, not the real `registry.ts`) WHEN the app
  reaches `ready()` THEN it throws, naming the dead entry _(verifies R8; forward stress-test: "a
  `GUARDED_ROUTES` entry has a typo")_

### Implementation Notes

- **Module(s):** `api/plugins/immutability.ts`
- **Pattern reference:** `api/plugins/indexes.ts` (`onReady` boot-check idiom), `api/plugins/
  authenticate.ts` (`fp()` wrapping, decorator/hook shape), `api/plugins/authenticate.test.ts`
  (`buildApp()` + ad hoc routes + `signToken` helper — the closest existing test to this one's
  needs)
- **Key decisions:** A1/R22 (`onRoute`, not a bare `addHook('preHandler', ...)` — the entire reason
  this task exists as designed), R9 (404-before-409 ordering)
- **Libraries:** `fastify-plugin` (already a dependency)
- **High-risk callouts:** H risk per ARCH Areas of Impact — this is the scored claim; any gap here
  (wrong ordering, a route missing from the registry, a foreign-doc 409 leak) directly fails the
  phase's primary requirement. Mitigated by the ordering scenario above and the boot-check
  scenarios; T6's independent evidence suite is the second, contract-blind backstop.
  **Forward note for 4-D (not this task's concern now):** the "candidate mutating route" heuristic
  used for the boot check's first direction (`POST`/`PATCH`/`DELETE` under
  `/api/v1/documents/:id/...`, excluding the bare creation route) would also flag a future
  `duplicate` route — which R21 explicitly forbids adding to `GUARDED_ROUTES`. That tension is
  latent until 4-D's `documents-duplicate.ts` actually registers a route; it does not affect this
  task's correctness against the routes that exist through this phase, and should be resolved by
  4-D's own implementer (or an ARCH amendment) if that lane runs.

### Scope Boundaries

- Do NOT hand-annotate individual routes with the guard — apply only from `GUARDED_ROUTES` (R8)
- Do NOT edit `api/routes/documents.ts` or `api/routes/document-lines.ts` to reach them — the whole
  point of `onRoute` + `fp()` is reaching routes without editing their files
- Do NOT implement the finalize route itself (T5) or the duplicate route (Out of Scope — 4-D)
- Do NOT resolve the 4-D boot-check tension noted above — flag it, don't design around a route that
  doesn't exist yet

### Files Expected

**New files:**
- `apps/backend/src/api/plugins/immutability.ts`
- `apps/backend/src/api/plugins/immutability.test.ts`

**Must NOT modify:**
- `apps/backend/src/app.ts` (autoload only — guards ARCH backward-regression risk for this file)
- `apps/backend/src/api/routes/documents.ts`, `apps/backend/src/api/routes/document-lines.ts`
  (reached without editing — the design's entire point)
- `apps/backend/src/api/plugins/authenticate.ts` (consumed, not changed)

---

## Task T5: Finalize route

> **Status:** not started
> **Verification:** test-after
> **Effort:** s
> **Priority:** critical
> **Depends on:** T1, T3, T4
> **Satisfies REQs:** R1, R4
> **Footprint slice:** New: `apps/backend/src/api/routes/documents-lifecycle.ts`
> **High-risk areas touched:** `app.ts` autoloader (M, touched-but-not-changed) — this route is the
> first target the guard (T4) reaches via `onRoute` for a route registered in the *same* wave as
> the guard itself

### Description

`POST /api/v1/documents/:id/finalize`, wired to T3's `services/lifecycle.ts`. HTTP-level concerns
only: attaches `app.authenticate`, calls `finalizeDocument`, and maps its thrown errors to status
codes — `DocumentNotFoundError` → 404, `DocumentHasNoLinesError` → 400 `DOCUMENT_HAS_NO_LINES`
(bespoke top-level code, A3), the reused `PricingPreviewError` → 400 `VALIDATION_FAILED` with
`details[]` (same lifting wrapper shape `api/routes/documents.ts` uses, duplicated locally since
that file is frozen), `DocumentAlreadyFinalizedError` → 409 `DOCUMENT_FINALIZED`. Returns the
`DocumentResponse` from `toDocumentResponse` — no new response shape (R1).

### Test Plan

#### Test File(s)
- None owned by this task. Per the project's lane-ownership convention
  (`docs/parallel-execution.md`), route-level and evidence-suite behavior for this domain is owned
  by **T6** (`test/api/finalize.test.ts`, `test/api/immutability.test.ts`), written blind against
  T1's contract. T5 is verified when T6's suite — already written by wave 2 — goes green against
  this route.

#### Test Scenarios (verified via T6, cross-referenced here for completeness)

- Valid draft → 200 with the fixture's totals; double finalize → 409; invalid persisted lines →
  specific field code; empty document → 400 `DOCUMENT_HAS_NO_LINES`; foreign document → 404 —
  verified by T6's `finalize.test.ts`
- Every `GUARDED_ROUTES` route (including this one) → 409 against a finalized document, document
  unchanged afterward — verified by T6's `immutability.test.ts`

##### Wiring self-check (this task's own responsibility, not delegated)

- **route autoloads with no `app.ts` edit** — expected: `git diff -- apps/backend/src/app.ts` shows
  no changes after this task
- **typecheck passes** — expected: `cd apps/backend && npx tsc --noEmit` exits 0
- **registering this route doesn't break T4's boot check** — expected:
  `cd apps/backend && npx vitest run src/api/plugins/immutability.test.ts` stays green once this
  route exists (the "clean boot with the current 6-route reality" scenario now includes this route)

### Implementation Notes

- **Module(s):** `api/routes/documents-lifecycle.ts`
- **Pattern reference:** `api/routes/documents.ts` (route-local error mapping, the
  `documentNotFoundEnvelope`/`mapDocumentEngineError` shape — duplicated locally since
  `documents.ts` is frozen, not imported)
- **Key decisions:** A3 (`DOCUMENT_HAS_NO_LINES` is 400, bespoke top-level code — not wrapped in
  `VALIDATION_FAILED`, mirroring the `DOCUMENT_NOT_FOUND`/`LINE_NOT_FOUND` precedent)
- **Libraries:** none new
- **High-risk callouts:** M risk — first route registered in the same wave the guard targets it in;
  T4's boot-check scenario and T6's evidence suite are the regression backstop if the guard doesn't
  attach correctly to this specific route

### Scope Boundaries

- Do NOT write files under `test/api/**` — T6 owns the evidence suite; writing there collides with
  a lane already producing those files against the same contract
- Do NOT implement the duplicate endpoint — that is 4-D, gated on J4 being green (Out of Scope here)
- Do NOT compute anything — call `services/lifecycle.ts`, never do arithmetic in the route handler

### Files Expected

**New files:**
- `apps/backend/src/api/routes/documents-lifecycle.ts` (pattern: `api/routes/documents.ts`)

**Must NOT modify:**
- `apps/backend/src/app.ts` (autoload only)
- `apps/backend/src/api/errors/engine-errors.ts`
- `apps/backend/src/contracts/document.ts`

---

## Task T6: Immutability evidence suite

> **Status:** not started
> **Verification:** tdd
> **Effort:** l
> **Priority:** critical
> **Depends on:** T1
> **Satisfies REQs:** R8, R9, R13, R14
> **Footprint slice:** New: `apps/backend/test/api/immutability.test.ts`,
> `apps/backend/test/api/finalize.test.ts`
> **High-risk areas touched:** `api/plugins/immutability.ts` (H, via independent evidence),
> `api/routes/registry.ts` (M, via independent completeness check)

### Description

The scored acceptance suite (R13) — one parameterized test iterating `GUARDED_ROUTES` (imported,
never hand-listed) against a finalized document, plus focused finalize scenarios. Written against
`docs/contracts/phase-4.md` and the registry, not against T4/T5's implementation — **expected red
until both land**, by design, the same pattern this project's own `4-B` lane brief and ARCH-4's T6
already establish. Treat this as a deliverable, not incidental coverage.

### Test Plan

#### Test File(s)
- `apps/backend/test/api/immutability.test.ts`
- `apps/backend/test/api/finalize.test.ts`

#### Test Scenarios

##### Immutability evidence (`immutability.test.ts`)

- **every route in `GUARDED_ROUTES` rejects a write against a finalized document** — table-driven
  over `GUARDED_ROUTES` (imported from `api/routes/registry.ts`, not hand-listed) GIVEN a finalized
  document owned by the caller WHEN each route is called THEN 409 `DOCUMENT_FINALIZED` _(verifies
  R13)_
- **the document is provably unchanged afterward** — for each guarded route, a re-read (`GET`)
  after the 409 shows the document byte-identical to before the call — not just a 409 status code,
  the part usually missed _(verifies R13)_
- **both a valid and an invalid body get 409, never a validation error** — for each guarded route,
  a schema-valid body and a schema-invalid body against a finalized document both yield 409
  `DOCUMENT_FINALIZED`, proving the lifecycle check precedes validation _(verifies R13)_
- **non-guarded routes still behave normally against a finalized document** — `GET
  /api/v1/documents/:id` returns 200 for a finalized document; `POST /api/v1/documents` still
  creates a new document (201) while a finalized document exists for the same owner _(verifies
  R13)_
- **the registry covers every existing-document mutation Fastify has registered** — GIVEN the live
  app WHEN its registered routes are inspected THEN every `POST`/`PATCH`/`DELETE` under
  `/api/v1/documents/:id/...` (excluding duplicate, once it exists) matches an entry in
  `GUARDED_ROUTES` — an independent confirmation of T4's boot check, using the live app rather than
  trusting the boot check alone _(verifies R8)_

##### Finalize scenarios (`finalize.test.ts`)

- **a valid draft finalizes to 200 with the fixture's totals** — GIVEN the PDF sample lines WHEN
  finalized THEN 200, `status: 'finalized'`, `grandTotal` `421.50` _(verifies R1, R12)_
- **double finalize is 409** — GIVEN an already-finalized document WHEN finalize is called again
  THEN 409 `DOCUMENT_FINALIZED` _(verifies R2)_
- **invalid persisted lines get the specific field code, not a generic 409** — GIVEN a document
  whose persisted lines are made invalid via direct DB write (bypassing the normal create/update
  validation, simulating data saved before a since-tightened rule) WHEN finalized THEN a 400 with
  the specific field code/path, not 409 — G4's stretch-goal-2 case _(verifies R4)_
- **an empty document is rejected** — GIVEN a draft with no lines WHEN finalized THEN 400
  `DOCUMENT_HAS_NO_LINES` _(verifies R4, A3)_
- **a foreign document is 404** — GIVEN another owner's document WHEN finalized THEN 404
  `DOCUMENT_NOT_FOUND`, never 409 (R9 applied to the finalize route itself) _(verifies R9, R14)_

### Implementation Notes

- **Module(s):** none of production code — test-only, per this lane's explicit guardrail
- **Pattern reference:** `test/integration/ownership.test.ts` (table-driven shape,
  `isMongoReachable`/`describe.skipIf` guard, `setupTestDb` usage), `test/api/documents.test.ts`
  (route-test shape), `test/fixtures/pdf-sample.ts` (the fixture the `421.50` scenario consumes,
  read-only), `test/support/factories.ts` (`createAuthenticatedUser`, `buildCreatePayload`,
  `buildLinePayload` — reused unmodified)
- **Key decisions:** none — this task verifies others' decisions, doesn't make new ones
- **Libraries:** none new — `vitest`, existing `test/support/db.ts`
- **High-risk callouts:** This *is* the mitigation for T4's H-risk footprint entry — independent,
  contract-blind coverage of the guard's ordering and reach. Writing the invalid-persisted-lines
  scenario requires a direct `harness.db.collection('documents').updateOne(...)` write to seed data
  the normal API would never persist — note this explicitly in the test, it is not a bug in the
  fixture setup

### Scope Boundaries

- Do NOT write any source file outside `test/` — if the contract as written can't express a needed
  test, that's an amendment request to T1's author, not a reason to guess or adapt the test to
  whatever T4/T5 happen to have produced
- Do NOT wait for T4/T5 to be done before writing these tests — write against
  `docs/contracts/phase-4.md` and `api/routes/registry.ts` now; red is the expected interim state
- Do NOT hand-list the guarded routes — always import `GUARDED_ROUTES`

### Files Expected

**New files:**
- `apps/backend/test/api/immutability.test.ts` (pattern: `test/integration/ownership.test.ts`)
- `apps/backend/test/api/finalize.test.ts` (pattern: `test/api/documents.test.ts`)

**Must NOT modify:**
- `apps/backend/src/api/routes/registry.ts` (read-only import — an amendment goes through T1's
  owner, not a silent edit here)
- `apps/backend/test/support/factories.ts`, `apps/backend/test/support/db.ts` (reused unmodified —
  guards ARCH backward-regression risk)
- `docs/contracts/phase-4.md` (read-only reference)

---

## Task T7: Frontend lifecycle client

> **Status:** not started
> **Verification:** tdd
> **Effort:** xs
> **Priority:** high
> **Depends on:** T1
> **Satisfies REQs:** R5, R15
> **Footprint slice:** New: `apps/frontend/src/lib/api/lifecycle.ts`
> **High-risk areas touched:** None

### Description

`finalize(id)` and `duplicate(id)` — thin wrappers over `apiFetch`, mirroring
`lib/api/documents.ts`'s shape. `duplicate` is declared and exported but has no caller until 4-D
(R5, R15) — writing it now costs nothing and keeps the client's shape matching the frozen contract
from T1.

### Test Plan

#### Test File(s)
- `apps/frontend/src/lib/api/lifecycle.test.ts` (colocated, following `lib/api/documents.test.ts`'s
  pattern of asserting the underlying `fetch`/`apiFetch` call)

#### Test Scenarios

##### Request shape

- **`finalize(id)` calls `POST /api/v1/documents/:id/finalize` with no body** — WHEN `finalize(id)`
  is called THEN `apiFetch` is invoked with that path, method `POST`, and no body _(verifies R15)_
- **`duplicate(id)` calls `POST /api/v1/documents/:id/duplicate` with no body** — WHEN
  `duplicate(id)` is called THEN `apiFetch` is invoked with that path, method `POST`, and no body
  _(verifies R5, R15)_

##### Error propagation

- **a rejected `apiFetch` call surfaces as `ApiError` unchanged** — GIVEN `apiFetch` rejects with an
  `ApiError` WHEN either client function is called THEN the same error propagates, not wrapped or
  swallowed (this is the shape T8's 409 handler depends on) _(verifies R15)_

### Implementation Notes

- **Module(s):** `lib/api/lifecycle.ts`
- **Pattern reference:** `lib/api/documents.ts` (thin-wrapper shape, `jsonRequest`-equivalent not
  needed here since both calls have no body)
- **Key decisions:** none new
- **Libraries:** none new
- **High-risk callouts:** None

### Scope Boundaries

- Do NOT wire `duplicate` into any UI — no caller until 4-D (Out of Scope this phase)
- Do NOT add any UI-facing logic — this file is API plumbing only, consumed by T8

### Files Expected

**New files:**
- `apps/frontend/src/lib/api/lifecycle.ts` (pattern: `lib/api/documents.ts`)
- `apps/frontend/src/lib/api/lifecycle.test.ts`

**Must NOT modify:**
- `apps/frontend/src/lib/api/client.ts` (consumed, not changed)
- `apps/frontend/src/lib/api/types/lifecycle.ts` (T1's output — read-only)

---

## Task T8: Locked document UI

> **Status:** not started
> **Verification:** ui
> **Effort:** l
> **Priority:** high
> **Depends on:** T7
> **Satisfies REQs:** R15, R16, R17, R18, R19
> **Footprint slice:** New: `apps/frontend/src/components/lifecycle/**`,
> `apps/frontend/src/app/(app)/documents/[id]/view/page.tsx`; Modified:
> `apps/frontend/src/app/(app)/documents/[id]/page.tsx`,
> `apps/frontend/src/components/document-editor/DocumentEditor.tsx`
> **High-risk areas touched:** `components/document-editor/**` (M, ownership transferred for this
> wave per `docs/parallel-execution.md` § Ownership is per-wave) — 3-D's existing
> save/dirty-tracking/validation-error-mapping behavior must keep working unmodified around the new
> 409 branch

### Description

Finalize as a deliberate, confirmed act; a read-only record view for finalized documents (not a
disabled form); routing that sends a draft to the existing editor and a finalized document to the
new view without a full reload; and the stale-editor case — an editor open on a draft that gets
finalized elsewhere receives 409 on save and must surface that clearly, non-destructively, never
silently discarding edits or leaving a stuck spinner (R18). Per R19, none of this enforces
immutability client-side — every state shown here is a reflection of what the API already decided.

### Verification Checklist

- **Finalize confirmation dialog is irreversible, named, and accessible** — expected: the dialog
  names the document by title, states in those terms that finalization is irreversible, traps focus
  and closes on Escape (mirroring `DeleteDialog`'s pattern), and cancel is the default/initially-
  focused action (not confirm, per R15 — the inverse of `DeleteDialog`'s destructive-action
  default); component test: confirm calls `lifecycle.finalize` only on confirm, cancel does not call
  it
- **Read-only view renders a finalized document as a record, not disabled inputs** — expected:
  `view/page.tsx` follows `design/htmls/document-view.html`'s layout (metadata block, full
  line-items table with computed columns, document totals) rendered as plain labels/text, not
  `<input disabled>` elements; the mockup's document-number field and "Finalized <timestamp> by
  <user>" audit line are **absent** (Out of Scope, A5), and there is **no** duplicate action (Out of
  Scope until 4-D)
- **Routing sends drafts to the editor, finalized documents to the view, without a full reload** —
  expected: `documents/[id]/page.tsx` renders `DocumentEditor` for `status: 'draft'` and the
  read-only view for `status: 'finalized'`; a successful in-place finalize transitions the same
  mounted page from editor to view without a browser navigation/reload
- **A stale-editor 409 surfaces a clear, non-destructive message and switches to read-only** —
  expected: `DocumentEditor`'s save handler, on an `ApiError` with `code === 'DOCUMENT_FINALIZED'`,
  shows a message stating the document has been finalized (not a generic save-error banner),
  transitions the view to read-only, never silently discards the user's unsaved edits without
  telling them, and never leaves the "Saving…" state stuck — component test drives this exact path
- **No client-side lock enforcement (R19)** — expected: nothing in the new code disables inputs
  based on a client-computed guess about staleness before the API responds; the 409 response is the
  only trigger for the read-only transition
- **Existing draft editor behavior is unchanged** — expected: `DocumentEditor.test.tsx`'s existing
  assertions (unsaved-changes guard, `details[]` → row-field mapping, totals-source switch on save)
  continue passing unmodified with the 409 branch added around them (guards backward-regression risk
  for `components/document-editor/**` — the ownership-transfer risk this wave explicitly carries)
- **Full suite and build pass** — expected: `cd apps/frontend && npm test && npm run build` exits 0

#### Testable Seams

- Confirm-dialog confirm/cancel handlers (finalize called only on confirm)
- 409-on-save branch (message content + read-only transition)
- Routing conditional (`status: 'draft'` → editor, `status: 'finalized'` → view)
- Read-only view's render of a `DocumentResponse` (no interactive/disabled inputs)

### Implementation Notes

- **Module(s):** `components/lifecycle/**` (dialog, status banner), `app/(app)/documents/[id]/
  view/page.tsx`, `app/(app)/documents/[id]/page.tsx` (transferred for this wave), `components/
  document-editor/**` (same transfer)
- **Pattern reference:** `design/htmls/document-view.html` (layout/markup for the read-only view,
  minus the document-number and audit-line elements it shows), `components/documents/DeleteDialog.tsx`
  / `CreateDialog.tsx` (confirmation-dialog shape: overlay, focus management, Escape-to-cancel —
  adapt the focus target since cancel, not confirm, is the default action here), `components/
  documents/StatusPill.tsx` (already status-aware, reusable as-is in the view header)
- **Key decisions:** R19 (API is the only enforcement point — the UI reflects state), A5 (no audit
  field to render, so the mockup's timestamp/user line has nothing to bind to and is correctly
  omitted)
- **Libraries:** none new
- **High-risk callouts:** M risk per ARCH Areas of Impact — no regression test currently exists for
  "editor still works for drafts" beyond what 3-D already wrote; the existing-behavior checklist
  item above is the explicit re-run of that guarantee, not an assumption that the diff is additive

### Scope Boundaries

- Do NOT add a duplicate button or action anywhere in this UI (Out of Scope — 4-D, gated on J4)
- Do NOT render a document-number field or a "Finalized at X by Y" audit line (Out of Scope, A5 —
  not in the frozen `Document` shape)
- Do NOT implement any client-side prediction of staleness to preemptively disable the editor — the
  409 response is the only signal (R19)
- Do NOT edit `components/line-items/**` — not owned this wave, and finalize/duplicate don't touch
  per-line editing

### Files Expected

**New files:**
- `apps/frontend/src/components/lifecycle/**` (confirm dialog, status banner, colocated
  `*.test.tsx`)
- `apps/frontend/src/app/(app)/documents/[id]/view/page.tsx`

**Modified files:**
- `apps/frontend/src/app/(app)/documents/[id]/page.tsx` (routes by `status`; handles the
  post-finalize transition without a reload)
- `apps/frontend/src/components/document-editor/DocumentEditor.tsx` (save handler catches
  `ApiError` with `code === 'DOCUMENT_FINALIZED'`)

**Must NOT modify:**
- `apps/frontend/src/lib/api/documents.ts`, `apps/frontend/src/lib/api/lifecycle.ts` (T7's output —
  read-only; a missing method is a request back to T7's owner)
- `apps/frontend/src/lib/api/types/lifecycle.ts` (T1's output — read-only)
- `apps/frontend/src/components/line-items/**` (not owned this wave)

---

## Task T9: Join J4

> **Status:** not started
> **Verification:** checklist
> **Effort:** m
> **Priority:** critical
> **Depends on:** T5, T6, T8
> **Satisfies REQs:** R20
> **Footprint slice:** New: `e2e/lifecycle.cy.ts`
> **High-risk areas touched:** None new — reconciliation only

### Description

Proves every task's pieces agree end to end and closes the phase: both backend suites green
(including T6's suite, now green against T4/T5 rather than red as it was through waves 2–3), the
frontend suite and build green, the Cypress happy path plus the single-tab stale-save race, a
manual `curl` confirmation, and the join commit.

### Verification Checklist

- **Full backend suite green** — expected: `cd apps/backend && npx vitest run` exits 0, including
  T6's `test/api/immutability.test.ts` and `finalize.test.ts` (now green against T4/T5's
  implementation)
- **Full frontend suite and build green** — expected: `cd apps/frontend && npm test && npm run
  build` exits 0
- **`docker compose up --build` (`make up`) boots clean** — expected: all services healthy, no
  crash loop
- **`e2e/lifecycle.cy.ts` happy path** — expected: finalize a draft through the UI and see the
  editor lock (route to the read-only view) — new Cypress spec, pattern `e2e/documents.cy.ts`
- **`e2e/lifecycle.cy.ts` stale-save race, single-tab technique** — expected: open the editor on a
  draft, finalize that same document out-of-band with `cy.request()` (not a second tab — Cypress has
  no multi-tab control model), then save from the still-open editor and assert the 409 message
  surfaces (verifies R18, R20)
- **Manual `curl` confirmation** — expected: a `PATCH` against a finalized document returns 409
  `DOCUMENT_FINALIZED`, and `POST /api/v1/documents` still creates a new draft while a finalized
  document exists; recorded in the join report or commit message
- **Committed as `chore(J4): join phase 4`** — expected: `git log` shows the commit, scoped to this
  task's own file changes (the new e2e spec)

### Implementation Notes

- **Module(s):** none new beyond `e2e/lifecycle.cy.ts` — reconciliation and evidence only
- **Pattern reference:** `e2e/documents.cy.ts` (Cypress spec shape), ARCH-3's/ARCH-4's own Join
  process (`docs/parallel-execution.md` § "Running a join")
- **Key decisions:** none new — confirms decisions already made by T1–T8
- **Libraries:** none new — `cypress` (already a dependency)
- **High-risk callouts:** None — by this point every M/H-risk footprint entry has its own task-level
  mitigation; this task's job is proving they compose

### Scope Boundaries

- Do NOT implement 4-D (duplicate) — skip entirely if anything above is red; the required flow
  outranks the stretch goal
- Do NOT add a Mongo index or aggregation (Out of Scope)
- Where something disagrees between tasks, `docs/contracts/phase-4.md` decides; fix the contract
  first if it's the one that's wrong, then both sides — do not silently patch around a disagreement
  in only one place

### Files Expected

**New files:**
- `e2e/lifecycle.cy.ts` (pattern: `e2e/documents.cy.ts`)

**Must NOT modify:**
- Any file already owned and completed by T1–T8 beyond the specific seam-fixes a join implies — this
  task proves composition, it does not re-implement
