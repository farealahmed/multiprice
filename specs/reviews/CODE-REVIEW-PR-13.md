# Review Report

## Metadata

| Field | Value |
|-------|-------|
| **Review Mode** | PR #13 |
| **Target** | https://github.com/farealahmed/multiprice/pull/13 |
| **Date** | 2026-08-13 17:41 AEST |
| **Tech Stack** | TypeScript; Fastify 5, Zod, MongoDB driver, Vitest; Next.js 15, React 19, Testing Library, Cypress |
| **Checks Run** | Code Quality; Test Coverage; Security; Error Handling; Performance; Database Patterns; Migration; TypeScript Strictness; Runtime Behavior; Async Patterns; React Patterns; Accessibility; Documentation |
| **Checks Skipped** | Task Completion — general PR mode; Config/Dependencies — no config, lockfile, or dependency changes; Express Patterns — backend uses Fastify |
| **Files Changed** | 38 |
| **Lines Changed** | +3930 / -8 |

## Review Process

- [x] Preflight checks passed
- [x] Diff gathered (38 files, 3,938 changed lines)
- [x] Tech stack detected: TypeScript; Fastify/Zod/MongoDB; Next.js/React; Vitest/Cypress
- [x] Context read (no CLAUDE.md; PR description and commit messages)
- [x] Triage proposed and developer confirmed
- [x] 13 checks dispatched: code-quality, test-coverage, security, error-handling, performance, database-patterns, migration, typescript-strictness, runtime-behavior, async-patterns, react-patterns, accessibility, documentation
- [x] Results collected and deduplicated
- [x] Report compiled
- [x] Verdict determined
- [x] Report saved to specs/reviews/

## Verdict: ❌ REQUEST CHANGES

The route/service/repository boundaries, owner scoping, cents-to-major conversion, and frontend build are sound; Cypress passes the two visible boundary-date reconciliation scenarios. The page nevertheless obtains its cards and rows from independent reads, so it can display non-reconciling values during normal concurrent writes—the feature's central guarantee. Date-range validation and retry behavior also violate the advertised contract in observable edge cases.

### Finding Counts

| Category | 🔴 | 🟠 | 🟡 | 💭 | ⚠️ |
|----------|-----|-----|-----|-----|-----|
| Code Quality | 0 | 0 | 0 | 0 | 0 |
| Test Coverage | 0 | 0 | 2 | 0 | 0 |
| Security | 0 | 0 | 0 | 0 | 0 |
| Error Handling | 0 | 0 | 1 | 0 | 0 |
| Performance | 0 | 0 | 0 | 0 | 0 |
| Database Patterns | 0 | 0 | 0 | 0 | 0 |
| Migration | 0 | 0 | 1 | 0 | 0 |
| TypeScript Strictness | 0 | 0 | 0 | 0 | 0 |
| Runtime Behavior | 0 | 1 | 1 | 0 | 0 |
| Async Patterns | 0 | 0 | 0 | 0 | 0 |
| React Patterns | 0 | 0 | 0 | 0 | 0 |
| Accessibility | 0 | 0 | 2 | 0 | 0 |
| Documentation | 0 | 0 | 0 | 0 | 0 |
| **Total** | **0** | **1** | **8** | **0** | **0** |

### Code Quality

No findings. The implementation retains the existing route → service → repository boundary and uses the shared range-filter helper in both Mongo read paths.

### Test Coverage

| # | Severity | Finding | Evidence and impact | Required direction |
|---|---|---|---|---|
| 5 | 🟡 Medium | Route-level invalid-range envelopes are untested. | `apps/backend/test/integration/reports.test.ts:175` begins the success/reconciliation suite; it has no authenticated requests asserting that either amended route returns `400 VALIDATION_FAILED`, the domain code, and the offending `details[].path`. Schema tests cannot prove Fastify query parsing and the shared envelope mapper are connected correctly. | Add parameterized integration cases for malformed and inverted ranges on both `/api/v1/reports/summary` and `/api/v1/documents`. |
| 6 | 🟡 Medium | Cypress does not bind reconciliation assertions to the selected range's requests. | `e2e/report.cy.ts:116-124` starts intercepting before `cy.visit('/report')`, which triggers the default-month reads. The waits after `setRange()` can therefore consume those initial requests rather than the July/August reads the test claims to verify. | Wait for initial load before changing the range, then match/alias the selected `from` and `to` request URLs before reconciling cards and rows. |

The integration test was attempted locally but all 14 cases were skipped because `MONGO_URL` was unset; see Manual Checks Required.

### Security

No findings. Both endpoints authenticate before parsing/querying; the authenticated `ownerId` is embedded in the list scope and the aggregation's initial `$match`. Zod reduces query values to strings before Mongo construction.

### Error Handling

| # | Severity | Finding | Evidence and impact | Required direction |
|---|---|---|---|---|
| 1 | 🟡 Medium | ISO-shaped but impossible dates are accepted. | `apps/backend/src/contracts/report.ts:19-31` only checks a digit regex. `2026-02-30` and `2026-99-99` therefore pass into both range queries, which use lexicographic bounds and return `200` rather than documented `DATE_RANGE_INVALID`. | Validate Gregorian calendar dates, including month lengths and leap years; add contract cases for impossible ISO-shaped values. |

