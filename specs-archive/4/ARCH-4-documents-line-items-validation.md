# Architecture: Documents, line items, validation

> **Date:** 2026-08-13
> **Issue:** #4
> **Phase:** 2 of 5 (System Architecture)
> **Requirements source:** Standalone brief — see Inferred Requirements (`specs/context/4.md`, `docs/phases/phase-3-issue-4.md`, `docs/implementation-phases.md` § Phase 3)
> **Type:** feature

## Architecture Summary

The first real UI → backend → database round trip. `documents` is a new owner-scoped Mongo
collection built on Phase 2's `createOwnedRepository<StoredDocument>`, storing money as integer
cents, quantity as integer thousandths, and percentages as basis points — the same scale the
pricing engine already computes in. Every mutating route (`POST/PATCH/DELETE` at both the
document and line-item level) funnels through one `recomputeAndPersist` step in
`services/documents.ts` that always recomputes the *whole* document via `calculateDocument`
before writing, so totals in the database are never a client-supplied number and a partial edit
can never leave a stale total behind. `services/documents.ts` reuses — rather than re-derives —
Phase 1's wire↔engine unit conversion by having `services/pricing-preview.ts` export
`toEngineLine`/`fromEngineResult`/`findFailingLine`, which were previously private; engine
failures still flow through the existing `api/errors/engine-errors.ts` mapper unmodified. Line
identity is a server-minted `crypto.randomUUID()`, preserved across a PATCH when the client echoes
it back and minted fresh when it doesn't. Per-line computed figures (subtotal, discount amount,
tax amount, line total) are **never persisted** — only the document-level `totals` rollup is
stored and returned; the editor keeps sourcing its per-row breakdown from the existing stateless
`/pricing/preview` endpoint at all times, load through post-save, so there is exactly one place in
the whole system that computes a per-line number for display. On the frontend, a new documents
list page and an id-aware document editor (built on Phase 1's line-item components, now owned by
this phase per the parallel-execution "ownership is per-wave" rule) round out the four parallel
lanes; the standalone `/editor` demo route is retired at the join in favor of the real
`documents/[id]` editor.

## Inferred Requirements

No REQ doc exists for this issue; `specs/context/4.md` (= `docs/phases/phase-3-issue-4.md`) is
itself a complete lane-brief specification, this project's established pattern (see ARCH-3).
Requirements below are restated from it, from `docs/implementation-phases.md` § Phase 3, and from
the judgment calls confirmed with the developer in this session, for traceability by
`generate-tasks`.

