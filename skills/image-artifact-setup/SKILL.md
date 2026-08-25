---
name: image-artifact-setup
description: Set up a reproducible image-artifact generator in a project — Open Graph / social cards, link-preview art, project or product tiles, README banners, store screenshots — by rendering HTML/CSS in headless Chromium with Playwright and screenshotting it. Use this whenever the user wants to generate, standardize, regenerate, or automate images built from project data: og:image cards, social previews, thumbnails, marketing cards, tile art. Also use when the user says their og images or preview images are inconsistent / hand-made / a mess, wants images that follow their design system, wants images generated per page or per route, or asks to script image creation instead of doing it in Figma. Works in any stack — React, Next.js, Gatsby, Astro, Vite, SvelteKit, Remix, Flutter, Swift/iOS, Android — scaffolding `scripts/image-gen-tools/` and wiring a runnable script.
---

# Image Artifact Setup

Scaffold a generator that turns project data into images, committed into the repo and runnable on demand.

The reason to build this instead of exporting from a design tool is that hand-made images rot. They drift from the copy on the page, they get inconsistent as they accumulate, and one always ends up missing. A generator that reads the project's own data can't drift, and covers a new page the next time it runs.

## What you are building

A small TypeScript program, run with `bun`, that:

1. Reads the project's **own** data (route config, nav config, content collection, frontmatter) — never a hand-copied list.
2. Composes each image as HTML/CSS/SVG in the project's real design tokens.
3. Renders it in headless Chromium at a fixed size and screenshots it.
4. Writes it where the project already expects images to be.

Two flavors, and the choice changes the amount of work substantially:

| Flavor            | What's in the image                                       | Needs a dev server?               |
| ----------------- | --------------------------------------------------------- | --------------------------------- |
| **Composed**      | Type, icons, generated SVG motifs — art you author in CSS | No                                |
| **Live showcase** | Screenshots of the actual running app, framed in 3D       | Yes, plus a fill recipe per route |

Composed is the default. Offer live showcase when the artifacts are meant to sell a UI (tool pages, product features, dashboards) — it's far more convincing, but it needs the app running and a per-route script to drive each screen into a state worth showing. Read `references/capture-pitfalls.md` before attempting it; a live capture that looks easy will silently produce garbage in about five different ways.

## Workflow

Work through these in order. Each phase feeds the next, and phases 1–4 are mostly reading and asking — don't start writing the generator until you know what you're generating.

### 1. Identify the project

Detect the stack before assuming anything about file layout. Read `references/project-detection.md` for the per-stack signals, where generated images belong, and where design tokens usually live.

The one distinction that changes the plan: **does the repo already have a `package.json` at the root?**

- **Yes (JS/TS project)** — add dev dependencies to the root `package.json`, put the generator in `scripts/image-gen-tools/`, add a root script.
- **No (Flutter, Swift, Android, Go, Rust…)** — the generator is a self-contained sub-project. `cd scripts/image-gen-tools && bun init -y`, install there, and add the run script to _that_ `package.json`. Tell the user the command is `cd scripts/image-gen-tools && bun run <name>`, since there's no root package to hang it off.

