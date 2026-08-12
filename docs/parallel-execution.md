# Parallel execution protocol

`docs/implementation-phases.md` says *what* gets built and *why* in that order. This document says *how many terminals can be open at once*, and `docs/phases/phase-N.md` gives each of those terminals a brief it can execute without asking anyone a question.

Nothing here changes the plan. The phases, their ordering, and the decisions table are unchanged. This is a decomposition of each phase into lanes that touch disjoint files.

---

## The unit of parallel work

Every phase runs as **gate → lanes → join**.

```
G3  ──►  ┌─ 3-A backend ──┐
         ├─ 3-B tests ────┤
         ├─ 3-C list UI ──┤ ──►  J3
         └─ 3-D editor ───┘
 (1 terminal)   (4 terminals)      (1 terminal)
```

**Gate (G)** — one short serial task, one terminal. It writes the contract: zod schemas in the backend, the mirrored types in the frontend client, the error codes, and the fixtures. It writes *both sides*. This is what makes the lanes independent: no lane has to wait for another lane to discover what a field is called.

**Lanes (A, B, C…)** — run simultaneously in separate terminals. Each owns a disjoint set of files and consumes the gate's contract read-only.

**Join (J)** — one terminal, after every lane in the phase reports done. Runs the whole suite plus the phase's Cypress happy path, fixes the seams, commits.

The join is not ceremony. It is where the duplicated frontend/backend types get proven against each other — rule 2 of the plan.

---

## Rules

These exist so that N terminals in **one checkout, on one branch** do not corrupt each other. No worktrees.

1. **Own your files, and only your files.** Each lane brief has an *Owns* list. If you need a change in a file you do not own, stop and report it — do not edit it.
2. **Contract files are frozen for the whole phase.** Only the gate writes them. A lane that believes the contract is wrong stops and requests an amendment (see below). This is the one rule whose violation is expensive.
3. **Commit by pathspec, never through the index.**
   ```
   git commit -m "feat(3-A): document CRUD routes" -- apps/backend/src/api/routes/documents.ts apps/backend/src/services/documents.ts
   ```
   Every terminal shares one git index. `git add` followed by `git commit` will sweep in whatever another lane happened to stage a second earlier. A pathspec commit reads those paths from the working tree and ignores the index entirely, so it cannot capture another lane's work. Never `git add -A`, never `git add .`, never a bare `git commit -a`.
4. **Never run `git checkout`, `git stash`, `git reset`, `git pull`, or `git rebase`.** Other agents are live in this directory. The join owns branch state. If a git command fails with `index.lock exists`, another lane is mid-commit — wait a second and retry, never delete the lock.
5. **Never run a destructive or global command** — no `rm -rf` outside your own paths, no `npm install` of a dependency another lane also needs (the gate installs shared deps; lane-specific deps are listed in the brief).
6. **Do not start dev servers on shared ports.** Backend `3001`, frontend `3000`, Mongo `27017` belong to the join and to the human. Lanes verify with tests, not by booting the stack. If a lane truly needs a server, use a random port via the test harness.
7. **Report, don't broadcast.** On completion, write `specs/lanes/<lane-id>.md` — one file per lane, so two lanes never touch the same status file.

### Ownership is per-wave

An *Owns* list is a **lock for the duration of one wave**, not a permanent assignment. A file written by `3-D` in wave 5 can be owned by `4-C` in wave 7, because `3-D` stopped running two waves ago. Several lanes depend on this: `4-C` cannot route finalized documents to a read-only view without editing the editor page, `4-D` cannot surface a duplicate action without editing the list, `5-A` cannot add a date filter without editing the list route.

Where a lane needs a file another lane wrote, its brief says so explicitly and names the earlier owner. What is forbidden is editing a file owned by a lane running **right now** — that is the whole constraint, and it is the only one.

A consequence worth stating: a lane that creates something two later lanes both need should say so in `specs/lanes/`. The alternative — every lane defensively duplicating shared surface — is how two implementations of the same rounding rule end up in one repository.

### Amendment protocol

A lane discovers the contract cannot express what the phase needs (missing field, wrong type, a code that has no place to live):

1. Stop work on the affected part; keep going on everything else.
2. Write the problem into `specs/lanes/<lane-id>.md` under `## Contract amendment requested`, with the exact proposed change.
3. Tell the human. The gate terminal — not you — makes the edit on both sides, and every lane in the phase re-reads it.

