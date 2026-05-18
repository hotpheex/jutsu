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
   Missing augmentation skill: drop it, note it. Missing role skill: stop with
   a hard error.
6. Build the run plan: the ordered issue list, each `pending`.
7. `upsert-comment <parent> run-status <file>` — post the initial run-status
   (render with the ordered list, every issue `pending`).
8. Fire the `run-start` hook (see Hooks below).

## Phase 1 — Per-issue loop

Process issues strictly sequentially, in dependency order. For each issue:

1. **Cascade-skip check.** If any issue this one is blocked by ended `failed`
   or `skipped`, mark this issue `skipped`, post an outcome comment saying so,
   and continue to the next issue.
2. **Handoff comment.** If earlier issues produced discoveries affecting this
   issue, `upsert-comment <issue> handoff <file>` with that context before
   dispatching.
3. **Dispatch the implementer** subagent from `templates/implementer-prompt.md`
   (see Subagent contract). Choose the model by issue complexity.
4. **Handle the status** the implementer reports (see Subagent contract).
5. **Stage 1 — spec compliance.** Dispatch a subagent from
   `templates/spec-compliance-prompt.md`. On `FAIL`, go to the fix loop.
6. **Stage 2 — code quality.** Only after stage 1 `PASS`: dispatch a subagent
   from `templates/code-quality-prompt.md`, which runs the `reviewer` skill.
7. **Fix loop.** If stage 1 failed, or stage 2 returned Critical/Important
   findings: dispatch a fix subagent from `templates/fix-prompt.md`, then
   re-run stage 1 and stage 2. Repeat until both are clean or the loop fails
   to converge (no progress between iterations) — a non-converging loop is
   handled like `BLOCKED`.
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

1. Dispatch a `reviewer`-skill subagent over the whole branch diff
   (`<base>...HEAD`).
2. For remaining Critical/Important findings, dispatch a fix subagent.
3. Fire the `pre-pr` hook.

## Phase 3 — Raise PR

`create-pr <branch> <base> <title> <body-file>`. The body contains:

- A one-paragraph summary of the batch.
- **Completed:** each `done` issue with its commit SHA.
- **Deferred:** Suggestion-level findings rolled up from outcome comments.
- **Skipped / failed:** each such issue with the escalation reason.
- **Pending human work:** the `hitl` children, listed but not implemented.

## Phase 4 — Notify

Fire the `run-complete` hook. With no augmentation bound there, the run simply
ends; report the PR URL.

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
- **Single writer.** Only the orchestrator writes tracker comments and the
  run-status. Subagents surface findings in their final report; the
  orchestrator records them.

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
- `post-issue-complete` → `screenshot-journey`: for an issue with visible UI
  changes, capture a milestone screenshot.
- `run-complete` → (future Discord notifier): announce the finished PR.

## The tracker abstraction

`scripts/tracker.mjs` is the only component that knows the tracker is GitHub.
Comment markers it manages (HTML comments, so the orchestrator finds and
parses its own comments on a resumed run):

- `ship-it:run-status` — one comment on the parent issue, edited in place.
- `ship-it:handoff` — per child, cross-issue context posted before dispatch.
- `ship-it:outcome` — per child, the result posted after completion.

A different tracker backend reimplements `tracker.mjs`'s operations and
nothing else changes.
