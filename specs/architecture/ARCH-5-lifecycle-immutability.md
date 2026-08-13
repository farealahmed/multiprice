# Architecture: Lifecycle and immutability

> **Date:** 2026-08-13
> **Issue:** #5
> **Phase:** 2 of 5 (System Architecture)
> **Requirements source:** Standalone brief — see Inferred Requirements (`specs/context/5.md`, `docs/phases/phase-4-issue-5.md`, `docs/implementation-phases.md` § Phase 4)
> **Type:** feature

## Architecture Summary

Phase 3 gave every document a `status: 'draft' | 'finalized'` field that nothing ever wrote
`'finalized'` to. This phase makes that transition real and, more importantly, makes it
*enforced at the API boundary* — the scored claim is immutability via the API, not just in the
UI. A new `GUARDED_ROUTES` registry (`api/routes/registry.ts`) names the six existing-document
mutations; a new `immutability.ts` plugin reads that list at route-registration time (Fastify's
`onRoute` hook, not a request-time global hook — see Architecture Decision A1 for why the literal
"global preHandler hook" reading of the brief is actually a correctness bug) and appends itself to
each matched route's own `preHandler` array, guaranteeing it runs after `app.authenticate` without
editing a single file Phase 3 owns. The finalize route recomputes totals through the same pricing
engine and validator every other write already uses (no second validation subsystem), then commits
with one atomic conditional Mongo write — `{status: 'draft'} → {status: 'finalized'}` — so a
finalize race resolves to a clean 409 rather than a re-read-and-retry. `DocumentsRepository` gains
exactly one new method for that atomic write; everything else Phase 3 built is read, not modified.
On the frontend, a new read-only view renders a finalized document as a record instead of a
disabled form, and the existing editor (ownership transferred for this wave, per
`parallel-execution.md`) learns to route a finalized document to that view and to turn a stale-save
409 into a clear, non-destructive message rather than a silent failure.

## Inferred Requirements

No REQ doc exists for this issue; `specs/context/5.md` (= `docs/phases/phase-4-issue-5.md`) is
itself a complete lane-brief specification, this project's established pattern (see ARCH-3, ARCH-4).
Requirements below are restated from it, from `docs/implementation-phases.md` § Phase 4, and from
judgment calls confirmed with the developer in this session, for traceability by `generate-tasks`.

