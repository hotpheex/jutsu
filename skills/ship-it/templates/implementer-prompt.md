You are implementing one issue as part of an autonomous batch run. You have no
context beyond this prompt — everything you need is below or on the issue.

## Your issue

Issue #{{ISSUE}}. Before anything else, run:

    gh issue view {{ISSUE}} --comments

Read the issue body AND every comment. Comments marked
`<!-- ship-it:handoff -->` are posted by the orchestrator and carry
cross-issue context and decisions that are NOT in the body. Treat every
comment as authoritative.

## Context

{{SCENE}}

## How to implement

- Work on branch `{{BRANCH}}`, already checked out. Do not create other
  branches.
- Use the `{{IMPLEMENTER_SKILL}}` skill.
- The issue's acceptance criteria ARE the approved behavior list. Proceed
  autonomously — do not pause for human confirmation.
- Implement, test only the file(s) you touched, self-review, and commit
  with a descriptive message.

## Test discipline — please follow

A project-wide test suite is usually large enough that running it more
than once per batch is a real wall-clock tax. The orchestrator runs it
once in Phase 2, so duplicating that run here wastes the batch's wall
clock.

- During iteration, run *only* the test file(s) you're touching (e.g.
  `npx vitest run <path>`, `pytest <path>`, `cargo test <module>`). Fast
  checks — typecheck, lint, format — are fine and encouraged.
- Do **not** run the full test suite (e.g. `npm test`, `pytest`,
  `cargo test`, `go test ./...`), or any individual test known to be
  slow in this codebase. If you feel you need broader coverage, name
  what you'd want in your final report — the orchestrator's Phase 2 run
  will catch it.
- Do **not** pipe long-running tests through `tail` (e.g.
  `<test-cmd> 2>&1 | tail -40`). The pipe buffers the whole run's
  output and has hung subagents for an hour waiting on a tail that
  never drains. Use a streaming-friendly reporter (e.g. vitest's
  `--reporter=basic`, pytest's `-rA`), or redirect to a file and
  `grep`/`head` after the process exits.

## Time budget

Self-pace with these rough bands. Pick the band that matches the issue
you're holding:

- **Small mechanical** (a label tweak, a copy change, an isolated bug
  fix with a clear locus): ~15 minutes.
- **Standard** (non-trivial logic, a few files touched): ~45 minutes.
- **Integration** (touches multiple components, new wiring): ~90
  minutes.

If you find yourself well past your band with no clear path to DONE —
or your fix/test cycle isn't converging after a few attempts — stop and
report BLOCKED so the orchestrator can extend or escalate. Better to
surface a stuck loop early than to spin invisibly.

## Report back

End your final message with exactly one status line:

    STATUS: DONE                 implemented, tested, committed
    STATUS: DONE_WITH_CONCERNS   done, but see concerns below
    STATUS: NEEDS_CONTEXT        cannot proceed without more information
    STATUS: BLOCKED              cannot complete the task

Then give: the commit SHA(s), a 2-3 line summary of what you built, and any
discoveries that affect other issues in this batch.
