# Tasks: Printable view + README rewrite for submission (Phase 6 close-out)

> **Date:** 2026-08-14
> **Issue:** #7
> **Phase:** 3 of 5 (Task Generation)
> **Architecture:** `specs/architecture/ARCH-7-readme-submission-lane-briefs.md` — read that document first; the tasks below are the full Change Footprint and trace to its Inferred Requirements (R1–R9) and Architecture Decisions Log (A1–A5).

## Execution Plan

Two tasks, sequential — **T1 (printable view) before T2 (README)**, so the README's stretch-goal status section describes the finished state rather than needing a later edit.

```
T1 (printable view) ──► T2 (README)
```

No parallelism needed — T2's Footprint (`README.md`) doesn't overlap T1's (frontend print route/component/stylesheet), but T2's *content* (R8, stretch-goal status) depends on T1 being done, so they run in order, not concurrently.

---

## Task T1: Printable view for a document

> **Status:** done
> **Verification:** ui
> **Effort:** s
> **Priority:** high
> **Depends on:** None
> **Satisfies REQs:** R9
> **Footprint slice:** New: `apps/frontend/src/app/(app)/documents/[id]/print/page.tsx`, `apps/frontend/src/components/print/PrintDocument.tsx` (+ module CSS), `apps/frontend/src/styles/print.css`. Modified: `apps/frontend/src/components/lifecycle/DocumentView.tsx` (add Print link — see Description).
> **High-risk areas touched:** None (all Areas of Impact in ARCH-7 for this task are Low risk)

### Description

Add stretch goal 3 from the PDF: a printable view of a document, reachable from the existing read-only view. Renders the document (metadata, line items, totals) in a print-optimized layout based on `design/htmls/print.html`, with `@media print` rules so printing (or "Save as PDF" from the browser) produces a clean, chrome-free page. No backend changes — reuses the existing `GET /api/v1/documents/:id` response.

**Implementation note (post-hoc):** the Print link was added to `DocumentView.tsx` — the shared
component rendered by both `[id]/view/page.tsx` and `[id]/page.tsx`'s finalized branch — rather
than to `[id]/view/page.tsx` directly as originally planned below. This reaches a finalized
document from either route instead of just one, which is a better outcome than the original
plan; every reference below to modifying `[id]/view/page.tsx` should be read as `DocumentView.tsx`.

### Verification Checklist

1. **`/documents/:id/print` loads and renders without error for a finalized document** — navigate from `[id]/view`, confirm document metadata, line items, and totals all render. _(R9)_
2. **Also works for a draft document** — no status gating on the print route, matching how `[id]/view` already behaves. _(R9)_
3. **"Print" link is present in `DocumentView.tsx`'s header and reachable from both `[id]/view/page.tsx` and `[id]/page.tsx` (finalized)**, navigating to the new route. _(R9, ARCH Change Footprint)_
4. **Print preview at A4 renders cleanly** — app chrome (topbar/nav) hidden via `.no-print`, document header, prepared-for/document blocks, line-items table, and totals all legible with nothing clipped. _(R9)_
5. **Print preview at Letter size renders cleanly** — same checks as #4. _(R9)_
6. **No line-item row splits across a page break** — verified on a document with enough lines to approach a page boundary (15+ lines), `page-break-inside: avoid` applied. _(R9, ARCH forward stress-test)_
7. **Black-on-white in print preview** — no color backgrounds or dark chrome bleeding through. _(R9)_
8. **Totals in the print view exactly match `document.totals`** — rendered verbatim, not recomputed client-side (same discipline as `DocumentTotals`/`StatCards`). _(R9, ARCH Patterns & Conventions)_
9. **Document numbering label is derived from existing data only** (`issueDate` + a slice of the document id) — confirmed by inspecting the diff: no new persisted field, no counter. _(R9, ARCH Decision A5)_
10. **Empty document (zero lines) renders without crashing** — empty table body, totals still render (all zeros). _(R9, ARCH forward stress-test)_
11. **`DocumentView.tsx`'s existing rendering is unchanged apart from the added link** (metadata display, line items table, duplicate action, document totals) — verified by `DocumentView.test.tsx`'s existing tests all still passing plus a new test for the Print link's `href`. `[id]/view/page.tsx` and `[id]/page.tsx` (both unmodified, both render `DocumentView`) keep their own loading/error/retry states, verified by eye. _(guards ARCH backward-regression risk for `DocumentView.tsx`)_
12. **`npm --prefix apps/frontend test` passes**, including a new component test for `PrintDocument` (see Testable Seams below).
13. **`npm --prefix apps/frontend run typecheck` and `npm --prefix apps/frontend run build` both pass** — confirms the new route builds cleanly in a production build.

#### Testable Seams

