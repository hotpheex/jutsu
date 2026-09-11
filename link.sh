#!/bin/sh
# Wire this checkout into Claude Code and Codex. Symlinks only; re-runnable.
set -eu

repo=$(cd "$(dirname "$0")" && pwd -P)
roots="$HOME/.claude/skills $HOME/.agents/skills"

# Candidate skill dirs: own skills, and vendored skills one or two levels deep.
# A skill is any directory that contains SKILL.md.
skills=$(
  for d in "$repo"/skills/*/ "$repo"/vendor/*/ "$repo"/vendor/*/*/; do
    [ -f "$d/SKILL.md" ] && printf '%s\n' "${d%/}"
  done
  true
)

# Duplicate basenames would silently shadow each other; fail instead.
dupes=$(printf '%s\n' "$skills" | grep . | xargs -n1 basename | sort | uniq -d || true)
[ -z "$dupes" ] || { echo "link.sh: duplicate skill names: $dupes" >&2; exit 1; }

for root in $roots; do
  mkdir -p "$root"
  # Remove only symlinks we own (targets inside this repo). Leaves hand-made
  # skills and other tools' symlinks alone.
  for l in "$root"/*; do
    [ -L "$l" ] || continue
    case "$(readlink "$l")" in "$repo"/*) rm "$l" ;; esac
  done
  printf '%s\n' "$skills" | while IFS= read -r s; do
    [ -n "$s" ] && ln -s "$s" "$root/$(basename "$s")"
  done
done

mkdir -p "$HOME/.codex" "$HOME/.claude"
ln -sfn "$repo/AGENTS.md" "$HOME/.codex/AGENTS.md"
ln -sfn "$repo/claude/CLAUDE.md" "$HOME/.claude/CLAUDE.md"

echo "link.sh: $(printf '%s\n' "$skills" | grep -c .) skills linked from $repo"