| ID | Inferred Requirement | Source |
|----|----|----|
| R1 | `Document{id, ownerId, title, customer, issueDate, status, lines, totals, createdAt, updatedAt}`; `ownerId` never serialized to the client. `LineItem{id, description, quantity, unitPrice, discount, taxPercent}` — no computed fields. | Brief G3 step 1 |
| R2 | Two representations, one mapper: `StoredDocument`/`StoredLineItem` (cents / thousandths / basis points, what Mongo holds) vs. `DocumentResponse`/`LineItemResponse` (major units, what every route returns). | Brief G3 step 2 |
| R3 | `issueDate` is a calendar date stored as `YYYY-MM-DD`, never a `Date` — avoids a timezone shift moving a document into the wrong month for Phase 5's range filters. | Brief G3 step 3 |
| R4 | Frozen route table: `GET/POST /documents`, `GET/PATCH/DELETE /documents/:id`, `POST /documents/:id/lines`, `PATCH/DELETE /documents/:id/lines/:lineId`. | Brief G3 step 3 (table) |
| R5 | Create takes `title`, `customer`, `issueDate`, optional `lines`. `status` and `totals` are rejected on input with `SERVER_MANAGED_FIELD`, not silently ignored. PATCH is a partial update over metadata and, optionally, the whole lines array. | Brief G3 step 4 |
| R6 | Error codes: `DOCUMENT_NOT_FOUND`, `TITLE_REQUIRED`, `CUSTOMER_REQUIRED`, `ISSUE_DATE_INVALID`, `LINE_NOT_FOUND`, `DESCRIPTION_REQUIRED`, `SERVER_MANAGED_FIELD`, plus Phase 1's per-line codes applied unchanged to persisted lines. | Brief G3 step 5 |
| R7 | Another user's document id returns **404**, never 403 — falls out of an owner-scoped query returning nothing. | Brief G3 step 6 |
| R8 | `DocumentsRepository` interface, every method taking `ownerId` first. | Brief G3 step 7 |
| R9 | Frontend mirror of document types + error codes at `lib/api/types/document.ts`; typed client `lib/api/documents.ts` with `list/get/create/update/remove` plus the three line calls — owned by the gate because 3-C and 3-D both import it in the same wave. | Brief G3 steps 8–9 |
| R10 | `documents.repository.ts` filters every query by `{_id, ownerId}` in one step — never `findById` then compare. | Brief 3-A step 1 |
| R11 | Route files autoload from `src/api/routes/`; every route attaches `app.authenticate`; `app.ts` is never edited. | Brief 3-A step 2 |
| R12 | Totals recomputed by `calculateDocument` on every write and persisted with the document; a read returns stored totals, a write recomputes from scratch over the whole lines array. No arithmetic reimplemented — the engine is imported. | Brief 3-A step 3 |
| R13 | Line ids are server-generated and stable across updates; a PATCH replacing the lines array preserves ids the client sent and mints ids it didn't. | Brief 3-A step 4 |
| R14 | Every validation failure carries a specific code and a field path in `details[]` (e.g. `lines.2.quantity`, `issueDate`). | Brief 3-A step 5 |
| R15 | Engine errors map to HTTP through the existing `engine-errors.ts` — no second mapping written. | Brief 3-A step 6 |
| R16 | Listing is newest-first by `issueDate` then `createdAt`, owner-scoped, `lines` omitted from the list payload. | Brief 3-A step 7 |
| R17 | Ownership isolation: for each of the six id-scoped routes, another user's document/line yields 404; the list route never leaks another owner's documents, including when the caller has none. | Brief 3-B steps 2–3 |
| R18 | One test per error code asserting both status and code (not just status). | Brief 3-B step 4 |
| R19 | Round-trip correctness against the PDF's 3-line fixture: `450.00 / 40.00 / 11.50 / 421.50`. | Brief 3-B step 5 |
| R20 | Two separate tests for server-managed fields: a payload containing `totals`/`status` is rejected with `SERVER_MANAGED_FIELD`; a normal payload persists server-computed values matching the engine exactly. | Brief 3-B step 6 |
| R21 | A PATCH editing one line leaves the other lines' ids unchanged. | Brief 3-B step 7 |
| R22 | Documents list UI: empty state, status pill, right-aligned totals, create flow, delete-with-confirmation, loading/failure states. | Brief 3-C steps 2–6 |
| R23 | Editor loads a document by id, edits metadata + lines, saves through the typed client, never sends `totals`/`status`, maps `details[]` paths to the right row/field, warns on navigating away with unsaved changes. | Brief 3-D steps 1–5 |
| R24 | Join J3 retires the standalone `/editor` route, ports its Cypress happy path to the document editor, adds `documents` to shell nav, and proves `421.50` persists through save/reload. | Brief Join J3 |
| R25 | Stored↔response conversion lives in `services/documents.ts`, not the repository — the repository only ever sees `StoredDocument`/`StoredLineItem`. | Developer decision, 2026-08-13 |
| R26 | `services/pricing-preview.ts` exports `toEngineLine`, `fromEngineResult`, `findFailingLine` (currently private) so `services/documents.ts` reuses them instead of re-deriving the wire↔engine conversion. | Developer decision, 2026-08-13 |
| R27 | Line ids are `crypto.randomUUID()` — no new dependency. Create/update line-input schemas accept an optional `id` field for echo-back preservation. | Developer decision, 2026-08-13 |
| R28 | The document-domain `LineItem` input schema is `z.intersection(lineInputSchema, z.object({id, description}))`, reusing Phase 1's actual schema object rather than a second copy. | Developer decision, 2026-08-13 |
| R29 | `SERVER_MANAGED_FIELD` is detected by declaring `totals`/`status` as optional-but-forbidden keys with a `superRefine` check, not by relying on zod's default unknown-key stripping. | Developer decision, 2026-08-13 |
| R30 | Per-line computed values are never persisted or returned on `Document`/`LineItem`; the editor always sources per-row figures from `/pricing/preview`, both before and after save. | Developer decision, 2026-08-13 |

## High-Level Structure

```
Browser
  │ GET/POST/PATCH/DELETE /api/v1/documents[/:id[/lines[/:lineId]]]
  ▼
Next.js rewrite (same-origin, unchanged)
  ▼
[global] rate-limit.ts (unchanged, applies here too)
  ▼
Fastify route  src/api/routes/documents.ts + document-lines.ts
  │  preHandler: app.authenticate → request.userId
  │  1. zod-validate against contracts/document.ts (rejects totals/status)
  ▼
services/documents.ts
  │  2. recomputeAndPersist(lines): toEngineLine (reused from pricing-preview.ts)
  │     → calculateDocument (engine, cents) → catches PricingError →
  │     PricingPreviewError (reused class) on failure
  │  3. on success: StoredLineItem[] + StoredTotals (cents) built; line ids
  │     preserved/minted; fromEngineResult-style conversion back to major
  │     units for the HTTP response only — cents are what's written
  ▼
persistence/documents.repository.ts  (createOwnedRepository<StoredDocument>)
  │  every call takes ownerId first, merged into the Mongo filter
  ▼
documents collection  { _id, ownerId, title, customer, issueDate, status,
                         lines: StoredLineItem[], totals: StoredTotals,
                         createdAt, updatedAt }
  ▼
Route replies 200/201 with DocumentResponse (major units), or catches a
domain/engine error and replies via engine-errors.ts / the global handler
  ▼
Browser: documents list + editor render server totals only

Editor page (3-D), independent of the write path above:
Browser ──(load)──► GET /documents/:id → metadata + lines (no computed fields)
        ──(every keystroke, debounced)──► POST /pricing/preview → per-row
              LineResult[] for display — used before AND after save
        ──(Save draft)──► PATCH /documents/:id → persisted DocumentTotals
              swaps in for the four document-level numbers only
```

**Added to the existing system:** `contracts/document.ts`, `domain/document.ts`,
`persistence/documents.repository.ts`, `services/documents.ts`, `api/routes/documents.ts`,
`api/routes/document-lines.ts`, `docs/contracts/phase-3.md`; frontend `lib/api/types/document.ts`,
`lib/api/documents.ts`, `app/(app)/documents/page.tsx`, `app/(app)/documents/[id]/page.tsx`,
`components/documents/**`, `components/document-editor/**`.

