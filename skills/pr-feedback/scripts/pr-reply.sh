#!/usr/bin/env bash
# Reply in a review thread and/or resolve it.
#
#   pr-reply.sh <pr-number> --comment-id <first_comment_id> --body "Fixed in abc1234." [--resolve <thread_id>] [--repo owner/name]
#   pr-reply.sh <pr-number> --resolve <thread_id> [--reason ADDRESSED|WONT_FIX|INVALID] [--repo owner/name]
#   pr-reply.sh <pr-number> --top-level --body "..." [--repo owner/name]
#
# Ids come from pr-feedback.sh output. Replies go through REST (needs the
# numeric comment id); resolving goes through GraphQL (needs the PRRT_ node id).
# --reason defaults to ADDRESSED; use WONT_FIX or INVALID when declining.
# GitHub asks for a second between content-creating calls, so the script sleeps
# one second after a reply before resolving.
set -euo pipefail

pr="${1:?usage: see header}"; shift
repo=""; comment_id=""; body=""; thread_id=""; top=0; reason="ADDRESSED"
while [ $# -gt 0 ]; do
  case "$1" in
    --repo)       repo="$2"; shift 2 ;;
    --comment-id) comment_id="$2"; shift 2 ;;
    --body)       body="$2"; shift 2 ;;
    --resolve)    thread_id="$2"; shift 2 ;;
    --reason)     reason="$2"; shift 2 ;;
    --top-level)  top=1; shift ;;
    *) echo "unknown arg: $1" >&2; exit 2 ;;
  esac
done
[ -n "$repo" ] || repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner)

if [ -n "$body" ] && [ $top = 1 ]; then
  gh pr comment "$pr" --repo "$repo" --body "$body" >/dev/null && echo "commented on PR #$pr"
elif [ -n "$body" ]; then
  [ -n "$comment_id" ] || { echo "--body needs --comment-id or --top-level" >&2; exit 2; }
  gh api "repos/$repo/pulls/$pr/comments/$comment_id/replies" -f body="$body" --jq '"replied: \(.html_url)"'
  [ -z "$thread_id" ] || sleep 1
fi

if [ -n "$thread_id" ]; then
  case "$reason" in ADDRESSED|WONT_FIX|INVALID) ;; *) echo "--reason must be ADDRESSED, WONT_FIX or INVALID" >&2; exit 2 ;; esac
  gh api graphql -F id="$thread_id" -f query="
    mutation(\$id:ID!) { resolveReviewThread(input:{threadId:\$id, resolutionReason:$reason}) { thread { isResolved } } }" \
    --jq '"resolved: \(.data.resolveReviewThread.thread.isResolved) ('"$reason"')"'
fi
