#!/usr/bin/env node
// PreToolUse hook (Claude Code and Codex, matcher "Bash"): blocks `gh pr create`
// and body-setting `gh pr edit` unless the body has every heading of the pr
// skill's template. Exit 2 with a reason on stderr is the deny contract both share.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const skill = fileURLToPath(new URL("../vendor/mattpocock/engineering/pr/SKILL.md", import.meta.url));

export function templateHeadings(text) {
  const template = text.match(/```markdown\n([\s\S]*?)```/);
  return template ? [...template[1].matchAll(/^## (.+)$/gm)].map((m) => m[1].trim()) : [];
}

// gh at command position only, so `grep "gh pr create"` passes through.
const ghPr = /(?:^|[;&|(\n]|\$\()\s*(?:\w+=\S*\s+)*gh\s+pr\s+(create|new|edit)\b/;
const bodyFlag = /\s(?:--body|-b|--body-file|-F)(?:[=\s]|$)/;
const bodyFile = /\s(?:--body-file|-F)(?:=|\s+)("[^"]*"|'[^']*'|\S+)/g;

export function setsPrBody(cmd) {
  const op = typeof cmd === "string" && cmd.match(ghPr)?.[1];
  return op === "create" || op === "new" || (op === "edit" && bodyFlag.test(cmd));
}

export function missingHeadings(cmd, cwd, headings) {
  let body = cmd;
  for (const [, arg] of cmd.matchAll(bodyFile)) {
    const path = arg.replace(/^["']|["']$/g, "");
    if (path === "-") continue; // stdin: a heredoc is already in cmd
    try {
      body += "\n" + readFileSync(resolve(cwd ?? ".", path), "utf8");
    } catch {}
  }
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return headings.filter((h) => !new RegExp(`(?:^|["'])[ \\t]*## ${escape(h)}[ \\t]*$`, "m").test(body));
}

function loadHeadings() {
  try {
    return templateHeadings(readFileSync(skill, "utf8"));
  } catch {
    return [];
  }
}

function deny(reason) {
  process.stderr.write(reason + "\n");
  process.exit(2);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "--check") {
    const headings = loadHeadings();
    console.log(headings.join("\n"));
    process.exit(headings.length ? 0 : 1);
  }
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let input = {};
  try {
    input = JSON.parse(raw);
  } catch {}
  const cmd = input.tool_input?.command;
  if (!setsPrBody(cmd)) process.exit(0);

  const headings = loadHeadings();
  // Fail closed: a vendor rename must not silently switch the check off.
  if (headings.length === 0) deny(`require-pr-skill: no template headings found in ${skill}; fix the hook.`);
  const missing = missingHeadings(cmd, input.cwd, headings);
  if (missing.length) {
    deny(
      `PR body is missing the pr skill template headings: ${missing.map((h) => `## ${h}`).join(", ")}. ` +
        "Load the `pr` skill, write the body with it, and retry. " +
        "Pass the body inline or via --body-file with a literal path so this check can read it.",
    );
  }
}
