# Wiring ui-journey into a project

How to install the skill's helpers into a Playwright project and produce a
journey. The skill files themselves are reference; the project gets copies.

**Prerequisite:** the target project already has Playwright set up
(`@playwright/test` installed and browsers fetched via `npx playwright install`).
This skill rides on an existing Playwright setup — it does not bootstrap one. For
a project with no Playwright yet, run `npm init playwright@latest` first.

## 1. Decide where the journey lives

A journey has two distinct parts, and they do **not** have to live in the same
place:

- **Tooling** — `capture.ts`, `manifest.ts`, `build-viewer.mjs`, `viewer.html`.
  This is code. It is *always* copied into the repo, beside the test dir, and
  committed to version control.
- **Output** — `manifest.json`, `shots/`, and the generated `index.html` /
  `index.md`. *Where this lands is configurable* via the `JOURNEY_DIR` env var
  (or the `journeyDir` option to `captureMilestone`). It defaults to `journey/`
  inside the repo.

If the project keeps curated artifacts **outside** the code tree — a docs
vault, an Obsidian wiki, a `reviews/` directory synced elsewhere — point
`JOURNEY_DIR` there. The tooling stays in the repo; only the captured data and
generated viewer move out. Do this *before* the first capture — migrating a
journey after the fact means relocating files and un-committing screenshots.

A common layout is a code repo and a vault as sibling directories:

```
workspace/
├── my-app/          (code repo — tooling lives here, committed)
└── obsidian/        (vault — JOURNEY_DIR points here, not a git repo)
```

