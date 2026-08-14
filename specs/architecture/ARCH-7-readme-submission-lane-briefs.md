# Architecture: Printable view + README rewrite for submission (Phase 6 close-out)

> **Date:** 2026-08-14
> **Issue:** #7
> **Phase:** 2 of 5 (System Architecture)
> **Requirements source:** Standalone brief — see Inferred Requirements. Derived from `docs/multi-rate-pricing-calculator.md`/`.pdf` (Deliverables section, Stretch goal 3) and issue #7 (`docs/phases/phase-6-issue-7.md`, Lanes 6-A and 6-D).
> **Type:** feature + documentation

## Architecture Summary

Issue #7 originally scoped a 5-lane parallel-agent effort (README, seed script, frontend quality pass, printable view, deployment, CI/CD). Deployment and CI/CD are already live and verified; a frontend quality pass happened ad hoc this session; the seed script and a unified e2e journey test were explicitly declined by the developer (existing per-phase Cypress specs already cover that ground). Two things remain: the PDF's third stretch goal — a printable view of a document — and `README.md` itself, still a 25-line Docker-only stub missing every one of the PDF's five required sections. This ARCH scopes both, in that order: **a small additive frontend feature** (one new route, one new component, one new stylesheet — no backend changes, no new dependency, reuses the existing `GET /documents/:id` response) **followed by a single-file README rewrite** that can then accurately describe the finished stretch-goal state. The README is reassembled from facts already verified against the live codebase this session — the pricing engine's worked example, the immutability test suite, the deployment runbook — rather than from the original lane brief's assumptions, at least one of which (a `Makefile`) doesn't exist in this repo.

## Inferred Requirements (if Mode B / no REQ)

| ID | Inferred Requirement | Source |
|----|----|----|
| R1 | README states what the app is and the live URL prominently, near the top | PDF Deliverables: "a live URL... also include it in your submission email"; issue #7 Lane 6-A build step 1 |
| R2 | README gives copy-pasteable, verified setup steps from a clean clone | PDF Deliverables: "Prerequisites and step-by-step setup" |
| R3 | README documents the calculation & rounding policy with the PDF's own worked example | PDF Deliverables: "Calculation and rounding policy (with a worked example)"; PDF § What we evaluate: "Communication — README clarity, especially rounding policy" |
| R4 | README documents finalize/immutability rules and names the evidence (test file) that proves them | PDF Deliverables: "Finalize/immutability rules" |
| R5 | README states assumptions and tradeoffs made during the build | PDF Deliverables: "Assumptions and tradeoffs"; PDF: "make a reasonable assumption, document it in your README" |
| R6 | README states what would be improved before production | PDF Deliverables: "What you would improve before production" |
| R7 | README tells a reviewer how to run every test surface in one command each | Issue #7 Lane 6-A build step 7 |
| R8 | README accurately reports stretch-goal status (done / not done) rather than implying more than exists | General submission honesty |
| R9 | Provide a printable view of a document — HTML or PDF output, per the PDF's own either/or wording | PDF Stretch goal 3: "Printable view — HTML or PDF output of a document" |

## High-Level Structure

