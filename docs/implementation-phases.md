# Implementation phases — Multi-Rate Pricing Calculator

## What this is

A take-home submission for a Full Stack role. The PDF (`docs/multi-rate-pricing-calculator.pdf`) is the only authority. The HTML in `design/htmls/` is illustration — it has no say over data models, policies, or scope, and where it disagrees with the PDF, it is wrong and gets changed.

**Deliverables:** source code, a live URL (deployed by lane `6-E`), and a README covering setup, rounding policy with a worked example, immutability rules, assumptions, and what you'd improve.

**It is judged on seven things.** Nothing in this plan may compromise them, and anything not serving them is optional:

| Evaluation area | What they look for | Retired in |
|---|---|---|
| Correctness | Line and document totals correct for mixed discount/tax | Phase 1 |
| Calculation design | Single shared module; consistent rounding | Phase 1 |
| Tests | Calculation unit tests | Phase 1 |
| Validation | Specific errors for bad input | Phase 3 |
| Lifecycle | Finalized docs immutable **via the API** | Phase 4 |
| Reporting | Summary totals match individual documents in range | Phase 5 |
| Communication | README clarity, especially rounding policy | Phase 6 |

## Requirement traceability

| PDF requirement | Phase |
|---|---|
| 1. Authentication, per-user data isolation | 2 |
| 2. Documents and line items | 3 |
| 3. Calculations, server-side, documented rounding | 1 |
| 4. Draft/finalized lifecycle, finalize endpoint | 4 |
| 5. Summary report by issue-date range | 5 |
| 6. REST API, CRUD, validation with specific messages | 3, 4 |
| Stretch: duplicate, finalize validation, printable view | 4, 4, 6 |

## How this gets executed

Each phase below is decomposed into lanes that can run **simultaneously, in separate terminals**, in `docs/phases/phase-N.md`. Every phase runs as **gate → lanes → join**: one short serial task freezes the contract on both sides, two to four lanes then build against it in parallel over disjoint files, and a join proves them against each other.

- `docs/parallel-execution.md` — the rules that let N agents share one checkout, the file-ownership map, and the wave schedule.
- `docs/phases/phase-0.md` … `phase-6.md` — a self-contained brief per lane: mission, owned files, build steps, tests, and the command that says it is done.
- `.claude/agents/` — the four roles the lanes are written for.

The phases, their ordering, and the decisions below are unchanged by that decomposition.

## Two rules that produce this plan

**1. The contract is the unit of work, not the layer.** Each phase opens by defining the endpoint schemas in the backend and the small set of response types needed by the frontend client. The two apps stay independent — no shared package, generated client, or contract-synchronization system. Those solve long-term drift that this take-home does not have.

Drift is caught instead by rule 2: every phase ends with one Cypress happy path that exercises the real endpoint. A renamed field breaks that flow in the same phase that renamed it.

**2. A phase is done when a human can do something in a browser.** Each phase closes with a short Cypress flow and the equivalent demo script against the Compose stack. This prevents a backend that runs four phases ahead of a UI nobody built, and it is what keeps the duplicated types honest. Cypress covers one happy path per phase; API and integration tests carry the edge cases.

**Ordering is by risk retired.** Pricing first, before any database — it carries three of the seven evaluation rows and needs no persistence to be correct. Identity second, because every later query is scoped by it and retrofitting ownership is how leaks get written. Lifecycle gets its own phase because immutability is a rule over *every* mutating route, and proving a negative deserves dedicated attention. Reporting late, because it needs documents created by the real flow.

Avoided: **layer-first** (all backend, then all frontend) defers integration risk to the end. **Page-first** risks spreading calculation logic across screens — precisely what the "single shared module" criterion is testing for.

---

## Decisions

Made on the PDF's terms. It says: *"If anything is ambiguous, make a reasonable assumption, document it in your README, and proceed."*

