# Implementation phases — Multi-Rate Pricing Calculator

## What this is

A take-home submission for a Full Stack role. The PDF (`docs/multi-rate-pricing-calculator.pdf`) is the only authority. The HTML in `design/htmls/` is illustration — it has no say over data models, policies, or scope, and where it disagrees with the PDF, it is wrong and gets changed.

**Deliverables:** source code, a live URL (deployment already handled), and a README covering setup, rounding policy with a worked example, immutability rules, assumptions, and what you'd improve.

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

## Two rules that produce this plan

**1. The contract is the unit of work, not the layer.** Each phase opens by writing the zod schemas for its endpoints in the backend, and the mirrored response types in the frontend client. The two apps stay genuinely independent — no shared package, no workspace — so the types are duplicated by hand, deliberately. This project's lifecycle ends at the interview; a shared package would buy drift-proofing that only pays off over months of maintenance, at the cost of coupling two Docker builds today.

Drift is caught instead by rule 2: every phase ends with a browser flow that exercises the real endpoint. A renamed field breaks that flow in the same phase that renamed it.

**2. A phase is done when a human can do something in a browser.** Each phase closes with a demo script: real clicks against the Compose stack. This prevents a backend that runs four phases ahead of a UI nobody built, and it is what keeps the duplicated types honest.

**Ordering is by risk retired.** Pricing first, before any database — it carries three of the seven evaluation rows and needs no persistence to be correct. Identity second, because every later query is scoped by it and retrofitting ownership is how leaks get written. Lifecycle gets its own phase because immutability is a rule over *every* mutating route, and proving a negative deserves dedicated attention. Reporting late, because it needs documents created by the real flow.

Rejected: **layer-first** (all backend, then all frontend) defers every integration risk to the end. **Page-first** smears the calculation across whichever screen needed it first — precisely what the "single shared module" criterion is testing for.

---

## Decisions

Made on the PDF's terms. It says: *"If anything is ambiguous, make a reasonable assumption, document it in your README, and proceed."*

| Decision | Choice | Why |
|---|---|---|
| Money storage | Integer **cents** | PDF: "avoid floating-point drift". No float reaches the domain. |
| Money on the wire | JSON numbers in major units | Reject >2 dp at the schema instead of adding a string-conversion layer. |
| Quantity | Decimal to 3 dp, integer **milli-units** | PDF types it *Number (≥ 1)*. Integer-only would silently narrow the spec. |
| Percentages | Integer **basis points** | `0.1` isn't representable in binary floating point. |
| Rounding | Half-up away from zero, 2 dp per line; document totals sum rounded lines | The PDF's sample expects exactly this. `Math.round` is half-up toward +∞ and wrong on negatives — explicit helper. |
| **Fixed discount > line subtotal** | **Reject**, code `DISCOUNT_EXCEEDS_SUBTOTAL` | PDF allows reject or clamp. Rejecting produces a specific error message, which is a scored row; clamping silently rewrites user input and produces nothing to grade. |
| **Report scope** | **All documents in range, drafts included** | The PDF filters the report by issue date and says nothing about status. Filtering by status would be an unstated narrowing. Documented as an assumption. |
| Line items | **Embedded** in the document | Lines never outlive their document; finalize freezes the whole aggregate. Single-document atomicity, no transactions. |
| Discount shape | Discriminated union (`none` \| `percent` \| `fixed`) | PDF: "percent or fixed, not both" becomes unrepresentable rather than runtime-checked. |
| Stretch goals | All three | Duplicate and finalize-validation reuse work from Phase 4; printable view is a template over data that already exists. |

## Shape

```
apps/backend/         Fastify. Owns the zod schemas. src/pricing imports nothing.
apps/frontend/        Next.js App Router. Own package.json, own types, own Dockerfile.
infra/compose.yml     mongo · backend · frontend
```

Two independent projects sharing nothing but the HTTP contract. Each builds from its own directory.

## Test ladder

Every phase climbs the same rungs; if one doesn't apply, the phase says so.

| Rung | Tool | Answers |
|---|---|---|
| Unit | Vitest | Is the logic right? |
| Integration | Vitest + testcontainers | Does it survive a real Mongo? |
| API | supertest | Does the contract hold, including failures? |
| Component | Storybook | Does every UI state exist? |
| E2E | Cypress | Does the demo script work? |

---

## Phase 0 — Skeleton

Serves no evaluation row directly; makes every later phase demonstrable.

**Contract** Health response — trivial on purpose. It establishes the pattern: schema in the backend, mirrored type in the frontend's API client, one browser flow proving both.

**Backend** Fastify boot; zod-validated env config that refuses to start on a missing var; pino; one error envelope `{ error: { code, message, details } }`; `GET /health` with Mongo connectivity; graceful shutdown.

**Frontend** App Router; design tokens; shared shell; a page calling `/health` through the typed client.

**Infra** Compose: `mongo` (single-node replica set, idempotent init), `backend`, `frontend`. Mongo publishes no host port.

**Tests** Unit: config rejects bad env. API: `/health`. Component: one primitive. E2E: page loads healthy. No integration rung — nothing persists yet.

**Demo** `docker compose up` on a clean clone → browser shows the app talking to Mongo.

---

## Phase 1 — Calculation engine and live editor

**Retires: Correctness, Calculation design, Tests — three of seven.** No database, deliberately.

**Contract** Line input, line result, document totals. Rejects >2 dp money, >3 dp quantity, percent outside 0–100, and both discount types at once.

**Backend** `src/pricing`: units, rounding helper, `calculateLine`, `calculateDocument`. This directory imports nothing — not zod, not the logger; it is the "single shared module" the PDF asks for, and every later phase calls it rather than reimplementing. `POST /api/v1/pricing/preview` wraps it, stateless.

