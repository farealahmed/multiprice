# Review Report

## Metadata

| Field | Value |
|-------|-------|
| **Review Mode** | PR #14 |
| **Target** | https://github.com/farealahmed/multiprice/pull/14 |
| **Date** | 2026-08-13 20:18 |
| **Tech Stack** | Node 22, TypeScript, Fastify 5, MongoDB 7, Next.js 15, React 19, Vitest, Cypress, Docker Compose, Caddy, GitHub Actions |
| **Checks Run** | Code Quality & Conventions; Security; Error Handling & Observability; Configuration & Dependencies; Documentation; TypeScript Strictness; Runtime Behavior |
| **Checks Skipped** | Test Coverage & Quality — no application behavior change; Performance — no algorithm/query-path change; Async Patterns — no changed async TS/JS; React / Next.js Patterns and Accessibility — no production UI change; Express Patterns — Fastify project with no routes/middleware changed; Database Patterns — no query/schema/migration change; Migration & Breaking Changes — additive operational configuration only |
| **Files Changed** | 16 |
| **Lines Changed** | +624 / -30 |

## Review Process

- [x] Preflight checks passed
- [x] Diff gathered (16 files, 654 lines)
- [x] Tech stack detected: Node 22, TypeScript, Fastify, MongoDB, Next.js/React, Vitest/Cypress, Docker Compose/Caddy, GitHub Actions
- [x] Context read (no CLAUDE.md; PR description and commit summary)
- [x] Triage proposed and developer confirmed
- [x] 7 checks dispatched: Code Quality, Security, Error Handling, Configuration & Dependencies, Documentation, TypeScript Strictness, Runtime Behavior
- [x] Results collected and deduplicated
- [x] Report compiled
- [x] Verdict determined
- [x] Report saved to specs/reviews/

## Verdict: ❌ REQUEST CHANGES

The public deployment path is not runnable: the current `frontend-ci` check fails in GitHub Actions, and a successfully built frontend would proxy API/auth traffic to itself. The two independent deployment jobs also race over one shared Compose stack, including its first bootstrap. Security and documentation defects remain after those runtime blockers.

### Finding Counts

| Category | 🔴 | 🟠 | 🟡 | 💭 | ⚠️ |
|----------|-----|-----|-----|-----|-----|
| Code Quality & Conventions | 0 | 1 | 0 | 0 | 0 |
| Security | 0 | 1 | 2 | 0 | 2 |
| Error Handling & Observability | 0 | 0 | 0 | 0 | 0 |
| Configuration & Dependencies | 0 | 3 | 0 | 0 | 0 |
| Documentation | 0 | 0 | 2 | 0 | 0 |
| TypeScript Strictness | 0 | 0 | 0 | 0 | 0 |
| Runtime Behavior | 0 | 0 | 0 | 0 | 0 |
| **Total** | **0** | **5** | **4** | **0** | **2** |

## Code Quality & Conventions

| # | Severity | File | Line | Issue | Recommendation |
|---|----------|------|------|-------|----------------|
| 4 | 🟠 High | `.github/workflows/{backend,frontend}-ci.yml` | 6–14 | The workflows are path-filtered, while `specs/lanes/6-f.md` instructs branch protection to require both `ci` checks. GitHub leaves a required workflow skipped by `pull_request.paths` pending; a frontend-only PR therefore lacks a completed backend check, and vice versa. | Use unfiltered required gate workflows with conditional app jobs, or do not require checks that can be skipped. Confirm the selected arrangement in branch protection. |

### Review Comment — Finding 4

I noticed the planned branch-protection setup requires both checks, while each workflow is skipped for ordinary changes to the other app. This blocks the very PRs the path filters are meant to speed up. Would an always-completing gate job with conditional backend/frontend jobs fit the intended protection model?

### Coverage Checklist

- [x] `.github/workflows/backend-ci.yml` and `.github/workflows/frontend-ci.yml` — path-filter/branch-protection contract ⚠️ → Finding 4; workflow structure otherwise reviewed
- [x] `infra/compose.yml` and `infra/Caddyfile` — service naming, network intent, and configuration clarity reviewed
- [x] Frontend report test fixtures — mechanical timestamp additions reviewed; no separate convention issue

## Security

| # | Severity | File | Line | Issue | Risk | Recommendation |
|---|----------|------|------|-------|------|----------------|
| 5 | 🟠 High | `.github/workflows/{backend,frontend}-ci.yml` | 26–28, 43–44, 54–57 | Production deployment executes `checkout`, `setup-node`, and artifact actions through mutable `@v4` tags. | A retargeted or compromised action can alter the workspace or deploy inputs before they reach production. | Pin each action to a reviewed full commit SHA, retaining the version in an adjacent comment. |
| 6 | 🟡 Medium | `.github/workflows/{backend,frontend}-ci.yml` | 66–67 | `ssh-keyscan` learns the host key from the same network connection it then trusts. | A DNS or on-path attacker can impersonate the droplet and receive deployment assets. | Store an independently verified `known_hosts` entry/fingerprint as protected configuration; do not generate it during deployment. |
| 7 | 🟡 Medium | `infra/compose.yml` | 5, 53 | MongoDB and the public Caddy edge use mutable image tags, including `caddy:2-alpine`. | A registry-tag change can introduce unreviewed production code; Caddy terminates public TLS and persists certificate state. | Pin reviewed image digests and update those digests deliberately. |