| Decision | Choice | Why |
|---|---|---|
| Money storage | Integer **cents** | PDF: "avoid floating-point drift". No float reaches the domain. |
| Money on the wire | JSON numbers in major units | Reject >2 dp at the schema instead of adding a string-conversion layer. |
| Quantity | Decimal to 3 dp, **minimum 1**, represented internally as scaled integers | PDF types it *Number (≥ 1)* — both halves are binding: integer-only would narrow the spec, and `> 0` would widen it. Scaling stays behind conversion helpers. |
| Percentages | Integer **basis points**, behind conversion helpers | Avoids floating-point drift without leaking the storage representation through the domain. |
| Rounding | Half-up **away from zero**, 2 dp per line; document totals sum rounded lines | Precise even though the domain rejects negative inputs. Use one explicit helper rather than relying on JavaScript's rounding behavior. |
| **Fixed discount > line subtotal** | **Reject**, code `DISCOUNT_EXCEEDS_SUBTOTAL` | PDF allows reject or clamp. Rejecting produces a specific error message, which is a scored row; clamping silently rewrites user input and produces nothing to grade. |
| **Report scope** | **All documents in range, drafts included** | The PDF filters the report by issue date and says nothing about status. Filtering by status would be an unstated narrowing. Documented as an assumption. |
| Line items | **Embedded** in the document | Lines never outlive their document; finalize freezes the whole aggregate. Single-document atomicity, no transactions. |
| Discount shape | Discriminated union (`none` \| `percent` \| `fixed`) | PDF: "percent or fixed, not both" becomes unrepresentable rather than runtime-checked. |
| Stretch goals | Only after the required flow is complete | Duplicate and printable view are useful polish; neither may delay correctness, deployment, or the README. Finalize reuses the normal document validator defensively. |

## Shape

```
apps/backend/         Fastify. Owns the zod schemas. src/pricing imports nothing.
apps/frontend/        Next.js App Router. Own package.json, own types, own Dockerfile.
compose.yml           mongo · backend · frontend — at the root, so a bare
                      `docker compose up` works on a clean clone
compose.dev.yml       mongo only, for host-process development
```

Two independent projects sharing nothing but the HTTP contract. This makes the API boundary visible without introducing a workspace, shared package, or generated client.

## Testing strategy

Tests follow risk rather than forcing every feature through the same ladder:

| Surface | Approach | Why |
|---|---|---|
| Pricing | Focused unit tests | Highest-value surface and easiest place to prove rounding behavior. |
| Persistence and reporting | Integration tests against a test Mongo database | Proves ownership filters, storage, and aggregation behavior. Use Compose or Testcontainers, whichever stays simpler. |
| REST contract and lifecycle | API tests | Proves validation errors and finalized-document immutability. |
| Frontend | A few component tests for complex error/locked states, in **Vitest + Testing Library** | Avoid testing static presentation for its own sake. No Storybook requirement. Vitest keeps one runner across backend and frontend; Cypress stays reserved for real browser flows. |
| Browser contract | One Cypress happy path per phase | Exercises each real endpoint through the duplicated frontend contract. Keep edge cases in faster API and integration tests. |

---

## Phase 0 — Skeleton

**Lanes** [`docs/phases/phase-0.md`](phases/phase-0.md) — G0 conventions · 0-A backend runtime · 0-B frontend shell · 0-C infra & E2E · J0

Serves no evaluation row directly; makes every later phase demonstrable.

**Contract** Health response — trivial on purpose. It establishes the pattern: schema in the backend, mirrored type in the frontend's API client, one browser flow proving both.

**Backend** Fastify boot; validated env config; one error envelope `{ error: { code, message, details } }`; `GET /health` with Mongo connectivity; basic logging and shutdown handling.

**Frontend** App Router; design tokens; shared shell; a page calling `/health` through the typed client.

**Infra** Compose: `mongo`, `backend`, `frontend`. Use an ordinary Mongo container; embedded lines keep writes within one document, so a replica set and transaction setup buy nothing here. Mongo publishes no host port.

**Tests** API: `/health`. Cypress: the page loads and reports a healthy backend/database connection. Do not create component tests merely to test the skeleton.

**Demo** `docker compose up` on a clean clone → browser shows the app talking to Mongo.

---

## Phase 1 — Calculation engine and live editor

**Lanes** [`docs/phases/phase-1.md`](phases/phase-1.md) — G1 pricing contract · 1-A engine · 1-B preview route · 1-C editor UI · J1

