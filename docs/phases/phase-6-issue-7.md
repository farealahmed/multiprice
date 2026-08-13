# Phase 6 — README and submission (lane briefs)

GitHub issue: #7

Plan context: `docs/implementation-phases.md` § Phase 6. Rules: `docs/parallel-execution.md`.
**Retires: Communication** — the row most often lost by people whose code was fine.

```
6-E deploy ──┐                   ┌─ 6-A2 README final ─┐
6-A1 draft ──┤  (wave 8)  wave 9  ├─ 6-B seed script ───┤
6-F1 CI ─────┘                   ├─ 6-C quality pass ──┤ ──► J6 ──► 6-D print ──► J7
                                  └─ 6-F2 CD ───────────┘
```

No gate: there is no new contract in this phase. `6-A` is split in two, because the README's technical content is frozen well before the behaviour it describes has landed:

- **`6-A1` (wave 8)** — drafts everything derivable from `docs/contracts/`: setup, rounding policy, worked example, immutability rules, assumptions. Depends on `G5`, not on `J5`.
- **`6-A2` (wave 9)** — finalizes against landed behaviour and the `specs/lanes/*.md` reports, and verifies the instructions on a fresh clone. Depends on `J5`.

Deployment is **`6-E`**, a real lane in wave 8 rather than an assumption. The PDF makes a public URL a graded deliverable, and an unowned premise is how that gets discovered at submission time. `6-E` runs before `6-A2` so the README has a URL to state and `J6` has a live build to verify.

