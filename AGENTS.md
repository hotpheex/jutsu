# Global agent instructions

## wiki

"wiki" means my Obsidian vault at `$OBSIDIAN_VAULT`. If the variable is unset, ask.

Enter through `$OBSIDIAN_VAULT/index.md`, which routes. `wiki/RULES.md` is the
policy and outranks this file on anything about the vault. Both name the
locations, so read them rather than guessing a path.

Go there to pick up background a repo does not carry, and to reconcile durable
context once consequential work has changed it.

**Docs go to the wiki, not the repo.** Glossaries, ADRs, design docs, and skill
artifacts are never created, staged, or committed inside a repository. Keep the
format a skill specifies, change only the location. This overrides any skill
that says otherwise.

## Grilling

Every grill runs `grill-with-docs`, and persists its artifacts to the wiki.

Lead with the one-way doors: the calls only I can make, where the tradeoff is
real and reversing it is expensive. Settled and reversible details come last,
or not at all.
