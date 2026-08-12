# Phase 3 — Documents, line items, validation (lane briefs)

GitHub issue: #4

Plan context: `docs/implementation-phases.md` § Phase 3. Rules: `docs/parallel-execution.md`.
**Requirements 2 and 6. Retires: Validation.**

```
G3 ──► ┌─ 3-A backend CRUD ────────┐
       ├─ 3-B validation/isolation ┤
       ├─ 3-C documents list UI ───┤ ──► J3
       └─ 3-D editor persistence ──┘
```

Four lanes, the widest wave in the project. `3-B` is a test-only lane: it owns `test/api/**` and `test/integration/**` for this phase and writes them against the frozen contract, not against 3-A's implementation. It will be red until 3-A lands. That is the point — it is written blind to the implementation, so it tests the contract rather than the code that happens to exist.

---

## Gate G3 — Document contract

**Agent** backend-engineer · **Depends on** J1 (pricing contract settled), G2 (ownership rule) · **Blocks** 3-A, 3-B, 3-C, 3-D

**Mission** Fix the document and line-item shapes, the full route table, the error-code enum the UI renders against, and the repository interface — precisely enough that a test lane can be written before the implementation exists.

**Owns** `apps/backend/src/contracts/document.ts` (schemas **and** this domain's error codes), `apps/backend/src/domain/document.ts` (types only), `apps/frontend/src/lib/api/types/document.ts`, `apps/frontend/src/lib/api/documents.ts`, `docs/contracts/phase-3.md`

**Build**
1. Document shape:
   ```ts
   Document {
     id: string
     ownerId: string          // never serialized to the client
     title: string            // 1..200
     customer: string         // 1..200
     issueDate: string        // ISO date, YYYY-MM-DD, no time component
     status: 'draft' | 'finalized'
     lines: LineItem[]
     totals: DocumentTotals   // server-computed, never accepted from the client
     createdAt, updatedAt: string
   }
   LineItem { id, description, quantity, unitPrice, discount, taxPercent }
   ```
   `LineItem`'s numeric fields reuse Phase 1's `LineInput` shape exactly — the same schema object, imported, not a second copy that can drift. Lines are **embedded** in the document (plan decision): they never outlive it, finalize freezes the aggregate, and a write stays inside one document with no transaction.
2. **Two representations, one mapper — freeze both.** The plan stores money as integer cents; the wire carries major-unit JSON numbers. Declare them as separate types so no lane has to guess:

   - `StoredDocument` / `StoredLineItem` — money in **cents**, quantity in **thousandths**, percentages in **basis points**. This is what Mongo holds, and what Phase 5's aggregation sums.
   - `DocumentResponse` / `LineItemResponse` — money in **major units**, quantity and percentages as decimals. This is what every route returns.
   - One mapper at the repository/service boundary, named here, converting in both directions.

   Without this, 3-A may legitimately persist major-unit floats while 5-A's aggregation assumes cents. Both would pass their own tests, and the report would be quietly wrong at scale — the exact drift the PDF's "avoid floating-point drift" line is about. The `Document` shape below is the **response** shape.

3. `issueDate` is a calendar date, stored as a `YYYY-MM-DD` string, not a `Date`. Phase 5 filters ranges on it and a timezone-shifted timestamp is how a document lands in the wrong month. Write that reason into the contract doc; Phase 5 and the README both cite it.
3. Route table, frozen here — Phase 4's immutability test enumerates it, so it must be complete:

   | Method | Path | Mutating |
   |---|---|---|
   | GET | `/api/v1/documents` | no |
   | POST | `/api/v1/documents` | yes — **creates**, so never lifecycle-guarded (see G4) |
   | GET | `/api/v1/documents/:id` | no |
   | PATCH | `/api/v1/documents/:id` | yes |
   | DELETE | `/api/v1/documents/:id` | yes |
   | POST | `/api/v1/documents/:id/lines` | yes |
   | PATCH | `/api/v1/documents/:id/lines/:lineId` | yes |
   | DELETE | `/api/v1/documents/:id/lines/:lineId` | yes |

   Nested line routes exist so that the PDF's "CRUD for documents **and line items**" is obviously satisfied, without a second collection.
4. Create/update schemas: create takes title, customer, issueDate, and optional lines. **`status` and `totals` are rejected on input, not ignored** — a client that sends totals should hear about it, since the whole point is that the server owns them. PATCH is a partial update over metadata and, optionally, the whole lines array.
5. Error codes, exported from `contracts/document.ts` itself: `DOCUMENT_NOT_FOUND`, `TITLE_REQUIRED`, `CUSTOMER_REQUIRED`, `ISSUE_DATE_INVALID`, `LINE_NOT_FOUND`, `DESCRIPTION_REQUIRED` (a line description is required, 1..200 characters), `SERVER_MANAGED_FIELD` — on top of Phase 1's per-line codes, which apply unchanged to persisted lines.
6. **404, not 403, for another user's document.** State it here. A 403 confirms the id exists, which is a leak; 404 is also simpler to implement correctly, because it falls out of an owner-scoped query returning nothing.
7. Repository interface `DocumentsRepository`, every method taking `ownerId` first, per G2's rule. 3-A implements it; 3-B writes tests against it.
8. Mirror the document types and the full code enum into `apps/frontend/src/lib/api/types/document.ts`.
9. **Write the frontend's typed client for the whole route table** — `apps/frontend/src/lib/api/documents.ts` with `list`, `get`, `create`, `update`, `remove`, and the three line calls, each a thin wrapper over `client.ts`. It belongs to the gate rather than to a page lane because **3-C and 3-D both import it in the same wave**; whichever owned it would block the other. A gate-owned client is the same principle as gate-owned types: shared surface is written once, before the lanes fan out. Write `docs/contracts/phase-3.md` with the route table, both schemas, the error codes with their triggering conditions and field paths, and the 404 rule.

**Done when** both apps typecheck and `docs/contracts/phase-3.md` documents every route and every code.

**Guardrails** No implementation, no route registration, no repository body.

---

## Lane 3-A — Backend documents and line items

**Agent** backend-engineer · **Depends on** G3, J2 · **Parallel with** 3-B, 3-C, 3-D

**Mission** The full route table, persisted, owner-scoped, with totals recomputed by the Phase 1 engine on every write.

**Owns** `apps/backend/src/api/routes/documents.ts`, `apps/backend/src/api/routes/document-lines.ts`, `apps/backend/src/services/documents.ts`, `apps/backend/src/persistence/documents.repository.ts`, colocated `*.test.ts`

**Reads, never edits** `src/contracts/document.ts`, `src/pricing/**`, `src/persistence/repository.ts`, `src/api/plugins/authenticate.ts`

**Build**
1. `documents.repository.ts` implementing G3's interface on G2's base. Every method takes `ownerId` first and puts it in the filter. Never `findById` then compare — the filter is `{ _id, ownerId }`, and a miss is a miss regardless of why.
2. Route files go in `src/api/routes/` and autoload themselves — never edit `app.ts`. Every route attaches 2-A's `authenticate` preHandler. No route in this lane is public.
3. **Totals are recomputed by `calculateDocument` on every write and persisted with the document.** The client's numbers are never trusted, even when they are correct. A read returns stored totals; a write recomputes from scratch over the whole lines array. Do not reimplement any arithmetic here — import the engine.
4. Line ids are server-generated and stable across updates (the UI keys errors and rows by them). A PATCH that replaces the lines array preserves ids where the client sent them and mints ids where it did not.
5. Every validation failure carries a specific code and a field path in `details[]`: `lines.2.quantity` for a nested failure, `issueDate` for a metadata one. This is the scored row — a generic 400 with "invalid input" fails it regardless of how correct the rest is.
6. Engine errors (`DISCOUNT_EXCEEDS_SUBTOTAL` and friends) map to HTTP through **`src/api/errors/engine-errors.ts`**, which 1-B created for exactly this reason. Import it. Do not write a second mapping — a copy here is how the preview endpoint and the persisted path start disagreeing about the same input.
7. Listing: newest first by `issueDate` then `createdAt`, owner-scoped, with `lines` omitted from the list payload (the list page shows totals and metadata only).
8. Unit tests colocated for the service's recompute-on-write behavior and for id preservation. The API and integration tests belong to 3-B — do not write into `test/api/**` or `test/integration/**`.

**Done when** `cd apps/backend && npx vitest run src/api src/services src/persistence` is green and every route in G3's table exists.

**Guardrails** No finalize route, no immutability guard, no duplicate endpoint — Phase 4. Do not write in `test/api/**` or `test/integration/**`; that is 3-B's, and you will collide.

---

## Lane 3-B — Validation and isolation tests

**Agent** test-engineer · **Depends on** G3 · **Parallel with** 3-A, 3-C, 3-D

**Mission** Prove the two scored claims of this phase — that errors are *specific*, and that users cannot see each other's data — writing only against the contract.

**Owns** `apps/backend/test/api/documents.test.ts`, `apps/backend/test/api/document-lines.test.ts`, `apps/backend/test/api/validation-codes.test.ts`, `apps/backend/test/integration/ownership.test.ts`, `apps/backend/test/support/factories.ts`

**Reads, never edits** `docs/contracts/phase-3.md`, `src/contracts/**`, `test/support/db.ts`, `test/fixtures/pdf-sample.ts`

**Build**
1. `test/support/factories.ts` — helpers to create an authenticated user with a cookie, and to build valid document and line payloads with overrides. Phases 4 and 5 reuse this file; design it for them.
2. **Ownership isolation, every id-scoped route.** Six of the eight routes in G3's table take a document id; `GET /documents` and `POST /documents` do not, and cannot target another user's document. For each of those **six**, user B receives **404** against user A's document — not 403, not 200 with empty data. Table-driven over the filtered route list, so adding a route and forgetting the test is visible.
3. Also assert isolation on the list route: A's documents never appear in B's listing, including when B has none of their own.
4. **One test per error code, asserting the code and the field path** — not just the status. Cover `TITLE_REQUIRED`, `CUSTOMER_REQUIRED`, `ISSUE_DATE_INVALID`, `QUANTITY_TOO_LOW`, `UNIT_PRICE_NEGATIVE`, `TAX_PERCENT_OUT_OF_RANGE`, `DISCOUNT_PERCENT_OUT_OF_RANGE`, `DISCOUNT_TYPE_CONFLICT`, `DISCOUNT_EXCEEDS_SUBTOTAL`, `SERVER_MANAGED_FIELD`, `DOCUMENT_NOT_FOUND`, `LINE_NOT_FOUND`. A failure carrying the right status and the wrong code is a failure.
5. Round-trip correctness: create a document with the PDF's three sample lines from the fixture, read it back, and assert stored totals are `450.00 / 40.00 / 11.50 / 421.50`.
6. The client is not the source of truth — **two separate tests**, because the contract rejects client totals rather than ignoring them, so one request cannot demonstrate both:
   - a payload containing `totals` (or `status`) is rejected with `SERVER_MANAGED_FIELD` and the offending field's path;
   - a normal payload with no `totals` persists server-computed values that match the engine exactly.
7. Persistence of ids: a PATCH that edits one line leaves the other lines' ids unchanged.

**Working red is expected.** 3-A is being written in another terminal. Write against `docs/contracts/phase-3.md` and do not adapt a test to whatever 3-A happens to have produced — a disagreement between this lane and 3-A is exactly what the join needs to see.

**Done when** every test above exists and either passes or fails against a missing/incorrect route (never against a compile error in your own file). Record the pass/fail split in `specs/lanes/3-B.md`.

**Guardrails** Write no source outside `test/`. If a test cannot be expressed against the contract, that is an amendment request, not a reason to guess.

---

## Lane 3-C — Documents list

**Agent** frontend-engineer · **Depends on** G3, J2 · **Parallel with** 3-A, 3-B, 3-D

**Mission** The documents index from the mockup: empty state, status, totals, delete with confirmation.

**Owns** `apps/frontend/src/app/(app)/documents/page.tsx`, `apps/frontend/src/components/documents/**` (list, row, empty state, delete dialog), colocated `*.test.tsx`

**Reads, never edits** `src/lib/api/types/document.ts`, `src/lib/api/documents.ts` (G3's), `lib/api/client.ts`, `design/htmls/documents.html`, `src/styles/tokens.css`, `components/forms/**`

**Build**
1. Call the API through G3's `lib/api/documents.ts`, which already covers the whole route table. You do not own it — if something is missing, request it as a contract amendment rather than adding a call of your own, since 3-D is importing the same file right now.
2. The list from `design/htmls/documents.html`: title, customer, issue date, status pill, grand total, right-aligned tabular numerals. Draft and finalized are visually distinct — Phase 4 gives finalized real consequences, and the affordance should already exist.
3. Empty state with a create action. This is the first screen a reviewer sees after signing up; a blank table reads as broken.
4. Create flow — title, customer, issue date — reusing 2-B's form primitives, rendering field errors from `details[]`.
5. Delete with confirmation. Deleting a document is irreversible; the dialog says which document, by title.
6. Loading and failure states for the list. An API failure shows a retry, not an infinite skeleton.
7. Component test for the delete dialog (confirm calls the API, cancel does not) and for the empty state. Skip snapshot tests of the table.

**Done when** `cd apps/frontend && npm test && npm run build` exits zero.

**Guardrails** No arithmetic — display server totals as received. No editor work; 3-D owns it.

---

## Lane 3-D — Editor persistence

**Agent** frontend-engineer · **Depends on** G3, J2 · **Parallel with** 3-A, 3-B, 3-C

**Mission** Take 1-C's stateless editor and give it a document: load, edit, save, reload, still correct.

**Owns** `apps/frontend/src/app/(app)/documents/[id]/page.tsx`, `apps/frontend/src/components/document-editor/**`, `apps/frontend/src/components/line-items/**` (extending 1-C's), colocated `*.test.tsx`

**Reads, never edits** `src/lib/api/documents.ts` (G3's — import it; if it lacks something, request an amendment), `src/lib/api/types/document.ts`, `design/htmls/document-edit.html`

**Build**
1. The editor page loads a document by id and renders metadata (title, customer, issue date, status) above 1-C's line-item table.
2. Keep the live `/pricing/preview` behavior while editing, and switch to the **saved document's persisted totals** after a successful save. Two sources of the same number is the drift risk in this lane; make which one is displayed explicit in the component's state, not implicit in render order.
3. Save through G3's `documents.ts`. Never send `totals` or `status` — the contract rejects them, and sending them is a validation error the user cannot fix.
4. Field errors from `details[]` map to the right line row and the right input, using the path convention (`lines.2.quantity`). Metadata errors attach to metadata fields. An unmapped path surfaces at document level rather than vanishing.
5. Unsaved-changes indication and a guard on navigating away with pending edits.
6. A component test for the error-path mapping **if** it contains real logic — parsing `lines.2.quantity` into a row and field is real logic; delegating to a helper that returns the field is not.

**Done when** `cd apps/frontend && npm test && npm run build` exits zero.

**Guardrails** No read-only or locked state — Phase 4. No new API functions in your own files; that file belongs to 3-C.

---

## Join J3

1. All four lanes reported. Run the backend suite: 3-B's tests are the acceptance criteria for 3-A. Reconcile every disagreement in favor of `docs/contracts/phase-3.md`; where the contract itself is wrong, fix it in the contract first, then both sides.
2. Frontend suite and build green.
3. **Retire Phase 1's standalone `/editor` route.** It existed to demo a stateless engine; 3-D's `documents/[id]` page is now the real editor, and leaving both ships a dead screen. Delete `app/(app)/editor/`, and port `e2e/pricing-preview.cy.ts` to drive the document editor instead — the `421.50` assertion stays, only the route changes.
4. Add `documents` to `components/shell/nav-items.ts` — no page lane may edit the shell.
5. `make up`, then `e2e/documents.cy.ts`: create a document, add the PDF's sample lines, save, reload, and see **421.50** persisted.
4. By hand: submit a negative quantity and confirm a specific message appears on the right row.
5. Commit `chore(J3): join phase 3`.

**Demo** Create a document, add the sample lines, save, reload, see it persisted with correct totals; submit a negative quantity and see a specific message.
