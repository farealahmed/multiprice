# Review Report

## Metadata

| Field | Value |
|-------|-------|
| **Review Mode** | Pipeline: `ARCH-4-documents-line-items-validation` / PR #11 |
| **Target** | `feat/4/documents-line-items-validation` → `main` — https://github.com/farealahmed/multiprice/pull/11 |
| **Date** | 2026-08-13 10:59 AEST |
| **Tech Stack** | TypeScript; Fastify; Next.js 15 / React 19 App Router; MongoDB native driver; Zod; Vitest; Cypress |
| **Checks Run** | task-completion, code-quality, security, error-handling, database-patterns, react-patterns, accessibility, typescript-strictness, async-patterns, test-coverage |
| **Checks Skipped** | performance (agreed scope; CRUD and engine recompute already justified), documentation (T1 deliverable in diff), config-dependencies (no package/lock changes), migration (additive), express-patterns (Fastify), runtime-behavior (agreed overlap) |
| **Files Changed** | 46 |
| **Lines Changed** | +7601 / -502 |

## Review Process

- [x] Preflight checks passed
- [x] Diff gathered (46 files, +7601 / -502 lines)
- [x] Tech stack detected: TypeScript, Fastify, Next.js/React, MongoDB, Zod, Vitest, Cypress
- [x] Context read (`CLAUDE.md` absent; PR description, `specs/context/4.md`, ARCH, and task spec read)
- [x] Triage proposed and developer confirmed before this run; supplied scope used verbatim
- [x] 10 checks dispatched in parallel: task-completion, code-quality, security, error-handling, database-patterns, react-patterns, accessibility, typescript-strictness, async-patterns, test-coverage
- [x] Results collected and deduplicated
- [x] Report compiled
- [x] Verdict determined
- [x] Report saved to `specs/reviews/`

## Verdict: ❌ FAIL

The documents list calls an async state-setting loader during render, so the new primary route continuously re-renders/fetches instead of reaching a stable list, empty, or failure state. The change also misses frozen contract and join requirements: missing line descriptions are silently fabricated, the retired `/editor` link and Cypress spec remain, and the new Cypress scenario cannot create or save its rows. Mongo failures are additionally misreported as 404s. Resolve the must-fix findings and re-review the affected paths.

### Finding Counts

| Category | 🔴 | 🟠 | 🟡 | 💭 | ⚠️ |
|----------|-----|-----|-----|-----|-----|
| Task completion | 0 | 5 | 6 | 0 | 0 |
| Code quality | 0 | 2 | 3 | 0 | 0 |
| Security | 0 | 0 | 2 | 0 | 0 |
| Error handling | 0 | 2 | 2 | 0 | 0 |
| Database patterns | 0 | 1 | 0 | 0 | 0 |
| React patterns | 0 | 3 | 5 | 0 | 0 |
| Accessibility | 0 | 0 | 3 | 0 | 0 |
| TypeScript strictness | 0 | 0 | 3 | 0 | 0 |
| Async patterns | 0 | 2 | 2 | 0 | 0 |
| Test coverage | 0 | 2 | 2 | 0 | 0 |
| **Deduplicated total** | **0** | **6** | **10** | **0** | **0** |

## Task Completion

**Result:** ❌ Requirements and task verification are incomplete.