**`6-F` (revision)** — this phase originally assumed no CI pipeline (`0-C` and `6-E`'s guardrails both said so): one repeatable command was the requirement, automation was not. That was a scope call for a take-home, and the human has since decided otherwise — a real pipeline is now part of the submission. `6-F` is split the same way `6-A` is, for the same reason: `6-F1` (wave 8) wires test automation, which needs nothing `J4` hasn't already proved; `6-F2` (wave 9) wires the deploy step, which needs `6-E`'s release command to exist first.

---

## Lane 6-A — README

**Agent** claude (writing task) · **`6-A1`** depends on `G5` (wave 8) · **`6-A2`** depends on `J5` (wave 9) · **Parallel with** 6-B, 6-C

**Mission** The deliverable a reviewer reads first and grades a whole scored row on. Everything it needs to say has already been written down in `docs/contracts/` — this lane assembles it for someone who has never seen the repository.

**Owns** `README.md`

**Reads** `docs/contracts/phase-*.md`, `docs/implementation-phases.md` § Decisions, `specs/lanes/*.md` (every lane's assumptions, **including `deployment.md` for the live URL and setup facts**), `Makefile`, `compose.yml`

**Build** — the PDF names five required sections; do not reorder or merge them.

1. **What this is** — two sentences, then the live URL, prominently. The URL is a graded deliverable; it does not belong at the bottom.
2. **Prerequisites and step-by-step setup.** Docker version, Node version if running outside containers, `git clone` → `docker compose up` → the URL to open → how to create an account. Test the instructions on a clean clone. Every command copy-pasteable, no "should be straightforward", no step that assumes the reader knows the repo.
3. **Calculation and rounding policy, with the PDF's worked example.** The scored line item, and the one reviewers read closest:
   - The order: subtotal → discount → **round** → tax on the discounted amount → **round** → line total; document totals are sums of rounded line figures.
   - The policy in one sentence: half-up away from zero, 2 decimal places per line.
   - Why integer cents, quantity in thousandths, percentages in basis points — one line each, citing the PDF's "avoid floating-point drift".
   - **The PDF's sample, worked through completely** — the three lines with their per-line figures, then `450.00 / 40.00 / 11.50 / 421.50`, and the note that the grand total is reachable two ways (sum of line totals, or subtotal − discount + tax) and agrees. Copy the numbers from `docs/contracts/phase-1.md`; do not recompute them by hand.
   - Where the code is: `apps/backend/src/pricing/`, one module, imports nothing, called by every route that touches money.
4. **Finalize and immutability rules.** Draft is fully editable; finalized is read-only. Every mutating route returns 409 `DOCUMENT_FINALIZED`. Name the parameterized test file that proves it and say what it enumerates — that is the evidence for a scored row and it should not have to be discovered.
5. **Assumptions and tradeoffs.** The PDF invites these explicitly. At minimum:
   - **Fixed discount exceeding the line subtotal is rejected** with `DISCOUNT_EXCEEDS_SUBTOTAL`, not clamped. The PDF allows either; rejecting produces a specific error message, which is itself a scored behavior, while clamping silently rewrites what the user typed.
   - **The report includes drafts.** The PDF filters by issue date and says nothing about status; filtering by status would narrow an unstated requirement.
   - **Both range ends are inclusive**, and `issueDate` is a calendar date compared as a string, so no timezone shifts a document into another month.
   - **Lines are embedded in the document**, not a separate collection — they never outlive it, and finalize freezes the aggregate in one atomic write.
   - **Two independent apps sharing no package**, with hand-mirrored types across the HTTP boundary, and the Cypress flow per phase that keeps them honest. Say why: a shared package or a generated client solves long-term drift this exercise does not have.
   - Anything else in the `specs/lanes/*.md` reports. Sweep them; that is what they are for.
6. **What I would improve before production.** Concrete and honest, not a disclaimer list. Reasonable candidates: refresh tokens and session revocation; rate limiting on auth; an audit trail on finalize; pagination on the documents list; a report index on `{ownerId, issueDate}` and its measured effect; per-currency support and currency-aware rounding; a generated client if the two apps kept growing; observability beyond structured logs.
7. **Running the tests** — one command per surface (unit, API, integration, component, Cypress), and what each proves. A reviewer looking for the calculation tests should find them in one hop.

**Done when** (`6-A2`) someone who has never seen the repository can go from `git clone` to reproducing `421.50` using only this file. Verify it by following your own instructions on a fresh clone in a temp directory — including the bare `docker compose up`, which is why `compose.yml` sits at the repository root.

**Guardrails** No source changes. Where the README would have to describe something as awkward, note it in your report — do not fix the code in this lane.

---

## Lane 6-B — Seed script and API surface

**Agent** backend-engineer · **Depends on** J5 · **Parallel with** 6-A, 6-C

**Mission** A reviewer signs in and immediately sees real data, including the PDF's sample.

**Owns** `apps/backend/src/scripts/seed.ts`, `apps/backend/scripts/**`, `apps/backend/package.json` scripts *(append only)*, `Makefile` *(append a `seed` target only)*

**Reads, never edits** `test/fixtures/pdf-sample.ts`, `src/services/**`, `src/pricing/**`

**Build**
1. `npm run seed` (and `make seed`) creates a demo user with printed credentials, and documents spread across at least two months so the report's ranges have something to show.
2. **One seeded document is the PDF's sample, exactly** — from the fixture file, so a reviewer can open it and see `421.50` without typing anything. Make it obvious by title.
3. Include at least one finalized document, so the locked view and the 409 behavior are reachable without the reviewer having to finalize something first.
4. Seed through the services, not by inserting raw documents — totals then come from the engine, and the seeded data cannot disagree with what the API would have produced.
5. Idempotent: re-running does not duplicate or crash. Refuse to run against a non-development database unless explicitly forced.
6. OpenAPI **only if** it falls naturally out of the existing zod schema setup — a `@fastify/swagger` registration over schemas that already exist is worth it; a manual spec file, a client-generation step, or a documentation pipeline is not, and the plan says so. If it does not fall out cleanly in under an hour, skip it and say so in your report.

**Done when** on a fresh volume, `make up && make seed` then signing in with the printed credentials shows the sample document at `421.50` and at least one finalized document.

**Guardrails** No production data paths, no destructive default. Do not modify service or engine code to make seeding easier.

---

## Lane 6-C — Frontend quality pass

**Agent** frontend-engineer · **Depends on** J5 · **Parallel with** 6-A, 6-B

**Mission** A bounded pass over responsiveness, semantics, and keyboard access. Not a formal accessibility audit — the plan is explicit about the scope.

**Owns** every `apps/frontend/src/**` file, for **behavior-preserving changes only** *(this is the one lane with broad frontend ownership; it runs when no other frontend lane is active, which is why it is in the last wave)*

**Build**
1. Responsive behavior at three widths — phone, tablet, desktop. The line-item table is the hard one: it has six columns and cannot shrink gracefully. Pick one approach (horizontal scroll within a bounded container, or a stacked card layout below a breakpoint) and apply it consistently. Never let the page body scroll horizontally.
2. Semantic controls: real `<button>`, `<label>` bound to inputs by `htmlFor`, `<table>` with `<th scope>` for tabular data, one `<h1>` per page, headings in order. Replace any clickable `<div>` that crept in.
3. Field errors connected to their inputs with `aria-describedby` and `aria-invalid`, so an error is announced rather than merely painted red. This is the one accessibility item that overlaps a scored row — validation errors are graded on being specific and visible.
4. Visible focus indicators throughout, meeting the mockups' palette rather than the browser default outline. Never `outline: none` without a replacement.
5. The finalize confirmation dialog: focus moves in on open, is trapped while open, returns to the trigger on close, `Escape` cancels. It is the app's only irreversible action.
6. Contrast check on the warm palette — `--ink-soft` and `--gray` on `--cream` are the likely failures. Adjust the token, not each usage.
7. Currency and date formatting consistent everywhere, via the existing helpers. One place, not seven.
8. Run the full frontend suite after every change. This lane touches many files and preserves behavior; a red test means you changed something you should not have.

**Done when** `npm test && npm run build` green, all Cypress specs still pass, and a full keyboard-only pass through the core journey works with visible focus throughout.

**Guardrails** No new features, no refactors, no dependency additions. If something needs a real fix rather than a polish, report it rather than fixing it here.

---

## Lane 6-E — Deployment

**Agent** infra-engineer · **Depends on** J4 · **Parallel with** 6-A1, 6-F1 (wave 8)

**Mission** A publicly reachable URL running this application, and a release path someone else can repeat.

**Owns** `infra/compose.yml`, `infra/Caddyfile`, `infra/.env.example`, `specs/lanes/deployment.md`

**Reads, never edits** `compose.yml`, `apps/*/Dockerfile`, `.env.example`

### Inputs (decided)

Modeled on a sibling project's working deployment — `../multip` on disk, a separate repo (`foyzulkarim/multip` on GitHub, unrelated to this one) — read for its proven shape, not copied wholesale, because that project exposes two public subdomains and this one deliberately keeps a single origin (see Build §2). `multip` itself no longer exists — its droplet was corrupted and deleted before this lane started, so this is a **dedicated** droplet for `multiprice`, provisioned fresh, not a shared one.

1. **Provider** — a fresh DigitalOcean droplet (Basic, 1 vCPU / 2 GB / 50 GB, DigitalOcean's Docker marketplace image — Docker preinstalled), dedicated to `multiprice` alone. Hardened by hand: non-root `deploy` user with sudo and docker-group membership, key-only SSH (no root login, no password auth), a 2 GB swap file, DigitalOcean Cloud Firewall open on 22/80/443 to all sources (SSH access control is the deploy key, not an IP allowlist — GitHub Actions runners need to reach port 22 too).
2. **Database** — self-hosted Mongo, one container, named volume, **no published host port**. No replica set: this app has no multi-document transactions (finalize is one atomic write on an embedded aggregate), so a plain `mongod` is enough.
3. **Hostname** — `multiprice.farealahmed.com`. One Cloudflare `A` record, DNS-only ("grey cloud", not proxied), pointed at the droplet's IP, so Caddy's own Let's Encrypt HTTP challenge works. **One hostname only** — this repo's frontend already proxies `/api/*` to the backend via `BACKEND_ORIGIN` (see `compose.yml`), so only the frontend needs a public vhost; the backend stays reachable over the compose network alone.
4. **Secrets** — GitHub Actions repository secrets on `farealahmed/multiprice`; see `6-F`'s brief for the exact names. `JWT_SECRET` and the Mongo credentials live in the droplet's `infra/.env` (gitignored, created from `infra/.env.example` on first deploy, never overwritten by later deploys).

**Build**
1. `infra/compose.yml` — `caddy`, `frontend`, `backend`, `mongo`, one compose project owning the whole droplet. `caddy` and `frontend` on an `edge` network; `backend` and `mongo` on an `internal` network only. No `build:` key on `frontend`/`backend` — images arrive pre-built (see `6-F`); this lane's own manual first deploy may build locally once to prove the shape, but the standing mechanism is 6-F's tarball delivery. Reuses `apps/*/Dockerfile` as-is — no new build tooling, `0-C` already produces images that run.
2. `infra/Caddyfile` — **one vhost**, `multiprice.farealahmed.com`, automatic TLS, `reverse_proxy` to `frontend` only. No second vhost — the backend is never public, so `SameSite=None` and third-party-cookie policy never become this project's problem.
3. `infra/.env.example` — every variable the deployed stack needs, real names, empty values. `JWT_SECRET` generated per environment and **never** the development default from `compose.yml`.
4. `Secure` cookies and `NODE_ENV=production` on the deployed backend; confirm the config validator rejects a missing `JWT_SECRET` rather than booting with a default.
5. Deploy once by hand, then smoke-test **through the browser, not just curl**: sign up, create a document with the PDF's sample lines, see `421.50`, finalize, confirm the edit is rejected. Cookie and proxy failures show up in a browser and not in curl.
6. Seed the deployed database (`6-B`'s script, once it exists) or create a demo account.
7. Write `specs/lanes/deployment.md`: the URL, the droplet, the exact manual release command, where secrets live (`infra/.env` on the droplet, GitHub Actions secrets for `6-F`), how to roll back, and any manual step. `6-A2` writes the README's setup and live-URL sections from this file, and `6-F2` wires its deploy job from the same facts — anything omitted here is missing from both.

**Done when** the URL is reachable from a browser with no session state, and the smoke test above passes on it end to end.

**Guardrails** No application source changes. If the app needs a change to deploy — a health path, a port, a build flag — request it in your report; `J6` applies it. Automating the release command is `6-F`'s job, not this lane's: `6-E` only has to prove the command works by hand, once.

---

## Lane 6-F — CI/CD pipeline

**Agent** infra-engineer · **`6-F1`** depends on `J4` (wave 8) · **`6-F2`** depends on `J5` and reads `6-E`'s `specs/lanes/deployment.md` (wave 9) · **Parallel with** `6-E`, `6-A1` (wave 8); `6-A2`, `6-B`, `6-C` (wave 9)

**Mission** Turn `6-E`'s "one repeatable command" into something that runs itself: every push and PR proves the suites still pass, and a merge to `main` redeploys `multiprice.farealahmed.com` without a human re-typing `6-E`'s release command. This is a scope reversal — the plan through Phase 0 explicitly said no CI pipeline; the human has since asked for one, modeled on `multip`'s already-working workflows (`../multip/.github/workflows/{backend,frontend}-ci.yml`) but adapted to this repo's single public hostname and its actual (smaller) npm script set — `multip`'s `lint`/`format`/`depcruise`/`check:boundaries` steps do not exist here and are **not** added as a side effect of this lane; only what `package.json` already has.

**Owns** `.github/workflows/**`, `specs/lanes/6-f.md`

**Reads, never edits** `compose.yml`, `apps/*/Dockerfile`, `infra/**`, `specs/lanes/deployment.md`, both apps' `package.json`, root `.nvmrc`

**Build**

`6-F1` (wave 8) — CI, two path-filtered workflows so a frontend-only change never rebuilds the backend and vice versa (`multip`'s pattern, minus the lint/format/depcruise steps it has and this repo doesn't):
1. `.github/workflows/backend-ci.yml` — triggers on `push`/`pull_request` touching `apps/backend/**` or `infra/**`. `actions/setup-node@v4` off the root `.nvmrc` (Node 22), `npm ci`, `npm run typecheck`, `npm test`, all inside `apps/backend`.
2. `.github/workflows/frontend-ci.yml` — same trigger shape for `apps/frontend/**` or `infra/**`; `npm ci`, `npm run typecheck`, `npm test`, `npm run build`.
3. Both jobs `docker build` their app's existing Dockerfile, `docker save | gzip`, upload as a workflow artifact (`retention-days: 1`) — the same artifact `6-F2`'s deploy job downloads, so CI and CD share one build rather than building twice.
4. Report which check names to require in GitHub's branch-protection settings on `farealahmed/multiprice`. **You cannot turn on branch protection yourself** — repo settings are the human's, not a committable file — name them explicitly in your report.

`6-F2` (wave 9) — CD, mirroring `multip`'s SSH-tarball deploy job exactly, pointed at the dedicated droplet:
5. A `deploy` job in each workflow, `needs: ci`, gated on `github.ref == 'refs/heads/main' && github.event_name == 'push'`: download the artifact, SSH in with `DEPLOY_SSH_KEY`, `rsync` `infra/` and the image tarball to the droplet, then over that same SSH connection: create `infra/.env` from `infra/.env.example` if missing (never overwrite an existing one — `multip`'s `--delete` mistake deleted a live `.env` mid-deploy; do not repeat it), `docker load`, `docker compose -f infra/compose.yml up -d --no-build`.
6. Smoke test: curl-retry loop (`multip`'s pattern, ~10 tries / 5s apart) against `https://multiprice.farealahmed.com/api/health` for the backend job and `https://multiprice.farealahmed.com/` for the frontend job — both go through the single public hostname, since the backend has no subdomain of its own here.
7. Secrets referenced as `${{ secrets.NAME }}`: `DEPLOY_SSH_KEY`, `DEPLOY_HOST` (`multiprice.farealahmed.com`), `DEPLOY_USER` (`deploy`). **You cannot add the secret values yourself** — list these exact names in your report; the human sets them (`gh secret set NAME --repo farealahmed/multiprice < path/to/value`), not you.
8. Do not automate the browser smoke test from `6-E`'s Done criteria — the curl health check above is enough for CD; the sign-up → `421.50` → finalize walkthrough stays a manual step in `J6`.

**Done when** opening a PR shows both CI checks running and blocking merge on failure, and a push to `main` (once branch protection and secrets are configured by the human) redeploys `multiprice.farealahmed.com` — verified once by triggering it and confirming the URL served a new build.

**Guardrails** No application source changes, no changes to `6-E`'s `infra/**` — read it, deploy against it, do not rewrite it. One CI provider (GitHub Actions). Do not replace `J6`'s manual redeploy-and-verify step; automate the mechanism, not the final human check. Do not port `multip`'s two-public-subdomain Caddy pattern — one vhost, frontend only.

---

## Join J6 — Submission

1. All lanes reported, including `6-F`. Full suite green in both apps, and the CI workflow itself green on this branch's latest push.
2. `e2e/journey.cy.ts` — the reviewer's core journey in one flow: sign up → create a document → enter the PDF's sample lines → see `421.50` → finalize → fail to edit → run a report that reconciles. This proves the documented setup path end to end; it does not re-test API edge cases that faster suites already cover.
3. Fresh clone in a temp directory, follow the README literally, and reproduce `421.50` from it alone. Anything you had to know that the README does not say goes back to 6-A.
4. **Redeploy the final build.** If `6-F2`'s pipeline is wired and armed (branch protection and secrets configured by the human), merging this phase's PR to `main` triggers it; otherwise run `6-E`'s documented release command by hand. Either way, confirm on the live URL: signup works, the sample document totals `421.50`, finalize locks it, and the report reconciles. `6-E` deployed an earlier build in wave 8; this is the one that gets submitted.
5. Commit `chore(J6): join phase 6`.

**Demo** A stranger clones, runs `docker compose up`, signs up, reproduces `421.50`, finalizes, fails to edit, runs a report — from the README alone.

---

## Lane 6-D — Printable view (stretch goal 3)

**Agent** frontend-engineer · **Depends on J6 being green.** Only if everything above is done.

**Owns** `apps/frontend/src/app/(app)/documents/[id]/print/**`, `apps/frontend/src/styles/print.css`, `apps/frontend/src/app/(app)/documents/[id]/view/page.tsx` *(transferred for this wave — the link to the printable view has to live there)*, `README.md` *(its stretch-goals section only)*

**Build**
1. The printable document from `design/htmls/print.html` — served as HTML with print styles, not generated as a PDF. A PDF pipeline is a dependency and a deployment concern for a stretch goal.
2. Print stylesheet: no app chrome, no navigation, black on white, page-break rules that do not split a line-item row across pages.
3. Reachable from the read-only view.
4. Document numbering such as `Q-2026-014` **stays a display concern** — derive it for display from data that already exists. Do not build configurable or concurrency-safe numbering machinery for a requirement the PDF never states.
5. Add it to the README's stretch-goals section yourself — 6-A finished in wave 9 and the file is yours for this wave.

**Done when** the print preview of a finalized document is clean at A4 and Letter, and totals are legible.

**Then run J7 — final verification.** `J6` verified a submission that did not yet contain this lane's changes, and shipping unverified edits after the final check is how a green submission goes out broken. Re-run both suites and the full `e2e/journey.cy.ts`, confirm the deployed URL still serves a working build, and commit `chore(J7): final verification`. If `6-D` is skipped, `J6` is the last word and there is no `J7`.

**Guardrails** No backend changes. No PDF library. If this lane starts running long, drop it — it is the lowest-value item in the project and its cost is the thing the plan warns about.
