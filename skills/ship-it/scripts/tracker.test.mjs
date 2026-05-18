import { test } from "node:test";
import assert from "node:assert/strict";
import {
  markerToken,
  composeMarkedBody,
  findMarkedComment,
  commentRestId,
  extractParentRef,
  parseBlockedBy,
  topoSort,
  renderRunStatus,
} from "./tracker.mjs";

test("markerToken wraps a name in the ship-it HTML-comment token", () => {
  assert.equal(markerToken("run-status"), "<!-- ship-it:run-status -->");
});

test("composeMarkedBody prefixes the body with its marker token", () => {
  const out = composeMarkedBody("handoff", "hello");
  assert.ok(out.startsWith("<!-- ship-it:handoff -->\n\n"));
  assert.ok(out.endsWith("hello"));
});

test("findMarkedComment returns the comment carrying the marker", () => {
  const comments = [
    { id: "a", body: "unrelated" },
    { id: "b", body: "<!-- ship-it:run-status -->\n\nthe status" },
  ];
  assert.equal(findMarkedComment(comments, "run-status").id, "b");
});

test("findMarkedComment returns null when no comment carries the marker", () => {
  assert.equal(findMarkedComment([{ id: "a", body: "x" }], "outcome"), null);
});

test("commentRestId extracts the numeric id from a comment URL", () => {
  const url = "https://github.com/o/r/issues/18#issuecomment-2407881234";
  assert.equal(commentRestId(url), "2407881234");
});

test("extractParentRef reads the issue number from a Parent section", () => {
  const body = "## Parent\n\n#18\n\n## What to build\n\nstuff";
  assert.equal(extractParentRef(body), 18);
});

test("extractParentRef returns null when there is no Parent section", () => {
  assert.equal(extractParentRef("## What to build\n\nstuff"), null);
});

test("extractParentRef skips a markdown #anchor before the issue reference", () => {
  const body = "## Parent\n\nSee [notes](#background)\n\n#18\n\n## What to build";
  assert.equal(extractParentRef(body), 18);
});

test("parseBlockedBy collects every issue reference in the section", () => {
  const body = "## Blocked by\n\n- #12\n- #13\n\n## Parent\n\n#18";
  assert.deepEqual(parseBlockedBy(body), [12, 13]);
});

test("parseBlockedBy returns [] when the section says None", () => {
  const body = "## Blocked by\n\nNone - can start immediately\n";
  assert.deepEqual(parseBlockedBy(body), []);
});

test("topoSort orders issues after the issues that block them", () => {
  const issues = [
    { number: 3, blockedBy: [2] },
    { number: 1, blockedBy: [] },
    { number: 2, blockedBy: [1] },
  ];
  assert.deepEqual(
    topoSort(issues).map((i) => i.number),
    [1, 2, 3],
  );
});

test("topoSort ignores blocking edges to issues outside the set", () => {
  const issues = [
    { number: 5, blockedBy: [99] },
    { number: 4, blockedBy: [] },
  ];
  assert.deepEqual(
    topoSort(issues).map((i) => i.number).sort(),
    [4, 5],
  );
});

test("topoSort throws on a dependency cycle", () => {
  const issues = [
    { number: 1, blockedBy: [2] },
    { number: 2, blockedBy: [1] },
  ];
  assert.throws(() => topoSort(issues), /cycle/);
});

test("renderRunStatus renders a numbered table of run items", () => {
  const body = renderRunStatus([
    { issue: 19, title: "Debug menu", state: "done", sha: "abc1234" },
    { issue: 21, title: "Side identity", state: "pending", sha: null },
  ]);
  assert.ok(body.includes("| 1 | #19 Debug menu | done | abc1234 |"));
  assert.ok(body.includes("| 2 | #21 Side identity | pending | - |"));
});

import {
  listChildren,
  getIssue,
  upsertComment,
  readComment,
  addLabel,
  createPr,
} from "./tracker.mjs";

// A fake `gh` runner: matches on a substring of the joined args and returns
// the canned stdout. Records every call for assertions.
function fakeGh(rules) {
  const calls = [];
  const run = (args) => {
    calls.push(args);
    const key = args.join(" ");
    for (const [match, resp] of rules) {
      if (key.includes(match)) return resp;
    }
    return "";
  };
  run.calls = calls;
  return run;
}

