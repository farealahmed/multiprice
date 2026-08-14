# Review Report

## Metadata

| Field | Value |
|-------|-------|
| **Review Mode** | PR #16 |
| **Target** | https://github.com/farealahmed/multiprice/pull/16 |
| **Date** | 2026-08-13 12:55 |
| **Tech Stack** | TypeScript; Next.js 15 App Router; React 19; Fastify + MongoDB (unchanged); Vitest/Testing Library; Cypress; Docker Compose |
| **Checks Run** | Code quality; test coverage; security; error handling; TypeScript strictness; runtime behavior; async patterns; React patterns; accessibility; documentation; migration |
| **Checks Skipped** | Performance — no material algorithm or query-shape change; config/dependencies — no dependency or runtime-config change; Express/Fastify and database patterns — PR has no backend route, service, persistence, or schema diff |
| **Files Changed** | 12 |
| **Lines Changed** | +1373 / -0 |

## Review Process

- [x] Preflight checks passed
- [x] Diff gathered (12 files, 1373 lines)
- [x] Tech stack detected: TypeScript, Next.js/React, Fastify/MongoDB, Vitest, Cypress, Docker Compose
- [x] Context read (no CLAUDE.md; PR description and commits in general PR mode)
- [x] Triage proposed and developer confirmed
- [x] 11 checks dispatched: code-quality, test-coverage, security, error-handling, typescript-strictness, runtime-behavior, async-patterns, react-patterns, accessibility, documentation, migration
- [x] Results collected and deduplicated
- [x] Report compiled
- [x] Verdict determined
- [x] Report saved to specs/reviews/

## Verdict: [WARN] **APPROVE WITH COMMENTS**

The printable route is additive, remains behind the existing authenticated document request, and has sound semantic/print structure. One navigation race can display and print one document's calculated line amounts with another document's metadata; fix that before relying on the printout. The README is materially more useful, but its calculation contract and setup guidance need source-accurate corrections.

### Finding Counts

| Category | 🔴 | 🟠 | 🟡 | 💭 | ⚠️ |
|----------|-----|-----|-----|-----|-----|
| Code quality | 0 | 0 | 0 | 0 | 0 |
| Test coverage | 0 | 0 | 1 | 0 | 0 |
| Security | 0 | 0 | 0 | 0 | 1 |
| Error handling | 0 | 0 | 0 | 0 | 0 |
| TypeScript strictness | 0 | 0 | 0 | 0 | 0 |
| Runtime behavior | 0 | 1 | 0 | 0 | 0 |
| Async patterns | 0 | 0 | 0 | 0 | 0 |
| React patterns | 0 | 0 | 0 | 0 | 0 |
| Accessibility | 0 | 0 | 0 | 0 | 1 |
| Documentation | 0 | 0 | 2 | 2 | 1 |
| Migration | 0 | 0 | 0 | 0 | 1 |
| **Total** | **0** | **1** | **3** | **2** | **4** |

## Code Quality

No independent finding. The shared pricing-preview race is reported under Runtime Behavior to avoid duplication. The print component separation and the shared `DocumentView` entry link follow the local component boundaries.

**Coverage:** print route, rendering component, scoped styles, and finalized-document link reviewed.

## Test Coverage

| # | Severity | Finding | Evidence | Recommendation |
|---|---|---|---|---|
| 2 | 🟡 Medium | Pricing-preview failures have no regression coverage. | `apps/frontend/src/app/(app)/documents/[id]/print/page.tsx:48-55` has a separate preview rejection path, while `page.test.tsx:85-94` only rejects `get()`. | Reject `previewMock` once, assert the alert, retry, assert a second preview request, and assert the printable document renders. |

**Coverage:** successful loading and document-GET retry are covered. Native `window.print()` and presentation-only variants are not material missing contract tests.

## Security

No source-level security finding. The route only invokes the existing credentialed, owner-scoped document GET; React renders document fields and errors as text; native printing is click-gated.

**Manual:** production TLS, document-response cache policy, CSP/frame policy, and Secure/HttpOnly/SameSite cookie settings remain operational checks.

## Error Handling

No independent finding. Ordinary GET and preview errors render an actionable retry state. The stale-load defect is consolidated under Runtime Behavior.

## TypeScript Strictness

