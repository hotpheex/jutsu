#!/usr/bin/env bash
# Block (no inference) until a PR gets new feedback, then exit.
#
#   wait-for-feedback.sh <pr-number> [--repo owner/name] [--timeout 480] [--min-wait 60]
#
# Snapshots thread/comment/review counts and check state, then polls one
# GraphQL call per tick with backoff (30s → 120s) until something changes or
# the timeout lands. Prints what changed and a `since=` timestamp to pass to
# pr-feedback.sh --since. Exit codes:
#   0 new feedback   1 PR not open   3 timeout, nothing new
#   4 checks finished with a failure (also feedback)   5 API unreadable (fail closed)
set -euo pipefail

pr="${1:?usage: wait-for-feedback.sh <pr-number> [--repo owner/name] [--timeout secs] [--min-wait secs]}"; shift
repo=""; timeout=480; minwait=60
while [ $# -gt 0 ]; do
  case "$1" in
    --repo)     repo="$2"; shift 2 ;;
    --timeout)  timeout="$2"; shift 2 ;;
    --min-wait) minwait="$2"; shift 2 ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done
[ -n "$repo" ] || repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
owner="${repo%%/*}"; name="${repo##*/}"

snapshot() {
  gh api graphql -F owner="$owner" -F name="$name" -F pr="$pr" -f query='
    query($owner:String!, $name:String!, $pr:Int!) {
      repository(owner:$owner, name:$name) { pullRequest(number:$pr) {
        state
        reviewThreads(first:100) { totalCount nodes { isResolved } }
        comments { totalCount }
        reviews { totalCount }
        commits(last:1) { nodes { commit {
          statusCheckRollup { state contexts(first:50) { nodes {
            ... on CheckRun { name conclusion status }
            ... on StatusContext { context state }
          } } }
        } } }
      } }
    }' --jq '.data.repository.pullRequest | {
      state,
      threads: .reviewThreads.totalCount,
      unresolved: ([.reviewThreads.nodes[] | select(.isResolved|not)] | length),
      comments: .comments.totalCount,
      reviews: .reviews.totalCount,
      checks: (.commits.nodes[0].commit.statusCheckRollup.state // "NONE")
    }'
}

base=$(snapshot)
[ "$(jq -r .state <<<"$base")" = "OPEN" ] || { echo "PR #$pr is $(jq -r .state <<<"$base"), nothing to wait for"; exit 1; }
since=$(date -u +%Y-%m-%dT%H:%M:%SZ)
echo "baseline: $base"
echo "since=$since"

start=$(date +%s); interval=30; failures=0
sleep "$minwait"   # bots take a minute or more after a push; the first poll would be wasted
while :; do
  if ! cur=$(snapshot 2>/dev/null); then
    failures=$((failures + 1))
    [ $failures -lt 3 ] || { echo "ERROR: GitHub API unreadable three times in a row"; exit 5; }
    sleep "$interval"; continue
  fi
  failures=0
  if [ "$cur" != "$base" ]; then
    echo "changed:  $cur"
    jq -n --argjson a "$base" --argjson b "$cur" '
      [ (if $b.unresolved > $a.unresolved then "\($b.unresolved - $a.unresolved) new unresolved thread(s)" else empty end),
        (if $b.comments   > $a.comments   then "\($b.comments - $a.comments) new comment(s)" else empty end),
        (if $b.reviews    > $a.reviews    then "\($b.reviews - $a.reviews) new review(s)" else empty end),
        (if $b.checks != $a.checks        then "checks: \($a.checks) -> \($b.checks)" else empty end)
      ] | join("; ")'
    [ "$(jq -r .checks <<<"$cur")" = "FAILURE" ] && exit 4
    # Checks turning green with no new comments is not feedback; keep waiting.
    if [ "$(jq '{unresolved,comments,reviews}' <<<"$cur")" = "$(jq '{unresolved,comments,reviews}' <<<"$base")" ]; then
      base="$cur"; continue
    fi
    exit 0
  fi
  now=$(date +%s)
  if [ $((now - start)) -ge "$timeout" ]; then
    echo "timeout after ${timeout}s with no new feedback"; exit 3
  fi
  sleep "$interval"
  interval=$(( interval < 120 ? interval * 2 : 120 ))
done
