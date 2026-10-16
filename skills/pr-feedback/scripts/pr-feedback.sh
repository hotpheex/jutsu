#!/usr/bin/env bash
# Dump the open feedback on a PR as compact markdown for an agent to triage.
#
#   pr-feedback.sh <pr-number> [--repo owner/name] [--all] [--since <ISO-8601>]
#
# Sections: unresolved review threads (with ids for reply/resolve), top-level
# comments, review summaries, failing checks. Bot boilerplate is trimmed.
# --all   include resolved threads too.
# --since only what is new: comments/reviews created after this timestamp, and
#         any thread (resolved or not) with a comment after it, so a bot's
#         follow-up on a thread you already resolved still surfaces.
#         wait-for-feedback.sh prints a `since=` line to pass here.
set -euo pipefail

pr="${1:?usage: pr-feedback.sh <pr-number> [--repo owner/name] [--all] [--since ts]}"; shift
repo=""; all=0; since=""
while [ $# -gt 0 ]; do
  case "$1" in
    --repo)  repo="$2"; shift 2 ;;
    --all)   all=1; shift ;;
    --since) since="$2"; all=1; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done
[ -n "$repo" ] || repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
owner="${repo%%/*}"; name="${repo##*/}"
me=$(gh api user --jq .login)

query='
query($owner:String!, $name:String!, $pr:Int!, $after:String) {
  repository(owner:$owner, name:$name) {
    pullRequest(number:$pr) {
      title url state isDraft headRefName headRefOid reviewDecision
      author { login }
      reviewThreads(first:100, after:$after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id isResolved isOutdated path line originalLine
          comments(first:50) {
            nodes { databaseId createdAt author { login } body }
          }
        }
      }
      reviews(first:100) {
        nodes { databaseId state createdAt author { login } body commit { abbreviatedOid } }
      }
      comments(first:100) {
        nodes { databaseId createdAt author { login } body }
      }
      commits(last:1) { nodes { commit { committedDate statusCheckRollup { state } } } }
    }
  }
}'

# Page through review threads; everything else fits in one page for a normal PR.
threads='[]'; after=null; first=1
while :; do
  page=$(gh api graphql -f query="$query" -F owner="$owner" -F name="$name" -F pr="$pr" -F after="$after")
  if [ $first = 1 ]; then base="$page"; first=0; fi
  threads=$(jq -n --argjson a "$threads" --argjson b "$(jq '.data.repository.pullRequest.reviewThreads.nodes' <<<"$page")" '$a + $b')
  jq -e '.data.repository.pullRequest.reviewThreads.pageInfo.hasNextPage' <<<"$page" >/dev/null || break
  after=$(jq -r '.data.repository.pullRequest.reviewThreads.pageInfo.endCursor' <<<"$page")
done

# Cut bot boilerplate: collapsed <details> blocks the agent can fetch on demand,
# HTML comments, and trailing "learnings". Keep the first ~40 lines.
trim() {
  jq -rn --arg body "$1" '
    def trim_body:
      gsub("<!--[^>]*-->"; "")
      | gsub("<details>\\s*<summary>(🤖 Prompt for AI Agents|🧠 Learnings used|🧩 Analysis chain|📝 Committable suggestion|🪄 Autofix[^<]*)</summary>(.|\n)*?</details>"; "")
      | gsub("\n{3,}"; "\n\n")
      | split("\n") | .[0:40] | join("\n");
    $body | trim_body
  '
}

pr_json=$(jq '.data.repository.pullRequest' <<<"$base")
jq -r '"# PR #'"$pr"': \(.title)\n\(.url)\nstate=\(.state) draft=\(.isDraft) branch=\(.headRefName) head=\(.headRefOid[0:7]) reviewDecision=\(.reviewDecision // "none") checks=\(.commits.nodes[0].commit.statusCheckRollup.state // "none") author=\(.author.login)"' <<<"$pr_json"
echo