### Review Comments

**Finding 5:** I noticed the main-branch deploy path executes mutable action tags before rsyncing production infrastructure. Because those actions can modify the checkout, a compromised tag can alter the deployed Caddy or image inputs. Please pin the action revisions to reviewed SHAs.

**Finding 6:** The job accepts whichever SSH key `ssh-keyscan` returns immediately before transferring production assets. Store the droplet's independently verified host key instead, so strict host-key verification can detect DNS or network interception.

**Finding 7:** The database and TLS edge are selected by mutable tags. Pinning their SHA-256 digests makes every production runtime change reviewable and prevents tag retargeting from changing a deploy without a source change.

### Coverage Checklist

- [x] `.github/workflows/backend-ci.yml` and `.github/workflows/frontend-ci.yml` — least-privilege token permissions and main-only deploy gate ✅; action provenance ⚠️ → Finding 5; SSH target authentication ⚠️ → Finding 6
- [x] `infra/compose.yml` — backend/Mongo not published and internal/edge networks segregated ✅; runtime image provenance ⚠️ → Finding 7
- [x] `infra/Caddyfile` — single public vhost, HSTS, anti-sniffing, framing, and referrer headers ✅
- [x] `infra/.env.example` — no committed production secret; required blank JWT secret documented ✅

## Error Handling & Observability

**Result:** ✅ No standalone findings.

The reviewed deployment failures are captured by Findings 2 and 3; no additional error-path defect was identified in the scoped workflow and Compose files.

### Coverage Checklist

- [x] `.github/workflows/backend-ci.yml` and `.github/workflows/frontend-ci.yml` — deploy shell failure propagation and retry loops reviewed; shared-stack failures are covered by Finding 3
- [x] `infra/compose.yml` — startup dependency/error propagation reviewed; frontend origin failure is covered by Finding 2

## Configuration & Dependencies

| # | Severity | File | Line | Issue | Recommendation |
|---|----------|------|------|-------|----------------|
| 1 | 🟠 High | `.github/workflows/frontend-ci.yml` | 37 | The added CI is already red: `frontend-ci` run `31690293142` failed at `npm run build` on this PR's head SHA (`bf0adaf`), reporting that Next could not resolve its required `@types/node` dependency on the fresh runner. | Make `npm ci && npm run build` pass from a clean checkout in the same workflow environment; then rerun the PR checks. |
| 2 | 🟠 High | `.github/workflows/frontend-ci.yml` | 41 | The deployment image is built without `BACKEND_ORIGIN`. The frontend Dockerfile consumes it at build time, so the Next rewrite bakes `http://localhost:3001`; the Compose value is incorrectly attached to `backend`, not the build. In the frontend container it resolves to itself, breaking `/api/*` and `/auth/*`. | Build the frontend artifact with `--build-arg BACKEND_ORIGIN=http://backend:3001`, and keep the documented/Compose configuration aligned. |
| 3 | 🟠 High | `.github/workflows/{backend,frontend}-ci.yml` | 84–96 / 81–93 | Each independent deploy loads only one app image, then starts the complete Compose stack. A fresh droplet has neither `multiprice-*:local` image available remotely; the first job can fail because the peer image is absent. Later overlapping deploys can also reload an older image under the shared tag and roll back a service. | Use one serialized stack deployment that downloads and loads both artifacts before Compose starts, or add an equivalent shared concurrency and explicit bootstrap dependency. |

### Review Comments

**Finding 1:** I confirmed `frontend-ci` is failing on the PR rather than only warning: the GitHub Actions log exits from `next build` because it cannot resolve `@types/node` in the clean runner. The advertised CI gate cannot protect merges until the dependency/workspace resolution is corrected and the check is green.

**Finding 2:** The Dockerfile explicitly consumes `BACKEND_ORIGIN` during `next build`, but the workflow never passes it. The runtime Compose value cannot alter already-generated Next rewrites, so a deployed browser request goes to port 3001 inside the frontend container. Please provide the internal Compose hostname at build time.

**Finding 3:** Both workflows write the same Compose project but have no cross-workflow dependency or shared concurrency. On first deployment, whichever starts Compose before the peer image exists fails; on later overlapping runs, an older job can retag/recreate a service after a newer one. Make stack startup a coordinated operation.

### Coverage Checklist

- [x] `.github/workflows/frontend-ci.yml` — clean-run CI status ⚠️ → Finding 1; frontend build configuration ⚠️ → Finding 2; shared deployment lifecycle ⚠️ → Finding 3
- [x] `.github/workflows/backend-ci.yml` — artifact transfer and shared deployment lifecycle ⚠️ → Finding 3
- [x] `infra/compose.yml` and `infra/.env.example` — required production variables, internal service address, image availability, and Compose lifecycle reviewed
- [x] `infra/Caddyfile` — proxy configuration reviewed; public proxy failure follows from Finding 2

