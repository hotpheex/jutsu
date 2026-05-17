# Wiring screenshot-journey into a project

How to install the skill's helpers into a Playwright project and produce a
journey. The skill files themselves are reference; the project gets copies.

**Prerequisite:** the target project already has Playwright set up
(`@playwright/test` installed and browsers fetched via `npx playwright install`).
This skill rides on an existing Playwright setup — it does not bootstrap one. For
a project with no Playwright yet, run `npm init playwright@latest` first.

## 1. Copy the helpers

Copy these into the target project (a `journey/` folder next to the test dir
is the convention):

```
lib/capture.ts        ->  journey/capture.ts
lib/manifest.ts       ->  journey/manifest.ts
scripts/build-viewer.mjs  ->  journey/build-viewer.mjs
assets/viewer.html    ->  journey/viewer.html
```

Keep `viewer.html` in the same folder as `build-viewer.mjs` (the layout above
does this). `build-viewer.mjs` finds the template as a sibling automatically —
no path editing needed.

No dependencies to install — `capture.ts` imports only `@playwright/test` and
Node built-ins. The Playwright test runner transpiles the `.ts` helpers
automatically; no extra `tsconfig.json` entry is required.

### JavaScript-only projects

The helpers are TypeScript. If the project is plain JS, strip the type
annotations and the `import type` line — the runtime logic is unchanged. The
Playwright test runner transpiles `.ts` automatically, so most projects can
keep them as-is.

## 2. Add an npm script

```json
{
  "scripts": {
    "journey": "node journey/build-viewer.mjs"
  }
}
```

## 3. Capture milestones

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

## 4. Build the viewer

```bash
npm run journey
# or scope the output:
JOURNEY_OUTPUT=html npm run journey
```

Open `journey/index.html` in a browser to step through the journey.

## 5. Commit the right files

Commit the copied helpers (`capture.ts`, `manifest.ts`, `build-viewer.mjs`,
`viewer.html`) and **both** `journey/manifest.json` and `journey/shots/` — the
manifest and its images are the journey, and the viewer needs both.

`journey/index.html` and `journey/index.md` are regenerated, so git-ignore them
unless you publish the viewer as a committed artifact. A suggested `.gitignore`:

```
journey/index.html
journey/index.md
```

## Resetting the journey

The manifest is append-only by design. To start a fresh journey, delete the
manifest and shots, then capture again:

```bash
rm -rf journey/manifest.json journey/shots
```

The copied helpers and `viewer.html` stay — only the captured data is cleared.

## Output layout

```
journey/
├── capture.ts          (copied helper)
├── manifest.ts         (copied helper)
├── build-viewer.mjs    (copied helper)
├── viewer.html         (copied template)
├── manifest.json       (generated, append-only)
├── shots/              (generated PNGs)
│   └── 0001-landing.png
├── index.html          (generated viewer)
└── index.md            (generated gallery)
```
