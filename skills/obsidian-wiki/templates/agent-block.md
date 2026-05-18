<!-- BEGIN obsidian-wiki (managed) -->
## Knowledge wiki

This repo maintains a persistent, agent-maintained knowledge wiki at
`{{WIKI_PATH}}` — an Obsidian vault following the Karpathy "LLM wiki" pattern.

- **Read `{{WIKI_PATH}}/wiki/index.md` first** when you need project context.
- The wiki is the agent's durable long-term memory *and* a digest of external
  sources. Record durable decisions, rationale, and findings there.
- **Single writer:** only the parent agent in a session writes the wiki.
  Subagents surface findings in their final report; the parent persists them.
- **At the end of any session that produced durable insight,** update the wiki
  per `{{WIKI_PATH}}/wiki/meta/update-rule.md`.
- Page format and conventions: `{{WIKI_PATH}}/wiki/meta/conventions.md`.
- For the full pattern — the four operations Ingest, Record, Query, Lint — use
  the `obsidian-wiki` skill.
<!-- END obsidian-wiki (managed) -->
