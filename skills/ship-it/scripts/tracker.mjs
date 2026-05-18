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
  const section = (body || "").match(/##\s*Parent\s*\n+([\s\S]*?)(?=\n##|$)/i);
  if (!section) return null;
  const m = section[1].match(/#(\d+)/);
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

// ---------------------------------------------------------------------------
// GitHub backend — operations
// ---------------------------------------------------------------------------

/** Run a `gh` invocation and return stdout. Injectable for tests. */
function realGh(args) {
  return execFileSync("gh", args, { encoding: "utf8" });
}

/**
 * Open child issues of `parent`: open issues whose body's "## Parent" section
 * references `parent`. Each result carries number, title, labels (string[]),
 * body, and blockedBy (number[]).
 */
export function listChildren(parent, { runGh = realGh } = {}) {
  const raw = runGh([
    "issue", "list",
    "--state", "open",
    "--limit", "200",
    "--json", "number,title,labels,body",
  ]);
  return JSON.parse(raw)
    .map((i) => ({
      number: i.number,
      title: i.title,
      labels: (i.labels || []).map((l) => l.name),
      body: i.body,
      blockedBy: parseBlockedBy(i.body),
    }))
    .filter((i) => extractParentRef(i.body) === Number(parent));
}

/** An issue's body plus all comments [{id, url, body, author}]. */
export function getIssue(issue, { runGh = realGh } = {}) {
  const data = JSON.parse(
    runGh([
      "issue", "view", String(issue),
      "--json", "number,title,body,comments",
    ]),
  );
  return {
    number: data.number,
    title: data.title,
    body: data.body,
    comments: (data.comments || []).map((c) => ({
      id: c.id,
      url: c.url,
      body: c.body,
      author: c.author?.login,
    })),
  };
}

/**
 * Upsert a marker-keyed comment. If a comment carrying the marker already
 * exists it is edited in place; otherwise a new comment is posted. Returns
 * "edited" or "created".
 */
export function upsertComment(issue, marker, body, { runGh = realGh } = {}) {
  const fullBody = composeMarkedBody(marker, body);
  const existing = findMarkedComment(
    getIssue(issue, { runGh }).comments,
    marker,
  );
  if (existing) {
    runGh([
      "api", "--method", "PATCH",
      `repos/{owner}/{repo}/issues/comments/${commentRestId(existing.url)}`,
      "-f", `body=${fullBody}`,
    ]);
    return "edited";
  }
  runGh(["issue", "comment", String(issue), "--body", fullBody]);
  return "created";
}

/** The body of an issue's marker-keyed comment, or "" when absent. */
export function readComment(issue, marker, { runGh = realGh } = {}) {
  const found = findMarkedComment(getIssue(issue, { runGh }).comments, marker);
  return found ? found.body : "";
}

/** Add a label to an issue (a no-op on the tracker if already present). */
export function addLabel(issue, label, { runGh = realGh } = {}) {
  runGh(["issue", "edit", String(issue), "--add-label", label]);
}

/** Open a pull request; returns the PR URL. */
export function createPr(head, base, title, body, { runGh = realGh } = {}) {
  return runGh([
    "pr", "create",
    "--head", head, "--base", base,
    "--title", title, "--body", body,
  ]).trim();
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const OPERATIONS = {
  "list-children": (a) => JSON.stringify(listChildren(a[0]), null, 2),
  "get-issue": (a) => JSON.stringify(getIssue(a[0]), null, 2),
  "upsert-comment": (a) =>
    upsertComment(a[0], a[1], readFileSync(a[2], "utf8")),
  "read-comment": (a) => readComment(a[0], a[1]),
  "add-label": (a) => {
    addLabel(a[0], a[1]);
    return "ok";
  },
  "create-pr": (a) => createPr(a[0], a[1], a[2], readFileSync(a[3], "utf8")),
};

/** Dispatch one CLI invocation. Returns the string to print. */
export function run(argv) {
  const [op, ...rest] = argv;
  const handler = OPERATIONS[op];
  if (!handler) {
    throw new Error(
      `unknown operation: ${op || "(none)"} — ` +
        `expected one of: ${Object.keys(OPERATIONS).join(", ")}`,
    );
  }
  return handler(rest);
}

function main() {
  try {
    const out = run(process.argv.slice(2));
    if (out) console.log(out);
  } catch (err) {
    console.error(`tracker: ${err.message}`);
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main();
}
