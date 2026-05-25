# Running a batch

The full procedure for one `ship-it` run. Read this before starting.

Terminology: the **parent issue** is the invocation argument; its **children**
are the work-set; an **issue** below means one child.

## Phase 0 — Setup

1. `node scripts/tracker.mjs list-children <parent>` — the child issues.
2. Keep children labelled `ready-for-agent`; set aside `hitl` children for the
   PR body. Children with neither label are also set aside and noted.
3. Order the AFK children by dependency (the script's `list-children` output
   carries each issue's `blockedBy`; sort so blockers come first).
4. Resolve the work-set branch: a conventional name is `ship-it/<parent>`.
   Check it out if it exists; otherwise create it from the base branch.
5. Capability detection — for each registry skill, check availability.
   Three distinct failure modes, three distinct responses:
   - Missing **role** skill (e.g. no `implementer`, no `reviewer`): stop with
     a hard error. The run cannot start.
   - Missing **augmentation** skill (the skill itself is not installed): drop
     it silently, note it in the run plan. The run continues without it.
   - **Augmentation skill installed but its required state is corrupted**
     (e.g. `ui-journey` is available but `$JOURNEY_DIR/manifest.json` is
     missing while `shots/` is non-empty): skip this augmentation for the
     duration of the run and surface it in the final PR body's Deferred
     section, so a human can repair the state before the next run. Do not
     silently regenerate.
6. Build the run plan: the ordered issue list, each `pending`.
7. `upsert-comment <parent> run-status <file>` — post the initial run-status
   (render with the ordered list, every issue `pending`).
8. Fire the `run-start` hook (see Hooks below).

## Phase 1 — Per-issue loop

Process issues strictly sequentially, in dependency order. For each issue:

1. **Cascade-skip check.** If any issue this one is blocked by ended `failed`
   or `skipped`, or is a `hitl` issue (or any other issue outside the AFK
   work-set that will therefore never be implemented this run), mark this
   issue `skipped`, post an outcome comment naming the unsatisfiable blocker,
   and continue to the next issue. Cascade-skipped issues are reported in the
   PR body alongside the `hitl` issues as work that is still blocked.
2. **Handoff comment.** If earlier issues produced discoveries affecting this
   issue, `upsert-comment <issue> handoff <file>` with that context before
   dispatching.
3. **Dispatch the implementer** subagent from `templates/implementer-prompt.md`
   (see Subagent contract). Choose the model by issue complexity. Before
   dispatching, record the current branch HEAD SHA: once the implementer has
   committed, this issue's review range `SHA_RANGE` is `<recorded-SHA>..HEAD`.
4. **Handle the status** the implementer reports (see Subagent contract).
5. **Stage 1 — spec compliance.** Dispatch a subagent from
   `templates/spec-compliance-prompt.md`. On `FAIL`, go to the fix loop.
6. **Stage 2 — code quality.** Only after stage 1 `PASS`: dispatch a subagent
   from `templates/code-quality-prompt.md`, which runs the `reviewer` skill.
7. **Fix loop.** If stage 1 failed, or stage 2 returned Critical/Important
   findings: dispatch a fix subagent from `templates/fix-prompt.md`
   (substitute `{{FIX_SKILL}}` with the `implementer` role-binding skill name,
   since the `fix` role defaults to it), then re-run stage 1 and stage 2.
   Repeat until both are clean or the loop fails to converge (no progress
   between iterations) — a non-converging loop is handled like `BLOCKED`.
8. **post-issue-complete hook.** Fire it (see Hooks).
9. **Record.** `upsert-comment <issue> outcome <file>` with the commit SHA(s),
   what was built, discoveries, and any deferred Suggestion-level findings.
   `add-label <issue> agent-done`. Re-render and `upsert-comment <parent>
   run-status <file>` with this issue now `done`.
10. **Cross-issue discoveries.** For each later issue a discovery affects,
    `upsert-comment <that-issue> handoff <file>` now, so it is waiting when
    that issue runs.

### Circuit breaker

After each issue, count `failed` + `skipped`. If it exceeds the threshold
(default: one-third of the AFK work-set), stop the loop. Still run Phase 2 and
Phase 3 over whatever landed, so partial work is captured and reviewable.

## Phase 2 — Final review

0. **Full test suite — the orchestrator runs this, once per batch.** Execute
   the project's full test suite (e.g. `npm test`) against the work-set
   branch HEAD. This is the *only* full-suite invocation in the entire run;
   implementers, reviewers, and fix subagents are forbidden from running it
   (their templates say so), because eleven independent full-suite runs cost
   eleven full-suite-durations while one orchestrator run catches the same
   regressions. If the suite fails, package the failures as findings and
   dispatch a fix subagent before proceeding to step 1.
1. Dispatch a `reviewer`-skill subagent over the whole branch diff
   (`<base>...HEAD`).
2. For remaining Critical/Important findings, dispatch a fix subagent.
3. Fire the `pre-pr` hook.

## Phase 3 — Raise PR

Push the work-set branch to the remote first — `gh pr create` will otherwise
prompt for a push target and hang a non-interactive run:

```
git push -u origin <branch>
```

Then `create-pr <branch> <base> <title> <body-file>`. The body contains:

- A one-paragraph summary of the batch.
- **Completed:** each `done` issue with its commit SHA, prefixed with a GitHub
  closing keyword so merging the PR auto-closes the issue — e.g.
  `- Closes #123 — <title> (`abc1234`)`. Repeat the keyword on every line; one
  shared keyword does not cascade. Accepted keywords: `close|closes|closed`,
  `fix|fixes|fixed`, `resolve|resolves|resolved`. Auto-close only fires when
  the PR targets the repo's default branch, so confirm `<base>` is the default
  before relying on it; if it is not, still include the keywords (they become
  no-ops) and note in the summary that issues must be closed manually.
- **Deferred:** Suggestion-level findings rolled up from outcome comments.
- **Skipped / failed:** each such issue with the escalation reason. Do **not**
  use a closing keyword here — these issues must stay open.
- **Pending human work:** the `hitl` children, listed but not implemented. Do
  **not** use a closing keyword here either.

## Phase 4 — Notify

Fire the `run-complete` hook. `discord-notify` is the sole binding; the
steps below are its inline execution.

1. If `discord-notify` is `off`, skip and report the PR URL.
2. Read `SHIP_IT_DISCORD_WEBHOOK_URL`. If unset or empty, skip silently and
   report the PR URL.
3. Extract the PR number from the URL returned by `create-pr` (the last
   path segment, e.g. `42` from `.../pull/42`).
4. POST to the webhook:

   ```bash
   curl -s -o /dev/null -w "%{http_code}" -X POST "$SHIP_IT_DISCORD_WEBHOOK_URL" \
     -H "Content-Type: application/json" \
     -d "{\"content\": \"ship-it done — {done} done, {skipped} skipped, {failed} failed — [PR #{number}]({url})\"}"
   ```

   Substitute `{done}`, `{skipped}`, `{failed}` with the final run counts and
   `{number}` / `{url}` with the PR number and full URL.

5. Decide which error to log from `curl`'s own signals, in this order:
   - If `curl` exited non-zero, log `discord notify failed: transport error`
     (network/DNS/TLS — `%{http_code}` will read `000` but the exit code is
     the authoritative signal, not the printed code).
   - Else if the HTTP status is not 2xx, log
     `discord notify failed: HTTP <status>`.
   - Else success — nothing to log.

   Never abort the run regardless of which branch fires — the PR is already
   raised.
6. Report the PR URL to the user.

## Subagent contract

Borrowed from `superpowers:subagent-driven-development`.

- **Fresh subagent per task. Never run implementers in parallel** — sequential
  only, no shared-branch conflicts.
- **The implementer must enumerate issue comments.** Its prompt mandates
  `gh issue view <n> --comments` and reading *every* comment — orchestrator
  `handoff` comments carry context absent from the issue body.
- **The issue is the approval.** Acceptance criteria are the approved behavior
  list; a role skill that normally pauses for human sign-off proceeds
  autonomously.
- **Four implementer statuses:**
  - `DONE` — proceed to review.
  - `DONE_WITH_CONCERNS` — read the concerns; act if they touch correctness or
    scope, else note and proceed.
  - `NEEDS_CONTEXT` — supply the missing context, re-dispatch the same model.
  - `BLOCKED` — enter escalate-retry.
- **Two-stage review, strict order.** Stage 1 (spec compliance) is a dedicated
  reviewer subagent with an intrinsic prompt. Stage 2 (code quality) is the
  `reviewer` role binding. Never start stage 2 before stage 1 passes.
- **Escalate-retry-then-skip.** On `BLOCKED` or a non-converging fix loop:
  re-dispatch once with a more capable model (the retry budget). If a
  `NEEDS_CONTEXT`/context gap caused it, also supply the missing context.
  Still failing → mark the issue `failed`, post an escalation outcome comment,
  cascade-skip its dependents.
- **Model selection.** Cheap models for mechanical issues, standard for
  integration work, the most capable for reviews and escalation retries.
- **Time budget.** The implementer and fix prompts give subagents
  self-pacing bands (~15 min mechanical, ~45 min standard, ~90 min
  integration; fixes default to ~30 min). If a subagent reports BLOCKED
  for budget, decide whether to extend (re-dispatch with fresh context)
  or treat as escalate-retry. The budget is guidance, not a tripwire —
  it exists so a stuck subagent surfaces fast rather than chewing wall
  clock invisibly.
- **Test discipline.** Subagents run only targeted tests on the file(s) they
  touched (e.g. `npx vitest run <path>`, `pytest <path>`, `cargo test
  <module>`), plus fast checks (typecheck, lint, format). They do *not*
  run the full test suite (e.g. `npm test`, `pytest`, `cargo test`,
  `go test ./...`), or any individual test known to be slow in the
  codebase — the orchestrator's Phase 2 step 0 is the single full-suite
  run for the whole batch. They also never pipe long-running test output
  through `tail` (e.g. `<test-cmd> 2>&1 | tail -40`): the pipe buffers
  the whole process output and has hung subagents for an hour waiting on
  a tail that never drains. Subagent templates encode this; the rule
  lives here too so that the procedure stays the source of truth.
- **Single writer.** Only the orchestrator writes tracker comments and the
  run-status. Subagents surface findings in their final report; the
  orchestrator records them. The one carve-out: the `ui-journey` manifest is
  a *project* artifact, not a tracker artifact — implementer subagents may
  append to it through `captureMilestone` (and only through
  `captureMilestone`), since the hook fires inside their workspace. No other
  subagent write to `manifest.json` or `index.md` is permitted.

## Resumability

Re-invoking on the same parent issue resumes the run. Rebuild state from the
tracker, not memory:

- `agent-done`-labelled children are already complete — skip them.
- Re-read the `run-status` comment for the human-facing picture.
- A child with a `failed`/`skipped` outcome comment but no `agent-done` label
  is retried fresh unless its blockers are unmet.

The workflow is idempotent: every tracker write is a marker-keyed upsert, so a
re-run overwrites rather than duplicates.

## Hooks

At each hook point, for every enabled augmentation bound there, invoke its
skill. An augmentation that is not installed is silently skipped.

- `post-issue-complete` → `obsidian-wiki`: when a genuinely durable *design*
  decision surfaced while implementing the issue, record it in the wiki. Run
  state stays in the tracker; only project knowledge goes to the wiki.
- `post-issue-complete` → `ui-journey`: for an issue with visible UI
  changes, capture **one** milestone screenshot for *this issue only*.
  - The implementer subagent calls `captureMilestone` directly (or runs a
    purpose-built single-test spec), targeting the new state. Do **not** run
    the project's full journey spec or any pre-existing capture script that
    walks earlier milestones — the manifest is append-only and a full replay
    re-captures every prior milestone, polluting the journey (a real run
    produced 9× duplicates of one label because the orchestrator ran
    `journey.spec.ts` on every issue).
  - Decide first whether the issue has user-visible UI changes. Pure logic,
    refactors, tests, or backend work: skip the hook — do not capture a "no
    visible change" milestone.
  - Label convention: `<branch-or-gate-prefix>-<short-slug>` keyed to *this*
    issue, so a resumed or rerun batch overwrites the entry's *meaning* but
    does not produce a near-duplicate caption (see `superpowers:ui-journey`
    for label/caption rules).
  - **`manifest.json` is the source of truth.** Before firing the hook, check
    that `$JOURNEY_DIR/manifest.json` exists. If it is missing and `shots/`
    is non-empty, treat the journey as corrupted: skip the hook, log
    `ui-journey: manifest missing — skipping until rebuilt`, and surface it
    in the final PR body's Deferred section. Do not auto-create a fresh
    manifest beside orphaned shots — that silently reorders history.
  - **Never hand-edit `index.md` or `manifest.json`.** Captions, labels, and
    ordering are written *only* by `captureMilestone`. `index.md` is a
    generated artifact and any manual edit is wiped on the next build (or,
    if the manifest is lost, becomes the only state — see the corruption
    above). If a caption is wrong, fix it in the manifest entry, never in
    `index.md`.
  - **Rebuild the viewer after each capture.** After `captureMilestone`
    returns, run `node journey/build-viewer.mjs` (or the project's
    `npm run journey` equivalent) so `index.md` and `index.html` are
    regenerated from the manifest. Captures without a rebuild leave the
    viewer stale and tempt future hand-edits.
- `run-complete` → `discord-notify` (inline): post a minimal run summary to
  Discord if `discord-notify` is `on` and `SHIP_IT_DISCORD_WEBHOOK_URL` is set.
  Format: `ship-it done — N done, N skipped, N failed — [PR #N](url)`.
  Failures are non-fatal.

## The tracker abstraction

`scripts/tracker.mjs` is the only component that knows the tracker is GitHub.
Comment markers it manages (HTML comments, so the orchestrator finds and
parses its own comments on a resumed run):

- `ship-it:run-status` — one comment on the parent issue, edited in place.
- `ship-it:handoff` — per child, cross-issue context posted before dispatch.
- `ship-it:outcome` — per child, the result posted after completion.

A different tracker backend reimplements `tracker.mjs`'s operations and
nothing else changes.