**Retires: Correctness, Calculation design, Tests — three of seven.** No database, deliberately.

**Contract** Line input, line result, document totals. Rejects >2 dp money, >3 dp quantity, percent outside 0–100, and both discount types at once.

**Backend** `src/pricing`: units, rounding helper, `calculateLine`, `calculateDocument`. This directory imports nothing — not zod, not the logger; it is the "single shared module" the PDF asks for, and every later phase calls it rather than reimplementing. `POST /api/v1/pricing/preview` wraps it, stateless.

**Frontend** The line-item editor, wired to `/pricing/preview`. Discount is a type-select plus a value input. Totals render server output only — the PDF states the client must not be the source of truth, so no arithmetic ships in the browser.

**Tests**
- Unit: the PDF's sample → `189.00 / 52.50 / 180.00`, then `450.00 / 40.00 / 11.50 / 421.50`.
- Unit: a case that discriminates the rounding policy (a line whose tax lands on a half-cent).
- Unit: 100% discount, fixed discount equal to subtotal, fixed over subtotal (rejects), tax absent vs. `0`, decimal quantity, boundary values.
- API: preview matches the engine exactly.
- Optional component test only if the discount-mode state becomes non-trivial.
- Cypress: enter the PDF sample and assert the `$421.50` total returned through `/pricing/preview`.

**Demo** Open the editor, enter the PDF's three sample lines, watch the totals resolve to its published numbers.

---

## Phase 2 — Authentication and ownership

**Lanes** [`docs/phases/phase-2.md`](phases/phase-2.md) — G2 auth contract & persistence · 2-A backend auth · 2-B frontend auth · J2

**Requirement 1.** "Each user must only see and modify their own data."

**Contract** Signup, login, session user.

**Backend** Users collection, unique email index; argon2; signup / login / logout / me; JWT in an httpOnly cookie; an `authenticate` preHandler attaching `userId`. **Every repository method takes `ownerId` as a parameter** — scoped in the query, not filtered afterwards, so an unscoped read is visibly missing an argument.

**Frontend** Sign-in and create-account with real validation and server error display; auth context; protected routes; sign-out.

**Tests** Integration: duplicate email rejected by the index, not only by app code. API: signup → login → me; wrong password 401; missing cookie 401. Cypress: sign up, arrive at the protected app, sign out, and get redirected from it. Skip tests for purely presentational form states.

**Demo** Register, get redirected in, sign out, fail to return without credentials.

---

## Phase 3 — Documents, line items, validation

**Lanes** [`docs/phases/phase-3.md`](phases/phase-3.md) — G3 document contract · 3-A CRUD · 3-B validation & isolation tests · 3-C list UI · 3-D editor persistence · J3

**Requirements 2 and 6. Retires: Validation.**

**Contract** Create/update shapes plus the error-code enum the UI renders against.

**Backend** Full CRUD for documents and explicit nested line-item routes backed by the embedded array. The routes make compliance with the requested line-item CRUD obvious without introducing a separate collection. **Totals are recomputed by the Phase 1 engine and persisted on every write** — the client's numbers are never trusted, even when correct. Every validation failure carries a specific code and field path: `QUANTITY_TOO_LOW`, `UNIT_PRICE_NEGATIVE`, `TAX_PERCENT_OUT_OF_RANGE`, `DISCOUNT_TYPE_CONFLICT`, `DISCOUNT_EXCEEDS_SUBTOTAL`.

**Frontend** Documents list with empty state and delete-with-confirm; the Phase 1 editor now loading and saving; field errors rendered inline from the API's codes — the scored row is about *specific* errors, so they have to be visible as such.

**Tests** Integration: ownership isolation — a second user gets 404, not 403, on every route. API: one case per error code, asserting code and field path. Cypress: create a document, add the sample lines, save, reload, and see the correct total. Add a component test for mapping API field errors inline only if that mapping contains meaningful logic.

**Demo** Create a document, add the sample lines, save, reload, see it persisted with correct totals; submit a negative quantity and see a specific message.

---

## Phase 4 — Lifecycle and immutability

