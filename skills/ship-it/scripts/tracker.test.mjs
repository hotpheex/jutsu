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
