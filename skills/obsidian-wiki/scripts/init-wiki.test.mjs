import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { initWiki } from "./init-wiki.mjs";

const SCRIPT = fileURLToPath(new URL("./init-wiki.mjs", import.meta.url));

// A fresh repo nested inside a unique temp dir, so the default sibling vault
// ("../<project>-wiki") also lands inside that unique temp tree.
function freshRepo() {
  const base = mkdtempSync(join(tmpdir(), "wiki-test-"));
  const repo = join(base, "repo");
  mkdirSync(join(repo, ".git"), { recursive: true });
  return repo;
}

test("creates the vault skeleton in the default sibling layout", () => {
  const repo = freshRepo();
  const { wikiPath, created, isGitRepo } = initWiki({
    repoRoot: repo,
    project: "demo",
  });
  assert.ok(wikiPath.endsWith("demo-wiki"));
  assert.ok(existsSync(join(wikiPath, "wiki/meta/conventions.md")));
  assert.ok(existsSync(join(wikiPath, "wiki/meta/update-rule.md")));
  assert.ok(existsSync(join(wikiPath, "wiki/index.md")));
  assert.ok(existsSync(join(wikiPath, "wiki/log.md")));
  assert.equal(
    readFileSync(join(wikiPath, ".obsidian/app.json"), "utf8"),
    "{}\n",
  );
  assert.equal(created.length, 5);
  assert.equal(isGitRepo, true);
});

test("supports an in-repo layout via target", () => {
  const repo = freshRepo();
  const { wikiPath } = initWiki({
    repoRoot: repo,
    target: "wiki-vault",
    project: "demo",
  });
  assert.equal(wikiPath, join(repo, "wiki-vault"));
  assert.ok(existsSync(join(repo, "wiki-vault/wiki/index.md")));
});

test("substitutes {{PROJECT}} placeholders", () => {
  const repo = freshRepo();
  const { wikiPath } = initWiki({ repoRoot: repo, project: "spaceship" });
  const log = readFileSync(join(wikiPath, "wiki/log.md"), "utf8");
  assert.ok(log.includes("spaceship"));
  assert.ok(!log.includes("{{PROJECT}}"));
});

test("leaves no placeholder token in any generated file or the agent block", () => {
  const repo = freshRepo();
  const { wikiPath, agentBlock } = initWiki({ repoRoot: repo, project: "demo" });
  for (const rel of [
    "wiki/meta/conventions.md",
    "wiki/meta/update-rule.md",
    "wiki/index.md",
    "wiki/log.md",
  ]) {
    const body = readFileSync(join(wikiPath, rel), "utf8");
    assert.ok(!body.includes("{{"), `${rel} still contains a placeholder`);
  }
  // The agent block is the artifact a human pastes into CLAUDE.md — an
  // unresolved {{WIKI_PATH}} there is the most visible possible failure.
  assert.ok(!agentBlock.includes("{{"), "agent block still contains a placeholder");
  assert.ok(agentBlock.includes(wikiPath), "agent block missing the resolved wiki path");
  assert.ok(
    agentBlock.includes("<!-- BEGIN obsidian-wiki (managed) -->") &&
      agentBlock.includes("<!-- END obsidian-wiki (managed) -->"),
    "agent block missing its managed-block delimiters",
  );

  // {{DATE}} and {{REPO_PATH}} both resolve inside conventions.md.
  const conventions = readFileSync(
    join(wikiPath, "wiki/meta/conventions.md"),
    "utf8",
  );
  assert.ok(
    conventions.includes(new Date().toISOString().slice(0, 10)),
    "conventions.md missing the resolved {{DATE}}",
  );
  assert.ok(
    conventions.includes(repo),
    "conventions.md missing the resolved {{REPO_PATH}}",
  );
});

test("is idempotent — re-running skips existing files and never overwrites", () => {
  const repo = freshRepo();
  const first = initWiki({ repoRoot: repo, project: "demo" });
  const indexPath = join(first.wikiPath, "wiki/index.md");
  writeFileSync(indexPath, "HUMAN EDIT");
  const second = initWiki({ repoRoot: repo, project: "demo" });
  assert.equal(second.created.length, 0);
  assert.equal(second.skipped.length, 5);
  assert.equal(readFileSync(indexPath, "utf8"), "HUMAN EDIT");
});

test("throws a clear error when the target path cannot be created", () => {
  const repo = freshRepo();
  writeFileSync(join(repo, "blocker"), "x"); // a file where a dir is needed
  assert.throws(
    () => initWiki({ repoRoot: repo, target: "blocker/vault", project: "demo" }),
    /cannot create vault/,
  );
});

test("derives the project name from the repo directory when none is given", () => {
  const repo = freshRepo(); // the repo dir is named "repo"
  const { wikiPath, projectName } = initWiki({ repoRoot: repo });
  assert.equal(projectName, basename(repo));
  assert.ok(wikiPath.endsWith(`${basename(repo)}-wiki`));
});

test("a mixed re-run creates the missing files and skips the existing ones", () => {
  const repo = freshRepo();
  const { wikiPath } = initWiki({ repoRoot: repo, project: "demo" });
  rmSync(join(wikiPath, "wiki/index.md"));
  rmSync(join(wikiPath, "wiki/log.md"));
  const second = initWiki({ repoRoot: repo, project: "demo" });
  assert.equal(second.created.length, 2);
  assert.equal(second.skipped.length, 3);
});

test("reports isGitRepo false when the repo root has no .git", () => {
  const base = mkdtempSync(join(tmpdir(), "wiki-nogit-"));
  const repo = join(base, "repo");
  mkdirSync(repo, { recursive: true }); // deliberately no .git
  const { isGitRepo } = initWiki({ repoRoot: repo, project: "demo" });
  assert.equal(isGitRepo, false);
});

test("the CLI scaffolds a vault, prints the agent block, and exits 0", () => {
  const repo = freshRepo();
  const out = execFileSync(process.execPath, [SCRIPT], {
    cwd: repo,
    env: { ...process.env, WIKI_PROJECT: "clidemo" },
    encoding: "utf8",
  });
  assert.ok(out.includes("vault ready at"), "CLI did not report success");
  assert.ok(
    out.includes("<!-- BEGIN obsidian-wiki (managed) -->"),
    "CLI did not print the managed agent block",
  );
  assert.ok(existsSync(join(repo, "..", "clidemo-wiki", "wiki/index.md")));
});