- `PrintDocument` renders document metadata (title, customer, issue date, status) — component test.
- `PrintDocument` renders every line item's description, quantity, unit price, discount, tax, and line total — component test.
- `PrintDocument` renders the totals block (subtotal, discount, tax, grand total) from `document.totals` verbatim — component test, same assertion style as `DocumentView.test.tsx`.
- `[id]/print/page.tsx`'s loading and error states — component test, same pattern as existing route-level tests (e.g. `DocumentEditor.test.tsx`'s load-failure case), mocking `get()`.
- `@media print` layout itself (page breaks, print-vs-screen chrome visibility) is **not** testable via component tests — that's the human-eyeball part of items 4–7 above.

### Implementation Notes

- **Module(s):** `apps/frontend/src/components/print/` (new), `apps/frontend/src/app/(app)/documents/[id]/print/` (new) — per ARCH-7 Module Boundaries.
- **Pattern reference:** `apps/frontend/src/app/(app)/documents/[id]/view/page.tsx` for the route's load-by-id-with-stale-request-guard pattern; `apps/frontend/src/components/lifecycle/DocumentView.tsx` for verbatim-totals rendering; `design/htmls/print.html` for the visual layout to implement.
- **Key decisions carried from ARCH-7:**
  - A4 — HTML + print CSS, no PDF-generation library, no server-side rendering.
  - A5 — document numbering is a display-only derivation, not a new stored field or counter.
- **Libraries:** none — no new dependency.
- **High-risk callouts:** none.

### Scope Boundaries

- Do NOT add a PDF-generation library or any server-side PDF rendering (ARCH-7 Out of Scope, Decision A4).
- Do NOT build configurable or concurrency-safe document numbering (ARCH-7 Out of Scope, Decision A5).
- Do NOT modify `[id]/page.tsx` or `[id]/view/page.tsx` directly — the Print link belongs in the shared `DocumentView.tsx` component both routes render, not duplicated into each route file.
- `PrintDocument` stays its own component — do NOT fold its rendering into `DocumentView.tsx` or reuse `DocumentView.tsx` for the print layout; they're different layouts that happen to share the same totals-rendering discipline.
- Do NOT add backend changes — no new endpoint, no schema change; reuse `GET /api/v1/documents/:id` as-is.
- Do NOT gate the print route by document status.

### Files Expected

**New files:** _(from ARCH-7 "New files / modules")_
- `apps/frontend/src/app/(app)/documents/[id]/print/page.tsx` (route: load by id, render `PrintDocument`)
- `apps/frontend/src/components/print/PrintDocument.tsx` (+ scoped CSS module) (print layout)
- `apps/frontend/src/styles/print.css` (`@media print` rules)
- A component test file for `PrintDocument` (and/or the print route), following this codebase's colocated-test convention

**Modified files:** _(from ARCH-7 "Modified files / modules")_
- `apps/frontend/src/components/lifecycle/DocumentView.tsx` (add "Print" link to `/documents/:id/print`, alongside the existing Duplicate action)

**Must NOT modify:** _(from ARCH-7 "Touched but not changed")_
- `apps/frontend/src/lib/api/documents.ts` (`get()`) — reused as-is
- `apps/frontend/src/app/(app)/documents/[id]/view/page.tsx`, `[id]/page.tsx` — not themselves modified; both render `DocumentView` and must keep working unchanged
- Any backend file — no API changes needed

---

## Task T2: Rewrite README.md for submission

> **Status:** done
> **Verification:** checklist
> **Effort:** s
> **Priority:** high
> **Depends on:** T1 (README's stretch-goal status section needs T1's finished state to describe accurately)
> **Satisfies REQs:** R1, R2, R3, R4, R5, R6, R7, R8
> **Footprint slice:** Modified: `README.md` (full rewrite)
> **High-risk areas touched:** None (both Areas of Impact in ARCH-7 for this task are Low risk)

### Description

Replace the current 25-line Docker-only `README.md` with the full submission-ready document the PDF requires: what the app is + live URL, setup, calculation/rounding policy with the PDF's worked example, finalize/immutability rules, assumptions and tradeoffs, what to improve before production, how to run every test surface, and stretch-goal status (now all three: duplicate, finalize validation, and printable view). Every fact (numbers, commands, URL, evidence citations) is sourced from files already verified this session — not recomputed or assumed — per ARCH-7's Patterns & Conventions.

### Verification Checklist

