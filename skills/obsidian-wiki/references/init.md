# Initializing a wiki

The full procedure for setting up an `obsidian-wiki` vault in a repo. The
init script handles the mechanical scaffold; the agent handles the judgment
parts (vault location, block placement, the first Ingest).

## 1. Choose the vault location

Two layouts:

- **Sibling vault (default).** The vault lives beside the repo at
  `../<project>-wiki`. Keeps Obsidian sync clean and the vault out of the
  codebase's git history. Run init with no `WIKI_TARGET`.
- **In-repo.** The vault lives inside the repo (e.g. `./wiki`). One git
  history, simpler to clone. Run init with `WIKI_TARGET` set to a path inside
  the repo; `WIKI_TARGET` resolves relative to the repo root.

If unsure, use the default sibling layout.

## 2. Run the init script

From the repo root:

```bash
node /path/to/obsidian-wiki/scripts/init-wiki.mjs
```

Or with explicit options:

```bash
WIKI_TARGET=./wiki WIKI_PROJECT=my-project \
  node /path/to/obsidian-wiki/scripts/init-wiki.mjs
```

The script:

- Creates `wiki/`, `wiki/meta/`, and a minimal `.obsidian/` so the vault opens
  cleanly in Obsidian.
- Copies the four wiki templates in (`conventions.md`, `update-rule.md`,
  `index.md`, `log.md`), substituting `{{PROJECT}}`, `{{DATE}}`, and
  `{{REPO_PATH}}`.
- Is **idempotent** — re-running skips files that already exist and never
  overwrites human edits.
- Prints the created files and the managed block to inject next.
- Warns (but proceeds) if the current directory is not a git repository.

## 3. Inject the managed agent block

The script does not edit your instruction files — block placement is a
judgment call. Take the block the script printed (from
`templates/agent-block.md`, with `{{WIKI_PATH}}` already substituted) and add
it to:

- `CLAUDE.md` — for Claude Code agents.
- `AGENTS.md` — for other coding agents.

If a managed block already exists — delimited by
`<!-- BEGIN obsidian-wiki (managed) -->` and
`<!-- END obsidian-wiki (managed) -->` — replace it in place rather than
appending a second one. If the instruction file does not exist, create it.

## 4. First Ingest

Init lays down an empty skeleton — no domains yet. The wiki's first real
operation is an Ingest: pick an existing source (a spec, a design doc,
research notes), read it fully, create the first domain folder and its topic
pages, add a domain section to `index.md`, and append a `log.md` entry.

From there, the four operations (Ingest, Record, Query, Lint) carry the wiki
forward. See `SKILL.md` and `wiki/meta/conventions.md`.
