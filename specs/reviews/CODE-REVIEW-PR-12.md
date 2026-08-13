# Review Report

## Metadata

| Field | Value |
|-------|-------|
| **Review Mode** | PR #12 |
| **Target** | https://github.com/farealahmed/multiprice/pull/12 |
| **Date** | 2026-08-13 13:53 |
| **Tech Stack** | TypeScript; Fastify 5; MongoDB; Next.js 15; React 19; Vitest; Cypress |
| **Checks Run** | Code Quality, Test Coverage, Performance, Security, Error Handling, Documentation, TypeScript Strictness, Runtime Behavior, Async Patterns, React Patterns, Database Patterns, Migration, Accessibility |
| **Checks Skipped** | Task Completion (general PR mode, not a pipeline ARCH review); Config & Dependencies (no config, manifest, lockfile, or environment changes); Express Patterns (backend uses Fastify) |
| **Files Changed** | 39 |
| **Lines Changed** | +4458 / -53 |

## Review Process

- [x] Preflight checks passed
- [x] Diff gathered (39 files, 4511 changed lines)
- [x] Tech stack detected: TypeScript, Fastify 5, MongoDB, Next.js 15, React 19, Vitest, Cypress
- [x] Context read (no CLAUDE.md present; PR description and commit summary read)
- [x] Triage proposed and developer confirmed
- [x] 13 checks dispatched: Code Quality, Test Coverage, Performance, Security, Error Handling, Documentation, TypeScript Strictness, Runtime Behavior, Async Patterns, React Patterns, Database Patterns, Migration, Accessibility
- [x] Results collected and deduplicated
- [x] Report compiled
- [x] Verdict determined
- [x] Report saved to specs/reviews/

## Verdict: ❌ REQUEST CHANGES

The PR has a coherent route registry, owner-scoped guard, conditional finalization write, component coverage, and explicit lifecycle copy. However, the advertised API immutability guarantee is not atomic: concurrent writes can modify a finalized document, and a finalization can commit a revision that was never validated. The finalize path also discards the totals it computes, contradicting its new contract; these are merge blockers.

### Finding Counts

| Category | 🔴 | 🟠 | 🟡 | 💭 | ⚠️ |
|----------|-----|-----|-----|-----|-----|
| Code Quality | 1 | 1 | 0 | 0 | 0 |
| Test Coverage | 0 | 0 | 1 | 0 | 0 |
| Performance | 0 | 0 | 1 | 0 | 0 |
| Security | 1 | 0 | 0 | 0 | 0 |
| Error Handling | 0 | 0 | 0 | 0 | 0 |
| Documentation | 0 | 0 | 0 | 0 | 0 |
| TypeScript Strictness | 0 | 0 | 1 | 0 | 0 |
| Runtime Behavior | 0 | 0 | 1 | 0 | 0 |
| Async Patterns | 0 | 0 | 1 | 0 | 0 |
| React Patterns | 0 | 1 | 0 | 0 | 0 |
| Database Patterns | 0 | 0 | 0 | 0 | 0 |
| Migration | 0 | 0 | 0 | 0 | 0 |
| Accessibility | 0 | 0 | 2 | 0 | 0 |
| **Total** | **2** | **2** | **7** | **0** | **0** |

## Findings

### 1. 🔴 Critical — Couple lifecycle validation and every mutation to the same revision

**Locations:** `apps/backend/src/api/plugins/immutability.ts:81-96`; `apps/backend/src/services/lifecycle.ts:54-80`; `apps/backend/src/persistence/documents.repository.ts:66-69`

The guard reads `status` in a separate `findOne`, then the existing routes perform unconditional owner-scoped updates and deletes. A PATCH, line mutation, or DELETE can pass while the document is a draft; a concurrent finalize can set `status: 'finalized'`; then the already-admitted mutation can still commit. The API therefore permits writes after finalization.

The inverse transition is also unbound: `finalizeDocument` validates the snapshot returned by `findById`, while `finalizeIfDraft` predicates only on `_id`, `ownerId`, and `status`. A concurrent draft mutation can change or remove lines after validation but before the status flip; the finalizer then locks an empty or invalid revision.

**Required change:** use one concurrency mechanism across document mutation and finalization—transactional serialization or a monotonic revision/`updatedAt` compare-and-set. Every mutation must require both ownership and `status: 'draft'`; finalization must prove the revision it validates is the revision it transitions. Map a failed conditional mutation to the correct 404/409 lifecycle result without leaking foreign-document existence.

**Review tracing:** Code Quality, Security, Error Handling, Runtime Behavior, Async Patterns, and Database Patterns independently reported this underlying TOCTOU. Consolidated here as one structural defect.

### 2. 🔴 Critical — Persist the newly computed totals when finalizing