| # | Severity | File | Line | Issue | Recommendation |
|---|---|---|---:|---|---|
| 1 | 🟠 High | `apps/frontend/src/app/(app)/documents/page.tsx` | 57–75 | `load()` runs unconditionally during render and immediately calls `setPageState`. The route never settles; React repeatedly re-renders and refetches. This prevents T8's list, empty, loading, and failure UI from functioning. | Call the loader from `useEffect`, retaining `load` only for explicit retry. Add a page test for mount, rejection/retry, and a settled list. |
| 2 | 🟠 High | `apps/backend/src/api/routes/documents.ts` | 47–64, 77, 113–116 | `ensureLineDescriptions` supplies `"Item"` before the contract schema sees an omitted field. R1/R6 and T1 require omitted or empty descriptions to produce `DESCRIPTION_REQUIRED`; nested routes behave differently. | Remove the pre-validation rewrite. Test omitted description on document POST and whole-lines PATCH, asserting the code and `lines.N.description` path. |
| 3 | 🟠 High | `apps/frontend/src/components/shell/nav-items.ts` | 6–9 | J3 deletes `app/(app)/editor/**` but keeps the universal `/editor` navigation entry. The visible link now targets a non-existent route. | Remove `/editor` from `NAV_ITEMS`; retain only the documents flow. |
| 4 | 🟠 High | `e2e/documents.cy.ts` | 40–61 | The J3 Cypress flow creates a document with no lines then types into a non-existent Row 1. It also leaves all required descriptions empty. It fails before PATCH 200/reload and cannot demonstrate persisted `421.50`. | Click **+ Add line** before each fixture row, populate descriptions, then assert the save/reload path. |
| 5 | 🟠 High | `e2e/pricing-preview.cy.js` | existing file | The retired spec remains and visits `/editor`, which this PR deletes. The configured E2E suite still contains a dead-route test instead of the required port. | Delete or migrate that spec as J3 requires. |
| 6 | 🟡 Medium | `apps/backend/src/contracts/document.ts` | 64–73 | The schema validates only `YYYY-MM-DD` shape. Impossible dates such as `2026-02-31` and `2026-99-99` persist, contradicting R3's calendar-date contract. | Validate a real calendar date while retaining the string-only storage representation and `ISSUE_DATE_INVALID`. |
| 7 | 🟡 Medium | `apps/backend/src/api/routes/document-lines.ts` | 111–115 | A nested line PATCH can include `id`; spread-merging it overwrites the URL-targeted server-minted id and can duplicate another line's identity. This violates R13. | Omit `id` from nested patch input before merge, or reject it; preserve the selected stored id. |
| 8 | 🟡 Medium | `apps/backend/src/services/documents.ts` | 130–147, 192–193, 317–328 | The service imports `toEngineLine` but does not use it, and reimplements conversion on both wire→stored and stored→engine paths. This misses R25/R26/A2's single conversion boundary. | Route the engine conversion through the exported pricing-preview helper(s) and remove duplicate conversion logic. |
| 9 | 🟡 Medium | `apps/backend/src/services/documents.ts` | 233–242 | Metadata-only PATCH calculates totals but does not persist them because `patch.totals` is set only when `params.lines` exists. This does not meet the required recompute-and-persist-on-every-write funnel. | Persist the recomputed totals for every successful mutation. |
| 10 | 🟡 Medium | `apps/frontend/src/components/document-editor/DocumentEditor.tsx` | 219–222, 259–273 | Only the local Back link asks before discarding dirty edits. `Topbar`/`NavSlot` client-side navigation bypasses that handler and `beforeunload`. R23 requires a navigation warning. | Centralize the guard or intercept all in-app exits; test a Topbar navigation while dirty. |

### Task evidence

- **T1 (TDD):** schemas/tests/docs are present, but missing-description and real-calendar-date acceptance criteria fail.
- **T2 (checklist):** exports are present; T4 does not actually use the exported conversion boundary.
- **T3 (TDD):** owner-scoped repository structure and sort are present; driver-query failure is converted to a false 404.
- **T4/T5 (TDD):** central service and all route files exist; id preservation, raw contract validation, and every-write totals persistence have the gaps above.
- **T6 (test-after):** broad API/isolation coverage exists, but lacks mutation auth and omitted-description regression cases.
- **T7 (TDD):** typed client exists; `updateLine` exposes the wrong input type for the server's PATCH contract.
- **T8/T9 (test-after/UI):** main list route cannot settle; create errors do not render; dirty exit handling is incomplete.
- **T10 (checklist):** editor route/nav/e2e join is incomplete: stale `/editor` nav and Cypress spec remain, and the new Cypress flow cannot run its required scenario.

