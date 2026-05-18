---
description: Wiki format, citation, naming, and lint conventions. Read first when writing into the wiki.
tags: [meta]
last_updated: {{DATE}}
sources: []
---

# Wiki Conventions

Read this before writing or editing wiki pages. The pattern follows Karpathy's "LLM Wiki" idea: agents maintain the wiki, the human curates. Source documents live elsewhere (specs, docs, research) and are *cited, not duplicated*.

The wiki serves two equal purposes: digesting external sources, and acting as the agent's own durable long-term memory — decisions, rationale, and hard-won findings worth keeping across sessions.

## Folder layout

```
wiki/
├── index.md              -- catalog (content-oriented, by domain)
├── log.md                -- chronological append-only operation record
├── meta/                 -- conventions, update rule
└── <domain>/             -- one folder per project or topic
```

The folder split is by *domain* — a project or a topic. New domains get new folders; new pages within a domain go alongside their siblings.

## Page format

Every page starts with YAML frontmatter, followed by an H1 title and a short prose body:

```markdown
---
description: One-sentence summary used by future agents to decide if this page is relevant.
tags: [domain, locked]
last_updated: 2026-01-01
sources:
  - {{REPO_PATH}}/docs/some-spec.md
---

# Page Title

One-paragraph summary of what this page is for.

## Section

Content. Cite specific facts with `(source: path/to/file.md)`. Cross-link
siblings with `[[other-page]]` or `[[domain/other-page]]`.

## Related

- [[sibling-page]]
- [[other-domain/concept]]
```

### Frontmatter fields

| Field | Required | Purpose |
|---|---|---|
| `description` | yes | One-sentence summary. Future agents read this from `index.md` to filter relevance. Be specific. |
| `tags` | yes | Flat list, lowercase-hyphen. Used for grouping and Obsidian Dataview queries. |
| `last_updated` | yes | ISO date `YYYY-MM-DD`. Updated on every meaningful edit. |
| `sources` | yes (may be empty) | Paths to canonical sources this page draws from. Empty list `[]` if the page is pure synthesis or self-recorded memory. |

## Naming

- Lowercase, hyphen-separated. `architecture-overview.md`, not `ArchitectureOverview.md` or `architecture_overview.md`.
- One topic per file. If a page exceeds ~150 lines, consider splitting.
- Use descriptive nouns. The page name is the slug used in `[[wikilinks]]`.

## Citations

Source-of-truth documents are immutable from the wiki's perspective. Cite them; never duplicate them.

In `sources:` frontmatter, use the path to the canonical document. In body prose, cite with `(source: path)`:

```
The server runs at 10 Hz (source: {{REPO_PATH}}/docs/architecture.md).
```

When two sources disagree, note the contradiction explicitly. When a claim has no source (synthesis or inference), say so or mark it `*[needs verification]*`.

## Cross-links

Use Obsidian-style `[[wikilinks]]`. Both Obsidian and LLM agents handle them. Path-relative forms work too: `[[domain/page-name]]`.

Every page should have a `## Related` section with 2–5 outbound links. Pages with no inbound links are *orphans* — flag during lint.

## Domain isolation

One vault holds many projects and topics side by side. These rules keep parallel work from colliding:

- Each project or topic is its own folder under `wiki/`. Cross-link freely *within* a domain, sparingly *across* domains.
- `index.md` is sectioned per domain. An edit to one domain touches only that domain's section of the index.
- `log.md` is append-only — collision-free by construction. Tag every entry with its domain.
- The single-writer rule (below) holds per session. Domain folders mean two sessions working different projects never contend for the same pages.

## Index discipline

`index.md` is content-oriented: every wiki page must appear in the index with a one-line description, under its domain's section. Update the index in the **same edit** as the page itself. A stale index is a broken wiki.

`index.md` must stay under ~200 lines so it fits cheaply in any prompt.

## Log discipline

`log.md` is chronological, append-only. Every meaningful operation gets one entry with a consistent prefix:

```
## [2026-01-01] ingest | <domain> | <source> → N wiki pages
## [2026-01-01] record | <domain> | locked decision X → updated page.md
## [2026-01-01] lint   | <domain> | 2 orphans, 1 stale claim, 1 flag resolved
## [2026-01-01] query  | <domain> | "why X?" → filed as x.md
```

The prefix lets `grep "^## \[" log.md | tail -10` produce a fast recent-activity view.

## Lint

Periodic health check. Look for:

- Contradictions between pages
- Stale claims superseded by newer sources (compare `last_updated` against source dates)
- Orphan pages (no inbound links)
- Concepts mentioned across pages that lack their own page
- Missing cross-references
- Pages that violate the format above
- **Outstanding `*[needs verification]*` flags.** Every lint sweep must hunt down each flag and resolve it — confirm the claim, correct it, or escalate to the human. Flags must not accumulate silently.

Report findings as a numbered list with suggested fixes.

## Hard rules

- **Single writer.** Only the parent agent in a session writes the wiki. Subagents surface findings in their final report; the parent decides what gets persisted.
- **Never edit canonical sources from the wiki.** Source documents are immutable from the wiki's perspective. If a fact in a source is wrong, the human decides whether to revise the source.
- **Always update `index.md` and `log.md` after a wiki edit.** No exceptions.
- **Clean as you go.** When you touch a page and confidently identify stale content, fix or consolidate it then — do not wait for lint. Only act on staleness you can *confidently* identify; mark uncertain cases `*[needs verification]*`, never silently delete.
- **No emojis** unless the human explicitly requests them.

## Related

- [[update-rule]] — when and what to write
- [[../index]] — the wiki catalog
- [[../log]] — operation history
