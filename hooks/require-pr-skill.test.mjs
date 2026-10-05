import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const hook = fileURLToPath(new URL("./require-pr-skill.mjs", import.meta.url));
const good = "## Summary\n\nx\n\n## Evidence\n\ny\n\n## Merge Danger\n\nz\n";

function run(command, cwd = tmpdir()) {
  const r = spawnSync("node", [hook], {
    input: JSON.stringify({ tool_name: "Bash", tool_input: { command }, cwd }),
    encoding: "utf8",
  });
  return { code: r.status, stderr: r.stderr };
}

test("reads headings from the vendored pr skill", () => {
  const r = spawnSync("node", [hook, "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0);
  assert.deepEqual(r.stdout.trim().split("\n"), ["Summary", "Evidence", "Merge Danger"]);
});

test("ignores commands that do not set a PR body", () => {
  assert.equal(run("git push -u origin HEAD").code, 0);
  assert.equal(run('grep -rn "gh pr create" .').code, 0);
  assert.equal(run("gh pr view 12 --json body").code, 0);
  assert.equal(run("gh pr edit 12 --add-label bug").code, 0);
});

test("blocks a body without the template", () => {
  const r = run('gh pr create --title t --body "## Summary\n\nfixes it"');
  assert.equal(r.code, 2);
  assert.match(r.stderr, /## Evidence, ## Merge Danger/);
  assert.equal(run("gh pr create --fill").code, 2);
  assert.equal(run("cd /x && gh pr new -t t -b 'tweak'").code, 2);
  assert.equal(run("gh pr edit 12 --body 'rewritten'").code, 2);
});

test("allows a templated body inline or as a heredoc", () => {
  assert.equal(run(`gh pr create --title t --body "${good}"`).code, 0);
  assert.equal(run(`gh pr create --title t --body-file - <<'EOF'\n${good}EOF`).code, 0);
});

test("reads --body-file relative to the hook's cwd", () => {
  const dir = mkdtempSync(join(tmpdir(), "pr-"));
  writeFileSync(join(dir, "body.md"), good);
  writeFileSync(join(dir, "bad.md"), "## Summary\n");
  assert.equal(run("gh pr create -t t --body-file body.md", dir).code, 0);
  assert.equal(run(`gh pr create -t t -F "${join(dir, "body.md")}"`).code, 0);
  assert.equal(run("gh pr create -t t --body-file bad.md", dir).code, 2);
});