### Coverage Checklist
- [x] T1 contract/docs/frontend mirror — requirements traced ⚠️ Findings #2 and #6
- [x] T2 pricing helper exports — exports present; reuse requirement ⚠️ Finding #8
- [x] T3 repository — owner-first filters/sort present; failure semantics ⚠️ database Finding #1
- [x] T4–T5 services/routes — all declared routes present; validation/identity/persistence ⚠️ Findings #2, #7, #9
- [x] T6 backend tests — primary API/isolation coverage present; missing contract tests ⚠️ test-coverage findings
- [x] T7 typed client — full route table present; PATCH type ⚠️ strictness Finding #1
- [x] T8 list UI — requirements ⚠️ Findings #1 and React/accessibility findings
- [x] T9 editor UI — requirements ⚠️ Findings #10 and React findings
- [x] T10 join/e2e — requirements ⚠️ Findings #3–5

## Code Quality

| # | Severity | File | Line | Issue | Recommendation |
|---|---|---|---:|---|---|
| 1 | 🟠 High | `apps/frontend/src/app/(app)/documents/page.tsx` | 57–75 | Render performs an effectful fetch and state update. This is a React lifecycle violation and a functional render loop. | Move initial load to `useEffect`. |
| 2 | 🟠 High | `apps/frontend/src/components/shell/nav-items.ts` | 6–9 | Route cutover leaves a dead `/editor` navigation entry. | Remove the entry. |
| 3 | 🟡 Medium | `apps/backend/src/services/documents.ts` | 130–147, 317–328 | Duplicate conversion implementation despite a deliberately exported canonical helper. | Use the shared conversion boundary. |
| 4 | 🟡 Medium | `apps/frontend/src/lib/api/documents.ts` | 42–50 | `updateLine` accepts required `LineItemInput`, while its Fastify PATCH route accepts partial `UpdateLineItemInput`. A normal partial request requires an assertion. | Type the parameter and `DocumentRequestInput` as `UpdateLineItemInput`; add a one-field request test. |

### Coverage Checklist
- [x] Backend routes/contracts/service/repository — layering and domain boundaries ⚠️ Findings #3
- [x] Documents list/editor/components — lifecycle, route cutover, state ownership ⚠️ Findings #1–2
- [x] Typed frontend client — route signatures ⚠️ Finding #4

## Security

| # | Severity | File | Line | Issue | Recommendation |
|---|---|---|---:|---|---|
| 1 | 🟡 Medium | `apps/backend/src/api/routes/documents.ts` | 47–64 | Authenticated callers bypass the required description invariant by omitting the field, which is overwritten before Zod validation (CWE-20). | Validate raw input; add omitted-key POST/PATCH regression tests. |
| 2 | 🟡 Medium | `apps/backend/src/contracts/document.ts` | 212–228 | Create and whole-document PATCH have no line-array limit, despite the existing preview cap and ARCH's `≤500` recomputation assumption. A signed-in user can create repeatedly expensive oversized aggregates (CWE-400). | Share/apply the 500-line cap before service computation; test 501 lines. |

### Coverage Checklist
- [x] Auth and owner-scoped repository filters — all eight routes authenticate; no owner leakage found
- [x] Input/server-managed validation — ⚠️ Findings #1–2
- [x] Document response/client — `ownerId` excluded; client does not send server fields
- [x] Ownership tests — six id routes and list isolation covered

## Error Handling

