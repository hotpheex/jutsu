#!/usr/bin/env node
/**
 * init-wiki — scaffold an Obsidian-backed LLM wiki in a repo.
 *
 *   node scripts/init-wiki.mjs
 *
 * Environment variables:
 *   WIKI_TARGET   vault location (default: sibling "../<project>-wiki")
 *   WIKI_PROJECT  project name for template substitution (default: repo dir name)
 *
 * Idempotent: re-running skips files that already exist and never overwrites
 * human-edited content.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const templatesDir = resolve(here, "..", "templates");

// [template-relative source, vault-relative destination]
const VAULT_FILES = [
  ["wiki/meta/conventions.md", "wiki/meta/conventions.md"],
  ["wiki/meta/update-rule.md", "wiki/meta/update-rule.md"],
  ["wiki/index.md", "wiki/index.md"],
  ["wiki/log.md", "wiki/log.md"],
];

function substitute(text, vars) {
  return text
    .replace(/\{\{PROJECT\}\}/g, vars.project)
    .replace(/\{\{DATE\}\}/g, vars.date)
    .replace(/\{\{REPO_PATH\}\}/g, vars.repoPath)
    .replace(/\{\{WIKI_PATH\}\}/g, vars.wikiPath);
}

export function initWiki({ target, project, repoRoot = process.cwd() } = {}) {
  const repoPath = resolve(repoRoot);
  const projectName = project || basename(repoPath);
  const wikiPath = target
    ? resolve(repoPath, target)
    : resolve(repoPath, "..", `${projectName}-wiki`);
  const date = new Date().toISOString().slice(0, 10);
  const vars = { project: projectName, date, repoPath, wikiPath };

  const wikiDir = join(wikiPath, "wiki");
  const metaDir = join(wikiDir, "meta");
  const obsidianDir = join(wikiPath, ".obsidian");

  try {
    mkdirSync(metaDir, { recursive: true });
    mkdirSync(obsidianDir, { recursive: true });
  } catch (err) {
    throw new Error(`cannot create vault at ${wikiPath}: ${err.message}`);
  }

  const created = [];
  const skipped = [];

  for (const [src, dest] of VAULT_FILES) {
    const destPath = join(wikiPath, dest);
    if (existsSync(destPath)) {
      skipped.push(destPath);
      continue;
    }
    const tpl = readFileSync(join(templatesDir, src), "utf8");
    writeFileSync(destPath, substitute(tpl, vars));
    created.push(destPath);
  }

  const appJson = join(obsidianDir, "app.json");
  if (existsSync(appJson)) {
    skipped.push(appJson);
  } else {
    writeFileSync(appJson, "{}\n");
    created.push(appJson);
  }

  const agentBlock = substitute(
    readFileSync(join(templatesDir, "agent-block.md"), "utf8"),
    vars,
  );

  return { wikiPath, projectName, created, skipped, agentBlock };
}

function main() {
  let result;
  try {
    result = initWiki({
      target: process.env.WIKI_TARGET,
      project: process.env.WIKI_PROJECT,
    });
  } catch (err) {
    console.error(`init-wiki: ${err.message}`);
    process.exit(1);
  }

  if (!existsSync(join(process.cwd(), ".git"))) {
    console.warn(
      "init-wiki: warning — current directory is not a git repository. " +
        "The wiki is still valid.",
    );
  }

  for (const f of result.created) console.log(`  created  ${f}`);
  for (const f of result.skipped) {
    console.log(`  skipped  ${f} (already exists)`);
  }

  console.log(`\ninit-wiki: vault ready at ${result.wikiPath}`);
  console.log(
    "\nNext: append this managed block to CLAUDE.md (and AGENTS.md for " +
      "other agents).\nIf a managed block already exists, update it in place " +
      "instead of appending a second one.\n",
  );
  console.log(result.agentBlock);
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main();
}