There, set `JOURNEY_DIR=../obsidian/reviews`. The relative path resolves
against the repo root, which is the cwd for both Playwright and the npm
script. The git SHA recorded in each manifest entry still tracks the **code**
repo (captures collect it from the test's cwd), so the journey stays keyed to
code history even when its files live in the vault.

If the project has no such external location, leave the default — the journey
lives in `journey/` in the repo.

## 2. Copy the tooling

Copy these into the target project (a `journey/` folder next to the test dir
is the convention):

```
lib/capture.ts            ->  journey/capture.ts
lib/manifest.ts           ->  journey/manifest.ts
scripts/build-viewer.mjs  ->  journey/build-viewer.mjs
assets/viewer.html        ->  journey/viewer.html
```

This is the *tooling* — it always lives in the repo regardless of where you
pointed `JOURNEY_DIR`. Keep `viewer.html` in the same folder as
`build-viewer.mjs` (the layout above does this). `build-viewer.mjs` finds the
template as a sibling automatically, independent of `JOURNEY_DIR` — no path
editing needed.

No dependencies to install — `capture.ts` imports only `@playwright/test` and
Node built-ins. The Playwright test runner transpiles the `.ts` helpers
automatically; no extra `tsconfig.json` entry is required.

### JavaScript-only projects

The helpers are TypeScript. If the project is plain JS, strip the type
annotations and the `import type` line — the runtime logic is unchanged. The
Playwright test runner transpiles `.ts` automatically, so most projects can
keep them as-is.

## 3. Add an npm script

If the journey output lives in the repo (the default), no env var is needed:

```json
{
  "scripts": {
    "journey": "node journey/build-viewer.mjs"
  }
}
```

If you redirected output with `JOURNEY_DIR` (step 1), bake the same path into
the script so the viewer is built against the real output location:

```json
{
  "scripts": {
    "journey": "JOURNEY_DIR=../obsidian/reviews node journey/build-viewer.mjs"
  }
}
```

`build-viewer.mjs` itself always stays in `journey/` — `JOURNEY_DIR` only
moves the data it reads and the `index.*` files it writes, not the script or
template.

## 4. Capture milestones

### Option A — inside existing Playwright tests

Add a capture call at the point a test has driven the UI into a milestone state:

```ts
import { test } from "@playwright/test";
import { captureMilestone } from "../journey/capture";

test("lobby reaches pre-match state", async ({ page }) => {
  await page.goto("/?room=demo");
  await page.getByTestId("ready").click();
  await captureMilestone(page, "lobby-prematch", {
    caption: "Pre-match lobby once both players ready up",
  });
});
```

The screenshot rides along with the normal test run.

Caveat: the manifest is append-only, so a capture inside an always-run test
adds an entry on **every** run. That is fine for the evolution-of-one-screen
use case, but if you do not want the journey to grow on every CI run, prefer
Option B and run it deliberately at milestones. See "Resetting the journey".

### Option B — a standalone capture script

When you want captures independent of the test suite, write a dedicated spec
(e.g. `e2e/journey.spec.ts`) whose only job is to walk the app and capture:

```ts
import { test } from "@playwright/test";
import { captureMilestone } from "../journey/capture";

test("capture journey", async ({ page }) => {
  await page.goto("/");
  await captureMilestone(page, "landing", { caption: "Landing page, first paint" });
  // ...drive to the next milestone, capture again...
});
```

`page.goto("/")` assumes a dev server and a Playwright `baseURL`. To capture a
static local file with no server, navigate to a `file://` URL:

```ts
import { pathToFileURL } from "node:url";
await page.goto(pathToFileURL(`${process.cwd()}/app.html`).href);
```

### Pointing captures at JOURNEY_DIR

If you redirected output in step 1, the captures must write to the same place
as the build script reads from. Two ways:

- Pass `journeyDir` in each `captureMilestone` options object:

  ```ts
  await captureMilestone(page, "landing", {
    caption: "Landing page, first paint",
    journeyDir: "../obsidian/reviews",
  });
  ```

- Or set `JOURNEY_DIR` for the whole test run — e.g. in `playwright.config.ts`:

  ```ts
  process.env.JOURNEY_DIR ??= "../obsidian/reviews";
  ```

  so every capture in the run inherits it without per-call options.

The default (no `journeyDir`, no `JOURNEY_DIR`) writes to `journey/` in the
repo — match this against whatever you put in the npm script.

## 5. Build the viewer

```bash
npm run journey
# or scope the output:
JOURNEY_OUTPUT=html npm run journey
```

The viewer (`index.html`) and gallery (`index.md`) are written into
`JOURNEY_DIR` — `journey/` by default, or the external location you configured.
Open `index.html` there in a browser to step through the journey.

## 6. Commit the right files

**Always commit the tooling** — `capture.ts`, `manifest.ts`, `build-viewer.mjs`,
`viewer.html`. It is code and belongs in version control.

**The output is committed only when `JOURNEY_DIR` is inside the repo.**

- *In-repo journey (the default):* commit **both** `journey/manifest.json` and
  `journey/shots/` — the manifest and its images are the journey, and the
  viewer needs both. The generated `journey/index.html` and `journey/index.md`
  are regenerated each build, so git-ignore them unless you publish the viewer
  as a committed artifact:

  ```
  journey/index.html
  journey/index.md
  ```

- *External journey (`JOURNEY_DIR` points outside the repo):* the output —
  `manifest.json`, `shots/`, `index.html`, `index.md` — lives in the docs vault
  and is **not git-tracked by the code repo at all**. Do not `git add` it, and
  do not add the `index.*` `.gitignore` lines above — they only apply to the
  in-repo case. Only the tooling is committed. (`index.md` is a plain-markdown
  gallery, so a markdown vault like Obsidian renders the journey in place — the
  journey is browsable with no extra publishing step.)

## Resetting the journey

The manifest is append-only by design. To start a fresh journey, delete the
manifest and shots, then capture again. The path depends on where `JOURNEY_DIR`
points — for the in-repo default:

```bash
rm -rf journey/manifest.json journey/shots
```

For an external journey, target `$JOURNEY_DIR` instead (e.g.
`rm -rf ../obsidian/reviews/manifest.json ../obsidian/reviews/shots`). The
copied helpers and `viewer.html` stay — only the captured data is cleared.

**`manifest.json` and `shots/` must be deleted together.** Deleting one
without the other produces an orphaned state — manifest entries pointing at
missing files, or images with no captions/ordering — which the next
`captureMilestone` will not detect or repair, and which `build-viewer.mjs`
will happily render with broken refs. If you only need to drop the last few
captures, edit `manifest.json` (remove those entries) AND delete the
corresponding files in `shots/`; never one without the other.

## Output layout

The two parts of a journey can live in two places. **In the repo (tooling —
always committed):**

```
journey/
├── capture.ts          (copied helper)
├── manifest.ts         (copied helper)
├── build-viewer.mjs    (copied helper)
└── viewer.html         (copied template)
```

**Under `JOURNEY_DIR` (output — may be external):**

```
<JOURNEY_DIR>/
├── manifest.json       (generated, append-only)
├── shots/              (generated PNGs)
│   └── 0001-landing.png
├── index.html          (generated viewer)
└── index.md            (generated gallery)
```

By default `JOURNEY_DIR` is `journey/`, so both blocks land in the same in-repo
folder. When `JOURNEY_DIR` is external, the tooling stays in the repo and the
output lives in the docs vault.
