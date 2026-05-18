import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initWiki } from "./init-wiki.mjs";

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
  const { wikiPath, created } = initWiki({ repoRoot: repo, project: "demo" });
  assert.ok(wikiPath.endsWith("demo-wiki"));
  assert.ok(existsSync(join(wikiPath, "wiki/meta/conventions.md")));
  assert.ok(existsSync(join(wikiPath, "wiki/meta/update-rule.md")));
  assert.ok(existsSync(join(wikiPath, "wiki/index.md")));
  assert.ok(existsSync(join(wikiPath, "wiki/log.md")));
  assert.ok(existsSync(join(wikiPath, ".obsidian/app.json")));
  assert.equal(created.length, 5);
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