## Documentation

| # | Severity | File | Line | Issue | Recommendation |
|---|----------|------|------|-------|----------------|
| 8 | 🟡 Medium | `docs/phases/phase-6-issue-7.md` | 137 | The revised 6-E brief requires `specs/lanes/deployment.md` to document the URL, release command, secret location, rollback, and manual steps. The PR adds no runbook or equivalent document. | Add the required deployment runbook before treating 6-E/6-F2 as complete. |
| 9 | 🟡 Medium | `specs/lanes/6-f.md` | 5–12, 31–32 | The lane record still states 6-F2 is unstarted and that neither workflow has a deploy job, but this PR adds both deployment jobs. | Update status, landed work, verification evidence, and outstanding human actions to reflect implemented CD and its prerequisites. |

### Review Comments

**Finding 8:** The phase brief makes the deployment runbook the handoff for manual release, rollback, secret location, and README finalization, but this PR does not create it. Add that operational record so the manual fallback does not depend on repository archaeology.

**Finding 9:** The lane report currently tells an operator that CD does not exist while the merged workflows would deploy on each qualifying main push. Update it before enabling deployment so secret setup and live verification are not deferred accidentally.

### Coverage Checklist

- [x] `docs/implementation-phases.md`, `docs/parallel-execution.md`, and `docs/phases/phase-6-issue-7.md` — CI/CD scope and operational claims reviewed; runbook requirement ⚠️ → Finding 8
- [x] `specs/context/7.md` and `specs/lanes/6-f.md` — implementation-state consistency reviewed ⚠️ → Finding 9
- [x] Archival moves under `specs-archive/6/` — content unchanged; no review needed

## TypeScript Strictness

**Result:** ✅ No findings.

**Files reviewed:** `apps/frontend/src/app/(app)/report/page.test.tsx`, `apps/frontend/src/components/report/ReportTable.test.tsx`

### Coverage Checklist

- [x] `apps/frontend/src/app/(app)/report/page.test.tsx` — typed `DocumentSummary` fixture boundary; no `any`, assertions, non-null assertions, or suppressions
- [x] `apps/frontend/src/components/report/ReportTable.test.tsx` — typed `DocumentSummary` fixture boundary; no `any`, assertions, non-null assertions, or suppressions

## Runtime Behavior

**Result:** ✅ No standalone findings.

The frontend proxy and coordinated-image startup defects are Findings 2 and 3. They cover the runtime review's API routing, service lifecycle, shared-tag rollback, and first-deploy concerns.

### Coverage Checklist

- [x] `.github/workflows/backend-ci.yml` and `.github/workflows/frontend-ci.yml` — shared-stack concurrency and first-start lifecycle reviewed; Findings 2 and 3 capture defects
- [x] `infra/compose.yml` and `infra/Caddyfile` — internal/edge connectivity and deployed proxy routing reviewed; Finding 2 captures the defect

## Manual Checks Required

- [ ] After fixing Findings 1–3, observe one complete deployment from a fresh droplet: both images load before Compose starts; the frontend, `/api/health`, registration, authenticated API requests, and a finalized document work through `https://multiprice.farealahmed.com`.
- [ ] Provision a unique nonblank production `JWT_SECRET` in droplet `infra/.env` before first boot; verify restrictive ownership and that no secret entered Git history or Actions logs.
- [ ] Obtain and pin the droplet SSH host key through an independent channel; then verify DNS resolves only to the intended host, firewall exposure matches the deployment model, and `DEPLOY_USER` is non-root/key-only.
- [ ] Verify Caddy's public certificate, HTTP-to-HTTPS behavior, response headers, and ACME reachability on ports 80/443 after deployment.
- [ ] Configure branch protection only after resolving Finding 4; confirm relevant and irrelevant-path PRs both receive the required successful gate.

## Prioritized Action Items

### Must Fix (🔴 Critical / 🟠 High)

1. Make `frontend-ci` pass in a clean GitHub runner, then rerun the PR checks. (Finding 1)
2. Supply `BACKEND_ORIGIN=http://backend:3001` during the frontend image build and prove the public API/auth proxy works. (Finding 2)
3. Coordinate both artifacts and serialize access to the shared Compose stack before first or overlapping deployments. (Finding 3)
4. Make the branch-protection-required checks complete on every PR. (Finding 4)
5. Pin executable GitHub Actions to reviewed commit SHAs. (Finding 5)

### Should Address (🟡 Medium)

1. Pin a verified SSH host key rather than trusting live `ssh-keyscan` output. (Finding 6)
2. Pin MongoDB and Caddy production images by digest. (Finding 7)
3. Add the required deployment runbook. (Finding 8)
4. Correct the 6-F lane record to describe implemented CD. (Finding 9)

### Nice to Have (💭 Low)

None.

---
*Generated by Review — 2026-08-13 20:18*
