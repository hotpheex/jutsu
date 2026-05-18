# ship-it Discord Notification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Inline a Discord `run-complete` notification into ship-it — posts a minimal PR summary to a webhook, skips silently when unconfigured.

**Architecture:** Two Markdown files edited in place. No new files. SKILL.md gets a toggle in the config table and a row in the registry. running-a-batch.md gets an expanded Phase 4 with the curl invocation and the hooks section updated to describe the behavior.

**Tech Stack:** Markdown edits only. The runtime is Bash (`curl`) executed by the orchestrator at run-complete time.

---

### Task 1: Add `discord-notify` to the invocation config table (SKILL.md)

**Files:**
- Modify: `skills/ship-it/SKILL.md:38`

- [ ] **Step 1: Insert the new config row**

In `skills/ship-it/SKILL.md`, the invocation config table ends at line 38. Add one row after `circuit-breaker threshold`:

Replace:
```
| circuit-breaker threshold | 1/3 of the batch | halt the run if failures exceed it |
```

With:
```
| circuit-breaker threshold | 1/3 of the batch | halt the run if failures exceed it |
| `discord-notify` | `on` | Post run-complete summary to Discord (requires `SHIP_IT_DISCORD_WEBHOOK_URL`) |
```

- [ ] **Step 2: Verify**

Read `skills/ship-it/SKILL.md` lines 32–40. Confirm the table now has six rows and the new row is last.

- [ ] **Step 3: Commit**

```bash
git add skills/ship-it/SKILL.md
git commit -m "feat(ship-it): add discord-notify invocation config option"
```

---

### Task 2: Add `discord-notify` to the skill registry and remove placeholder (SKILL.md)

**Files:**
- Modify: `skills/ship-it/SKILL.md:106-110`

- [ ] **Step 1: Add registry row and remove stale placeholder**

In `skills/ship-it/SKILL.md`, the registry table ends at line 106 and is followed by a now-stale placeholder paragraph (lines 108–110). Make two changes:

First, add the new registry row after `screenshot-journey`:

Replace:
```
| `screenshot-journey` | augmentation | `screenshot-journey` | `post-issue-complete` | on if available |

To add an augmentation skill later: add a row here and a short section in
`references/running-a-batch.md`. No backbone changes. The planned Discord
notifier lands as an augmentation row attached to `run-complete`.
```

With:
```
| `screenshot-journey` | augmentation | `screenshot-journey` | `post-issue-complete` | on if available |
| `discord-notify` | inline | — | `run-complete` | on if env set |

To add an augmentation skill later: add a row here and a short section in
`references/running-a-batch.md`. No backbone changes.
```

- [ ] **Step 2: Verify**

Read `skills/ship-it/SKILL.md` lines 100–112. Confirm:
- The registry table has six rows (three role, two augmentation, one inline).
- The `discord-notify` inline row is present.
- No mention of "planned Discord notifier" remains.

- [ ] **Step 3: Commit**

```bash
git add skills/ship-it/SKILL.md
git commit -m "feat(ship-it): add discord-notify to skill registry"
```

---

### Task 3: Expand Phase 4 in running-a-batch.md

**Files:**
- Modify: `skills/ship-it/references/running-a-batch.md:85-88`

- [ ] **Step 1: Replace the Phase 4 block**

In `skills/ship-it/references/running-a-batch.md`, the current Phase 4 is:

```
## Phase 4 — Notify

Fire the `run-complete` hook. With no augmentation bound there, the run simply
ends; report the PR URL.
```

Replace it entirely with:

```
## Phase 4 — Notify

1. If `discord-notify` is `off`, skip and report the PR URL.
2. Read `SHIP_IT_DISCORD_WEBHOOK_URL`. If unset or empty, skip silently and
   report the PR URL.
3. Extract the PR number from the URL returned by `create-pr` (the last
   path segment, e.g. `42` from `.../pull/42`).
4. POST to the webhook:

   ```bash
   curl -s -o /dev/null -w "%{http_code}" -X POST "$SHIP_IT_DISCORD_WEBHOOK_URL" \
     -H "Content-Type: application/json" \
     -d "{\"content\": \"ship-it done — {done} done, {skipped} skipped, {failed} failed — [PR #{number}]({url})\"}"
   ```

   Substitute `{done}`, `{skipped}`, `{failed}` with the final run counts and
   `{number}` / `{url}` with the PR number and full URL.

5. If the HTTP status is not 2xx, or `curl` exits non-zero, log a one-line
   warning (`discord notify failed: <status>`). Never abort the run — the PR
   is already raised.
6. Report the PR URL to the user.
```

- [ ] **Step 2: Verify**

Read `skills/ship-it/references/running-a-batch.md` lines 85–115. Confirm Phase 4 has the six-step procedure and the `curl` command is present verbatim.

- [ ] **Step 3: Commit**

```bash
git add skills/ship-it/references/running-a-batch.md
git commit -m "feat(ship-it): expand Phase 4 with Discord notification procedure"
```

---

### Task 4: Update the Hooks section in running-a-batch.md

**Files:**
- Modify: `skills/ship-it/references/running-a-batch.md:145`

- [ ] **Step 1: Replace the stale run-complete hook entry**

In `skills/ship-it/references/running-a-batch.md`, the Hooks section currently ends with:

```
- `run-complete` → (future Discord notifier): announce the finished PR.
```

Replace that line with:

```
- `run-complete` → `discord-notify` (inline): post a minimal run summary to
  Discord if `discord-notify` is `on` and `SHIP_IT_DISCORD_WEBHOOK_URL` is set.
  Format: `ship-it done — N done, N skipped, N failed — [PR #N](url)`.
  Failures are non-fatal.
```

- [ ] **Step 2: Verify**

Read `skills/ship-it/references/running-a-batch.md` lines 135–148. Confirm:
- The `run-complete` entry describes the inline behavior, env var, and format.
- No "(future)" placeholder language remains.

- [ ] **Step 3: Commit**

```bash
git add skills/ship-it/references/running-a-batch.md
git commit -m "feat(ship-it): update hooks section — run-complete discord-notify"
```