An amendment costs one round trip. A lane quietly renaming a field costs the join.

---

## File ownership conventions

Applied across all phases so lane briefs can stay short:

| Path | Owner |
|---|---|
| `apps/backend/src/contracts/<domain>.ts` | **one gate each** — schemas *and* that domain's error codes |
| `apps/frontend/src/lib/api/types/<domain>.ts` | **the same gate** (mirrored types) |
| `docs/contracts/phase-N.md` | **Gate only** (human-readable snapshot) |
| `apps/backend/src/api/routes/**` | the lane that creates the file — routes autoload, so nothing shared is edited to register one |
| `apps/frontend/src/components/shell/**` | `0-B`, then **joins only** (adding a nav entry for a new screen) |
| `apps/backend/src/**/*.test.ts` | the lane that owns the source file next to it (colocated unit tests) |
| `apps/backend/test/api/**`, `apps/backend/test/integration/**` | the phase's test lane, if it has one; otherwise the backend lane |
| `apps/frontend/src/**/*.test.tsx` | the lane that owns the component |
| `e2e/**` (Cypress) | the join, except where a lane brief says otherwise |
| `infra/**`, `apps/*/Dockerfile` | the infra lane |
| `specs/lanes/<lane-id>.md` | that lane, exclusively |

Two lanes may live in the same directory as long as they own different files. That is normal and fine.

**There is no shared append-target anywhere in the project, by design.** No growing `codes.ts`, no growing `types.ts`, no route-registration file, no nav array a page lane edits. Every one of those would be a file two lanes need on the same day, and each is replaced above by per-domain files, autoloading, or a join task. When you add something new, keep that property — a shared append-target is the one structure this whole scheme cannot survive.

---

## Stack conventions (frozen by G0)

Every lane assumes these. They are defaults chosen so that no two agents invent different answers; change them in G0 before wave 1 if you want something else, not later.

| Concern | Convention |
|---|---|
| Language | TypeScript, ESM, `strict: true`, Node 22 |
| Backend | Fastify 5 + zod, official `mongodb` driver (no ODM) |
| Frontend | Next.js App Router, React 19, plain CSS Modules with tokens ported from `design/htmls/styles.css` |
| Unit/integration runner | Vitest, both apps |
| Component tests | Vitest + Testing Library |
| Browser tests | Cypress, one happy path per phase, in `e2e/` at the repo root |
| Ports | frontend `3000`, backend `3001`, Mongo internal only (dev: `127.0.0.1:27017`) |
| Compose | `compose.yml` and `compose.dev.yml` at the **repository root**, so a bare `docker compose up` works |
| Error envelope | `{ error: { code, message, details? } }`, codes `SCREAMING_SNAKE` — no exceptions, including `DOCUMENT_FINALIZED` |
| Browser → API | **same-origin only**: the frontend calls relative `/api/...`, Next rewrites to the backend. No CORS, no `NEXT_PUBLIC_API_URL` |
| Numeric bounds | quantity `1 … 1_000_000` (max 3 dp), unit price `0 … 1_000_000` (max 2 dp) — keeps scaled integer products inside `Number.MAX_SAFE_INTEGER` |
| Money on the wire | JSON number, major units, max 2 dp |
| Commits | Conventional Commits, scope = lane id, e.g. `feat(3-A): document CRUD routes` |

---

## Launching a lane

Open a terminal in the repo root, start `claude`, and paste:

```
You are Lane 3-A.

Read, in order:
  docs/parallel-execution.md          (the rules — especially file ownership)
  docs/implementation-phases.md       (§Decisions and §Phase 3)
  docs/phases/phase-3-issue-4.md      (find "Lane 3-A" — that is your brief)
  docs/contracts/phase-3.md           (the frozen contract you build against)
  docs/multi-rate-pricing-calculator.md  (the assignment itself, if you need it)

Implement Lane 3-A end to end, including its tests. Other agents are working in
this same directory right now: write only the files your brief lists under Owns,
and commit them by pathspec (git commit -m "..." -- <paths>), never via git add,
because every terminal shares one git index. Do not edit contract files. If you
are blocked on something outside your lane, write it to specs/lanes/3-A.md and
stop rather than reaching into another lane's files.

When the brief's "Done when" checks pass, write specs/lanes/3-A.md and report.
```