**Frontend** The line-item editor, wired to `/pricing/preview`. Discount is a type-select plus a value input. Totals render server output only — the PDF states the client must not be the source of truth, so no arithmetic ships in the browser.

**Tests**
- Unit: the PDF's sample → `189.00 / 52.50 / 180.00`, then `450.00 / 40.00 / 11.50 / 421.50`.
- Unit: a case that discriminates the rounding policy (a line whose tax lands on a half-cent).
- Unit: 100% discount, fixed discount equal to subtotal, fixed over subtotal (rejects), tax absent vs. `0`, decimal quantity, boundary values.
- API: preview matches the engine exactly.
- Component: line row, discount input in all three states, totals panel.
- E2E: type the PDF's sample into the editor, assert `$421.50`.

**Demo** Open the editor, enter the PDF's three sample lines, watch the totals resolve to its published numbers.

---

## Phase 2 — Authentication and ownership

**Requirement 1.** "Each user must only see and modify their own data."

**Contract** Signup, login, session user.

**Backend** Users collection, unique email index; argon2; signup / login / logout / me; JWT in an httpOnly cookie; an `authenticate` preHandler attaching `userId`. **Every repository method takes `ownerId` as a parameter** — scoped in the query, not filtered afterwards, so an unscoped read is visibly missing an argument.

**Frontend** Sign-in and create-account with real validation and server error display; auth context; protected routes; sign-out.

**Tests** Integration: duplicate email rejected by the index, not only by app code. API: signup → login → me; wrong password 401; missing cookie 401. Component: field default/error/disabled. E2E: sign up, land in, sign out, get bounced.

**Demo** Register, get redirected in, sign out, fail to return without credentials.

---

## Phase 3 — Documents, line items, validation

**Requirements 2 and 6. Retires: Validation.**

**Contract** Create/update shapes plus the error-code enum the UI renders against.

**Backend** Full CRUD for documents and for lines on the embedded array. **Totals are recomputed by the Phase 1 engine and persisted on every write** — the client's numbers are never trusted, even when correct. Every validation failure carries a specific code and field path: `QUANTITY_TOO_LOW`, `UNIT_PRICE_NEGATIVE`, `TAX_PERCENT_OUT_OF_RANGE`, `DISCOUNT_TYPE_CONFLICT`, `DISCOUNT_EXCEEDS_SUBTOTAL`.

**Frontend** Documents list with empty state and delete-with-confirm; the Phase 1 editor now loading and saving; field errors rendered inline from the API's codes — the scored row is about *specific* errors, so they have to be visible as such.

**Tests** Integration: ownership isolation — a second user gets 404, not 403, on every route. API: one case per error code, asserting code and field path. Component: table, empty state, inline error, error banner. E2E: create → add lines → save → correct total in the list.

**Demo** Create a document, add the sample lines, save, reload, see it persisted with correct totals; submit a negative quantity and see a specific message.

---

## Phase 4 — Lifecycle and immutability

**Requirement 4. Retires: Lifecycle.** Plus stretch goals 1 and 2.

**Contract** Finalize and duplicate responses, the `document_finalized` error.

**Backend** `POST /documents/:id/finalize`, with pre-finalize validation rejecting qty ≤ 0 or negative prices (stretch 2). Every mutating route rejects a finalized document with **409 `document_finalized`** and a clear message. `POST /documents/:id/duplicate` returns a new draft with fresh ids and recomputed totals (stretch 1).

**Frontend** Finalize confirmation — it is irreversible. Read-only document view. Duplicate action. A 409 from a stale tab surfaces clearly rather than failing silently.

**Tests**
- API: **one parameterized test enumerating every mutating route** against a finalized document, each asserting 409. The PDF scores immutability *via the API*, so this is the evidence; adding a route that escapes it requires deliberately editing this list.
- API: finalize rejected on an invalid line; finalize twice; duplicate from both states.
- Component: locked banner, confirm dialog, read-only table.
- E2E: finalize → attempt edit → locked → duplicate → edit the copy.

**Demo** Finalize, watch the UI lock, fail to edit it, duplicate, edit the copy.

---

## Phase 5 — Summary report

**Requirement 5. Retires: Reporting.**

**Contract** Range query and summary shape.

**Backend** `GET /reports/summary?from=&to=` — document count, sum of grand totals, sum of tax, sum of discount. One aggregation, scoped to the user, filtered on issue date, inclusive at both ends, timezone rule written down.

**Frontend** Range inputs, stat cards, the in-range document table, empty state, `from > to` handled.

**Tests** Integration: **reconciliation** — the aggregate equals the sum of the individual documents in range; this is the criterion verbatim. Integration: documents issued exactly on `from` and on `to` are included; another user's documents never counted. E2E: run a report, totals match the table.

**Demo** Create documents across two months, run each range, watch the cards reconcile with the rows.

---

## Phase 6 — README and submission

**Retires: Communication** — the row most often lost by people whose code was fine.

**README** Prerequisites and step-by-step setup; the calculation and rounding policy **with the PDF's worked example**; finalize/immutability rules; assumptions and tradeoffs, including the two policy calls above; what you'd improve before production; the live URL.

**Backend** OpenAPI from the shared schemas (near-free once contracts exist); a seed script so a reviewer sees data immediately.

**Frontend** Printable view (stretch 3).

**Only if everything above is green:** responsive fixes and an accessibility pass. Neither is in the evaluation table; both are polish, and polish never precedes a scored row.

**Demo** A stranger clones, runs `docker compose up`, signs up, reproduces `421.50`, finalizes, fails to edit, runs a report — from the README alone.