| # | Severity | File | Line | Issue | Recommendation |
|---|---|---|---:|---|---|
| 1 | 🟠 High | `apps/backend/src/persistence/documents.repository.ts` | 26–32 | The `catch` wraps the awaited Mongo lookup, not only `new ObjectId`. A driver failure becomes `null`, yielding `404 DOCUMENT_NOT_FOUND` rather than the specified logged `500 INTERNAL_ERROR`. | Construct/validate the ObjectId before the await; catch only invalid ids; let driver errors propagate. |
| 2 | 🟠 High | `apps/frontend/src/app/(app)/documents/page.tsx` | 57–75 | Render-loop reload immediately replaces a list failure with loading, so the required error/retry state cannot remain visible. | Use a mount effect; test error and retry. |
| 3 | 🟡 Medium | `apps/frontend/src/app/(app)/documents/page.tsx` | 82–99 | Non-`ApiError` delete or follow-up reload failures close the dialog and are discarded. | Set the generic page error state for the non-API branch. |
| 4 | 🟡 Medium | `apps/frontend/src/app/(app)/documents/page.tsx` | 113–161, 224–230 | API and client create errors are stored but never passed to/rendered by `CreateDialog`. | Pass field and form errors to the dialog and render actionable messages. |

### Coverage Checklist
- [x] Fastify validation and domain/engine mapping — expected paths correctly rethrow unknown errors except lookup ⚠️ Finding #1
- [x] Document editor error mapping — metadata, row, and unmapped details handled
- [x] Documents list/create/delete failures — ⚠️ Findings #2–4

## Database Patterns

| # | Severity | File | Line | Issue | Recommendation |
|---|---|---|---:|---|---|
| 1 | 🟠 High | `apps/backend/src/persistence/documents.repository.ts` | 26–32 | Broad error suppression maps Mongo/query failures to a normal ownership/not-found miss. It affects document GET/PATCH/DELETE and nested-line routes. | Separate ObjectId validation from the repository await and preserve database failure propagation. |

### Tracing Notes
- `list` delegates through the owner-scoped base and preserves `{ issueDate: -1, createdAt: -1 }` sorting.
- `findById` is awaited by GET, document mutations, and all nested-line paths; its null result drives their 404s.
- `updateDocument` uses full-document read/modify/write as ARCH permits; the explicitly accepted last-write-wins policy was not reported.

### Coverage Checklist
- [x] Owner-first API and merged filters — correct
- [x] List sorting and embedded-document model — correct within agreed non-performance scope
- [x] Lookup failure semantics — ⚠️ Finding #1
- [x] Tests — owner filters/sort covered; no query-failure regression test

## React Patterns

| # | Severity | File | Line | Issue | Recommendation |
|---|---|---|---:|---|---|
| 1 | 🟠 High | `apps/frontend/src/app/(app)/documents/page.tsx` | 74–75 | Render-time `load()` causes a state-update/render loop. | Use `useEffect` for mount load. |
| 2 | 🟠 High | `apps/frontend/src/components/document-editor/DocumentEditor.tsx` | 188–215, 281–329 | Inputs stay editable during save. A response for the clicked snapshot can overwrite edits made while awaiting and then clear `dirty`, losing data without a warning. | Disable edits during save or retain/version post-start edits before applying the response. |
| 3 | 🟠 High | `apps/frontend/src/components/shell/nav-items.ts` | 6–9 | The application exposes a dead `/editor` link after deleting that route. | Complete the route cutover. |
| 4 | 🟡 Medium | `apps/frontend/src/app/(app)/documents/page.tsx` | 113–161, 224–230 | Create errors are captured but not rendered. | Supply error state to `CreateDialog`. |
| 5 | 🟡 Medium | `apps/frontend/src/components/document-editor/DocumentEditor.tsx` | 120–131 | An in-flight preview can clear a save-validation error because both use shared `errors` state. | Split preview/save error state or correlate clearing to its request. |
| 6 | 🟡 Medium | `apps/frontend/src/components/document-editor/DocumentEditor.tsx` | 219–222, 259–273 | Dirty navigation guard misses Topbar and history client navigation. | Guard every in-app exit at the routing/navigation boundary. |
| 7 | 🟡 Medium | `apps/frontend/src/components/document-editor/DocumentEditor.tsx` | 73, 165–168 | `dirty` has no visible unsaved-changes indication, despite R23. | Render a pending-changes indicator cleared on save/load. |
| 8 | 🟡 Medium | `apps/frontend/src/components/documents/DeleteDialog.tsx` | 29 | Confirmation remains actionable while delete is pending; rapid duplicate clicks can turn a successful deletion into a later 404 page error. | Track submitting state and disable/ignore further actions until settlement. |

