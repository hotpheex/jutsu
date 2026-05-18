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
- Implement, test, self-review, and commit with a descriptive message.

## Report back

End your final message with exactly one status line:

    STATUS: DONE                 implemented, tested, committed
    STATUS: DONE_WITH_CONCERNS   done, but see concerns below
    STATUS: NEEDS_CONTEXT        cannot proceed without more information
    STATUS: BLOCKED              cannot complete the task

Then give: the commit SHA(s), a 2-3 line summary of what you built, and any
discoveries that affect other issues in this batch.