echo "## Review threads"
sel='.[] | select(any(.comments.nodes[]; .createdAt > $since))'
[ $all = 1 ] || sel="$sel | select(.isResolved | not)"
n=$(jq --arg since "${since:-1970-01-01T00:00:00Z}" "[$sel] | length" <<<"$threads")
if [ -n "$since" ]; then echo "with activity since $since: $n (of $(jq length <<<"$threads") total)"
else echo "open=$n (of $(jq length <<<"$threads") total; --all to include resolved)"; fi
since="${since:-1970-01-01T00:00:00Z}"
jq -c --arg since "$since" "$sel" <<<"$threads" | while IFS= read -r t; do
  echo
  jq -r --arg me "$me" '
    "### \(.path):\(.line // .originalLine // "?")" +
    (if .isResolved then " RESOLVED" else "" end) +
    (if .isOutdated then " (outdated: line moved or code changed since)" else "" end) +
    "\nthread_id=\(.id) first_comment_id=\(.comments.nodes[0].databaseId) " +
    "opened_by=\(.comments.nodes[0].author.login) last_reply_by=\(.comments.nodes[-1].author.login)" +
    (if .comments.nodes[-1].author.login == $me then " (you)" else "" end)
  ' <<<"$t"
  jq -c '.comments.nodes[]' <<<"$t" | while IFS= read -r c; do
    echo "- [$(jq -r '.author.login' <<<"$c") $(jq -r '.createdAt' <<<"$c")]"
    trim "$(jq -r '.body' <<<"$c")" | sed 's/^/  /'
  done
done
echo

echo "## Top-level comments"
jq -c --arg since "$since" '.comments.nodes[] | select(.createdAt > $since)' <<<"$pr_json" | while IFS= read -r c; do
  body=$(jq -r '.body' <<<"$c")
  # Bot walkthroughs and summaries are not feedback; name them and move on.
  # Findings from these bots arrive as inline threads or a review body.
  if grep -qE 'summarize by coderabbit|<!-- walkthrough_start -->|^## Pull request overview|^## Summary of Changes|^\[vc\]:|^\[supa\]:' <<<"$body"; then
    echo "- [$(jq -r .author.login <<<"$c")] (bot walkthrough or summary, skipped)"; continue
  fi
  if grep -qiE 'rate limit(ed)?.*(try again|minutes)' <<<"$body"; then
    echo "- [$(jq -r .author.login <<<"$c")] RATE LIMITED, not a review; wait the stated time before expecting one:"
  fi
  echo "- [$(jq -r '.author.login' <<<"$c") $(jq -r '.createdAt' <<<"$c") comment_id=$(jq -r .databaseId <<<"$c")]"
  trim "$body" | sed 's/^/  /'
done
echo

echo "## Reviews"
head7=$(jq -r '.headRefOid[0:7]' <<<"$pr_json")
jq -c --arg since "$since" '.reviews.nodes[] | select(.createdAt > $since) | select((.body|length) > 0 or .state != "COMMENTED")' <<<"$pr_json" | while IFS= read -r r; do
  on=$(jq -r '.commit.abbreviatedOid // "?"' <<<"$r"); stale=""; [ "$on" = "$head7" ] || stale=" STALE(reviewed $on, head is $head7)"
  echo "- [$(jq -r '.author.login' <<<"$r") $(jq -r '.state' <<<"$r") $(jq -r '.createdAt' <<<"$r") review_id=$(jq -r .databaseId <<<"$r")]$stale"
  body=$(jq -r '.body' <<<"$r")
  # CodeRabbit review bodies: keep the headline and the nitpick titles, drop the rest.
  if grep -q 'Actionable comments posted' <<<"$body"; then
    grep -E 'Actionable comments posted|<summary>' <<<"$body" \
      | grep -vE 'Prompt for|Autofix|Learnings|Additional comments|Review details|Review info|Run configuration|Configuration used|Files selected|Commits|Analysis chain' \
      | sed -E 's#</?summary>##g; s/<\/?blockquote>//g' | sed 's/^/  /'
    echo "  (full body: gh api repos/$repo/pulls/$pr/reviews/$(jq -r .databaseId <<<"$r") --jq .body)"
  else
    trim "$body" | sed 's/^/  /'
  fi
done
echo

echo "## Checks"
gh pr checks "$pr" --repo "$repo" --json name,state,bucket,link --jq '.[] | select(.bucket != "pass" and .bucket != "skipping") | "- \(.name): \(.bucket) \(.link)"' 2>/dev/null || echo "(no checks)"