1. **Live URL present near the top, not buried** — README's opening section states `https://multiprice.farealahmed.com` within the first section. _(R1)_
2. **`curl https://multiprice.farealahmed.com/api/health` returns `200 {"status":"ok","db":"up"}`** at time of writing, confirming the stated URL is verified live, not stale. _(R1, ARCH forward stress-test)_
3. **Setup steps reproduce a working app from a clean clone** — `git clone` → copy `.env.example` → `.env` → generate `JWT_SECRET` → `docker compose up --build` → open `http://localhost:3000` → sign up, in that literal order, matching the current root README's already-correct sequence. _(R2, ARCH forward stress-test)_
4. **Rounding-policy section matches the pricing engine exactly** — states the order (subtotal → discount → round → tax-on-discounted → round → total) and the policy in one sentence (half-up, 2 decimals per line), cross-checked against `apps/backend/src/pricing/calculate-line.ts` and `rounding.ts`. _(R3)_
5. **Worked-example numbers match `docs/contracts/phase-1.md` and `test/api/documents.test.ts:210` exactly** — Widget A / Widget B / Service fee per-line figures, and document totals `450.00 / 40.00 / 11.50 / 421.50`, copied not recomputed. _(R3, ARCH forward stress-test)_
6. **Two-path grand-total reconciliation is stated** — sum of line totals *and* subtotal − discount + tax both equal `421.50`. _(R3)_
7. **Integer-cents/thousandths/basis-points rationale is present**, citing the PDF's "avoid floating-point drift" and pointing at `apps/backend/src/pricing/` as the single module. _(R3)_
8. **Finalize/immutability section names `test/api/immutability.test.ts` by name** and correctly describes what its parametrized suite enumerates (six guarded routes × valid-mutation-rejected + invalid-body-rejected-before-validation assertions). _(R4)_
9. **409 `DOCUMENT_FINALIZED` is stated as the rejection behavior** for every guarded mutating route. _(R4)_
10. **Assumptions section includes all five original items** (reject-not-clamp on discount overflow, drafts included in reports, inclusive date range as plain-string comparison, embedded lines not a separate collection, two independent apps with hand-mirrored types) **plus the two found this session** (duplicate needed a real backend implementation; negative-unit-price is now defense-in-depth-checked at finalize). _(R5)_
11. **"What I'd improve" section is concrete, not a disclaimer list** — includes the rate-limit IP-bucketing limitation already documented in `apps/backend/src/api/plugins/rate-limit.ts`, cited accurately. _(R6)_
12. **Test-running section gives one real, copy-pasteable command per surface**: `npm --prefix apps/backend test`, `npm --prefix apps/frontend test`, `npx cypress run --config-file e2e/cypress.config.js` — verified against the actual scripts in both `package.json`s and `e2e/cypress.config.js`, not the phase-6 brief's nonexistent `Makefile` targets. _(R7)_
13. **A one-line note explains Mongo-gated backend tests skip cleanly without a running MongoDB** rather than failing red. _(R7, ARCH forward stress-test)_
14. **Stretch-goals section states duplicate ✅, finalize validation ✅ (both quantity and price), printable view ✅** — describing T1's finished feature accurately (HTML + print styles, not a PDF pipeline). _(R8, depends on T1)_
15. **No reference to a `Makefile`, `make up`, or `make seed`** anywhere in the rewritten README — confirmed absent since these commands don't exist in this repo.
16. **`npm --prefix apps/backend run typecheck` and `npm --prefix apps/frontend run typecheck` still pass** — sanity check that this is genuinely a docs-only change touching nothing else.

### Implementation Notes

- **Module(s):** none — `README.md` only, per ARCH-7's Module Boundaries.
- **Pattern reference:** the current root `README.md`'s existing `.env`/`JWT_SECRET` setup section is already correct — preserve it rather than rewriting from scratch (ARCH-7 Patterns & Conventions).
- **Key decisions carried from ARCH-7:**
  - A1 — scope is printable view (T1) + README (T2); no seed script, no unified e2e journey test, no other source changes.
  - A2 — source every fact from existing verified artifacts, not the phase-6 lane brief's assumptions (it references a nonexistent `Makefile`).
  - A3 — report printable view as ✅ now that T1 is done, not silently.
- **Libraries:** none — no dependency changes.
- **High-risk callouts:** none.

### Scope Boundaries

- Do NOT modify any source file — this task is `README.md` only (ARCH-7 Change Footprint).
- Do NOT build the seed script or unified `e2e/journey.cy.ts` (ARCH-7 Out of Scope).
- Do NOT expand the ad-hoc frontend quality-pass work already done this session (ARCH-7 Out of Scope).
- Do NOT recompute the worked-example numbers by hand — copy from `docs/contracts/phase-1.md`, cross-check against `test/api/documents.test.ts:210`.
- Do NOT reference the phase-6 brief's `Makefile` targets — they don't exist in this repo.

### Files Expected

**Modified files:** _(from ARCH-7 "Modified files / modules")_
- `README.md` (full rewrite — 25-line Docker stub → the 8-section structure in ARCH-7's High-Level Structure)

**Must NOT modify:** _(from ARCH-7 "Touched but not changed" — read-only sources of truth this task verifies content against)_
- `docs/contracts/phase-1.md` (source of worked-example numbers)
- `test/api/documents.test.ts` (cross-check for worked-example numbers)
- `test/api/immutability.test.ts` (named as evidence — must still exist and pass)
- `test/integration/ownership.test.ts` (candidate citation)
- `specs/lanes/deployment.md` (source of the live URL)
- `compose.yml`, `.env.example` (source of setup commands)
- `apps/backend/package.json`, `apps/frontend/package.json`, `e2e/cypress.config.js` (source of test commands)
- `apps/backend/src/api/plugins/rate-limit.ts` (source of the documented rate-limit limitation)