**Lanes** [`docs/phases/phase-4.md`](phases/phase-4.md) — G4 lifecycle contract · 4-A finalize & guard · 4-B immutability tests · 4-C lock UI · J4 · 4-D duplicate

**Requirement 4. Retires: Lifecycle.** Duplicate (stretch 1) lives here too — last in the phase, and only once the required flow is green. It reuses the create and finalize paths, so building it while that context is loaded is cheaper than revisiting it in Phase 6.

**Contract** Finalize response and the `DOCUMENT_FINALIZED` error. Add the duplicate response only if that stretch endpoint is implemented.

**Backend** `POST /documents/:id/finalize`, defensively reusing the normal document validator rather than creating a separate validation subsystem. Every mutating route rejects a finalized document with **409 `DOCUMENT_FINALIZED`** and a clear message. If the required flow is complete, `POST /documents/:id/duplicate` returns a new draft with fresh ids and recomputed totals.

**Frontend** Finalize confirmation — it is irreversible. Read-only document view. A 409 from a stale tab surfaces clearly rather than failing silently. Add the duplicate action with its stretch endpoint.

**Tests**
- API: **one parameterized test enumerating every mutating route** against a finalized document, each asserting 409. The PDF scores immutability *via the API*, so this is the evidence; adding a route that escapes it requires deliberately editing this list.
- API: finalize rejected on invalid persisted data and finalize twice. Add duplicate cases if the stretch endpoint is implemented.
- Component: confirm dialog and stale-tab `409` handling, where UI behavior merits focused coverage.
- Cypress: finalize a draft, see the editor lock, and verify a stale write surfaces the API rejection.

**Demo** Finalize, watch the UI lock, and show that a subsequent write is rejected by the API. If duplicate is implemented, create and edit the new draft.

---

## Phase 5 — Summary report

**Lanes** [`docs/phases/phase-5.md`](phases/phase-5.md) — G5 report contract · 5-A aggregation · 5-B report UI · J5

**Requirement 5. Retires: Reporting.**

**Contract** Range query and summary shape.

**Backend** `GET /reports/summary?from=&to=` — document count, sum of grand totals, sum of tax, sum of discount. One aggregation, scoped to the user, filtered on issue date, inclusive at both ends, timezone rule written down.

**Frontend** Range inputs, stat cards, the in-range document table, empty state, `from > to` handled. State visibly that both draft and finalized documents are included.

**Tests** Integration: **reconciliation** — the aggregate equals the sum of the individual documents in range; this is the criterion verbatim. Documents issued exactly on `from` and on `to` are included; another user's documents never count. Cypress: run a date-range report and verify its cards match the displayed in-range documents.

**Demo** Create documents across two months, run each range, watch the cards reconcile with the rows.

---

## Phase 6 — README and submission

**Lanes** [`docs/phases/phase-6.md`](phases/phase-6.md) — 6-A1/6-A2 README · 6-E deployment · 6-B seed · 6-C quality pass · J6 · 6-D printable view · J7

**Retires: Communication** — the row most often lost by people whose code was fine.

**README** Prerequisites and step-by-step setup; the calculation and rounding policy **with the PDF's worked example**; finalize/immutability rules; assumptions and tradeoffs, including the two policy calls above; what you'd improve before production; the live URL.

**Backend** A seed script so a reviewer can see data immediately. Generate OpenAPI only if it falls naturally out of the chosen Fastify schema setup; do not add a client-generation or documentation pipeline.

**Frontend** Basic responsive behavior, semantic controls, connected field errors, visible focus, and keyboard-accessible confirmation. This is a bounded quality pass, not a formal accessibility audit.

**Only if everything above is green:** a printable HTML view (stretch 3). Document numbering such as `Q-2026-014` stays a display concern; do not build configurable or concurrency-safe numbering machinery for an unstated requirement.

**Tests** Cypress: run the reviewer's core journey from signup through calculation, persistence, finalization, and reporting. This final flow proves the documented setup and submission path; it does not duplicate every API edge case.

**Demo** A stranger clones, runs `docker compose up`, signs up, reproduces `421.50`, finalizes, fails to edit, runs a report — from the README alone.