### Performance

No findings. The summary aggregation groups in Mongo and emits at most one result; the page starts its required reads concurrently. The missing owner/date index is explicitly documented as a deliberate scale trade-off for this phase, not an unacknowledged regression.

### Database Patterns

No findings. The aggregation scopes `ownerId` in its first `$match`, shares the inclusive issue-date predicate with document listing, aggregates persisted integer-cent totals, and zero-fills an empty aggregate.

### Migration

| # | Severity | Finding | Evidence and impact | Required direction |
|---|---|---|---|---|
| 2 | 🟡 Medium | Omitted summary bounds have an undocumented wire representation. | The contract permits each bound to be absent (`docs/contracts/phase-5.md:22-24`) and declares required echoed strings (`:28-35`). `apps/backend/src/services/reports.ts:18-20` instead turns omitted values into `''`. Consumers cannot distinguish an intentionally empty sentinel from a literal echo because the contract never defines it. | Make bounds optional end-to-end, or explicitly define and test the empty-string sentinel in both mirrored contracts and the contract document. |

Existing `documents.list()` callers remain backward compatible, and Fastify autoload makes the new endpoint reachable.

### TypeScript Strictness

No findings. Zod-derived types, Mongo aggregate generics, and existing authenticated-request narrowing are used without new unsafe casts or suppressions.

### Runtime Behavior

| # | Severity | Finding | Evidence and impact | Required direction |
|---|---|---|---|---|
| 3 | 🟠 High | The cards and rows are not read from one consistent report state. | `apps/frontend/src/app/(app)/report/page.tsx:46-50` issues independent `/reports/summary` and `/documents` reads. A create, update, or delete between the aggregation and list query lets the page render figures and rows from different document states, contradicting the visible promise at `:77-80` that totals “always reconcile.” | Provide the summary and rows from one snapshot-consistent backend operation, or otherwise bind both reads to the same immutable report version. Add a regression scenario that mutates data between the two reads. |
| 4 | 🟡 Medium | Retry silently changes a user-selected range. | `apps/frontend/src/app/(app)/report/page.tsx:66-68` rebuilds the current month instead of retaining the range passed to `load`. After a failed July request, the picker still displays July while retry loads current-month data. | Store the last submitted `DateRange` and retry exactly that value; assert API-call arguments in the page test. |

### Async Patterns

No separate findings after deduplication with Runtime Behavior. The request-state consistency and retry defects above are the async issues.

### React Patterns

No separate findings after deduplication. The report page's hook dependencies and controlled fields otherwise follow the project's client-component pattern.

### Accessibility

| # | Severity | Finding | Evidence and impact | Required direction |
|---|---|---|---|---|
| 7 | 🟡 Medium | Inverted-range validation is not exposed as an accessible error. | `apps/frontend/src/components/report/RangePicker.tsx:47-53,91` inserts ordinary text while focus remains on the button; it has no live/error role and is not associated with either input. Screen-reader users are not reliably told why submission was rejected. | Use an announced error/status and associate it with the affected controls (`aria-invalid` and `aria-describedby` as appropriate). |
| 8 | 🟡 Medium | Loading and request-failure states are not announced. | `apps/frontend/src/app/(app)/report/page.tsx:88-102` renders plain containers for loading and error states. A user who submits or retries the report receives no programmatic completion/failure notification. | Expose loading as a status and failure as an alert, consistent with existing application feedback patterns. |

These are WCAG 2.1 SC 4.1.3 (Status Messages) and, for the validation case, SC 3.3.1 (Error Identification).

### Documentation

No separate findings after deduplication. Inclusion rules, draft inclusion, persisted-cent conversion, and error-envelope documentation agree with the implementation; the omitted-bound response ambiguity is recorded under Migration.

## Manual Checks Required

- [ ] Set a reachable test Mongo instance through `MONGO_URL` and rerun `cd apps/backend && npx vitest run test/integration/reports.test.ts`; local execution skipped all 14 cases because the variable was unset.
- [ ] After resolving finding 3, exercise a document mutation deliberately interleaved between the report's component reads and confirm cards and table remain a single consistent view.

## Prioritized Action Items

### Must Fix (🔴 Critical / 🟠 High)

1. **#3 — Make report cards and rows snapshot-consistent.** The current two-request composition can violate the PR's core reconciliation claim during concurrent writes.

### Should Address (🟡 Medium)

1. **#1 — Reject impossible calendar dates** and cover them in the shared schema.
2. **#2 — Define the response representation for omitted bounds** in the mirrored contract and documentation.
3. **#4 — Retry the previously submitted range**, not the current month.
4. **#5 — Cover invalid HTTP range envelopes** for both public endpoints.
5. **#6 — Bind Cypress waits to the selected range requests.**
6. **#7 — Announce client-side range validation errors.**
7. **#8 — Announce loading and request failures.**

### Nice to Have (💭 Low)

None.

---
*Generated by Review — 2026-08-13 17:41 AEST*