**Locations:** `apps/backend/src/services/lifecycle.ts:63-82`; `apps/backend/src/persistence/documents.repository.ts:66-69`; `docs/contracts/phase-4.md:14`

`calculateDocument(engineLines)` is invoked only to detect validation errors. Its result is discarded, and `finalizeIfDraft` writes only `status` and `updatedAt`. The new endpoint contract says finalize “Recompute[s] totals,” while the service comment explicitly says totals are “never recomputed or overwritten.” A stale draft total remains authoritative after the irreversible transition.

**Required change:** carry the engine result into the same conditional finalization write and persist the recomputed totals with `status: 'finalized'`; add an observable test that starts from stale persisted totals and asserts the finalized response and stored document contain the fresh values. If recomputation is intentionally out of scope, remove the endpoint's contract claim instead—but that would conflict with the PR's stated lifecycle behavior.

**Review tracing:** Code Quality and Documentation found the implementation/contract contradiction. This is distinct from the concurrency issue above.

### 3. 🟠 High — Do not finalize a stale persisted draft while editor changes are dirty

**Location:** `apps/frontend/src/components/document-editor/DocumentEditor.tsx:414-416`

Editing metadata or lines marks the editor dirty, but the finalize control remains enabled. `handleFinalize` posts only the document ID; it does not save the editor state first. Confirming finalization consequently locks the last persisted version and replaces the editor with that response, silently discarding the changes currently displayed to the user.

**Required change:** require a successful save before opening or confirming finalization, or disable finalization while `dirty` is true and explain the required save. Preserve the existing stale-editor message distinction; this is a local unsaved-change path, not a remote-finalization race.

### 4. 🟠 High — Ignore stale responses when dynamic document IDs change

**Location:** `apps/frontend/src/app/(app)/documents/[id]/page.tsx:26-39`

Loading document A and navigating to B before A resolves leaves both requests active. If A resolves last, it overwrites B's page state. The page then supplies B's `documentId` with A's `initialDocument`, making a later save capable of applying A's displayed content to B.

**Required change:** abort the previous request or associate each completion with a generation/current ID and ignore stale completions. Apply the same rule to the dedicated read-only route's loader.

### 5. 🟡 Medium — Project the guard lookup to its single required field

**Location:** `apps/backend/src/api/plugins/immutability.ts:75-85`