### Coverage Checklist
- [x] App Router client components and route handoff — correct
- [x] List load/create/delete lifecycles — ⚠️ Findings #1, #4, #8
- [x] Editor preview/save/dirty lifecycle — ⚠️ Findings #2, #5–7
- [x] Retired route cutover — ⚠️ Finding #3

## Accessibility

| # | Severity | File | Line | Issue | Recommendation |
|---|---|---|---:|---|---|
| 1 | 🟡 Medium | `apps/frontend/src/app/(app)/documents/page.tsx` | 113–161, 224–230 | Create validation errors are not rendered or associated with inputs. Users, including screen-reader users, have no correction guidance. **WCAG 3.3.1, 4.1.3.** | Follow the existing Field pattern: `aria-invalid`, `aria-describedby`, associated announced field/form error. |
| 2 | 🟡 Medium | `apps/frontend/src/components/documents/CreateDialog.tsx`, `DeleteDialog.tsx` | 14–25 | Custom dialogs set initial focus and handle Escape but do not trap Tab/Shift+Tab or restore focus to their opener. **WCAG 2.4.3.** | Add focus trapping and opener restore, or reuse an established accessible dialog primitive. |
| 3 | 🟡 Medium | `apps/frontend/src/app/(app)/documents/page.tsx` | 181–193 | Async loading/failure replacement content is not a live status/alert, so screen readers are not told when loading completes/fails or retry becomes available. **WCAG 4.1.3.** | Use a polite status for loading and an alert/status role for failure. |

### Coverage Checklist
- [x] Editor labels, headings, table semantics, errors, controls — no additional finding
- [x] Document list table/empty/status UI — semantic and non-color-only status correct
- [x] Create/delete dialogs — ⚠️ Findings #1–2
- [x] Async page states — ⚠️ Finding #3

## TypeScript Strictness

| # | Severity | File | Line | Issue | Recommendation |
|---|---|---|---:|---|---|
| 1 | 🟡 Medium | `apps/frontend/src/lib/api/documents.ts` | 42–50 | Client PATCH type is stricter than its server contract. | Accept `UpdateLineItemInput`. |
| 2 | 🟡 Medium | `apps/backend/src/services/documents.ts` | 284–308 | Legacy `recomputeAndPersist` admits a no-id/no-metadata call and casts it to a create input; it then destructures `undefined` at runtime. | Remove the obsolete wrapper or model create/update/remove as a discriminated union with required create metadata. |
| 3 | 🟡 Medium | `apps/backend/src/services/documents.ts` | 243–245 | `updated!` suppresses a nullable post-update lookup after awaited I/O. A concurrent delete becomes a null dereference/500 rather than not-found. | Check for null and throw `DocumentNotFoundError`; ideally also act on update matched count. |

### Tracing Notes
- Document route callers, services, repository, pricing conversion, client API, and editor error mapping were traced one level.
- No `any`, `ts-ignore`, or additional assertion-based boundary hole was found in the changed TypeScript surface.

### Coverage Checklist
- [x] Backend type boundary — ⚠️ Findings #2–3
- [x] Frontend typed API — ⚠️ Finding #1
- [x] Other changed TypeScript and TSX — no additional evidence-backed strictness issue

## Async Patterns

| # | Severity | File | Line | Issue | Recommendation |
|---|---|---|---:|---|---|
| 1 | 🟠 High | `apps/frontend/src/app/(app)/documents/page.tsx` | 57–75 | Render-triggered loader never stabilizes and issues repeated requests. | Use a mount effect. |
| 2 | 🟠 High | `apps/frontend/src/components/document-editor/DocumentEditor.tsx` | 188–215 | Edits made after Save begins can be overwritten by the earlier response and marked clean. | Disable editing while saving or preserve post-request changes. |
| 3 | 🟡 Medium | `apps/frontend/src/components/documents/CreateDialog.tsx` | 77–79 | A double submit before `onConfirm` settles can create duplicate documents. | Add/propagate submitting state and disable repeated submits. |

