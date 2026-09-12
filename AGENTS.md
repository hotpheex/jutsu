# Global agent instructions

Harness-neutral instructions that apply in every repo and every session.
Consumers link this file to wherever their harness reads global instructions.

Keep it short and general. Anything specific to one repo belongs in that repo's
own `AGENTS.md`.

## Design docs live in the Obsidian vault, not in the repo

`CONTEXT.md`, `CONTEXT-MAP.md`, and ADRs are never created, edited, staged, or
committed inside a repository. They live in the Obsidian vault, under
`$OBSIDIAN_VAULT/Notes/<repo>/` (`~/vault` when the variable is unset):

- glossary: `$OBSIDIAN_VAULT/Notes/<repo>/CONTEXT.md`
- ADRs: `$OBSIDIAN_VAULT/Notes/<repo>/adr/NNNN-<slug>.md`

When a skill says to read or write `CONTEXT.md` or `docs/adr/`, use these paths
instead. Keep the file formats the skill specifies; only the location changes.
This overrides any skill that says otherwise, including `domain-modeling` and
`grill-with-docs`.