The guard only consumes `document.status`, but `findOne` materializes the entire document—including an unbounded `lines` array—on every guarded write before the route loads it again. Project `status` (and Mongo's implicit `_id`) to keep this extra authorization read constant-sized.

### 6. 🟡 Medium — Make the dedicated read-only route reject or redirect drafts

**Location:** `apps/frontend/src/app/(app)/documents/[id]/view/page.tsx:68`

The route sends any successfully loaded `DocumentResponse` to `DocumentView`. Opening `/documents/:id/view` for a draft therefore shows a “Locked” read-only record although the document remains mutable. Narrow the component input to a finalized subtype and redirect/render the editor for drafts.

### 7. 🟡 Medium — Handle a losing finalize race as a locked-state transition

**Location:** `apps/frontend/src/components/document-editor/DocumentEditor.tsx:260-270`

If two finalize calls race, the backend correctly returns `DOCUMENT_FINALIZED` to the loser. This catch only leaves an error in the dialog; it does not invoke `onFinalized`, so the page continues to expose an editable draft until a later save or reload. Treat this code like the stale-save path: display a clear state message, then reload/transition to the read-only view.

### 8. 🟡 Medium — Correct the lifecycle Cypress assertion

**Location:** `e2e/lifecycle.cy.ts:39`

The successful-finalization scenario asserts that the page contains `409 DOCUMENT_FINALIZED`. The finalized view renders “Locked. Lines, amounts, and metadata cannot be edited.” and never renders that error code on the success path. The scenario fails after a successful 200 finalize response.

**Required change:** assert the intentional locked-state copy or a stable semantic element instead. Keep `DOCUMENT_FINALIZED` assertions in the stale-save conflict scenario, where that response is observable.

### 9. 🟡 Medium — Keep focus within, and restore focus from, the confirmation dialog

**Location:** `apps/frontend/src/components/lifecycle/FinalizeDialog.tsx:35-45`

The dialog sets initial focus and handles Escape, but it does not trap Tab/Shift+Tab. Keyboard focus can reach active editor controls behind an `aria-modal` dialog. The successful transition also removes the focused dialog without moving focus to the newly rendered record.

**Required change:** trap focus among the dialog's controls while open, restore it to the opener on cancellation, and move focus to a meaningful heading or status element after successful finalization. This is a WCAG 2.4.3 focus-order failure.

### 10. 🟡 Medium — Give the finalized line-items table a programmatic name

**Location:** `apps/frontend/src/components/lifecycle/DocumentView.tsx:129-130`

“Line items” is a generic preceding `div`, not a heading or table caption. Screen-reader table navigation announces an unnamed 11-column table. Use a semantic heading associated with the table or add a `<caption>` (visually hidden if desired).

### 11. 🟡 Medium — Prevent dismissal and repeat submission during finalize

**Location:** `apps/frontend/src/components/lifecycle/FinalizeDialog.tsx:25-31`

The submit handler fires `onConfirm()` without pending state. Confirm may be repeated, and Cancel/overlay/Escape can close the dialog while the irreversible request is in flight; it may still succeed while the editor appears editable. Track pending confirmation state, disable repeated confirmation and dismissal until it settles, and surface failure in the dialog.

## Check Details

### Code Quality

- **Coverage:** lifecycle guard, repository transition, service orchestration, route registration, editor/page/view components.
- **Findings:** #2 and #4. Finding #1 is recorded under Security because it breaks the authorization guarantee.

### Test Coverage

- **Coverage:** changed unit, integration, component, and Cypress lifecycle tests.
- **Finding:** #8. The suite otherwise exercises intended success, conflict, invalid-line, empty-document, ownership, and immutable-route paths; it lacks the stale-totals regression asserted in #2.

### Performance

- **Coverage:** guard and finalization request paths.
- **Finding:** #5.

### Security

- **Coverage:** authentication ordering, ownership filtering, ObjectId handling, route registry, mutation paths, API error envelopes.
- **Finding:** #1. No separate injection, secret exposure, CSRF, or ownership-enumeration defect was found in the assigned changes.

### Error Handling

- **Coverage:** 404/409/400 API mapping and frontend stale-state recovery.
- **Finding:** #7. The error mapping itself is otherwise consistent with the project's envelope pattern.

### Documentation

- **Coverage:** Phase 4 contract, lifecycle types, guarded-route documentation.
- **Findings:** no additional finding. The contract mismatch is supporting evidence for #2. The documented duplicate API is explicitly marked as deferred to 4-D and unused in this PR, so its absent handler is not reported as a defect here.

### TypeScript Strictness

- **Coverage:** changed backend and frontend production TypeScript.
- **Finding:** #6. No additional `any`, unsafe assertion, or suppression issue was found.

### Runtime Behavior

- **Coverage:** Fastify registration behavior, lifecycle transition handling, UI state replacement.
- **Finding:** #7. The cross-request state race is consolidated into #1.

### Async Patterns

- **Coverage:** persistence awaits, draft-to-finalized race behavior, page and dialog asynchronous flows.
- **Findings:** no additional finding. The persistence races are consolidated into #1; dialog pending behavior is #11.

### React Patterns

- **Coverage:** dynamic routes, editor finalization flow, read-only rendering, dialog state.
- **Findings:** #3, #6, and #8.

### Database Patterns

- **Coverage:** owner-scoped Mongo filters, `findOneAndUpdate`, finalization concurrency, guard read shape.
- **Findings:** no additional finding. Atomicity is #1; projection cost is #5.

### Migration

- **Coverage:** finalize response/error contract and frontend client compatibility.
- **Findings:** no additional finding. Finalize's response shape is additive; the deferred duplicate declaration is intentionally not wired yet.

### Accessibility

- **Coverage:** dialog keyboard flow, focus order, final record semantics, table navigation.
- **Findings:** #9 and #10. The focus-restoration portion of #9 includes the post-finalize state replacement.

## Manual Checks Required

- [ ] After fixing #1, exercise concurrent finalize, PATCH, line mutation, and DELETE requests against the same document in a Mongo-backed environment; confirm all mutations admitted before the transition fail rather than committing after it.
- [ ] Run the targeted backend, frontend, and `e2e/lifecycle.cy.ts` suites. This review inspected tests statically; it did not execute project commands.
- [ ] Verify the dialog with keyboard only: initial Cancel focus, Tab/Shift+Tab confinement, Escape/cancel restoration, pending behavior, and focus placement on the finalized record.

## Prioritized Action Items

### Must Fix (🔴 Critical / 🟠 High)

1. Make mutation authorization and finalization validation atomic with the persisted draft revision (#1).
2. Persist fresh engine totals in the conditional finalization write and add a stale-total regression test (#2).
3. Prevent finalizing unsaved editor state (#3).
4. Cancel or ignore stale dynamic-route fetches (#4).

### Should Address (🟡 Medium)

1. Project the guard read to `status` (#5).
2. Gate the `/view` route on `status: 'finalized'` (#6).
3. Transition after a losing finalize race (#7).
4. Repair the impossible Cypress assertion (#8).
5. Complete dialog focus management and name the line-items table (#9–#10).
6. Add pending confirmation state (#11).

### Nice to Have (💭 Low)

None.

---
*Generated by Review — 2026-08-13 13:53*