### Tracing Notes
- Fastify routes await service/repository work; document service rethrows unknown failures correctly.
- Preview/load effects have stale-response cleanup; no finding for their request cancellation.
- Repository failure swallowing is reported under Database/Error Handling.

### Coverage Checklist
- [x] Backend handler/service awaits — correct other than shared repository finding
- [x] List lifecycle — ⚠️ Finding #1
- [x] Editor save lifecycle — ⚠️ Finding #2
- [x] Create dialog submit lifecycle — ⚠️ Finding #3

## Test Coverage

| # | Severity | File | Line | Issue | Recommendation |
|---|---|---|---:|---|---|
| 1 | 🟠 High | `e2e/documents.cy.ts` | 40–61 | The only new persistence E2E is structurally unable to reach the required save/reload assertion: no first row exists and descriptions are missing. | Build the rows and descriptions before asserting 200/reload. |
| 2 | 🟠 High | `e2e/pricing-preview.cy.js` | existing file | The old Cypress route test remains against deleted `/editor`, so the migration suite is not green. | Retire/port it. |
| 3 | 🟡 Medium | `apps/backend/test/api/documents.test.ts` | 153–159 | No-session checks cover GETs but not document POST/PATCH/DELETE. The route-auth contract is not directly protected for all mutations. | Add parameterized no-cookie assertions for the remaining document mutation endpoints. |
| 4 | 🟡 Medium | `apps/frontend/src/components/document-editor/DocumentEditor.test.tsx` | 93–132 | Tests cover successful save and the pure error mapper but not an update rejection rendered through the editor inputs. | Reject mocked `update()` with metadata and `lines.0.quantity` details; assert both visible errors. |

### Coverage Checklist
- [x] Contract/repository/service tests — codes, units, id preservation, owner filters covered; omitted-description boundary missing
- [x] API/integration tests — CRUD, line mutations, error paths, ownership/list isolation covered; mutation auth missing
- [x] Typed client tests — route methods and `ApiError` propagation covered
- [x] Editor/error mapper — happy path and pure mapping covered; rendered save failure missing
- [x] List UI — required interaction-state tests absent; this also let the render loop survive
- [x] E2E persistence — intended path present but cannot execute; old dead-route spec remains

## Manual Checks Required

- [ ] After correcting `e2e/documents.cy.ts`, run it against `make up` and confirm: create, add all three described rows, save, reload, persisted `421.50`.
- [ ] Exercise the real documents list with an empty account, a populated account, an API failure/retry, create validation rejection, and delete network failure.
- [ ] With dirty editor state, try Topbar navigation and browser back/forward; confirm no edits are lost without the required warning.
- [ ] Re-run backend/frontend typechecks and their relevant Vitest suites after fixes.

## Prioritized Action Items

### Must Fix (🔴 Critical / 🟠 High)

1. Move documents-list loading out of render; add lifecycle tests.
2. Remove missing-description fabrication and enforce the frozen validation contract.
3. Let Mongo lookup failures reach the global 500/error logging path.
4. Complete `/editor` retirement in nav and Cypress.
5. Repair the J3 Cypress setup so it actually creates rows, supplies descriptions, saves, reloads, and asserts `421.50`.
6. Prevent post-Save edits from being overwritten/marked clean.

### Should Address (🟡 Medium)

1. Validate real calendar dates and bound document lines at the established 500-line limit.
2. Preserve nested-line IDs; align the typed partial PATCH client.
3. Use the intended shared pricing conversion helpers and persist recomputed totals on metadata writes.
4. Render create/delete errors; make loading/failure accessible; fix dialog focus lifecycle.
5. Complete dirty indication/navigation guarding; separate preview/save errors; prevent duplicate destructive/create submits.
6. Add the listed mutation-auth and UI validation regression tests.

### Nice to Have (💭 Low)

None.

---
*Generated by Review — 2026-08-13 10:59 AEST*
