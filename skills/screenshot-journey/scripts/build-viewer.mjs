#!/usr/bin/env node
/**
 * build-viewer — turn a journey manifest into playback output.
 *
 *   node scripts/build-viewer.mjs
 *
 * Environment variables:
 *   JOURNEY_DIR     journey directory (default "journey")
 *   JOURNEY_OUTPUT  "html" | "md" | "both"  (default "both")
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const journeyDir = process.env.JOURNEY_DIR ?? "journey";
const output = (process.env.JOURNEY_OUTPUT ?? "both").toLowerCase();
const here = dirname(fileURLToPath(import.meta.url));

const manifestPath = join(journeyDir, "manifest.json");
const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, "utf8"))
  : { version: 1, entries: [] };

// Drop entries whose image is missing rather than aborting the whole build.
const entries = (Array.isArray(manifest.entries) ? manifest.entries : [])
  .filter((e) => {
    const ok = existsSync(join(journeyDir, e.file));
    if (!ok) console.warn(`skip: image missing for "${e.label}" (${e.file})`);
    return ok;
  })
  .sort((a, b) => a.sequence - b.sequence);

if (entries.length === 0) {
  console.warn("build-viewer: manifest has no usable captures yet.");
}

if (output === "html" || output === "both") writeHtml();
if (output === "md" || output === "both") writeMarkdown();

/**
 * Locate the viewer template. When installed into a project the template
 * sits beside this script (journey/viewer.html); in the skill repo it lives
 * in ../assets. Try both so the script works in either layout.
 */
function resolveTemplate() {
  const candidates = [
    join(here, "viewer.html"),
    join(here, "../assets/viewer.html"),
  ];
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    console.error(
      "build-viewer: viewer.html not found beside this script. " +
        "Copy viewer.html into the same folder as build-viewer.mjs.",
    );
    process.exit(1);
  }
  return found;
}

function writeHtml() {
  const template = readFileSync(resolveTemplate(), "utf8");
  // Escape "<" so a caption containing "</script>" cannot break the page.
  const data = JSON.stringify(entries).replace(/</g, "\\u003c");
  const html = template.replace("/*__JOURNEY_DATA__*/", data);
  const out = join(journeyDir, "index.html");
  writeFileSync(out, html);
  console.log(`build-viewer: wrote ${out} (${entries.length} captures)`);
}

function writeMarkdown() {
  const lines = ["# Development journey", ""];
  if (entries.length === 0) {
    lines.push("_No captures yet._", "");
  }
  for (const e of entries) {
    lines.push(`## ${e.sequence}. ${e.label}`, "");
    lines.push(`![${e.label}](${e.file})`, "");
    lines.push(e.caption, "");
    const meta = [e.sha && `\`${e.sha}\``, e.branch, e.timestamp]
      .filter(Boolean)
      .join(" &middot; ");
    if (meta) lines.push(`<sub>${meta}</sub>`, "");
  }
  const out = join(journeyDir, "index.md");
  writeFileSync(out, lines.join("\n"));
  console.log(`build-viewer: wrote ${out} (${entries.length} captures)`);
}