| ID | Inferred Requirement | Source |
|----|----|----|
| R1 | `POST /documents/:id/finalize` returns the finalized document, same shape as a `GET` (`status: 'finalized'`) — no new response type. | Brief G4 step 1 |
| R2 | Rejection is **409** `DOCUMENT_FINALIZED` (SCREAMING_SNAKE — corrects the brief prose's lowercase, per the project-wide code-casing convention). Message names the document, states finalization is irreversible. | Brief G4 step 2 |
| R3 | `GUARDED_ROUTES` in `api/routes/registry.ts` names the six existing-document mutations (excludes `POST /documents`, which creates rather than mutates). Both the guard and 4-B's test import this one list — no hand-listing. | Brief G4 step 3 |
| R4 | Finalize preconditions, in order: guard's generic already-finalized check (409, runs before the handler even for `.../finalize`) → document has ≥1 line, else rejected → persisted lines still pass the normal document validator (reuses `calculateDocument` + the existing engine-error mapping, no second validation path). | Brief G4 step 4 |
| R5 | Duplicate contract declared now, implemented only if 4-D runs: `POST /documents/:id/duplicate` → 201, new draft, fresh document+line ids, totals recomputed (not copied), title suffixed `(copy)`, `issueDate` = today. A finalized source is explicitly duplicable. | Brief G4 step 5 |
| R6 | Finalize/duplicate response types and the 409 code mirrored to `lib/api/types/lifecycle.ts`; `docs/contracts/phase-4.md` written including the registry table. | Brief G4 step 6 |
| R7 | The guard reaches routes it doesn't own without editing them, and must run strictly after `app.authenticate`. | Brief 4-A step 1 |
| R8 | Guard applies only from `GUARDED_ROUTES`, never hand-annotated; a mutating route missing from the registry is detectable at boot, failing loudly. | Brief 4-A step 2 |
| R9 | Guard's document lookup is owner-scoped: a foreign id is 404, never 409 (a 409 would leak the document's existence to a non-owner). | Brief 4-A step 1 |
| R10 | Finalize route: guard first, then `DOCUMENT_HAS_NO_LINES` if empty, then full recompute + normal validator over persisted lines, then flip status. | Brief 4-A steps 3–4 |
| R11 | Finalize write is a single conditional update (`{_id, ownerId, status:'draft'} → {status:'finalized'}`); no match = concurrent finalize = 409, no re-read-and-retry. | Brief 4-A step 5 |
| R12 | Post-finalize stored totals are computed fresh at finalize time; the implementing lane must report whether they differ from the draft's last-saved totals (a difference would surface a Phase 3 staleness bug, not a Phase 4 one). | Brief 4-A step 6 |
| R13 | `4-B`: one parameterized suite iterating `GUARDED_ROUTES` against a finalized document — 409 `DOCUMENT_FINALIZED`, document unchanged afterward (re-read, not just status-code), valid and invalid bodies both 409 (lifecycle check precedes validation), non-guarded routes (`GET`, `POST /documents`) unaffected. | Brief 4-B steps 1–4 |
| R14 | `finalize.test.ts`: valid draft → 200 + `421.50`; double finalize → 409; invalid persisted lines → specific field code, not generic 409; empty document → rejected; foreign document → 404. | Brief 4-B step 5 |
| R15 | `lib/api/lifecycle.ts`: `finalize(id)`, `duplicate(id)` (declared, unused until 4-D). Finalize confirmation dialog: irreversible, names the document, keyboard-accessible, focus-trapped, cancel is default. | Brief 4-C steps 1–2 |
| R16 | Read-only view renders a finalized document as a record, not a form with every input disabled. | Brief 4-C step 3 |
| R17 | Routing: finalized document opens read-only, draft opens the editor; the transition after a successful finalize happens without a full reload. | Brief 4-C step 4 |
| R18 | Stale-editor case: an editor open on a draft that's finalized elsewhere gets 409 on save; surfaced as a clear, non-destructive message, switches to read-only, never silently discards unsaved edits, never leaves a stuck spinner. | Brief 4-C step 5 |
| R19 | Immutability is enforced by the API, never by the browser; the UI reflects state, it does not defend it. | Brief 4-C guardrail |
| R20 | Join J4: both suites green, `e2e/lifecycle.cy.ts` (single-tab race via `cy.request()` finalizing out-of-band), manual `curl` confirmation, `chore(J4)` commit. | Brief Join J4 |
| R21 | Lane 4-D (stretch, gated on J4 green): duplicate route; source document proven untouched by its own test; **not** added to `GUARDED_ROUTES` (it creates a new document, never mutates the source). | Brief Lane 4-D |
| R22 | The guard is implemented via Fastify's `onRoute` hook, appending itself to each matched route's own `preHandler` array at route-registration time — not a bare `app.addHook('preHandler', ...)`. Fastify runs `addHook`-registered `preHandler` hooks *before* a route's own `preHandler` option, so a naive global hook would run **before** `app.authenticate` (which is attached per-route, opt-in, per Phase 2's pattern) and see `request.userId` unset. `onRoute` fires at registration time, appends into the same array the route already declared, and Fastify executes that array in order — structurally guaranteeing "after authenticate" instead of relying on incidental timing. | Developer decision, 2026-08-13 |
| R23 | `DocumentsRepository` gains `finalizeIfDraft(ownerId, id): Promise<StoredDocument \| null>`, implemented via `collection.findOneAndUpdate` (the `createOwnedRepository` wrapper exposes `updateOne` but not `findOneAndUpdate`/a matched-count, and finalize needs the post-image plus the "did it match" signal in one atomic call). Lane 4-A's *Owns* list is extended to include this one addition to `persistence/documents.repository.ts`. | Developer decision, 2026-08-13 |

## High-Level Structure

```
Request → [autoloaded plugins, then autoloaded routes — app.ts, unmodified]
                    │
    ┌───────────────┴────────────────────────────────────────┐
    │  plugins/immutability.ts (NEW)                          │
    │                                                          │
    │  Registration time (once, at boot):                     │
    │    onRoute(routeOptions) — for every autoloaded route,   │
    │      including 3-A's, sibling-registered because this   │
    │      plugin is fp()-wrapped:                             │
    │        • record {method, path} for the boot check        │
    │        • if {method, path} ∈ GUARDED_ROUTES:              │
    │            append guardHandler to routeOptions.preHandler │
    │            (normalizing fn → array first) — lands AFTER  │
    │            the route's own app.authenticate, same array   │
    │    onReady() — cross-check recorded routes vs             │
    │      GUARDED_ROUTES; throws (fails boot) on either        │
    │      direction of mismatch                                │
    │                                                          │
    │  Request time, guarded routes only:                     │
    │    app.authenticate (route's own preHandler, runs first) │
    │    → guardHandler: owner-scoped lookup by request.userId; │
    │      foreign/missing → 404; status==='finalized' → 409    │
    │      DOCUMENT_FINALIZED (reply sent directly — the        │
    │      guard never throws, since it protects handlers it    │
    │      does not own and can't rely on their catch blocks)   │
    └──────────────────────────────────────────────────────────┘
                    │
   3-A's existing routes (documents.ts, document-lines.ts) — UNMODIFIED
   4-A's new route (documents-lifecycle.ts) — POST .../finalize
                    │
   POST .../finalize handler (guard already ran — this is itself
   in GUARDED_ROUTES, so a double-finalize never reaches here):
     1. DOCUMENT_HAS_NO_LINES if lines.length === 0
     2. calculateDocument over persisted lines (same engine call
        services/documents.ts already makes) → reject invalid
        persisted data with the existing per-line codes
     3. repository.finalizeIfDraft(ownerId, id) — atomic
        conditional write; null (lost a concurrent race) → 409
        DOCUMENT_FINALIZED
     4. toDocumentResponse (imported from services/documents.ts,
        read-only) on the returned post-image
```