Substitute the lane id and phase number. Every lane brief is written to be executable from that prompt alone.

Optional: `.claude/agents/` defines four role charters — `backend-engineer`, `frontend-engineer`, `test-engineer`, `infra-engineer`. Each lane names the role it wants. Prepend `Act as the <role> defined in .claude/agents/<role>.md.` to the prompt above, or dispatch the lane to that subagent type from an orchestrating terminal.

## Running a join

A gate uses the same prompt with the gate's id. A join gets its own, because its job is reconciliation rather than construction:

```
You are running Join J3.

Read:
  docs/parallel-execution.md          (§Definition of done — every join)
  docs/phases/phase-3-issue-4.md      (the "Join J3" section — that is your checklist)
  docs/contracts/phase-3.md           (the authority when two lanes disagree)
  specs/lanes/3-*.md                  (what each lane reports, including its assumptions
                                       and anything it flagged for you)

Every lane in this phase has reported. Nothing is branched — the lanes wrote into
this working tree, so your job is not to merge but to prove the pieces agree.

Work the checklist in order. When something disagrees, the contract decides; where
the contract itself is wrong, fix it there first and then both sides. You may edit
any file in the phase — you are the only agent running right now. Confirm that with
git status before you start.

Report what you fixed, and what a human should look at before the next wave.
```

Unlike a lane, the join has no ownership restriction — it is the only agent running, and seam-fixing means touching both sides. Verify that is true (`git status`, no other terminals working) before it starts editing.

---

## Running the stack

**Not in a lane terminal.** Lanes verify with tests; they never boot a server. The running stack belongs to **you**, in a terminal that is not doing lane work — otherwise two agents fight over port 3001 and you cannot tell whose crash you are reading.

Keep one dedicated terminal open for it. There are two ways to run, and they answer different questions.

### Development — three processes, hot reload

What you use while building. The database is containerized; both apps run on the host so a save is visible in a second.

```
Terminal S1   make dev-db     # Mongo in Docker (compose.dev.yml), on 127.0.0.1:27017
Terminal S2   make dev-api    # backend, tsx watch, http://localhost:3001
Terminal S3   make dev-web    # frontend, next dev,  http://localhost:3000
```

Open `localhost:3000`. The path is **browser → Next.js (3000) → Fastify (3001) → Mongo (27017)**. Every hop is inspectable: the browser's network tab for the first, `dev-api`'s request log for the second, `make db-shell` for the third.

If three more terminals is too many, run `make dev-db` and start the two apps in the background of one terminal — but keep their output somewhere you can read it, because "the UI shows nothing" is nearly always a backend log line you did not see.

### Demonstration — one command, everything containerized

What a reviewer runs, and what every join verifies:

```
make up        # mongo + backend + frontend, production images
make seed      # from Phase 6 onward — demo user and the PDF's sample document
make reset     # clean database, start over
```

Here Mongo publishes **no host port** — only the backend reaches it, over the compose network. That is deliberate: it is how the deployed stack behaves, and it is why `compose.dev.yml` exists separately for the development path. Both files sit at the repository root so that the bare `docker compose up` in the README works from a clean clone; Compose does not look inside `infra/`.

### Seeing the data

```
make db-shell
> use multiprice
> db.documents.find().pretty()
> db.documents.findOne({}, { totals: 1, status: 1 })
```

Watching `totals` in the database while the UI shows the same figures is the quickest way to confirm the claim the whole project rests on: **the server computed those numbers, and the browser only displayed them.**

### What is actually visible, by phase

The full round trip does not exist until Phase 3, by design — the plan orders phases by risk retired, not by what looks finished.

| After | The UI shows | Where the data comes from |
|---|---|---|
| `J0` | a health page: backend up, database up | a Mongo `ping` — no collections yet |
| `J1` | the editor, totals resolving to `421.50` | the pricing engine, **stateless — no database at all** |
| `J2` | sign-up, sign-in, a protected app shell | the `users` collection |
| **`J3`** | **documents list and editor: create, save, reload, correct totals** | **the `documents` collection — the first real UI → backend → database round trip** |
| `J4` | a finalized document locked, a 409 surfaced | the same, plus a status transition |
| `J5` | report cards reconciling with the rows beneath them | a Mongo aggregation over stored totals |

