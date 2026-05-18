---
description: Decision rule for whether a session's output belongs in the wiki, and the end-of-session checklist.
tags: [meta, workflow]
last_updated: {{DATE}}
sources: []
---

# Wiki Update Rule

Read this at the **end** of every session that touched project context. It decides what gets persisted and what does not.

The wiki is two things at once: a digest of external sources, and the agent's own durable long-term memory. Most of what belongs here is the second kind — insight the agent produced by doing the work.

## When to update

Update the wiki at the end of any session that produced **durable insight** for a future agent. "Durable" means the insight is still useful in 1, 4, or 12 weeks — not just to finish the current task.

### Good candidates for the wiki

- **Locked decisions with rationale.** The decision *and* the why. ("We chose X over Y because Z.")
- **Architectural commitments that constrain future work.** ("The server has zero gameplay logic — adding any breaks determinism.")
- **Cross-cutting tradeoffs** that span multiple sources or subsystems.
- **Non-obvious facts a future agent would otherwise re-derive.**
- **Synthesis from queries.** When a good answer required reading several sources and connecting dots, file it.
- **New glossary terms** introduced by the session.
- **Open questions** that did not resolve in the session.

This is the **Record** operation: self-documenting what you learned by doing the work. It is a first-class reason to write to the wiki — not a side-effect of ingesting a source.

### Bad candidates (do not persist)

- Ephemeral task state. "Currently halfway through implementing X" belongs in a task list, not the wiki.
- Anything trivially derivable from `git log`, `git blame`, or current code state.
- Anything already captured in a canonical source document. Link to it instead.
- Conversation noise — "user asked a clarifying question, I answered."
- Snapshots of activity (PR lists, branch state). If asked to save these, ask what was *surprising* about them — that is the wiki-worthy part.

## End-of-session checklist

Run before closing any planning, design, or implementation session.

1. **Glossary audit.** Did this session introduce or shift the meaning of any term? Add or update the domain's glossary page.
2. **Open questions.** Are there `*[uncertain]*` annotations or deferred decisions? Capture them in the domain's open-questions page.
3. **Record.** Walk back through the session: any locked decisions, architectural commitments, or non-obvious findings worth persisting? If yes, create or update the relevant topic page.
4. **Clean as you go.** Did you notice stale or contradictory content while working? Fix what you can confidently identify; flag the rest `*[needs verification]*`.
5. **Index + log.** Every page touched is reflected in `index.md` (one line per page) and `log.md` (one entry per operation, prefixed `## [YYYY-MM-DD] <op> | <domain>`).

## Subagent boundary

Subagents do not write the wiki. The parent agent is the sole writer. When dispatching a subagent:

- **Require findings-surfacing.** Add to the subagent prompt: *"In your final report, surface any non-obvious findings worth persisting beyond this immediate task."*
- **Read the report through a wiki lens.** Did anything meet the durable-insight bar? If yes, the parent persists it.

This single-writer rule prevents concurrent edits and bloat.

## Related

- [[conventions]] — page format, citation, naming, lint
- [[../index]] — wiki catalog
- [[../log]] — operation history