**Modified in the existing system:** `services/pricing-preview.ts` (three new exports, no
behavior change), `components/shell/nav-items.ts` (join adds a `documents` entry),
`e2e/pricing-preview.cy.ts` → ported to drive the document editor.

**Deleted:** `apps/frontend/src/app/(app)/editor/**` (the Phase 1 stateless demo route), at the
join.

**Untouched:** `contracts/errors/envelope.ts`, `contracts/pricing.ts`, `contracts/auth.ts`,
`api/plugins/**` (all four existing plugins — the fifth mutating route set attaches
`app.authenticate` the same way Phase 2's routes already do, no new plugin needed),
`persistence/repository.ts` (base helper, consumed not modified), `persistence/users.repository.ts`,
`src/pricing/**` (engine internals — only new exports at the `pricing-preview.ts` boundary),
`components/line-items/DiscountInput.tsx`/`LineItemRow.tsx` (extended in place by 3-D, not
replaced), `components/forms/**`.

## Tech Choices

| Area | Decision | Alternatives Considered | Rationale |
|----|----|----|----|
| Storage shape | Integer cents/thousandths/basis-points, embedded lines, one collection | Separate `lines` collection with a document reference; major-unit floats in Mongo | Brief's explicit plan decision (lines never outlive their document, finalize freezes the aggregate). Storing floats risks exactly the drift Phase 5's aggregation depends on being absent |
| Repository base | `DocumentsRepository` wraps `createOwnedRepository<StoredDocument>` (Phase 2's factory) plus a custom sorted `list` | A hand-written repository from scratch, like `users.repository.ts` | `users.repository.ts` is hand-written *because* users aren't owned by a user — the opposite is true here, so this is the base helper's first real consumer, exactly as ARCH-3 (A4) anticipated |
| Wire↔engine conversion reuse | Export `toEngineLine`/`fromEngineResult`/`findFailingLine` from `services/pricing-preview.ts`; `services/documents.ts` imports them | Duplicate the ~15-line mapping inside `services/documents.ts` | The brief says "do not reimplement any arithmetic" and "import [engine-errors.ts], do not write a second mapping" — extending that principle to the conversion helpers themselves keeps exactly one place that knows the wire/engine unit scale, at the cost of three `export` keywords on an existing file no lane owns this wave |
| Engine-error HTTP mapping | Reuse `api/errors/engine-errors.ts::mapPricingEngineError` unmodified by throwing the existing `PricingPreviewError` class from `services/documents.ts` | Write a `mapDocumentEngineError` specific to the documents domain | `mapPricingEngineError` only inspects `error.cause`/`error.lineIndex` on any `PricingPreviewError` instance — it is already domain-agnostic; a second mapper would be the exact duplication the brief warns against |
| Line identity | `crypto.randomUUID()`, Node built-in | Mongo `ObjectId` per line; a monotonic counter | No new dependency; embedded lines aren't their own Mongo documents so an `ObjectId` would be a borrowed identity with no collection behind it. `crypto.randomUUID` needs no server-side state to generate |
| `LineItem` input schema | `z.intersection(lineInputSchema, z.object({id: z.string().optional(), description}))` | A hand-copied object schema with the same numeric fields | Brief requires reusing "the same schema object, imported, not a second copy that can drift" — intersection is the only zod composition that preserves the original schema's `superRefine` behavior without re-declaring it |
| `SERVER_MANAGED_FIELD` detection | `totals`/`status` declared as optional fields on the create/update schema, checked present-or-absent in a `superRefine` | Rely on zod's default behavior of silently stripping unrecognized keys | The brief is explicit: "rejected on input, not ignored" — silent stripping is the one behavior it rules out |
| Per-line computed values | Never persisted; editor always re-derives them via `/pricing/preview` | Persist a `LineResult` per stored line alongside `LineItem` | Keeps the persisted shape exactly what the frozen contract defines (`LineItem` has no computed fields) and avoids a second place where discount/tax arithmetic could silently drift from the engine — the engine is the only place per-line numbers are ever computed, on every call |
| Route-to-service funnel | One `recomputeAndPersist(ownerId, id, fullLines)` internal function in `services/documents.ts`; all five mutating routes call it with the full resulting lines array | Per-route partial recompute (e.g. `addLine` only recalculates the new line) | A partial recompute can't detect `DISCOUNT_EXCEEDS_SUBTOTAL` triggered by a different line's edit interacting with document-level state, and duplicates the "recompute the whole thing" logic five times. `calculateDocument` is cheap (≤500 lines, pure function) so recomputing in full on every write has no meaningful cost |

## Patterns & Conventions

- **One contract file per domain** (`contracts/document.ts` owns this domain's schemas *and*
  error codes) — Phase 0 convention, followed here, third domain to use it.
- **Autoloaded routes, opt-in `app.authenticate`** — both new route files attach the preHandler
  explicitly, per Phase 2's established pattern; no route in this phase is public.
- **Ownership-scoped repository** — `DocumentsRepository` is the base helper's first real
  consumer, exactly as flagged in ARCH-3's Data Models section.
- **Route-level domain error mapping, one global fallback handler** — third use of the pattern
  `engine-errors.ts` established for pricing and (implicitly) auth's route-local catches.
- **Hand-written frontend mirror, no codegen** — `lib/api/types/document.ts` mirrors
  `contracts/document.ts` by hand, per Phase 0's mirroring rule.
- **Gate-owned shared frontend surface** — `lib/api/documents.ts` is written once by G3 because
  3-C and 3-D both import it in the same wave; neither page lane adds its own call.
- **Intentionally not applied this phase:** finalize/lock semantics, duplicate-as-draft, the
  numbered-document identifier (`Q-2026-015`) shown in the mockup — all explicit Phase 4/5
  territory per the brief's guardrails; `status` exists in the type as `'draft' | 'finalized'`
  but nothing in this phase ever writes `'finalized'`.

## Data Models

### `StoredDocument` (persisted, `documents` collection)

**Purpose:** the Mongo-resident shape; money/quantity/percent scaled to integers, matching what
the pricing engine natively computes in.

**Key fields:**
| Field | Type / Constraint | Notes |
|----|----|----|
| `_id` | ObjectId | Mongo default; string form is the wire `id` |
| `ownerId` | string | Set by `createOwnedRepository`'s `insertOne`; never client-supplied |
| `title` | string, 1..200 | |
| `customer` | string, 1..200 | |
| `issueDate` | string, `YYYY-MM-DD` | Never a `Date` — R3 |
| `status` | `'draft' \| 'finalized'` | This phase only ever writes `'draft'` |
| `lines` | `StoredLineItem[]` | Embedded, never a separate collection |
| `totals` | `StoredTotals` | Cents-based document rollup; recomputed on every write |
| `createdAt` / `updatedAt` | Date | `updatedAt` bumped on every mutating call |

**Relationships:** `ownerId` → `users._id` (Phase 2's collection), unenforced at the DB level per
this project's no-ODM, no-FK convention.

**Lifecycle:** created via `POST /documents`; metadata and lines mutate freely while
`status === 'draft'`; hard-deleted via `DELETE /documents/:id`. Finalization (locking) is Phase 4.

### `StoredLineItem` (embedded in `StoredDocument.lines`)

| Field | Type / Constraint | Notes |
|----|----|----|
| `id` | string (`crypto.randomUUID()`) | Server-minted; stable across updates (R13) |
| `description` | string, 1..200 | Required — `DESCRIPTION_REQUIRED` if empty |
| `quantity` | integer, thousandths | e.g. `2.5` → `2500` |
| `unitPrice` | integer, cents | |
| `discount` | `{type:'none'} \| {type:'percent',value: basis points} \| {type:'fixed',value: cents}` | Mirrors `src/pricing`'s `Discount` shape at the stored scale |
| `taxPercent` | integer basis points, nullable | |

**Relationships:** owned exclusively by its parent `StoredDocument` — never queried or referenced
independently.

**Lifecycle:** created on document creation or `POST .../lines`; updated via `PATCH .../lines/:id`
or a whole-array `PATCH /documents/:id`; removed via `DELETE .../lines/:id`.

### `StoredTotals`

| Field | Type | Notes |
|----|----|----|
| `subtotal`, `totalDiscount`, `totalTax`, `grandTotal` | integer, cents | Output of `calculateDocument`, persisted as-is (no rounding at this layer — the engine already rounded) |

### `DocumentResponse` / `LineItemResponse` (wire, not persisted)

Exactly the `Document`/`LineItem` shapes frozen in the issue brief — major-unit numbers, no
`ownerId`. `LineItemResponse` carries no computed fields (R30); `DocumentTotals` on the response
mirrors `StoredTotals` converted through `fromCents`/`fromThousandths`/`fromBasisPoints`.

**Lifecycle:** constructed fresh by `services/documents.ts` on every response — never itself
persisted.

## API Contracts / Interfaces

### Document routes (HTTP)

**Boundary:** Fastify routes, `apps/backend/src/api/routes/documents.ts` +
`apps/backend/src/api/routes/document-lines.ts`. All eight attach `app.authenticate`.

| Method | Path | Purpose | Errors / Returns |
|----|----|----|----|
| `GET` | `/api/v1/documents` | Owner-scoped list, newest-first, `lines` omitted | 200 `DocumentResponse[]` (summary shape) |
| `POST` | `/api/v1/documents` | Create (title/customer/issueDate/optional lines) | 201 `DocumentResponse` · 400 `VALIDATION_FAILED` (`TITLE_REQUIRED`, `CUSTOMER_REQUIRED`, `ISSUE_DATE_INVALID`, per-line codes, `SERVER_MANAGED_FIELD`) |
| `GET` | `/api/v1/documents/:id` | Full document incl. lines | 200 `DocumentResponse` · 404 `DOCUMENT_NOT_FOUND` |
| `PATCH` | `/api/v1/documents/:id` | Partial metadata update, optional whole-lines-array replace | 200 `DocumentResponse` · 400 (as above) · 404 `DOCUMENT_NOT_FOUND` |
| `DELETE` | `/api/v1/documents/:id` | Hard delete | 204 · 404 `DOCUMENT_NOT_FOUND` |
| `POST` | `/api/v1/documents/:id/lines` | Append one line | 200 `DocumentResponse` · 400 (per-line codes) · 404 `DOCUMENT_NOT_FOUND` |
| `PATCH` | `/api/v1/documents/:id/lines/:lineId` | Update one line | 200 `DocumentResponse` · 400 (per-line codes) · 404 `DOCUMENT_NOT_FOUND` / `LINE_NOT_FOUND` |
| `DELETE` | `/api/v1/documents/:id/lines/:lineId` | Remove one line | 200 `DocumentResponse` · 404 `DOCUMENT_NOT_FOUND` / `LINE_NOT_FOUND` |

**Auth requirements:** every route requires a valid session; another user's document/line id is
404, never 403 (R7).

### Module boundaries (not HTTP)

| Signature | Purpose | Errors / Returns |
|----|----|----|
| `createDocumentsRepository(db): DocumentsRepository` | `list`, `findById`, `insert`, `update`, `remove`, every method `ownerId`-first | Driver-native results; no error translation |
| `services/documents.ts: recomputeAndPersist(ownerId, id \| null, metadata, lines): Promise<StoredDocument>` | Central write path — engine recompute, id preservation, persist | Throws `PricingPreviewError` (reused) on an engine rejection; throws `{code: DOCUMENT_NOT_FOUND}` on a missing id |
| `services/pricing-preview.ts: toEngineLine`, `fromEngineResult`, `findFailingLine` | Newly exported wire↔engine helpers | Unchanged behavior, now reusable outside the module |
| `toDocumentResponse(stored: StoredDocument): DocumentResponse` | The one Stored→Response mapper (R2) | Pure function, no I/O |

## Module Boundaries

| Module / Package | Responsibility | Allowed Dependencies |
|----|----|----|
| `apps/backend/src/contracts/document.ts` | zod schemas (incl. the `lineInputSchema` intersection), this domain's error codes | `zod`, `contracts/pricing.ts` (imports `lineInputSchema`, read-only) |
| `apps/backend/src/domain/document.ts` | `StoredDocument`/`StoredLineItem`/`StoredTotals` types only | `mongodb` types only (mirrors `domain/user.ts`) |
| `apps/backend/src/persistence/documents.repository.ts` | `documents` collection access, `ownerId`-scoped | `mongodb`, `persistence/repository.ts`, `domain/document.ts` |
| `apps/backend/src/services/documents.ts` | Recompute-on-write, id preservation, Stored↔Response mapping, domain error throws | `src/pricing/**` (via reused helpers), `services/pricing-preview.ts` (three new exports), `persistence/documents.repository.ts` |
| `apps/backend/src/api/routes/documents.ts`, `document-lines.ts` | HTTP wiring — validate, call service, map errors to status | `contracts/document.ts`, `services/documents.ts`, `api/errors/engine-errors.ts` |
| `apps/frontend/src/lib/api/types/document.ts` | Mirrored types + error codes | none (leaf) |
| `apps/frontend/src/lib/api/documents.ts` | Typed `list/get/create/update/remove` + 3 line calls | `lib/api/client.ts` (read-only), `lib/api/types/document.ts` |
| `apps/frontend/src/components/documents/**` | List page UI | `lib/api/documents.ts`, `lib/api/types/document.ts`, `components/forms/**` |
| `apps/frontend/src/components/document-editor/**`, `components/line-items/**` (extended) | Editor UI, id-aware line-items table | `lib/api/documents.ts`, `lib/api/pricing.ts` (still used for live preview), `lib/api/types/document.ts` |

**Rule carried forward from Phases 1–2:** the HTTP layer never does arithmetic on money, and no
route ever queries `documents` without an `ownerId` in hand — this phase's equivalent of both
prior phases' foundational rule, now exercised for the first time against a mutable, multi-write
resource instead of a stateless preview or an identity collection.

## Change Footprint

### New files / modules

| Path | Purpose | Pattern reference |
|----|----|----|
| `apps/backend/src/contracts/document.ts` | Schemas + error codes | `contracts/pricing.ts` (schema+codes-in-one-file), `contracts/auth.ts` (superRefine → `params.code` for domain codes) |
| `apps/backend/src/domain/document.ts` | `StoredDocument`/`StoredLineItem`/`StoredTotals` | `domain/user.ts` |
| `apps/backend/src/persistence/documents.repository.ts` | `DocumentsRepository`, built on `createOwnedRepository` | `persistence/users.repository.ts` (shape), `persistence/repository.ts` (the base it wraps) |
| `apps/backend/src/persistence/documents.repository.test.ts` | Colocated unit tests | `persistence/repository.test.ts` |
| `apps/backend/src/services/documents.ts` | `recomputeAndPersist`, Stored↔Response mapping | `services/pricing-preview.ts` |
| `apps/backend/src/services/documents.test.ts` | Colocated unit tests (recompute-on-write, id preservation) | `services/auth.test.ts` |
| `apps/backend/src/api/routes/documents.ts` | 5 document-level routes | `api/routes/auth.ts` (route-local error mapping) |
| `apps/backend/src/api/routes/document-lines.ts` | 3 nested line routes | same |
| `apps/backend/test/support/factories.ts` | Authenticated-user + payload builders, reused by Phases 4–5 | new — first file in `test/support/` beyond `db.ts` |
| `apps/backend/test/api/documents.test.ts`, `document-lines.test.ts`, `validation-codes.test.ts` | Route-level tests | `test/api/auth.test.ts`, `test/api/pricing-preview.test.ts` |
| `apps/backend/test/integration/ownership.test.ts` | Table-driven isolation tests over all 6 id-scoped routes | `test/integration/users.test.ts` |
| `docs/contracts/phase-3.md` | Human-readable contract snapshot | `docs/contracts/phase-2.md` |
| `apps/frontend/src/lib/api/types/document.ts` | Mirrored types + codes | `lib/api/types/auth.ts` |
| `apps/frontend/src/lib/api/documents.ts` | Typed client, whole route table | `lib/api/pricing.ts`, `lib/api/auth.ts` |
| `apps/frontend/src/app/(app)/documents/page.tsx` + `components/documents/**` | List, empty state, delete dialog | `app/(auth)/**` (client component shape), `design/htmls/documents.html` |
| `apps/frontend/src/app/(app)/documents/[id]/page.tsx` + `components/document-editor/**` | Editor page | `app/(app)/editor/page.tsx` (being retired — direct structural ancestor), `design/htmls/document-edit.html` |
| `e2e/documents.cy.ts` | J3's Cypress happy path | `e2e/pricing-preview.cy.ts` (being ported, not just referenced) |

### Modified files / modules

| Path | What changes here |
|----|----|
| `apps/backend/src/services/pricing-preview.ts` | Export `toEngineLine`, `fromEngineResult`, `findFailingLine` (currently module-private) — no behavior change |
| `apps/frontend/src/components/line-items/row-state.ts` | `RowState` gains an optional `id?: string`; `toLineInputs` unaffected (still produces wire `LineInput`, id is carried alongside, not through it) |
| `apps/frontend/src/components/line-items/LineItemRow.tsx`, `LineItemsTable.tsx` | Accept/forward the optional row id so the editor can echo it back on save |
| `apps/frontend/src/components/shell/nav-items.ts` | Join adds `{ href: '/documents', label: 'Documents' }` |

### Deleted / replaced

| Path | Reason |
|----|----|
| `apps/frontend/src/app/(app)/editor/**` (page, module CSS, test) | Superseded by `documents/[id]` — the plan's own J3 checklist item; leaving both ships a dead screen |

### Touched but not changed (silent-regression hotspots)

| Path | Why it matters |
|----|----|
| `apps/backend/src/api/errors/engine-errors.ts` | Consumed unmodified by the new write path — its `mapPricingEngineError` must keep working for a `PricingPreviewError` thrown from a context other than the original preview route. Verified in the Tech Choices row above; no code change, but it's now called from two call sites instead of one |
| `apps/backend/src/api/plugins/authenticate.ts` | Attached by 8 new routes for the first time outside Phase 2's own auth routes — first real proof the opt-in preHandler pattern generalizes |
| `apps/backend/src/persistence/repository.ts` | First real consumer beyond ARCH-3's own tests — `createOwnedRepository`'s `insertOne`/`updateOne`/`deleteOne` signatures get exercised by a second collection for the first time |
| `apps/frontend/src/lib/api/pricing.ts` (`preview`) | Continues to be called from the editor after this phase lands (R30) — must not regress under the assumption that Phase 3 replaces it; it stays the sole source of per-line display numbers |
| `e2e/pricing-preview.cy.ts` | Ported rather than deleted — the `421.50` assertion must survive the route change from `/editor` to `/documents/[id]` |
| `apps/frontend/src/components/shell/Topbar.tsx` / `NavSlot.tsx` | Already render nav items generically; adding one entry is additive, no consumer assumed a fixed-length list (grepped — none) |

## Areas of Impact

| Area | Impact | Risk (L/M/H) | Why |
|----|----|----|----|
| `persistence/documents.repository.ts` (new) | Second real consumer of `createOwnedRepository`, first mutable multi-field collection | M | Any gap in the ownership filter here is a cross-user data leak, the exact failure mode Phase 2's whole design exists to prevent structurally. Mitigated by the required-first-parameter typecheck plus R17's table-driven isolation tests |
| `services/pricing-preview.ts` (3 new exports) | First file two phases' service layers both depend on | L | Purely additive (export keyword only); the existing `pricing-preview.test.ts` and `test/api/pricing-preview.test.ts` are unaffected since the exported functions' behavior is unchanged |
| `services/documents.ts` (new, central write path) | Every mutating route in this phase funnels through one function | M | Concentrating all writes in `recomputeAndPersist` is deliberate (correctness), but makes it a single point of failure for the whole phase — a bug here breaks all 5 mutating routes at once rather than one. Mitigated by R18/R19/R20's error-code and round-trip test coverage |
| `apps/frontend/src/app/(app)/editor/**` (deleted) | Removes the only screen currently exercising the pricing engine end-to-end pre-Phase-3 | L | Explicit plan decision (J3 checklist); `e2e/documents.cy.ts` covers the same ground plus persistence, and `pricing-preview.ts`'s own unit/API tests are untouched |
| Frontend route structure | Second and third pages under `(app)/`, first with a dynamic `[id]` segment | L | Follows the existing `(app)` guard from ARCH-3; no new layout needed |
| `docs/contracts/phase-3.md` | New human-readable contract the next phase's gates (G4/G5) read from | L | Documentation-only; Phase 4/5 gates cite it the same way this phase cites `phase-2.md`'s ownership rule |

**Contract changes:** none to `health.ts`, `pricing.ts`, `auth.ts`, `envelope.ts` — all frozen and
unmodified. `document.ts` is wholly new. `services/pricing-preview.ts` gains exports but no
signature or behavior change to `previewPricing` itself — `POST /pricing/preview` is unaffected.

**Cross-cutting ripples:** none into telemetry, feature flags, or the build pipeline. The one
migration-adjacent note: this is the first collection besides `users` — `indexes.ts`'s registry
pattern (from ARCH-3) is available if a `documents` index becomes necessary, but nothing in this
phase's query patterns (`ownerId` + optional `_id`, always through the single-document repository
methods) requires one yet; Phase 5's aggregation may.

## Cross-Cutting Concerns

- **Errors:** validation failures (zod, incl. the `SERVER_MANAGED_FIELD`/per-line custom codes)
  flow through the existing, unmodified global handler and `envelope-mapper.ts` — no amendment
  needed, since `params.code` support already exists from Phase 1. Engine failures
  (`DISCOUNT_EXCEEDS_SUBTOTAL` etc.) and `DOCUMENT_NOT_FOUND`/`LINE_NOT_FOUND` are caught and
  mapped route-locally, mirroring `auth.ts`/`pricing.ts`'s existing pattern. Unmapped errors
  (e.g. a Mongo outage mid-write) fall through to `500 INTERNAL_ERROR`.
- **Logging & metrics:** no new fields beyond what `error-handler.ts` already logs (`err`, `code`).
  No document content (title, customer, line descriptions) is ever logged deliberately — worth a
  grep-based regression check at review time, not a new safeguard.
- **Auth & authz:** every route requires `app.authenticate`; authorization is entirely the
  `ownerId` filter — no roles, no per-document sharing, consistent with Phase 2's single-tenant
  model. 404-not-403 is the deliberate anti-enumeration choice, restated from R7.
  **Isolation is the second scored claim of this phase** — the table-driven test structure (R17)
  is verification for R7, `SERVER_MANAGED_FIELD` for R5, per-line codes for R6.
- **Performance & scale:** `calculateDocument` over ≤500 lines is a pure in-memory loop, negligible
  cost per write even though it runs on every mutation (Tech Choices row). `find()` for the list
  route is `ownerId`-filtered and sorted by two fields with no index this phase — acceptable at
  demo scale; flagged above as a Phase 5 candidate if it becomes a hot path.
- **Security:** validation boundary is the zod schema at the route edge, same as every prior
  phase. `ownerId` never arrives from the client — it's injected by `createOwnedRepository` from
  `request.userId`, which itself only ever comes from a verified JWT. `SERVER_MANAGED_FIELD`
  closes the specific hole of a client dictating its own totals.
- **Migrations & rollout:** net-new collection, no existing data to migrate, no index required
  yet. Rollback is a plain deploy revert — Phase 2 already proved this pattern; nothing here is
  additionally stateful.

## Architecture Decisions Log

| # | Decision | Alternatives | Chosen Because | Satisfies REQs |
|----|----|----|----|----|
| A1 | `DocumentsRepository` wraps `createOwnedRepository<StoredDocument>` | Hand-written, like `users.repository.ts` | This is the base helper's intended first real consumer per ARCH-3 (A4) — `users` was deliberately the exception, not the template | R8, R10 |
| A2 | Export `toEngineLine`/`fromEngineResult`/`findFailingLine` from `services/pricing-preview.ts` | Duplicate the conversion in `services/documents.ts` | Brief's "do not reimplement any arithmetic" / "do not write a second mapping" principle extended to the unit-conversion layer itself | R12, R15, R25, R26 |
| A3 | Reuse `PricingPreviewError` + `mapPricingEngineError` unmodified for document writes | A `mapDocumentEngineError` specific to this domain | The existing mapper is already error-shape-generic, not preview-route-specific; a second mapper would itself be the duplication the brief warns against | R15 |
| A4 | Line ids: `crypto.randomUUID()`, server-minted, echoed back on PATCH to preserve | Mongo `ObjectId` per embedded line; client-supplied ids | Embedded lines have no collection behind them, so `ObjectId` would be a borrowed identity; `crypto.randomUUID` needs no server state and is a Node 22 built-in (already the frozen runtime) | R13, R27 |
| A5 | `LineItem` input schema as `z.intersection(lineInputSchema, {id, description})` | Hand-copy the numeric fields into a new schema | Only composition that reuses Phase 1's actual schema object (with its `superRefine`) rather than a second copy that can drift, per the brief's explicit instruction | R1, R28 |
| A6 | `SERVER_MANAGED_FIELD` via explicit optional-forbidden fields + `superRefine` | Rely on zod's default silent key-stripping | Brief: "rejected on input, not ignored" — silent stripping is the one behavior explicitly ruled out | R5, R20, R29 |
| A7 | Per-line computed values never persisted; editor always re-derives via `/pricing/preview` | Persist a `LineResult` per stored line | Keeps the persisted/response `LineItem` shape exactly as the frozen contract defines it (no computed fields) and keeps the engine the single source of per-line numbers, at load and after save alike | R1, R23, R30 |
| A8 | One `recomputeAndPersist` funnel for all 5 mutating routes | Per-route partial recompute | A partial recompute can miss a cross-line engine rejection and duplicates "recompute the whole document" logic five times; `calculateDocument` is cheap enough that full recompute has no real cost | R12, R14 |
| A9 | List route omits `lines` from the response payload | Return full documents from `GET /documents` and let the client discard `lines` | Brief's explicit instruction (3-A step 7); avoids shipping potentially hundreds of lines' worth of data to a screen that only shows a total |

## Risk & Stress-Test Scenarios

### Forward — runtime failure scenarios

| Scenario | How the Design Handles It |
|----|----|
| Two concurrent `PATCH`es to the same document (metadata race) | Mongo's per-document `updateOne` is atomic per call; the last write wins on whichever fields it touched — no optimistic-lock/version field exists this phase (not required by the brief); a lost-update race under true concurrency is a known, accepted gap, not silently different from any other single-document Mongo write in this codebase |
| A `PATCH .../lines/:lineId` for a line id that doesn't exist on the document | `LINE_NOT_FOUND`, distinct from `DOCUMENT_NOT_FOUND` — the repository confirms the document is owned first, then the service checks the line id against the loaded array |
| Mongo unreachable for 30s during a write | Uncaught driver error falls through the domain-error catch → global handler → `500 INTERNAL_ERROR`, same as Phase 2's equivalent gap — not this phase's job to add retry/fallback |
| `documents` collection growing to 10M rows | List query is `ownerId`-filtered first (equality match), so even an unindexed sort operates over one owner's subset, not the whole collection; flagged in Areas of Impact as a Phase 5 index candidate if it becomes measurably slow |
| Rollback after a bad deploy | Net-new collection; a plain deploy revert loses no other phase's data. Any documents created between deploy and rollback are simply orphaned data, acceptable at this project's stage |
| A malformed `discount` payload reusing Phase 1's exact validation | Falls through to the same `superRefine` issues Phase 1 already tests — this phase adds no new numeric-validation surface, only the wrapper fields |

### Backward — regression risk per touched area

| Touched area | What could regress | How we'd know / mitigation |
|----|----|----|
| `services/pricing-preview.ts` | Exporting three previously-private functions could tempt a future edit to change their signatures without checking both call sites | Both `pricing-preview.test.ts` (existing) and `services/documents.test.ts` (new) exercise them; running the full suite as part of "done when" catches a signature drift immediately |
| `apps/backend/src/api/errors/engine-errors.ts` | A second call site (`services/documents.ts`) means any future change here now affects two routes' error shapes at once | `test/api/pricing-preview.test.ts` (existing, unmodified expectations) plus the new `documents.test.ts` engine-error cases both pin the mapper's output |
| `apps/frontend/src/components/line-items/row-state.ts` / `LineItemRow.tsx` / `LineItemsTable.tsx` | Adding an optional `id` field could regress Phase 1's own stateless usage if any component assumed the field's absence | These components are only ever instantiated by the (soon-deleted) `/editor` page and the new `/documents/[id]` editor — once `/editor` is deleted at J3, there's no remaining stateless-only consumer to regress. Verify with `apps/frontend`'s full test + build as part of "done when" |
| `e2e/pricing-preview.cy.ts` → ported | The `421.50` assertion could silently stop being exercised if the port is incomplete | J3's checklist explicitly requires the ported spec to still assert `421.50`, now against `/documents/[id]` instead of `/editor` |
| `apps/backend/src/persistence/repository.ts` | A second collection could expose an untested edge in `createOwnedRepository` (e.g. `insertOne`'s `Omit<..., 'ownerId'>` typing) that `users.repository.ts` never exercised since it doesn't use the helper | `documents.repository.test.ts` covers the same five methods ARCH-3's `repository.test.ts` already covers, now against a real consumer |

## Open Questions

- Should `PATCH /documents/:id/lines/:lineId` accept a partial line update (only the changed
  fields) or require the full line object?
  - **Impact if unresolved:** ambiguous whether a client must resend `description`/`quantity`/etc.
    unchanged or can omit them.
  - **Suggested default:** partial update (only send changed fields), consistent with the
    document-level `PATCH`'s "partial update over metadata" behavior (R5) and standard REST PATCH
    semantics — `generate-tasks` should confirm this against the frozen contract doc once G3
    writes it, since the brief itself doesn't specify.
- Does an empty `lines: []` array on create/update need its own validation rule (e.g. reject a
  document with zero lines), or is a document with no lines yet a valid draft state?
  - **Impact if unresolved:** an empty-lines document could confuse Phase 5's aggregation if
    treated as an edge case there instead of here.
  - **Suggested default:** allow zero lines — the mockup's own screenshots show a document mid-edit
    with a "+ Add line" affordance implying a document can transiently have none; `totals` would
    simply be all-zero. No brief guardrail forbids it.

## Out of Scope

- Finalize/lock semantics, the `DOCUMENT_FINALIZED` status transition, immutability guards
  (reason: explicit Phase 4 territory — G4/4-A/4-B per `docs/implementation-phases.md`)
- Duplicate-as-draft action (reason: explicit Phase 4 territory — 4-D, gated on J4 passing first)
- The human-readable document number (`Q-2026-015`) shown in the mockup (reason: not in the
  frozen `Document` shape the brief defines this phase — `id` is the only identifier; introducing
  a second, sequential identifier is a scope addition not requested by the brief)
- Report/summary aggregation, date-range filtering on `issueDate` (reason: explicit Phase 5
  territory — G5/5-A)
- An optimistic-concurrency/version field on `StoredDocument` (reason: not requested by the brief;
  flagged as a known, accepted gap under Risk & Stress-Test rather than designed for speculatively)
- A `documents` collection index (reason: current query patterns don't need one at this project's
  scale; flagged as a Phase 5 candidate in Areas of Impact rather than added preemptively)

---

# Tasks

Tasks live in a sibling file, not inline — see
`specs/architecture/ARCH-4-documents-line-items-validation-tasks.md` (same convention as issue
#1's `ARCH-1-skeleton-lane-briefs.md` / `ARCH-1-tasks.md` pair, and issue #3's
`ARCH-3-auth-ownership.md` / `ARCH-3-auth-ownership-tasks.md` pair).