Phase 1 having no database is the deliberate part. It carries three of the seven scored rows and needs no persistence to be correct, so it does not get any.

---

## Wave schedule

Lanes in the same wave run at the same time. The number in brackets is terminals in use.

A gate never shares a wave with the lanes it blocks, and a join runs alone.

| Wave | Runs | Then |
|---|---|---|
| 0 | `G0` conventions, health contract, autoload + one-file-per-domain rules **[1]** | — |
| 1 | `0-A` backend runtime · `0-B` frontend shell · `0-C` infra & E2E harness · `G1` pricing contract **[4]** | `J0` |
| 2 | `1-A` pricing engine · `1-C` editor UI · `G2` auth contract + persistence **[3]** | — |
| 3 | `1-B` preview route **[1]** | `J1` |
| 4 | `2-A` backend auth · `2-B` frontend auth · `G3` document contract **[3]** | `J2` |
| 5 | `3-A` documents backend · `3-B` validation & isolation tests · `3-C` documents list · `3-D` editor persistence **[4]** | `J3` |
| 6 | `G4` lifecycle contract · `G5` report contract **[2]** | — |
| 7 | `4-A` finalize+guard · `4-B` immutability tests · `4-C` lock UI · `5-B` report UI **[4]** | `J4` |
| 8 | `5-A` report aggregation · `4-D` duplicate (only if J4 green) · `6-A1` README draft · `6-E` deployment **[4]** | `J5` |
| 9 | `6-A2` README final · `6-B` seed script · `6-C` quality pass **[3]** | `J6` |
| 10 | `6-D` printable view (only if J6 green) **[1]** | `J7` |

Ten waves, nineteen lanes, peak four terminals. Three things worth noticing:

**`G0` runs alone.** It creates the files every other gate builds beside, so nothing can run next to it. It is short — config and two type files.

**Gates run a wave ahead of their lanes.** `G2` during Phase 1's work, `G3` during Phase 2's, `G4`/`G5` together after `J3`. A gate needs the previous phase's *decisions*, not its code — which is what buys the parallelism. What a gate can never do is share a wave with the lanes it blocks; those lanes would be building against a contract still being written.

**Deployment is a lane, not an assumption.** `6-E` runs in wave 8 because `6-A2` needs a URL to put in the README and `J6` needs a live build to verify. It is the one lane that cannot start without facts only the human has — provider, database, hostname, secrets — and its brief lists them.

**`6-A` is split across two waves.** `6-A1` drafts from the frozen contracts in wave 8; `6-A2` finalizes against landed behaviour after `J5`. A lane cannot be simultaneously blocked on a join and running before it — the earlier schedule claimed both.

**Wave 3 has one lane, and that is correct.** `1-B` imports `src/pricing` directly, so it cannot even typecheck until `1-A` lands. A test lane can be written blind against a contract; a lane that *calls* another lane's module cannot. Do not be tempted to run them together.

If you have fewer terminals than a wave wants, drop lanes in this order: test lanes last (they are scored), UI lanes second-to-last, stretch lanes first.

---

## Definition of done — every lane

A lane is done when all of these are true. This list is repeated in each brief only where it differs.

- Everything in the brief's *Build* section exists.
- The brief's *Done when* command exits zero.
- No file outside *Owns* has been modified — check with `git status --short`.
- `specs/lanes/<lane-id>.md` exists, containing: what landed, files touched, assumptions made, anything the join needs to know, and any contract amendment requested.
- The work is committed with the lane id in the scope, by pathspec, touching no other lane's files.

A lane is **not** responsible for making other lanes' tests pass, for the phase's Cypress flow (unless its brief says so), or for anything in a later phase.

---

## Definition of done — every join

- Every lane in the phase has a `specs/lanes/` report.
- Full suite green in both apps.
- `docker compose up --build` boots the stack clean.
- The phase's Cypress happy path passes against that stack.
- The phase's demo (from `docs/implementation-phases.md`) is reproducible by hand.
- Any new screen's entry added to `components/shell/nav-items.ts` — no page lane may edit the shell, so wiring a new screen into the navigation is always the join's job.
- Seams fixed and committed as `chore(J3): join phase 3`.