test("listChildren returns only open issues whose Parent section matches", () => {
  const runGh = fakeGh([
    [
      "issue list",
      JSON.stringify([
        {
          number: 19,
          title: "Debug menu",
          labels: [{ name: "ready-for-agent" }],
          body: "## Parent\n\n#18\n\n## Blocked by\n\nNone",
        },
        {
          number: 99,
          title: "Unrelated",
          labels: [],
          body: "## Parent\n\n#7\n",
        },
      ]),
    ],
  ]);
  const children = listChildren(18, { runGh });
  assert.equal(children.length, 1);
  assert.equal(children[0].number, 19);
  assert.deepEqual(children[0].labels, ["ready-for-agent"]);
  assert.deepEqual(children[0].blockedBy, []);
});

test("getIssue returns the body and a normalized comment list", () => {
  const runGh = fakeGh([
    [
      "issue view",
      JSON.stringify({
        number: 19,
        title: "Debug menu",
        body: "do the thing",
        comments: [
          {
            id: "node1",
            url: "https://github.com/o/r/issues/19#issuecomment-5",
            body: "a comment",
            author: { login: "octocat" },
          },
        ],
      }),
    ],
  ]);
  const issue = getIssue(19, { runGh });
  assert.equal(issue.body, "do the thing");
  assert.equal(issue.comments[0].id, "node1");
  assert.equal(issue.comments[0].author, "octocat");
});

test("upsertComment creates a new comment when the marker is absent", () => {
  const runGh = fakeGh([
    ["issue view", JSON.stringify({ number: 7, body: "b", comments: [] })],
  ]);
  const result = upsertComment(7, "outcome", "the outcome", { runGh });
  assert.equal(result, "created");
  const create = runGh.calls.find((a) => a[0] === "issue" && a[1] === "comment");
  assert.ok(create, "expected a `gh issue comment` call");
  assert.ok(create.includes("--body"));
  assert.ok(
    create[create.indexOf("--body") + 1].startsWith("<!-- ship-it:outcome -->"),
  );
});

test("upsertComment edits in place when the marker is already present", () => {
  const existing = {
    id: "node9",
    url: "https://github.com/o/r/issues/7#issuecomment-321",
    body: "<!-- ship-it:run-status -->\n\nold",
    author: { login: "bot" },
  };
  const runGh = fakeGh([
    ["issue view", JSON.stringify({ number: 7, body: "b", comments: [existing] })],
  ]);
  const result = upsertComment(7, "run-status", "new status", { runGh });
  assert.equal(result, "edited");
  const patch = runGh.calls.find((a) => a.includes("PATCH"));
  assert.ok(patch, "expected a `gh api PATCH` call");
  assert.ok(patch.join(" ").includes("issues/comments/321"));
});

test("readComment returns the marked comment body, or empty when absent", () => {
  const present = fakeGh([
    [
      "issue view",
      JSON.stringify({
        number: 7,
        body: "b",
        comments: [
          { id: "n", url: "u#issuecomment-1", body: "<!-- ship-it:handoff -->\n\nhi" },
        ],
      }),
    ],
  ]);
  assert.ok(readComment(7, "handoff", { runGh: present }).includes("hi"));

  const absent = fakeGh([
    ["issue view", JSON.stringify({ number: 7, body: "b", comments: [] })],
  ]);
  assert.equal(readComment(7, "handoff", { runGh: absent }), "");
});

test("addLabel issues a `gh issue edit --add-label` call", () => {
  const runGh = fakeGh([]);
  addLabel(19, "agent-done", { runGh });
  assert.deepEqual(runGh.calls[0], [
    "issue", "edit", "19", "--add-label", "agent-done",
  ]);
});

test("createPr opens a PR and returns the trimmed URL", () => {
  const runGh = fakeGh([
    ["pr create", "https://github.com/o/r/pull/42\n"],
  ]);
  const url = createPr("feat-branch", "main", "My PR", "body text", { runGh });
  assert.equal(url, "https://github.com/o/r/pull/42");
  const call = runGh.calls[0];
  assert.ok(call.includes("--head") && call.includes("feat-branch"));
  assert.ok(call.includes("--base") && call.includes("main"));
});

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { run } from "./tracker.mjs";

const SCRIPT = fileURLToPath(new URL("./tracker.mjs", import.meta.url));

test("run throws a clear error for an unknown operation", () => {
  assert.throws(() => run(["frobnicate"]), /unknown operation: frobnicate/);
});

test("run throws when no operation is given", () => {
  assert.throws(() => run([]), /unknown operation/);
});

test("the CLI exits non-zero and explains an unknown operation", () => {
  assert.throws(
    () =>
      execFileSync(process.execPath, [SCRIPT, "frobnicate"], {
        encoding: "utf8",
        stdio: "pipe",
      }),
    (err) => {
      assert.equal(err.status, 1);
      assert.match(err.stderr, /unknown operation/);
      return true;
    },
  );
});
