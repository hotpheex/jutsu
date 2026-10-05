# jutsu

Global agent instructions and skills, in one git repo, for every harness I use.

```
AGENTS.md          global instructions, harness-neutral
skills/<name>/     my own skills, SKILL.md inside
hooks/             harness hooks, Node scripts with no dependencies
vendor/            third-party skills, written by `vendir sync`, never hand-edited
vendir.yml         what to vendor, from where, pinned to a commit SHA
vendir.lock.yml    written by vendir, committed
```

The repo holds content only. Wiring it into a harness is the consumer's job;
the t3code image does it in its `skills-sync` script.

## The contract for consumers

- **A skill** is any directory containing `SKILL.md`, found under `skills/*/`
  and up to three levels under `vendor/` (`vendor/<upstream>/<skill>/` or
  `vendor/<upstream>/<category>/<skill>/`). Its name is the directory basename,
  which CI guarantees matches the frontmatter `name` and is unique across the
  repo. Symlink each one by basename into the harness's skills directory
  (`~/.claude/skills/`, `~/.agents/skills/`).
- **Instructions** are `AGENTS.md`. Symlink it to wherever the harness reads
  global instructions (`~/.codex/AGENTS.md`, `~/.claude/CLAUDE.md`).
- **Hooks** are `hooks/*.mjs` other than `*.test.mjs`. Each one's header names
  its event and matcher, and denies by exiting 2 with the reason on stderr,
  which Claude Code and Codex both honour. Register them by hand once (below).
- **Updating** is `git pull --ff-only` and re-running the linking. Nothing
  needs installing; vendir only runs on the machine that edits `vendir.yml`
  and in CI.

```sh
git clone https://github.com/hotpheex/jutsu ~/.jutsu
```

## Register the hooks

`require-pr-skill.mjs` blocks `gh pr create` (and `gh pr edit` with a body)
unless the body has every heading of the `pr` skill's template, so an agent
that skipped the skill is told to load it. It reads the headings from the
vendored skill at runtime, so a Renovate bump that changes them needs no edit
here.

Add this `PreToolUse` entry to `~/.claude/settings.json` and to
`~/.codex/hooks.json`, alongside any hooks already there:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": "node \"$HOME/.jutsu/hooks/require-pr-skill.mjs\"" }
        ]
      }
    ]
  }
}
```

Codex skips a hook until you trust it: open `/hooks` in a Codex session and
trust this one. Trust is pinned to the hook definition, not the script, so
later pulls do not ask again.

## Add, bump, or remove a skill

**Own skill:** `mkdir skills/<name>`, write `SKILL.md` with `name: <name>` in its
frontmatter, open a PR.

**Third-party skill:** if the upstream is already in `vendir.yml`, add one
`includePaths` line. Otherwise add a `contents` entry (copy an existing one).
`ref` must be a 40-char commit SHA, and the `# renovate:` comment must stay on
the same line. `includePaths` are relative to the upstream root; `newRootPath`
is the upstream's skills directory, so `vendor/<path>/` mirrors whatever sits
below it. Then:

```sh
vendir sync          # brew install vendir, or a release from carvel-dev/vendir
git status vendor    # check only the intended files arrived
```

Commit `vendir.yml`, `vendir.lock.yml`, and `vendor/` together.

**Bump:** Renovate opens one PR per upstream every Monday morning with the new
SHA, and the `vendir` workflow pushes a `vendir sync` commit onto that branch so
the PR diff is the changed skill text. Review it like any other change. To bump
by hand instead:

```sh
sha=$(git ls-remote https://github.com/<owner>/<repo> refs/heads/main | cut -f1)
# paste $sha into the matching ref: line in vendir.yml
vendir sync && git diff --stat vendor
```

**Rename:** change `path`, run `vendir sync` (it removes the old directory), PR.

**Remove:** delete the entry or `includePaths` line, run `vendir sync`, PR.
Consumers drop the skill at their next pull and relink.

If an upstream skill needs editing, do not patch `vendor/`. Fork it into
`skills/` under a new name.

## CI

`.github/workflows/vendir.yaml` runs on every PR and on pushes to `main`:

- On a PR from this repo, it runs `vendir sync` and commits any change to the PR
  branch. This is what turns a Renovate SHA bump into a content diff.
- It then checks `vendor/` matches `vendir.yml`, every skill's frontmatter
  `name` equals its directory, and no two skills share a name.
- It runs the hook tests (`node --test hooks/*.test.mjs`), which also fail if
  a bump moves or reshapes the `pr` skill the hook reads.

Known behaviour on a bumped PR: the `vendir sync` commit is pushed with
`GITHUB_TOKEN`, so GitHub creates a second workflow run for it but holds it as
"action required" instead of running it. The first run's `check` job already
checked out the branch head after the sync, so the result is valid; it is just
attached to the earlier commit. Approve the held run from the Actions tab if you
want a green check on the head commit, or ignore it. Do not make `check` a
required status check. Swap `GITHUB_TOKEN` for a fine-grained PAT with contents
write if you want the follow-up run to start on its own.