Two independent pieces of work, sequenced (printable view first, so R8's stretch-goal status in the README reflects the finished state):

**1. Printable view (R9) — a small additive frontend feature, not a system:**

```
apps/frontend/src/components/lifecycle/DocumentView.tsx    ──[adds "Print" link alongside the existing Duplicate action]──►
apps/frontend/src/app/(app)/documents/[id]/print/page.tsx  ──[loads doc by id, same load pattern as [id]/view/page.tsx]──►
apps/frontend/src/components/print/PrintDocument.tsx       ──[renders print layout from design/htmls/print.html]
apps/frontend/src/styles/print.css                          ──[@media print rules: hide chrome, avoid row splits]
```

**Correction (post-implementation):** the Print link landed in `DocumentView.tsx` — the shared
component rendered by both `[id]/view/page.tsx` and `[id]/page.tsx`'s finalized branch — not in
`[id]/view/page.tsx` directly as originally planned above. That's a better outcome than the
original plan: the link reaches a finalized document from either route instead of only one. This
doc originally said `[id]/view/page.tsx`; every reference below is corrected to say
`DocumentView.tsx`, which is what actually changed.

No backend involvement — `GET /documents/:id` (already exists, already returns metadata + lines + totals) is the only data source. No new persisted field.

**2. README (R1–R8) — not a system, a single document.** Section order is fixed by the PDF (do not reorder or merge, per issue #7's own instruction) with setup and test-running folded in:

```
1. What this is + live URL           (R1)
2. Prerequisites & setup             (R2)
3. Calculation & rounding policy     (R3)   — the PDF's worked example, verbatim numbers
4. Finalize & immutability rules     (R4)   — cites test/api/immutability.test.ts
5. Assumptions & tradeoffs           (R5)
6. What I'd improve before production (R6)
7. Running the tests                 (R7)   — one command per surface
8. Stretch goals status              (R8)   — duplicate ✅, finalize validation ✅, printable ✅ (once R9 lands)
```

Every README fact is sourced from an existing artifact already verified this session — no new facts are invented, no numbers are recomputed by hand.

## Tech Choices

| Area | Decision | Alternatives Considered | Rationale |
|----|----|----|----|
| Printable output format | Plain HTML route + `@media print` CSS; the browser's native print/"Save as PDF" covers the PDF case | Server-generated PDF (e.g. a headless-Chrome/Puppeteer pipeline) | Developer's explicit choice: a PDF pipeline adds a new dependency, a new failure surface, and a deployment concern (headless Chrome in the container) for an optional stretch goal — the PDF itself accepts "HTML or PDF output," and the original phase-6 brief independently reached the same conclusion |
| README | N/A — prose, no technology decision | — | — |

## Patterns & Conventions

- **Route = thin data loader, component = rendering** — `[id]/print/page.tsx` follows the exact pattern already established by `[id]/view/page.tsx`: load-by-id with a stale-request guard (`requestedIdRef`), loading/error states, delegate rendering to a component. `PrintDocument` is that component, mirroring how `DocumentView` already works.
- **Totals rendered verbatim from the server, never recomputed client-side** — same discipline as `DocumentTotals.tsx` and `StatCards.tsx`: `PrintDocument` renders `document.totals` as-is.
- **Document numbering stays a display concern** — derived from data that already exists (`issueDate` + a slice of the document id), not a new stored field or an incrementing counter. Matches the original lane brief's own guardrail against building numbering machinery for a requirement the PDF never states.
- **Copy the PDF's own numbers, don't recompute** (README) — `docs/contracts/phase-1.md` and `test/api/documents.test.ts:210` are both existing ground truth for `450.00 / 40.00 / 11.50 / 421.50`; the README cites rather than re-derives.
- **Name evidence files instead of just asserting behavior** (README) — matches the standard already set by `docs/contracts/*.md` throughout this codebase.
- **State real commands, not aspirational ones** (README) — the existing root `README.md`'s `.env` / `JWT_SECRET` setup section is already accurate and gets kept, not rewritten; the phase-6 brief's `Makefile` references are dropped since no `Makefile` exists in this repo.

## Data Models

N/A — no persisted or wire data model changes. Printable view reads the existing `DocumentResponse` shape unchanged; document numbering is derived at render time, not stored.

## API Contracts / Interfaces

N/A — no new route, schema, or contract on the backend. The printable view is a frontend-only consumer of the existing `GET /api/v1/documents/:id`.

## Module Boundaries

| Module / Package | Responsibility | Allowed Dependencies |
|----|----|----|
| `apps/frontend/src/components/print/` | Print-layout rendering for one document | `@/lib/api/types/document`, `@/components/money/Money` — no new dependency |
| `apps/frontend/src/app/(app)/documents/[id]/print/` | Route: load document by id, render `PrintDocument` | `@/components/print`, `@/lib/api/documents` |
| `README.md` | Sole owned file for the documentation half of this ARCH | Reads (never modifies) `docs/contracts/`, `specs/lanes/deployment.md`, `compose.yml`, `.env.example`, the test suite |

## Change Footprint

### New files / modules

| Path | Purpose | Pattern reference |
|----|----|----|
| `apps/frontend/src/app/(app)/documents/[id]/print/page.tsx` | Route: load document by id, render the print layout | `apps/frontend/src/app/(app)/documents/[id]/view/page.tsx` (load-by-id pattern) |
| `apps/frontend/src/components/print/PrintDocument.tsx` (+ module CSS) | Print-formatted document layout: header, prepared-for/document blocks, line-items table, totals, footer | `design/htmls/print.html` (visual mockup); `apps/frontend/src/components/lifecycle/DocumentView.tsx` (verbatim-totals rendering pattern) |
| `apps/frontend/src/styles/print.css` | `@media print` rules: hide app chrome, avoid splitting a line-item row across a page break, black-on-white | `design/htmls/print.html`'s `.no-print` class usage |

### Modified files / modules

| Path | What changes here |
|----|----|
| `apps/frontend/src/components/lifecycle/DocumentView.tsx` | Add a "Print" link to the new `/documents/:id/print` route, alongside the existing Duplicate action, in the shared finalized-document header — reaches a finalized document from both `[id]/view/page.tsx` and `[id]/page.tsx`'s finalized branch, since both render this component |
| `README.md` | Full rewrite: 25-line Docker-only stub → the 8-section structure above, covering every PDF-required deliverable topic, including the now-complete stretch-goal status |

### Deleted / replaced

None.

### Touched but not changed (silent-regression hotspots)

_Not code-regression hotspots in the usual sense — these are the source-of-truth files the README must stay accurate against. If any of these drift after this task, the README drifts with them and nobody will notice until a reviewer does._

| Path | Why it matters |
|----|----|
| `docs/contracts/phase-1.md` | Source of the worked-example numbers the README cites verbatim |
| `test/api/documents.test.ts` | Cross-check for the worked-example numbers (ground truth: the passing assertion, not the doc) |
| `test/api/immutability.test.ts` | Named as the evidence for the finalize/immutability section — must still exist and still pass |
| `test/integration/ownership.test.ts` | Candidate citation for auth/ownership evidence in "what to improve" or assumptions, if referenced |
| `specs/lanes/deployment.md` | Source of the live URL and release process described in setup |
| `compose.yml`, `.env.example` | Source of the actual setup commands (root `README.md`'s existing setup section is already correct and is preserved, not replaced) |
| `apps/backend/package.json`, `apps/frontend/package.json`, `e2e/cypress.config.js` | Source of the real `npm test` / Cypress commands for the "Running the tests" section |
| `apps/backend/src/api/plugins/rate-limit.ts` | Source of the documented IP-bucketing limitation, a candidate "what to improve" item |
| `apps/frontend/src/lib/api/documents.ts` (`get()`) | Print route reuses this existing client function — must keep returning the full `DocumentResponse` shape |
| `apps/frontend/src/app/(app)/documents/[id]/view/page.tsx` | Not itself modified, but renders `DocumentView` (now modified) unconditionally — its loading/error states must keep working with only the header gaining a link |
| `apps/frontend/src/app/(app)/documents/[id]/page.tsx` | Also renders `DocumentView` for a finalized document (the other of the two paths the new Print link now reaches) — not itself modified |

## Areas of Impact

| Area | Impact | Risk (L/M/H) | Why |
|----|----|----|----|
| Frontend routing | One new route added under an existing dynamic segment | L | Purely additive — no existing route's behavior changes, only `DocumentView.tsx` (shared by two routes) gains a link |
| Print/PDF output | New user-facing capability (stretch goal 3) | L | No backend dependency, no new package; worst case is a visual/layout issue confined to the new route |
| Submission / grading | README becomes a complete, accurate deliverable instead of a stub; stretch-goal status is now fully positive | L | Documentation-only for the README half; no runtime behavior changes there |
| Reviewer onboarding | A reviewer can go from `git clone` to reproducing `421.50` using only the README, and can open a finalized document's print view | L | Directly verified this session against the actual (not assumed) repo state |

**Contract changes:** none — no API, schema, or public type changes.

**Cross-cutting ripples:** none — no auth, telemetry, migration, feature-flag, or build-pipeline changes. The live deployment is unaffected for the README half (`README.md` isn't part of either app's Docker build); the printable-view route deploys as part of the normal frontend build/redeploy, same as any other new page.

## Cross-Cutting Concerns

- **Errors:** printable-view route follows the same loading/error pattern as `[id]/view/page.tsx` (spinner → error message + retry, or the rendered document). README: N/A.
- **Logging & metrics:** N/A for both.
- **Auth / authz:** printable view is reached only from an already-authenticated page (`[id]/view`) and calls the existing authenticated `get()` client — no new auth surface, no new authz rule (any document the caller can already view, they can already print — same ownership scoping as everywhere else in the app). README: N/A.
- **Performance:** N/A — single-document render, no new query pattern.
- **Security:** printable view renders data the user already has access to via the existing document-view page; no new data exposure. README: the one relevant note is negative — must *not* recommend committing a real `.env` or a placeholder `JWT_SECRET`; the existing root README's guidance (generate one, never commit it) is correct and is preserved verbatim.
- **Migrations / rollout:** none for either half — no schema change, no redeploy required specifically for the README; the printable-view route ships with the next normal frontend deploy.

## Architecture Decisions Log

| # | Decision | Alternatives | Chosen Because | Satisfies REQs |
|----|----|----|----|----|
| A1 | Scope this task to printable view + a README rewrite — no seed script, no unified e2e journey test, no other source changes | Full 5-lane plan as originally scoped in issue #7; README-only (printable view deferred) | Seed script and journey test were explicitly declined by the developer (existing per-phase Cypress specs already cover the journey); printable view was initially deferred as the plan's lowest-priority item but the developer explicitly asked for it back in scope; README is the other unambiguous gap against a graded deliverable | R1–R9 |
| A2 | Source every README fact (numbers, commands, URL) from existing verified artifacts rather than the original phase-6 lane brief | Follow the lane brief's content plan as-written | The lane brief assumes a `Makefile` that doesn't exist in this repo, and was written before this session's fixes (duplicate's missing backend, negative-price defense-in-depth) existed to document | R2, R3, R4, R5, R7 |
| A3 | Explicitly report printable view as ✅ once built, not silently | Silently leave stretch goals unmentioned | The PDF invites documenting stretch-goal choices; a graded "Communication" row rewards explicit, accurate status over silence | R8 |
| A4 | Printable view is plain HTML + `@media print` CSS; no PDF-generation library or server-side rendering | Server-generated PDF (headless-Chrome/Puppeteer pipeline) | Developer's explicit choice — avoids a new dependency, a new failure surface, and a deployment concern for an optional stretch goal; the PDF's own wording accepts "HTML or PDF output," and the browser's native print-to-PDF already covers the PDF case for free | R9 |
| A5 | Document numbering (e.g. `Q-2026-014`) is derived at render time from existing data (`issueDate` + an id slice) — no new stored field, no counter | A real incrementing/configurable document-number field on the document model | Matches the original lane brief's own guardrail: don't build numbering machinery for a requirement the PDF never states; keeps the change backend-free | R9 |

## Risk & Stress-Test Scenarios

### Forward — runtime failure scenarios

| Scenario | How the Design Handles It |
|----|----|
| Reviewer runs `docker compose up` with no `.env` on a clean clone | Fails by design (config validator rejects a missing `JWT_SECRET` rather than booting insecurely) — README's setup section states the `.env.example` → `.env` → generate-`JWT_SECRET` step *before* `docker compose up`, matching what's already correct in the current root README |
| Reviewer runs `npm --prefix apps/backend test` with no MongoDB running | Mongo-gated suites (`describe.skipIf(!mongoReachable)`) skip cleanly rather than failing red — README notes this so skipped tests aren't mistaken for a broken suite |
| Reviewer cross-checks the worked-example numbers against the running app | Numbers are copied from `docs/contracts/phase-1.md`, independently cross-checked against the passing assertion in `test/api/documents.test.ts:210` in this task, not recomputed by hand — eliminates transcription drift |
| A document has enough line items to approach a page boundary in print preview | `page-break-inside: avoid` on table rows in `print.css`, verified visually at A4 and Letter with a document long enough to actually hit a boundary |
| A document has zero line items and the reviewer opens its print view | `PrintDocument` renders the same "no lines" state the editor/view already handle — an empty table body, not a crash; totals still render from `document.totals` (all zeros) |

### Backward — regression risk per touched area (brownfield only)

| Touched area (from Change Footprint) | What could regress | How we'd know / mitigation |
|----|----|----|
| `test/api/immutability.test.ts` (cited by name) | If this test file is later renamed/restructured, the README's citation goes stale | Low likelihood within this task's timeframe; not a code change this task makes, so no immediate mitigation needed beyond noting it |
| `specs/lanes/deployment.md` (URL source) | If the droplet or hostname ever changes, the README's URL goes stale | Out of this task's control — deployment lane owns that file; README just reads it once at write time |
| `apps/frontend/src/components/lifecycle/DocumentView.tsx` | Adding the Print link to the shared header could disturb the existing Duplicate action or the read-only rendering it sits alongside | `DocumentView.test.tsx` already exists and covers this component directly — a new test asserts the Print link's `href`, and the existing tests (metadata rendering, no editable inputs, duplicate flow, document totals) all still pass unchanged, proving the addition didn't disturb what was already there |
| `apps/frontend/src/app/(app)/documents/[id]/view/page.tsx`, `[id]/page.tsx` | Neither route file is itself modified, but both render `DocumentView` — a regression there would surface on both routes | No dedicated component test exists for either route file (exercised indirectly via `e2e/lifecycle.cy.ts` and `e2e/documents.cy.ts`); mitigation is manual verification that both routes still load/error/retry correctly, plus a Cypress smoke pass |

## Open Questions

- Should the README's live-URL section be re-verified (curl/browser check) at the moment of final commit, given the CI/CD deploy pipeline had a real failure earlier this session (missing `JWT_SECRET` on the droplet) that's since been fixed?
  - **Impact if unresolved:** low — the URL was confirmed reachable and serving the latest build as of this session; a stale README URL section would only matter if the droplet state changes again before submission.
  - **Suggested default:** do a quick `curl https://multiprice.farealahmed.com/api/health` right before committing the README, not a full browser smoke test — J6's full redeploy-and-verify was explicitly descoped from this task.

## Out of Scope

- Seed script (`apps/backend/src/scripts/seed.ts`) (reason: explicitly declined by the developer — no graded requirement depends on it)
- Unified `e2e/journey.cy.ts` (reason: explicitly declined — existing `e2e/auth.cy.ts`, `documents.cy.ts`, `lifecycle.cy.ts`, `report.cy.ts` already cover the same journey per-phase)
- PDF-generation library or server-rendered PDF output (reason: A4 — HTML + print CSS covers the stretch goal without a new dependency; browser print-to-PDF covers the PDF case)
- Configurable or concurrency-safe document numbering (reason: A5 — display-only derivation from existing data; the PDF never requires real document numbers)
- Frontend quality pass beyond what already happened ad hoc this session (responsive breakpoints, `aria-describedby` wiring, formal contrast audit) (reason: not requested for this task; the spacing/UX fixes already shipped this session are sufficient for the README to describe honestly)

---

# Tasks

_This section is populated by the **generate-tasks** skill (Phase 3)._
_Run: `/generate-tasks from: specs/architecture/ARCH-7-readme-submission-lane-briefs.md`_
