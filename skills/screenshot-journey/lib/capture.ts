/**
 * captureMilestone — take one progressive screenshot of a development
 * milestone and record it in the journey manifest.
 *
 * Drop this file into a Playwright project (it only needs `@playwright/test`,
 * already a dependency of any such project). Call captureMilestone from
 * inside an existing test, or from a standalone capture script.
 */

import { execSync } from "node:child_process";
import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import { readManifest, writeManifest, type JourneyEntry } from "./manifest";

export interface StableFrameOptions {
  /**
   * Browser-evaluated predicate that must return truthy before the shot is
   * taken. REQUIRED for canvas/WebGL apps and games — CSS animation disabling
   * does nothing for a canvas, so an explicit readiness gate is the only way
   * to avoid a half-rendered frame. Example: `() => window.__game?.ready`.
   */
  waitFor?: () => unknown;
  /** Final settle delay in ms after all other waits. Default 150. */
  settleMs?: number;
  /** Inject CSS that zeroes animations/transitions. Default true. */
  disableAnimations?: boolean;
}

export interface CaptureOptions extends StableFrameOptions {
  /** What this milestone demonstrates. Required — a journey without captions is just pixels. */
  caption: string;
  /** Capture this element only. Omit to capture the viewport. */
  clip?: Locator;
  /** Capture the full scrollable page rather than the viewport. Ignored when `clip` is set. */
  fullPage?: boolean;
  /** Journey directory. Defaults to env JOURNEY_DIR, then "journey". */
  journeyDir?: string;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function git(args: string): string | null {
  try {
    return execSync(`git ${args}`, {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/**
 * Wait until the page is visually settled, so the screenshot is deterministic
 * rather than catching a frame mid-transition.
 */
export async function waitForStableFrame(
  page: Page,
  options: StableFrameOptions = {},
): Promise<void> {
  const { waitFor, settleMs = 150, disableAnimations = true } = options;

  if (disableAnimations) {
    await page.addStyleTag({
      content:
        "*,*::before,*::after{" +
        "animation-duration:0s!important;animation-delay:0s!important;" +
        "transition-duration:0s!important;transition-delay:0s!important;" +
        "caret-color:transparent!important;}",
    });
  }

  await page.evaluate(() => document.fonts.ready);

  if (waitFor) {
    await page.waitForFunction(waitFor);
  }

  if (settleMs > 0) {
    await page.waitForTimeout(settleMs);
  }
}

/**
 * Capture a milestone screenshot and append it to the journey manifest.
 *
 * @example
 * await captureMilestone(page, "lobby-prematch", {
 *   caption: "Pre-match lobby, both players connected",
 *   clip: page.locator("#game"),
 *   waitFor: () => window.__render?.ready === true,
 * });
 */
export async function captureMilestone(
  page: Page,
  label: string,
  options: CaptureOptions,
): Promise<JourneyEntry> {
  const journeyDir =
    options.journeyDir ?? process.env.JOURNEY_DIR ?? "journey";
  const manifestPath = join(journeyDir, "manifest.json");

  await waitForStableFrame(page, options);

  const manifest = readManifest(manifestPath);
  const sequence = manifest.entries.length + 1;
  const fileRel = `shots/${String(sequence).padStart(4, "0")}-${slug(label)}.png`;

  if (options.clip) {
    await options.clip.screenshot({ path: join(journeyDir, fileRel) });
  } else {
    await page.screenshot({
      path: join(journeyDir, fileRel),
      fullPage: options.fullPage ?? false,
    });
  }

  const entry: JourneyEntry = {
    label,
    caption: options.caption,
    file: fileRel,
    sha: git("rev-parse --short HEAD"),
    branch: git("rev-parse --abbrev-ref HEAD"),
    timestamp: new Date().toISOString(),
    viewport: page.viewportSize() ?? { width: 0, height: 0 },
    sequence,
  };

  manifest.entries.push(entry);
  writeManifest(manifestPath, manifest);
  return entry;
}
