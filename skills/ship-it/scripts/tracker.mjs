#!/usr/bin/env node
/**
 * tracker.mjs — issue-tracker backend abstraction for the ship-it skill.
 *
 * The orchestrator never calls `gh` directly; it calls these operations.
 * Default backend: GitHub via the `gh` CLI. A different tracker backend
 * implements the same operation set and nothing else changes.
 *
 * CLI:
 *   node tracker.mjs list-children <parent-issue>
 *   node tracker.mjs get-issue <issue>
 *   node tracker.mjs upsert-comment <issue> <marker> <body-file>
 *   node tracker.mjs read-comment <issue> <marker>
 *   node tracker.mjs add-label <issue> <label>
 *   node tracker.mjs create-pr <head> <base> <title> <body-file>
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** The HTML-comment token that marks an orchestrator-owned comment. */
export function markerToken(marker) {
  return `<!-- ship-it:${marker} -->`;
}

/** Prefix a comment body with its marker token. */
export function composeMarkedBody(marker, body) {
  return `${markerToken(marker)}\n\n${body}`;
}

/** First comment whose body carries the marker token, or null. */
export function findMarkedComment(comments, marker) {
  const token = markerToken(marker);
  return comments.find((c) => (c.body || "").includes(token)) || null;
}

/** The numeric REST id embedded in a GitHub comment URL. */
export function commentRestId(url) {
  const m = (url || "").match(/#issuecomment-(\d+)/);
  if (!m) throw new Error(`cannot parse comment id from URL: ${url}`);
  return m[1];
}

/**
 * The parent issue number referenced in a child body's "## Parent" section,
 * or null when there is no parent reference.
 */
export function extractParentRef(body) {
  const m = (body || "").match(/##\s*Parent\s*\n+[^#]*?#(\d+)/i);
  return m ? Number(m[1]) : null;
}

/** Issue numbers listed in a body's "## Blocked by" section; "None" -> []. */
export function parseBlockedBy(body) {
  const section = (body || "").match(/##\s*Blocked by\s*\n+([^#]*(?:#\d+[^#]*)*)/i);
  if (!section) return [];
  return [...section[1].matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
}

/**
 * Order issues so each follows the issues that block it. `issues` is an array
 * of {number, blockedBy:[number], ...}. Blocking edges to issues outside the
 * set are ignored. Throws on a dependency cycle.
 */
export function topoSort(issues) {
  const inSet = new Set(issues.map((i) => i.number));
  const byNum = new Map(issues.map((i) => [i.number, i]));
  const ordered = [];
  const done = new Set();
  const visiting = new Set();
  function visit(num) {
    if (done.has(num)) return;
    if (visiting.has(num)) {
      throw new Error(`dependency cycle through issue #${num}`);
    }
    visiting.add(num);
    for (const dep of byNum.get(num).blockedBy) {
      if (inSet.has(dep)) visit(dep);
    }
    visiting.delete(num);
    done.add(num);
    ordered.push(byNum.get(num));
  }
  for (const i of issues) visit(i.number);
  return ordered;
}

/** Render the run-status comment body (without its marker) from run items. */
export function renderRunStatus(items) {
  const rows = items
    .map(
      (it, idx) =>
        `| ${idx + 1} | #${it.issue} ${it.title} | ${it.state} | ${it.sha || "-"} |`,
    )
    .join("\n");
  return [
    "## ship-it run status",
    "",
    "| # | issue | state | commit |",
    "| --- | --- | --- | --- |",
    rows,
  ].join("\n");
}