**Added to the existing system:** `contracts/lifecycle.ts`, `api/routes/registry.ts`,
`api/routes/documents-lifecycle.ts`, `api/plugins/immutability.ts`, `services/lifecycle.ts`,
`docs/contracts/phase-4.md`; frontend `lib/api/types/lifecycle.ts`, `lib/api/lifecycle.ts`,
`components/lifecycle/**`, `app/(app)/documents/[id]/view/page.tsx`.

**Modified in the existing system:** `persistence/documents.repository.ts` (one new method),
`app/(app)/documents/[id]/page.tsx` and `components/document-editor/**` (routing + 409 handling,
ownership transferred for this wave per `parallel-execution.md` § Ownership is per-wave).

**Untouched:** `app.ts` (autoloader already anticipates this — see its own comment), `contracts/document.ts`,
`services/documents.ts`, `api/routes/documents.ts`, `api/routes/document-lines.ts`,
`api/plugins/authenticate.ts`, `api/errors/engine-errors.ts`, `persistence/repository.ts`
(the base helper — `finalizeIfDraft` goes around it for one call, not through it; see A2).

## Tech Choices

| Area | Decision | Alternatives Considered | Rationale |
|----|----|----|----|
| Guard mechanism | Fastify `onRoute` hook mutating each matched route's `preHandler` array at registration time | A bare `app.addHook('preHandler', guardFn)` (the brief's literal prose) | `addHook`-registered `preHandler` hooks run *before* a route's own `preHandler` option in Fastify's execution order. Since `app.authenticate` is attached per-route (opt-in, Phase 2's pattern) rather than as a global hook, a naive global guard would run before authentication resolves `request.userId` — breaking R9's owner-scoped lookup. `onRoute` fixes the ordering structurally (R22) |
| Boot check | Same `onRoute` handler accumulates `{method, path}` seen; a companion `onReady` hook (mirrors `plugins/indexes.ts`'s pattern) diffs that set against `GUARDED_ROUTES` in both directions | A hand-maintained checklist; no boot check at all | Reuses one piece of state for two jobs (guarding + verifying); `indexes.ts` already establishes `onReady` as this codebase's boot-time-check idiom |
| Atomic finalize write | `DocumentsRepository.finalizeIfDraft` via `collection.findOneAndUpdate({_id, ownerId, status:'draft'}, {$set:{status:'finalized', updatedAt}}, {returnDocument:'after'})` | Read-then-write (`findById` + `update`); a version/optimistic-lock field | `findOneAndUpdate` gets the match-or-no-match signal and the post-image in one round trip — no read-then-write race window, no new field on `StoredDocument`. Matches R11's explicit "do not re-read and retry" |
| Validation reuse for finalize | Re-run `calculateDocument` over the persisted lines and reuse the existing engine-error mapping (`mapPricingEngineError`) that `documents.ts`/`document-lines.ts` already call | A dedicated finalize-time validator | Brief's explicit "reusing the ordinary validator covers it without a second validation subsystem" (G4 step 4) — third call site for a pattern already established twice in Phase 3 |
| `DOCUMENT_HAS_NO_LINES` HTTP status | 400, top-level `error.code` (not wrapped in `VALIDATION_FAILED`, following the `DOCUMENT_NOT_FOUND`/`LINE_NOT_FOUND` precedent of a bespoke top-level domain code rather than a per-field issue) | 409 (grouped with `DOCUMENT_FINALIZED` as a "lifecycle conflict") | It's a precondition-not-met on the finalize *input state*, closer in kind to a validation failure than to the "someone already changed this" conflict 409 is reserved for in this codebase. Flagged in Open Questions since the brief doesn't pin the status explicitly |

## Patterns & Conventions

- **Domain error codes live in the domain's own contract file** — `contracts/lifecycle.ts` owns
  `DOCUMENT_FINALIZED` and `DOCUMENT_HAS_NO_LINES`, third domain to follow the Phase 0 convention
  (`pricing.ts`, `document.ts` before it).
- **`fp()`-wrapped, autoloaded plugins for cross-cutting hooks** — third real use after
  `authenticate.ts` and `error-handler.ts`; `app.ts`'s own comment names this exact guard as the
  pattern's motivating example, though the specific hook type (`onRoute`, not a bare
  `preHandler` add) is this session's refinement of that comment's intent.
- **`onReady` for boot-time cross-checks** — second use after `indexes.ts`.
- **Route-level, not global, error mapping** — the guard is the one exception: it replies directly
  from a `preHandler` rather than throwing, because it protects route handlers it doesn't own and
  can't assume their try/catch shape.
- **Repository is the sole Mongo access point** — `finalizeIfDraft` preserves this (A2): it still
  lives inside `documents.repository.ts`, just calls the driver's `findOneAndUpdate` directly
  instead of routing through `createOwnedRepository`'s narrower `updateOne` wrapper.
- **Ownership is per-wave** — 4-C's edits to the editor page and `components/document-editor/**`
  are exactly the transfer `parallel-execution.md` describes; 3-D is not running this wave.
- **Intentionally not applied this phase:** client-side immutability enforcement (R19 — API is the
  only enforcement point); the human-readable document number shown in the design mockup
  (out of scope, same reasoning as ARCH-4); a `documents` collection index (still not needed at
  this project's scale).

## Data Models

No new persisted entity. `StoredDocument.status: 'draft' | 'finalized'` already exists (Phase 3);
this phase is the first to ever write `'finalized'` to it, and does so through exactly one path
(`finalizeIfDraft`).

### `StoredDocument.status` (existing field, new transition)

**Purpose:** gates every existing-document mutation once flipped.

**Lifecycle:** `'draft'` at creation (Phase 3, unchanged) → `'finalized'` via
`POST /documents/:id/finalize` (this phase) → terminal; no un-finalize route exists or is planned.

**Constraint enforced by this phase:** the transition is one-way and can only be written by
`finalizeIfDraft`'s conditional filter — no other code path sets `status` to `'finalized'`.

## API Contracts / Interfaces

### Lifecycle routes (HTTP)

**Boundary:** Fastify route, `apps/backend/src/api/routes/documents-lifecycle.ts`. Attaches
`app.authenticate`, same as every Phase 3 route.

| Method | Path | Purpose | Errors / Returns |
|----|----|----|----|
| `POST` | `/api/v1/documents/:id/finalize` | Recompute + lock a draft | 200 `DocumentResponse` (`status:'finalized'`) · 400 `DOCUMENT_HAS_NO_LINES` or per-line codes · 404 `DOCUMENT_NOT_FOUND` · 409 `DOCUMENT_FINALIZED` |
| `POST` | `/api/v1/documents/:id/duplicate` *(4-D only, contract declared now)* | New draft copied from any source | 201 `DocumentResponse` (new id, `status:'draft'`, title suffixed) · 404 `DOCUMENT_NOT_FOUND` |

Every other Phase 3 route gains 409 `DOCUMENT_FINALIZED` as a possible response when the target
document is finalized (via the guard) — no other change to their existing contracts.

**Auth requirements:** unchanged from Phase 3 — session required; another user's document is 404,
never 409 (R9), including on the finalize/duplicate routes themselves.

### Module boundaries (not HTTP)

| Signature | Purpose | Errors / Returns |
|----|----|----|
| `GUARDED_ROUTES: ReadonlyArray<{method: string; path: string}>` | Single source of truth for which routes the guard protects and 4-B's test iterates | Static data, no I/O |
| `DocumentsRepository.finalizeIfDraft(ownerId, id): Promise<StoredDocument \| null>` | Atomic conditional finalize write | `null` on no match (already finalized, concurrently or otherwise) |
| `services/lifecycle.ts: finalizeDocument(ownerId, id): Promise<DocumentResponse>` | Orchestrates preconditions, recompute, and the atomic write | Throws `DocumentNotFoundError` (reused from `services/documents.ts`), `DocumentHasNoLinesError` (new), or the reused `PricingPreviewError` on invalid persisted lines; throws a new `DocumentAlreadyFinalizedError` on a lost race |
| `immutability.ts` guard `preHandler` | Rejects a guarded write against a finalized document | Replies 409 directly; never throws |

## Module Boundaries

| Module / Package | Responsibility | Allowed Dependencies |
|----|----|----|
| `apps/backend/src/contracts/lifecycle.ts` | `DOCUMENT_FINALIZED`/`DOCUMENT_HAS_NO_LINES` codes, finalize/duplicate response schemas (reusing `document.ts`'s shapes, not redeclaring them) | `zod`, `contracts/document.ts` (read-only) |
| `apps/backend/src/api/routes/registry.ts` | `GUARDED_ROUTES` — data only | none |
| `apps/backend/src/api/plugins/immutability.ts` | Guard + boot check | `api/routes/registry.ts`, `persistence/documents.repository.ts` |
| `apps/backend/src/services/lifecycle.ts` | Finalize orchestration | `src/pricing/**` (via the same reused helpers `services/documents.ts` uses), `services/documents.ts` (read-only: `toDocumentResponse`), `persistence/documents.repository.ts` |
| `apps/backend/src/api/routes/documents-lifecycle.ts` | HTTP wiring for finalize (and duplicate, if 4-D) | `contracts/lifecycle.ts`, `services/lifecycle.ts` |
| `apps/frontend/src/lib/api/types/lifecycle.ts` | Mirrored types + codes | none (leaf) |
| `apps/frontend/src/lib/api/lifecycle.ts` | `finalize`, `duplicate` typed calls | `lib/api/client.ts` (read-only), `lib/api/types/lifecycle.ts` |
| `apps/frontend/src/components/lifecycle/**` | Confirm dialog, status banner | `lib/api/lifecycle.ts` |
| `apps/frontend/src/app/(app)/documents/[id]/view/page.tsx` | Read-only record view | `lib/api/documents.ts` (read-only), `lib/api/types/document.ts` |

**Rule carried forward from Phases 1–3:** the HTTP layer never does arithmetic on money, no route
queries `documents` without an `ownerId` in hand, and now: no code outside `finalizeIfDraft`'s
conditional filter is ever allowed to write `status: 'finalized'`.

## Change Footprint

### New files / modules

| Path | Purpose | Pattern reference |
|----|----|----|
| `apps/backend/src/contracts/lifecycle.ts` | Error codes + finalize/duplicate schemas | `contracts/document.ts` (schema+codes-in-one-file) |
| `apps/backend/src/api/routes/registry.ts` | `GUARDED_ROUTES` | new — first shared-lookup-table file; deliberately data-only per `parallel-execution.md`'s "no shared append-target" rule (it's read by two lanes but never appended to by either) |
| `apps/backend/src/api/plugins/immutability.ts` | Guard + boot check | `api/plugins/indexes.ts` (`onReady` pattern), `api/plugins/authenticate.ts` (`fp()` + decorator shape) |
| `apps/backend/src/api/plugins/immutability.test.ts` | Colocated unit test | `api/plugins/authenticate.test.ts`, `api/plugins/rate-limit.test.ts` |
| `apps/backend/src/services/lifecycle.ts` | `finalizeDocument` orchestration | `services/documents.ts` |
| `apps/backend/src/services/lifecycle.test.ts` | Colocated unit test | `services/documents.test.ts` (doesn't exist yet, so: `services/auth.test.ts`'s shape) |
| `apps/backend/src/api/routes/documents-lifecycle.ts` | Finalize (+ duplicate, 4-D) route | `api/routes/documents.ts` (route-local error mapping) |
| `apps/backend/test/api/immutability.test.ts` | `GUARDED_ROUTES`-driven parameterized suite | `test/integration/ownership.test.ts` (table-driven shape) |
| `apps/backend/test/api/finalize.test.ts` | Scenario suite | `test/api/documents.test.ts` |
| `docs/contracts/phase-4.md` | Human-readable contract snapshot, incl. registry table | `docs/contracts/phase-3.md` |
| `apps/frontend/src/lib/api/types/lifecycle.ts` | Mirrored types + codes | `lib/api/types/document.ts` |
| `apps/frontend/src/lib/api/lifecycle.ts` | `finalize`, `duplicate` calls | `lib/api/documents.ts` |
| `apps/frontend/src/components/lifecycle/**` (dialog, banner + tests) | Finalize confirmation, status messaging | `components/documents/DeleteDialog.tsx` (confirmation-dialog shape), `components/documents/StatusPill.tsx` (already status-aware) |
| `apps/frontend/src/app/(app)/documents/[id]/view/page.tsx` | Read-only record view | `design/htmls/document-view.html`; structurally closer to `documents/page.tsx`'s list rendering than to the editor's form |
| `e2e/lifecycle.cy.ts` | J4's Cypress happy path + stale-save race | `e2e/documents.cy.ts` |

### Modified files / modules

| Path | What changes here |
|----|----|
| `apps/backend/src/persistence/documents.repository.ts` | Adds `finalizeIfDraft(ownerId, id)`, calling `collection.findOneAndUpdate` directly (the module already computes a `db.collection<StoredDocument>('documents')` reference internally; this method reuses that same collection handle rather than opening a second one) |
| `apps/frontend/src/app/(app)/documents/[id]/page.tsx` | Routes a finalized document to the new `view/` page; handles the 409-on-save case before rendering the editor |
| `apps/frontend/src/components/document-editor/DocumentEditor.tsx` | Save handler catches `ApiError` with `code === 'DOCUMENT_FINALIZED'`, surfaces the non-destructive message, transitions to read-only instead of leaving a stuck spinner or discarding edits silently |

### Deleted / replaced

None this phase.

### Touched but not changed (silent-regression hotspots)

| Path | Why it matters |
|----|----|
| `apps/backend/src/services/documents.ts` (`toDocumentResponse`) | New consumer (`lifecycle.ts`) outside the file it was written for; 4-A cannot edit this file (R7's "reads, never edits"), so a signature change here breaks lifecycle.ts silently unless both test suites run together |
| `apps/backend/src/api/errors/engine-errors.ts` (`mapPricingEngineError`) | Third call site (after `documents.ts`, `document-lines.ts`) for the same reused mapper — finalize's persisted-line revalidation goes through it too |
| `apps/backend/src/app.ts` (plugin/route autoloader) | First time two plugins (`authenticate.ts`, `immutability.ts`) both care about the *same* route's `preHandler` array and about relative ordering between them — the whole point of R22's `onRoute` design, and the first real exercise of the ordering guarantee the app.ts comment gestures at but doesn't enforce by itself |
| `apps/backend/src/persistence/repository.ts` (`createOwnedRepository`) | Not modified, but `finalizeIfDraft` deliberately steps around its `updateOne` wrapper for one method — a reviewer skimming `documents.repository.ts` should not assume every method goes through `base` |
| `apps/frontend/src/components/document-editor/**` (rest of the file, transferred ownership) | 3-D's existing save/validation/dirty-tracking logic must keep working unmodified around the new 409 branch — this is the "ownership is a lock for the wave" risk `parallel-execution.md` calls out by name |

## Areas of Impact

| Area | Impact | Risk (L/M/H) | Why |
|----|----|----|----|
| `api/plugins/immutability.ts` (new) | This *is* the scored claim — immutability enforced via the API | H | Any gap here (wrong ordering, a route missing from the registry, a foreign-doc 409 leak) directly fails the phase's primary requirement. Mitigated by R22's structural ordering fix, the boot check (R8), and 4-B's evidence suite being a deliverable in its own right, not incidental coverage |
| `persistence/documents.repository.ts` (`finalizeIfDraft`) | First method in this repository that bypasses `createOwnedRepository`'s wrapper | M | A hand-rolled owner filter here (rather than the shared `withOwner` helper, which isn't exported) could drift from the pattern the rest of the file follows; mitigated by a colocated test asserting a foreign `ownerId` also fails to match |
| `api/routes/registry.ts` (new, read by 3 consumers: guard, boot check, 4-B's test) | Single source of truth for "which routes are guarded" | M | Wrong by omission = silently unguarded route (security gap); wrong by inclusion = a legitimately-creating route rejected. The boot check (R8) is the structural mitigation, not just the test suite |
| Frontend editor/view routing (`documents/[id]/**`) | Ownership transferred from 3-D for this wave only | M | Existing draft-editing behavior must survive the routing logic being added around it; no regression test currently exists for "editor still works for drafts" beyond what 3-D already wrote — worth re-running at J4 explicitly, not just trusting the diff is additive |
| `docs/contracts/phase-4.md` | Read by 4-D (wave 8) and any future phase referencing the registry | L | Documentation-only |

**Contract changes:** none to `document.ts`, `pricing.ts`, `auth.ts`, `envelope.ts` — all frozen and
unmodified. Every existing Phase 3 route gains one new possible response (409
`DOCUMENT_FINALIZED`) without any change to its success-path contract.

**Cross-cutting ripples:** none into telemetry, feature flags, or the build pipeline. No new
collection or index. The one genuinely new cross-cutting mechanism is the `onRoute`-based
plugin-to-plugin route mutation itself — nothing in this codebase has needed two plugins to
coordinate on one route's hook chain before this phase.

## Cross-Cutting Concerns

- **Errors:** the guard is the one deliberate exception to "routes catch and map their own domain
  errors" — it replies directly from a `preHandler` because it protects handlers it doesn't own.
  `services/lifecycle.ts`'s own errors (`DocumentNotFoundError` reused, new
  `DocumentHasNoLinesError`, `DocumentAlreadyFinalizedError`) are caught and mapped route-locally
  in `documents-lifecycle.ts`, mirroring Phase 3's pattern exactly.
- **Logging & metrics:** no new fields beyond what `error-handler.ts` already logs. The guard's
  409s are a normal, expected outcome (a stale tab, a race) — not error-level noise; a `req.log`
  call at `info` inside the guard on a 409 is reasonable but not required by the brief.
- **Auth & authz:** unchanged mechanism (`app.authenticate` + `ownerId` filter). The guard adds a
  *second* authorization dimension (document state, not just ownership) on top of the same
  `request.userId`, checked after ownership resolves — never before, never independently.
- **Performance & scale:** the guard's owner-scoped `findById` on every guarded request is one extra
  Mongo round trip per mutating call — the same cost Phase 3's routes already pay for their own
  existence checks, now paid once more at the plugin layer. Acceptable at this project's scale;
  worth noting if a future phase wants to fold the guard's lookup and the route handler's own
  lookup into one query.
- **Security:** the owner-scoped 404-before-409 ordering (R9) is the deliberate anti-enumeration
  choice, restated from Phase 3's own `DOCUMENT_NOT_FOUND` precedent. No new secrets, no new input
  surface beyond the finalize/duplicate routes' bodies (duplicate has none; finalize has none).
- **Migrations & rollout:** no schema change — `status: 'finalized'` is already a valid value in
  the existing field's type. Rollback is a plain deploy revert; any document finalized between
  deploy and rollback stays finalized (no automated un-finalize path exists or is planned this
  phase).

## Architecture Decisions Log

| # | Decision | Alternatives | Chosen Because | Satisfies REQs |
|----|----|----|----|----|
| A1 | Guard implemented via `onRoute`, appending to each matched route's own `preHandler` array | A bare `app.addHook('preHandler', guardFn)` (literal brief prose) | Fastify runs `addHook`-registered `preHandler` hooks before a route's own `preHandler` option; since `authenticate` is opt-in per-route here (not global), a naive global hook would run before `request.userId` is set, breaking the owner-scoped lookup the brief itself requires | R7, R9, R22 |
| A2 | `finalizeIfDraft` calls `collection.findOneAndUpdate` directly rather than through `createOwnedRepository`'s `updateOne` | Extend the shared base helper (`persistence/repository.ts`) with a `findOneAndUpdate` passthrough | Smaller blast radius — one method in one file, vs. a change to a base helper every other repository could inherit unintentionally. `documents.repository.ts` already computes the collection handle it needs | R11, R23 |
| A3 | `DOCUMENT_HAS_NO_LINES` returns 400 with a bespoke top-level code | 409, grouped with `DOCUMENT_FINALIZED` as a lifecycle conflict | Closer in kind to a validation precondition (document isn't in a state finalize can act on) than to "someone already changed this concurrently," which 409 is reserved for. Flagged as an assumption in Open Questions since the brief doesn't pin the status code | R4, R10 |
| A4 | Finalize revalidates persisted lines by re-running `calculateDocument` + reusing `mapPricingEngineError`, rather than a dedicated finalize validator | A finalize-specific validation function | Brief's explicit instruction; third use of an already-twice-established pattern, zero new arithmetic | R4, R10 |
| A5 | No new `StoredDocument` field for the lifecycle transition — reuses Phase 3's existing `status` field and its existing type | Add a `finalizedAt`/`finalizedBy` audit field (shown in the design mockup's copy: "Finalized 2026-07-28 14:32 UTC by j.doe@...") | Not requested by the brief's frozen contract; the mockup's audit line is presentation detail beyond what `Document`'s frozen shape defines, same reasoning ARCH-4 used to exclude the document-number field | R1 |

## Risk & Stress-Test Scenarios

### Forward — runtime failure scenarios

| Scenario | How the Design Handles It |
|----|----|
| Two concurrent `POST .../finalize` requests for the same document | `finalizeIfDraft`'s conditional filter (`status:'draft'`) means only one write matches; the loser's `findOneAndUpdate` returns `null` → 409 `DOCUMENT_FINALIZED`, no re-read, no double-write, no crash |
| A route file added to `api/routes/` in a later phase, mutates an existing document, forgets a `GUARDED_ROUTES` entry | The boot check's `onReady` cross-check (R8) fails loudly at startup — the app does not boot silently unguarded. Without the boot check this would be an invisible security regression |
| A `GUARDED_ROUTES` entry has a typo in its path (route never actually registers there) | Same boot check, opposite direction: an entry with no matching registered route also fails loudly, catching the typo before it ships as a dead guard |
| Mongo unreachable for 30s during `finalizeIfDraft`'s write | Uncaught driver error falls through to the global handler → 500 `INTERNAL_ERROR`, same as every other Phase 3 write's equivalent gap. No partial state, since it's one atomic operation |
| Rollback after a bad deploy | No schema change to roll back; documents finalized between deploy and rollback simply stay finalized — acceptable, same reasoning as Phase 3's rollback story |
| A client finalizes a document whose persisted lines were saved *before* a since-tightened validation rule | Finalize's revalidation (R4/R10) catches it and rejects with the specific field code — this is precisely the gap G4's brief calls out as "the PDF asks for finalize validation rejecting invalid quantities or negative prices" |

### Backward — regression risk per touched area

| Touched area | What could regress | How we'd know / mitigation |
|----|----|----|
| `services/documents.ts` (`toDocumentResponse`, read-only by `lifecycle.ts`) | A future signature change here breaks `lifecycle.ts` without an obvious local signal, since 4-A can't edit the file it depends on | Running both apps' full suites (this phase's "done when" for 4-A explicitly includes `services/lifecycle*`) catches a type error immediately at compile time — it's a TS signature, not a runtime contract |
| `app.ts` autoloader / plugin ordering | Two plugins now coordinate on the same route's `preHandler` array; a future third plugin doing the same could reintroduce an ordering bug this phase specifically fixed | `immutability.test.ts` should assert the *order* (authenticate error surfaces before a finalized-document 409 when both would apply — e.g., an unauthenticated request to a finalized document's route must still get 401, not 409), not just that both eventually fire |
| `apps/frontend/src/components/document-editor/**` (transferred ownership) | 3-D's existing save/dirty-tracking/validation-error-mapping behavior for drafts could regress while routing and 409-handling are added around it | Component tests already exist for the editor (per Phase 3); 4-C adds to them rather than replacing, and J4's `e2e/lifecycle.cy.ts` exercises a real draft-edit-then-finalize flow end to end, not just the new code path in isolation |
| `persistence/documents.repository.ts` (existing methods: `list`, `findById`, `insert`, `update`, `remove`) | None of these change, but the file now has a method (`finalizeIfDraft`) that doesn't go through `base` — a future refactor "simplifying" the file by routing everything through `base` could silently reintroduce the read-then-write race this method exists to avoid | Colocated test for `finalizeIfDraft` should explicitly assert atomicity intent (concurrent-call simulation: two calls against the same draft, exactly one succeeds) so the *reason* for the direct `findOneAndUpdate` call is pinned by a test, not just a comment |

## Open Questions

- Should `DOCUMENT_HAS_NO_LINES` be 400 (this doc's default, A3) or 409 (grouped with
  `DOCUMENT_FINALIZED` as a lifecycle-state conflict)?
  - **Impact if unresolved:** `finalize.test.ts`'s empty-document assertion needs a concrete status
    code to assert against; a wrong guess means one test rewritten, not a design change.
  - **Suggested default:** 400, per A3's reasoning — `generate-tasks`/G4 should confirm this
    against `docs/contracts/phase-4.md` once written, same as ARCH-4 deferred its own PATCH-partial
    question to that phase's contract doc.
- Does the guard log its own 409s, or rely entirely on the global request log?
  - **Impact if unresolved:** no functional difference; affects debuggability of finalize races in
    production.
  - **Suggested default:** no extra logging — `error-handler.ts` already logs every non-2xx
    response's code; a guard-specific log line would be the first duplicate log site in the
    project.

## Out of Scope

- Un-finalizing a document, or any admin override of the lock (reason: not requested by the brief;
  the mockup and brief both treat finalization as one-way)
- An audit trail (`finalizedAt`/`finalizedBy`) beyond what `updatedAt` already captures (reason:
  not in the frozen `Document` shape; see A5)
- The human-readable document number shown in the design mockup's finalized view (reason: same
  exclusion ARCH-4 already made — not in the frozen contract)
- Lane 4-D (duplicate) implementation itself — this doc declares its contract (R5, R21) per G4's
  instruction, but the lane only runs after J4 is green and is explicitly skippable if anything
  above is red
- An index on `documents` (reason: still not needed at this project's query volume, per ARCH-4's
  same finding, unchanged by this phase's read patterns)

---

# Tasks

Tasks live in a sibling file, not inline — see
`specs/architecture/ARCH-5-lifecycle-immutability-tasks.md` (same convention as issue #1's
`ARCH-1-skeleton-lane-briefs.md` / `ARCH-1-tasks.md` pair, issue #3's
`ARCH-3-auth-ownership.md` / `ARCH-3-auth-ownership-tasks.md` pair, and issue #4's
`ARCH-4-documents-line-items-validation.md` / `-tasks.md` pair).
