/**
 * The journey manifest: an append-only record of every milestone capture.
 *
 * The manifest is the source of truth for ordering, captions, and git
 * context. Image files on their own are just pixels — the manifest is what
 * makes the journey replayable.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface JourneyEntry {
  /** Stable kebab-case identifier for the milestone, e.g. "lobby-prematch". */
  label: string;
  /** Human caption: what this milestone *demonstrates*, not just what is shown. */
  caption: string;
  /** Image path relative to the journey directory, always forward-slashed. */
  file: string;
  /** Short commit SHA at capture time, or null outside a git repo. */
  sha: string | null;
  /** Branch name at capture time, or null outside a git repo. */
  branch: string | null;
  /** ISO-8601 capture time. */
  timestamp: string;
  /** Page viewport size at capture time. */
  viewport: { width: number; height: number };
  /** 1-based position in the journey, assigned on append. */
  sequence: number;
}

export interface Manifest {
  version: 1;
  entries: JourneyEntry[];
}

const EMPTY: Manifest = { version: 1, entries: [] };

/** Read the manifest, returning an empty one if the file does not exist. */
export function readManifest(path: string): Manifest {
  if (!existsSync(path)) return { ...EMPTY, entries: [] };
  const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<Manifest>;
  return { version: 1, entries: Array.isArray(raw.entries) ? raw.entries : [] };
}

/** Write the manifest, creating the parent directory if needed. */
export function writeManifest(path: string, manifest: Manifest): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
}