Report what you found before moving on. If detection is ambiguous (a monorepo, several apps, a `package.json` that's only for tooling), ask which app the artifacts are for rather than picking.

### 2. Extract the design system

The images have to look like they belong to the product, which means reading the real tokens rather than eyeballing a screenshot.

Find and read, in priority order:

1. A design-system or brand doc in the repo (`docs/design-system.md`, `BRANDING.md`, Storybook docs)
2. The actual token source — CSS custom properties, Tailwind `@theme`, `tailwind.config`, a theme object, Flutter `ThemeData`, iOS asset catalog colors
3. Where fonts are declared, and **how they're loaded** (this matters: see phase 5)
4. The icon library already in use

Copy exact values. If the project defines `oklch(0.16 0.01 250)`, put `oklch(0.16 0.01 250)` in the card CSS — Chromium supports modern color spaces, so there's no reason to approximate it as a hex. Approximating is how generated images end up subtly off-brand.

Note the **icon library**, because reusing the project's own icon for a thing is what makes a generated card feel native rather than templated. If icons are React components, they can be rendered to static SVG:

```ts
import { renderToStaticMarkup } from 'react-dom/server';
renderToStaticMarkup(React.createElement(Icon, { width: 44, strokeWidth: 1.5 }));
```

Then colour them by setting `color` on the container, since most icon sets stroke with `currentColor`.

Show the user the palette, fonts, and icon set you extracted, and say which you'll use for the cards. This is a cheap checkpoint that catches a wrong-theme misread before any code exists.

### 3. Agree on the artifacts

Present concrete options and let the user pick. Read `references/layout-presets.md` for the preset layouts and the dimension table, then ask about:

- **Which artifacts** — one per route? per content item? a single brand card? Name the actual set you found (e.g. "14 tool pages plus a default").
- **Dimensions** — offer the standard for the purpose. 1200×630 for Open Graph, 1280×640 for a README banner, and so on. Don't invent a size.
- **Layout** — offer 2–3 presets with a one-line sketch of each, and a recommendation with a reason.
- **Composed vs live showcase** — per the table above.

Use the ask-the-user tool with real options rather than a paragraph of prose questions. Anything the user leaves ambiguous, offer choices plus "or describe your own" — guessing on layout wastes a full generate-and-review cycle.

### 4. Confirm data source and destination

**Data source** is the most important decision in the whole skill, so state it explicitly and get agreement:

> "Titles, descriptions and icons will come from `<the file you found>`, so the cards can't drift from the site and a newly added page gets one automatically."

Search hard for an existing single source of truth — a nav config, a route manifest, a content collection, a registry array. If genuinely none exists, say so and offer either (a) creating a small shared data module the app _and_ the generator both import, or (b) reading frontmatter/filesystem directly. Prefer (a): duplicating the list into the generator guarantees it goes stale.

**Destination**: if the project already has a folder of these images, write there with the same filenames — existing references keep working. If there's no obvious home, ask. Also check how the images are _served_, because it changes the correct output resolution:

- Served raw (a `publicURL`, a `static/` copy, a direct path) → render at the exact canonical size, scale 1.
- Re-processed by an image pipeline (`gatsby-plugin-image`, `next/image`, an Astro image integration) → render at 2× so it has resolution to downsample from.

Getting this backwards means either blurry cards or scrapers downloading a needlessly huge PNG.

### 5. Generate the tool

Layout:

```
scripts/image-gen-tools/
├── generate-<artifact>.ts     # one per artifact family
└── lib/
    ├── card-renderer.ts       # shared frame + Chromium runner
    └── ...                    # e.g. author-card.ts, capture.ts, recipes.ts
```

Copy `assets/card-renderer.ts` into `lib/` as the starting point and adapt its `Theme` to the tokens from phase 2. It already handles the parts that are easy to get wrong. Keep the shared frame in one module even for a single artifact family — the moment there's a second one, they must not drift apart.

**Dependencies.** Add explicitly, as dev dependencies, even if they already resolve:

```bash
bun add -d playwright-core sharp
```

`playwright-core` is often present transitively (some doc/diagram plugins pull it in). Relying on that means the generator breaks when an unrelated dependency changes. Also ensure the browser binary is installed, and prefer a `postinstall` so a fresh clone works:

```bash
bunx playwright-core install chromium
```

`sharp` is only needed if you compress output (phase 5's size note) — skip it otherwise.

**Script wiring.** Add to the appropriate `package.json`:

```json
"scripts": { "og": "bun scripts/image-gen-tools/generate-og-images.ts" }
```

**Rendering essentials** — these four cause most bad output:

1. **Wait for fonts.** `await page.evaluate(() => document.fonts.ready)` plus a short pause, before every screenshot. Without it the capture can land before webfonts swap in and the type silently falls back to a system serif.
2. **Set `deviceScaleFactor` deliberately** per the phase-4 decision.
3. **Inline every asset** as a data URI. Embedded images, cropped photos, icons — the page is rendered from a string, so a relative path has nothing to resolve against. Google Fonts over the network is the practical exception.
4. **Compress if the art is photographic or screenshot-heavy.** A dark card with flat type quantizes essentially losslessly and gets several times smaller:
   ```ts
   await sharp(shot).png({ palette: true, quality: 90, effort: 8 }).toFile(target);
   ```
   Skip it for source art the project's own pipeline will re-encode.

**Fail loudly.** If the generator needs something external — a dev server, a font, an env var — check it up front and exit with the fix, rather than emitting fourteen blank images:

```ts
try {
  const res = await fetch(DEV_SERVER, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
} catch (e) {
  console.error(`Cannot reach ${DEV_SERVER} (${(e as Error).message}).`);
  console.error('These cards are shot from the live app. Start it first:\n\n  bun run dev\n');
  process.exit(1);
}
```

Log one line per artifact written, and a summary of anything that degraded — a silent fallback is how a broken card ships.

### 6. Verify by running it

Not optional, and not satisfied by "the script exited 0":

1. Run the script.
2. Confirm the expected **count** of files landed in the destination.
3. Confirm **dimensions** are what was agreed (`sips -g pixelWidth -g pixelHeight`, or `sharp(f).metadata()`).
4. **Look at two or three images.** Read them back as images — text is the thing that breaks (wrapping to an extra line, hyphen-splitting mid-word, overflowing its column, falling back to the wrong font), and none of that shows up in a file listing.
5. Run the project's typecheck and build if it has them, to confirm nothing regressed.
6. If any image is referenced by a page, confirm the reference still resolves after the build.

Then show the user a few of the generated images and say what you'd tune.

## Handling variable-length content

The single most common defect in generated cards is text of unpredictable length, and it's worth designing against from the start rather than discovering per-card. Real titles range from 11 to 30+ characters; real descriptions from 28 to 98.

Make the footprint predictable:

- **Step the title size by length** rather than letting it wrap to a third line:
  ```ts
  const titleSize = (t: string) => (t.length <= 18 ? '78px' : t.length <= 26 ? '68px' : '60px');
  ```
- **Clamp descriptions** to a fixed line count (`-webkit-line-clamp: 2`) so every card occupies the same space. If the truncation reads badly, that's a signal the _source_ copy is too long for a card — tell the user, since shortening it there usually improves the page too.
- **Set `text-wrap: balance` and `hyphens: none`** on headings. Default hyphenation produces breaks like `in-` / `editor`.
- **Centre content vertically** so short and long cards both sit right, and reserve space for anything pinned to an edge.

## When to ask rather than decide

Ask, with options: layout choice, dimensions, which artifacts, destination when there's no existing home, whether to screenshot the live app, and any copy you'd otherwise be inventing.

Decide yourself: file organisation, how to read the tokens, which locator strategy to use, compression settings, and every implementation detail. These are reversible and the user has no useful input on them.

If you hit a genuine conflict — the user asks for something the stack can't do — say so in a sentence, explain the constraint, and offer the nearest thing that works. One concrete example worth knowing: **a clipping ancestor (`overflow: hidden`) forces `transform-style` back to `flat`**, so layered `translateZ` parallax inside a rounded card silently does nothing. Reach for a different effect rather than shipping code that appears to work.

## Reference files

- `references/project-detection.md` — per-stack detection signals, image destinations, token locations
- `references/layout-presets.md` — layout presets, dimension table, the card CSS frame
- `references/capture-pitfalls.md` — **read before any live-app screenshotting**; dev-server overlays, consent banners, scroll clamping, locator failures
- `assets/card-renderer.ts` — copy into `lib/` as the shared frame and Chromium runner
