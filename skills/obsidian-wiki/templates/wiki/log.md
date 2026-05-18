# Wiki Log

Append-only chronological record of wiki operations. Most recent entries at the bottom.

Prefix every entry with `## [YYYY-MM-DD] <op> | <domain>` so `grep "^## \[" log.md | tail -10` returns recent activity.

Operation types: `seed`, `ingest`, `record`, `query`, `lint`, `revise`, `prune`.

---

## [{{DATE}}] seed | meta | wiki initialized for {{PROJECT}}

Scaffolded the wiki skeleton (`meta/conventions.md`, `meta/update-rule.md`, `index.md`, `log.md`) via the `obsidian-wiki` skill. No domains yet — the first Ingest or Record operation creates the first one.
