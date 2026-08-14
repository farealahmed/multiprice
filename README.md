# multiprice

A multi-rate pricing calculator: documents with per-line discounts and tax rules, a strict
draft → finalized lifecycle, and a summary report across any date range. Built against the
take-home assignment in `docs/multi-rate-pricing-calculator.pdf`.

**Live URL:** [https://multiprice.farealahmed.com](https://multiprice.farealahmed.com)

## Implementation Scope

**Requirements**

- ✅ Authentication — sign up / log in (argon2 password hashing, timing-safe login, httpOnly JWT session cookie), every user's data is structurally scoped by owner id
- ✅ Documents & line items — full CRUD, discount type (fixed vs. percent) is unrepresentable-both-at-once by the schema itself
- ✅ Calculations — integer cents / thousandths / basis points throughout, half-up rounding, matches the PDF's sample to the cent
- ✅ Document lifecycle — draft fully editable, finalized read-only, enforced by a self-verifying immutability guard
- ✅ Summary report — database-level aggregation, independently reconciliation-tested against the underlying documents
- ✅ REST API — one error envelope shape, specific domain error codes everywhere

**Stretch goals**

- ✅ **Duplicate** — copy any document (draft or finalized) into a new draft
- ✅ **Finalize validation** — reject finalize if any line has quantity ≤ 0 *or* a negative price
- ✅ **Printable view** — a print-optimized HTML page with `@media print` styling, reachable from a finalized document; no PDF-generation dependency, the browser's own print/"Save as PDF" covers that case

## Architecture Overview

Two independent apps, sharing no package, connected by a same-origin proxy — the frontend
rewrites `/api/*` to the backend, so the browser only ever talks to one origin and the session
cookie never becomes a cross-site problem.

```
apps/backend    Fastify + MongoDB
  src/api/         routes + plugins (auth, immutability guard, rate limiting, error handling)
  src/services/    business logic — one function per document operation
  src/pricing/     the calculation engine — self-contained, no external dependencies, called by every route that touches money
  src/persistence/ MongoDB repositories, one per collection
  src/contracts/   zod schemas — the single source of truth for validation and wire shapes
  src/domain/      stored-record types

apps/frontend   Next.js App Router
  src/app/         routes
  src/components/  one directory per feature area (documents, line-items, lifecycle, print, report)
  src/lib/api/     a typed client mirroring the backend's contracts by hand
```

**Why two apps with hand-mirrored types, not a shared package or generated client:** this
exercise doesn't run long enough for that drift to become a real cost, and each phase's Cypress
flow keeps the two sides honest against each other in the meantime.

**The immutability guard is self-verifying, not just applied.** Rather than hand-checking
"is this document finalized?" in every mutating route, a boot-time check walks every registered
route and refuses to start the app if a mutating route on `/documents/:id/*` isn't explicitly
guarded (or explicitly exempted, like `duplicate`, which creates a new document rather than
mutating the source). A forgotten guard becomes a startup failure, not a silent gap.

## Calculation & Rounding Policy

Per line, in order, with a round after every fractional step (four rounding points total):
**subtotal → round → discount → round → after-discount amount → round → tax on the discounted
amount → round → line total.** Document totals are sums of the already-rounded line figures —
no re-rounding at the document level.

**Policy, in one sentence:** half-up (away from zero), 2 decimal places, at every fractional
step.

**Why integer cents, quantity in thousandths, percentages in basis points:** the assignment
calls for avoiding floating-point drift — converting to exact integers at the API boundary and
never touching a floating-point dollar amount again inside the engine does that directly,
rather than trying to catch drift after the fact.

The engine lives in `apps/backend/src/pricing/` — a self-contained module set with no external
dependencies (its files import only each other, e.g. the line calculator imports the rounding
helper) — and is called by every route that touches money (create, update, finalize, duplicate,
and the live pricing preview the editor uses).

**Worked example** (the PDF's own sample):

| Line | Qty | Unit price | Discount | Tax | Subtotal | Discount amt | After discount | Tax amt | Line total |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Widget A | 2 | 100.00 | 10% | 5% | 200.00 | 20.00 | 180.00 | 9.00 | 189.00 |
| Widget B | 1 | 50.00 | — | 5% | 50.00 | 0.00 | 50.00 | 2.50 | 52.50 |
| Service fee | 1 | 200.00 | $20 fixed | — | 200.00 | 20.00 | 180.00 | 0.00 | 180.00 |

**Document totals:** Subtotal `450.00` · Total discount `40.00` · Total tax `11.50` · **Grand
total `421.50`**

The grand total is reachable two ways and both agree: `189.00 + 52.50 + 180.00 = 421.50`, or
`450.00 − 40.00 + 11.50 = 421.50`.

Tax is applied on the *discounted* amount, not the original — Widget A's tax is 5% of `180.00`,
not of `200.00`.

## Finalize & Immutability Rules

`draft` is fully editable (add, edit, remove lines, edit metadata). `finalized` is read-only —
every mutating route (`PATCH`/`DELETE` on the document, all three line-item routes, and finalize
itself) returns `409 DOCUMENT_FINALIZED` against a finalized document, before the request body
is even validated.

The evidence: `apps/backend/test/api/immutability.test.ts` runs a parametrized suite over all
six guarded routes, asserting two things for each — a *valid* mutation attempt is rejected
**and leaves the document byte-for-byte unchanged** (a `GET` before and after are compared), and
an *invalid* body is still rejected with `409` rather than a `400` (proving the guard runs
before schema validation, not after).

## Assumptions & Tradeoffs

**Calculation rules**
- A fixed discount that exceeds its line's subtotal is **rejected** (`DISCOUNT_EXCEEDS_SUBTOTAL`), not clamped. The PDF allows either; rejecting surfaces a specific error the user can act on, while clamping would silently rewrite what they typed.
- Totals are always server-computed. A create/update payload that includes `status` or `totals` is rejected outright (`SERVER_MANAGED_FIELD`), not silently stripped.

**Data model**
- Lines are embedded in the document, not a separate collection — they never outlive it, and finalize freezes the whole aggregate in one atomic write.
- Two independent apps, hand-mirrored types across the HTTP boundary (see Architecture Overview above).

**Reporting**
- The summary report includes drafts. The PDF filters by issue date and says nothing about status; filtering to finalized-only would narrow a requirement it never stated.
- Both range ends are inclusive, and `issueDate` is compared as a plain calendar-date string — never parsed into a `Date` — so no timezone can shift a document into another month.

**Found and fixed while building this**
- Duplicate existed only as a dead frontend stub calling a backend route that had never been implemented (a real `404` in practice) until this was caught and the actual service + route were built.
- The finalize-validation stretch goal only checked quantity defensively at finalize time — the pricing engine itself had no check for a negative unit price at all, only the write-time schema did. Both halves are now checked symmetrically at finalize.
- A unified end-to-end journey test (signup → sample document → finalize → report) was considered but not built; the Cypress specs below already cover the same ground per-phase instead.
- The printable view's page had a real race: its live pricing-preview call goes through a shared, debounced client function that resolves every in-flight caller with whichever line array was requested last, regardless of which document asked. Navigating from one document's print page to another's before the first had finished loading could let the second page render the first's line-level totals. Caught in review; fixed with a per-load generation token that stops a stale request from calling the preview endpoint at all once navigation has moved on, with a regression test covering the exact sequence.

## What I'd Improve Before Production

- **Email verification.** Signup currently validates email *shape* only (`name@domain.tld`) — there's no confirmation email or deliverability check, so a syntactically-valid but fake or unowned address is accepted. This was in-scope intent that didn't make it in; it's the first thing I'd close before real users.
- **Rate limiting by real client IP.** The current global rate limiter keys on `request.ip`, which in the Compose/reverse-proxy topology is the frontend container's address, not the original browser's — documented directly in `apps/backend/src/api/plugins/rate-limit.ts`. Fixing it properly needs a real reverse proxy terminating the client connection.
- Refresh tokens and session revocation (the current session is a long-lived signed cookie with no server-side revocation path).
- A report index on `{ownerId, issueDate}`, measured against real data volume.
- Seed data / a demo account, so a reviewer sees a populated app immediately instead of an empty one.
- Per-currency support and currency-aware rounding (everything today assumes one currency).
- A generated API client if the two apps kept growing — hand-mirrored types are fine at this size, not indefinitely.

## Setup

**Prerequisites:** Docker Engine with the Compose v2 plugin (the `docker compose` command below,
not the legacy `docker-compose`), and Node 22+ on the host — only needed for the one-off
`JWT_SECRET` generation command, not for running the app itself.

`docker compose up` requires a `.env` file at the repository root — it is not committed, and
there is no working default for `JWT_SECRET` (an empty or guessable session secret would make
signed cookies forgeable).

```sh
git clone <this-repo>
cd multiprice
cp .env.example .env
```

Generate a real value for `JWT_SECRET` (host Node 22+ required for this command only):

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Paste the output into `.env` as `JWT_SECRET=...`. Then:

```sh
docker compose up --build
```

Open `http://localhost:3000`, sign up with any email/password, and start creating documents.

## Running the Tests

| Surface | Command | Count |
|---|---|---|
| Backend (unit + API + integration) | `npm --prefix apps/backend test` | 316 tests |
| Frontend (component) | `npm --prefix apps/frontend test` | 94 tests |
| End-to-end | `npx cypress run --config-file e2e/cypress.config.js` | 5 specs (`auth`, `documents`, `lifecycle`, `report`, `health`) |

The calculation engine's own tests live in `apps/backend/src/pricing/*.test.ts` — start there
for the rounding-policy and worked-example coverage specifically.

Backend suites that require MongoDB (API and integration tests) skip cleanly with
`describe.skipIf` when no database is reachable, rather than failing red — run `npm run dev-db`
first (starts Mongo alone via `compose.dev.yml`) to exercise the full suite.

## Project Structure

```
multiprice/
├── apps/
│   ├── backend/     Fastify API — see Architecture Overview above
│   └── frontend/    Next.js app — see Architecture Overview above
├── e2e/             Cypress specs, one per phase
├── docs/            the assignment PDF, its markdown transcription, and per-phase contracts
├── specs/           architecture and task docs for each GitHub issue this was built from
├── design/          static HTML mockups (source of truth for visual design, not data models)
└── compose.yml      the whole stack — mongo, backend, frontend
```

## Development Approach

This was built with an agentic, issue-driven pipeline rather than one continuous session:

1. The PDF assignment was turned into a phased plan, and each phase became its own GitHub issue.
2. Per issue, the same repeatable cycle: **issue → architecture doc → task breakdown →
   implementation → tests → commit → pull request → review → fix any high/critical findings →
   merge → archive the old spec docs → move to the next issue.**
3. That review-and-fix loop before every merge is why the codebase has the discipline it does —
   things like the self-verifying immutability guard and the report-reconciliation test suite
   came out of that process, not a single unreviewed pass.

Two gaps still slipped through an earlier phase and only surfaced on a later pass over the
finished app: duplicate's missing backend, and the engine's missing negative-price check (see
Assumptions above). Both were found and closed before submission — a reminder that "phase
complete and merged" isn't the same as "verified end to end," which is part of why the
assumptions above are stated as plainly as they are rather than smoothed over.
