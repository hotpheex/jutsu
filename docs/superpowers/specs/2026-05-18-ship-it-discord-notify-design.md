# ship-it Discord Notification — Design

Date: 2026-05-18

## Summary

Extend the ship-it skill with an inline Discord notification at `run-complete`. Posts a minimal summary (counts + PR hyperlink) to a webhook. Skips silently when unconfigured.

## Scope

Two files change: `skills/ship-it/SKILL.md` and `skills/ship-it/references/running-a-batch.md`. No new files.

## Configuration

A new optional config entry in the invocation table:

| Option | Default | Purpose |
|---|---|---|
| `discord-notify` | `on` | Post run-complete summary to Discord (requires `SHIP_IT_DISCORD_WEBHOOK_URL`) |

Env var: `SHIP_IT_DISCORD_WEBHOOK_URL`. If unset or empty, the notification is skipped silently regardless of the toggle.

## Skill Registry

Add an inline row to the registry table:

| `discord-notify` | inline | — | `run-complete` | on if env set |

Remove the existing placeholder sentence: _"The planned Discord notifier lands as an augmentation row attached to `run-complete`."_

## Phase 4 Procedure

Replace the single-line Phase 4 block in `running-a-batch.md` with:

1. If `discord-notify` is `off`, skip.
2. Read `SHIP_IT_DISCORD_WEBHOOK_URL`. If unset or empty, skip silently.
3. Extract the PR number from the URL returned by `create-pr` (last path segment).
4. Build the payload and POST:

```bash
curl -s -o /dev/null -X POST "$SHIP_IT_DISCORD_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "{\"content\": \"ship-it done — {done} done, {skipped} skipped, {failed} failed — [PR #{number}]({url})\"}"
```

5. A non-2xx response or curl failure is logged as a warning only — never abort the run over a notification failure.

Update the `run-complete` row in the Hooks section to reflect the inline behavior.

## Message Format

```
ship-it done — 5 done, 1 skipped, 0 failed — [PR #42](https://github.com/org/repo/pull/42)
```

Discord renders `[PR #42](url)` as a masked hyperlink. The counts come from the final run tally maintained by the orchestrator.

## Error Handling

Notification failures are non-fatal. The orchestrator logs a one-line warning (`discord notify failed: <curl exit code or HTTP status>`) and continues. The run is already complete at this point.
