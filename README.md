# jutsu

Global agent instructions and skills, in one git repo, for every harness I use.
Claude Code and Codex both read it through symlinks made by `link.sh`.

```
AGENTS.md          global instructions, harness-neutral
claude/CLAUDE.md   imports AGENTS.md, adds Claude-only notes
skills/<name>/     my own skills, SKILL.md inside
vendor/            third-party skills, written by `vendir sync`, never hand-edited
vendir.yml         what to vendor, from where, pinned to a commit SHA
vendir.lock.yml    written by vendir, committed
link.sh            symlink everything into ~/.claude, ~/.agents, ~/.codex
```

## Use it on a machine

```sh
git clone https://github.com/hotpheex/jutsu ~/.jutsu
~/.jutsu/link.sh
```

Later, to pick up changes:

```sh
git -C ~/.jutsu pull --ff-only && ~/.jutsu/link.sh
```

`link.sh` is idempotent and only ever removes symlinks that point into `~/.jutsu`.
It does replace `~/.claude/CLAUDE.md` and `~/.codex/AGENTS.md` with symlinks, so
move any hand-written content there into `AGENTS.md` or `claude/CLAUDE.md` first.
It exits non-zero if two skills share a name.

Nothing needs installing on a consumer. vendir only runs on the machine that
edits `vendir.yml` and in CI.

## Add, bump, or remove a skill

**Own skill:** `mkdir skills/<name>`, write `SKILL.md` with `name: <name>` in its
frontmatter, open a PR.

**Third-party skill:** add a `contents` entry to `vendir.yml` (copy an existing
one). `ref` must be a 40-char commit SHA, and the `# renovate:` comment must stay
on the same line. `includePaths` are relative to the upstream root; `newRootPath`
is the upstream's skills directory, so `vendor/<path>/` mirrors whatever sits
below it (a flat `<skill>/` or a `<category>/<skill>/` split; `link.sh` finds
`SKILL.md` up to three levels under `vendor/`). To add another skill from an
upstream that is already listed, add one `includePaths` line. Then:

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
# paste $sha into every matching ref: line in vendir.yml
vendir sync && git diff --stat vendor
```

**Rename:** change `path`, run `vendir sync` (it removes the old directory), PR.

**Remove:** delete the entry, run `vendir sync`, PR. The symlink disappears on
every machine at its next `link.sh`.

If an upstream skill needs editing, do not patch `vendor/`. Fork it into
`skills/` under a new name.

## CI

`.github/workflows/vendir.yaml` runs on every PR and on pushes to `main`:

- On a PR from this repo, it runs `vendir sync` and commits any change to the PR
  branch. This is what turns a Renovate SHA bump into a content diff.
- It then checks `vendor/` matches `vendir.yml`, every skill's frontmatter
  `name` equals its directory, and `link.sh` runs twice cleanly.

Known behaviour on a bumped PR: the `vendir sync` commit is pushed with
`GITHUB_TOKEN`, so GitHub creates a second workflow run for it but holds it as
"action required" instead of running it. The first run's `check` job already
checked out the branch head after the sync, so the result is valid; it is just
attached to the earlier commit. Approve the held run from the Actions tab if you
want a green check on the head commit, or ignore it. Do not make `check` a
required status check. Swap `GITHUB_TOKEN` for a fine-grained PAT with contents
write if you want the follow-up run to start on its own.