No finding. The route maintains typed `DocumentResponse` to `LineInput` conversion, narrows errors as `unknown`, and introduces no assertions, `any`, non-null assertions, or suppression directives.

## Runtime Behavior

| # | Severity | Finding | Evidence | Recommendation |
|---|---|---|---|---|
| 1 | 🟠 High | A late route load can combine document B with document A's pricing-preview totals. | `page.tsx:29-46` accepts a late `get()` callback before it schedules `preview()`. `pricing.ts:19-58` debounces globally and resolves every queued waiter with the latest line array, so B can accept A's result while its id remains current. | Assign every `load()` invocation a monotonically increasing generation token; reject stale callbacks before calling `preview()` and before committing either success or error state. Add an A→B navigation race regression test. |

**Impact:** the table can show and print incorrect per-line monetary figures, while the summary continues to use B's server totals. No persisted document data changes, but output correctness is compromised.

## Async Patterns

No independent finding. The id-only stale guard fails both A→B and A→B→A sequences; merged into Finding 1.

## React Patterns

No independent finding. Hook dependencies, client boundary, and rendering states are conventional. The observable race is merged into Finding 1.

## Accessibility

No finding. The entry is a named native link; loading is a status region; errors are alerts with a native retry button; the print document uses a labelled article, scoped table headers, and a named totals region.

**Manual:** confirm browser print-preview and paged output preserve the intended accessible order and readable contrast.

## Documentation

| # | Severity | Finding | Evidence | Recommendation |
|---|---|---|---|---|
| 3 | 🟡 Medium | The stated rounding policy omits two engine rounding points, and the task checklist codifies the same incomplete sequence. | `README.md:59-64` and `ARCH-7-readme-submission-lane-briefs-tasks.md:122` omit rounding the subtotal before discount and the after-discount amount. `apps/backend/src/pricing/calculate-line.ts:69-82` performs four rounds: subtotal, percentage discount, after-discount, and tax. | State all four ordered rounding points in README and correct the task checklist that verifies it. |
| 4 | 🟡 Medium | Setup is not self-contained for a clean machine. | `README.md:134-155` directs users to run host `node` and Docker Compose but declares neither prerequisite. | Add a concise prerequisites list: Docker with the Compose plugin and a supported host Node version for the secret-generation command. |
| 5 | 💭 Low | The README describes `src/pricing/` as one import-free module. | `README.md:36,71-73` contradicts the actual multi-file subsystem; `calculate-line.ts:1` imports internal rounding logic. | Describe it as the pricing module set/subsystem rather than one import-free module. |
| 6 | 💭 Low | The architecture-task health check specifies an incomplete exact success payload. | `ARCH-7-readme-submission-lane-briefs-tasks.md:120` expects only `status` and `db`; `apps/backend/src/api/routes/health.ts:30-34` also returns `version`. | Require the relevant `status`/`db` fields or include `version` in the expected payload. |

**Coverage:** worked-example figures, test commands, immutability citation, and rate-limit explanation match their cited repository sources. Live URL reachability remains manual.

## Migration

No compatibility finding. The route is additive and reuses the existing document API. Finding 1 remains a navigation-flow correctness issue rather than a contract migration.

**Manual:** exercise the print action in the deployed authenticated application on target browsers/printers.

## Manual Checks Required

- [ ] Open a finalized document in production and verify print preview/Save as PDF at A4 and Letter, including a multi-page line-item table.
- [ ] Verify `https://multiprice.farealahmed.com/api/health` returns the deployed success response including `version`.
- [ ] Verify production TLS, cache headers, CSP/frame policy, and session-cookie flags.
- [ ] Run the relevant frontend test suite after fixing Findings 1–4; this source review intentionally did not execute tests or builds.

## Prioritized Action Items

### Must Fix (🔴 Critical / 🟠 High)

1. Fix the per-load pricing-preview race and protect it with an A→B navigation regression test.

### Should Address (🟡 Medium)

2. Add a print-route test for pricing-preview failure and retry.
3. Correct the README/task rounding sequence to match the four engine rounding points.
4. State Docker Compose and host Node prerequisites for the documented setup path.

### Nice to Have (💭 Low)

5. Correct the pricing-subsystem description in README.
6. Correct the internal health-check checklist payload expectation.

---
*Generated by Review — 2026-08-13 12:55*
