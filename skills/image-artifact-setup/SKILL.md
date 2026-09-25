---
name: image-artifact-setup
description: "Set up a reproducible image generator in a project (Open Graph and social cards, link previews, project or product tiles, README banners, store screenshots) by rendering HTML/CSS in headless Chromium with Playwright. Use when the user wants to generate, standardize, regenerate, or automate images built from project data: og:image cards, social previews, thumbnails, marketing cards, tile art. Also use when the user says their preview images are inconsistent, hand-made, or a mess, wants images that follow their design system or one per page or route, or wants to script image creation instead of using Figma. Works in any stack (React, Next.js, Gatsby, Astro, Vite, SvelteKit, Remix, Flutter, iOS, Android), scaffolding scripts/image-gen-tools/ with a runnable script."
argument-hint: "[artifact-type] [project-or-app]"
---

# Image artifact setup

Scaffold a generator that turns project data into images, committed to the repo and runnable on demand. Hand-made images drift from the page copy, get inconsistent, and go missing for new pages. A generator that reads the project's own data cannot drift.

The generator is a small TypeScript program that reads the project's own data (route config, nav config, content collection, frontmatter), composes each image as HTML/CSS/SVG in the project's real design tokens, screenshots it in headless Chromium at a fixed size, and writes it where the project already expects images.

| Flavor | What's in the image | Needs a dev server? |
| --- | --- | --- |
| **Composed** (default) | Type, icons, generated SVG motifs | No |
| **Live showcase** | Screenshots of the running app, framed in 3D | Yes, plus a fill recipe per route |

Offer live showcase when the images sell a UI (tool pages, dashboards). Read `references/capture-pitfalls.md` before attempting it; live captures fail silently in several ways.

Phases 1 to 4 are reading and asking. Write no generator code until the artifacts, data source, and destination are agreed.

## 1. Identify the project

- Read `references/project-detection.md` for per-stack signals, image destinations, token locations, and the runtime table.
- Check for a root `package.json`:
  - **Present (JS/TS project):** add dev dependencies to it with the lockfile's package manager, put the generator in `scripts/image-gen-tools/`, and add a root script.
  - **Absent (Flutter, Swift, Android, Go, Rust):** make `scripts/image-gen-tools/` a self-contained sub-project and tell the user the command includes the `cd`.
- Pick the runtime: bun when the project uses bun, otherwise `tsx`. Confirm it is installed before relying on it.
- Report what was found. When detection is ambiguous (monorepo, several apps, a tooling-only `package.json`), ask which app the images are for.

## 2. Extract the design system

Read, in priority order:

1. A design-system or brand doc (`docs/design-system.md`, `BRANDING.md`, Storybook docs).
2. The token source: CSS custom properties, Tailwind `@theme`, `tailwind.config`, a theme object, Flutter `ThemeData`, iOS asset catalog colors.
3. Where fonts are declared and how they load (Google Fonts link, self-hosted `@font-face`, `next/font`).
4. The icon library in use.

Copy exact values. Keep `oklch(0.16 0.01 250)` as `oklch(0.16 0.01 250)`; Chromium supports modern color spaces, and approximating to hex is how cards end up off-brand.

Show the user the palette, fonts, and icon set, and say which the cards will use. This catches a wrong-theme misread before any code exists.

## 3. Agree on the artifacts

Read `references/layout-presets.md` for the preset layouts and dimension table, then ask with the question tool, giving real options:

- **Which artifacts:** one per route, per content item, or a single brand card. Name the actual set found ("14 tool pages plus a default").
- **Dimensions:** the standard for the purpose (1200x630 for Open Graph, 1280x640 for a README banner). Never invent a size.
- **Layout:** 2 or 3 presets with a one-line sketch each, plus a recommendation and the reason.
- **Composed or live showcase**, per the table above.

## 4. Confirm the data source and destination

State the data source explicitly and get agreement:

> "Titles, descriptions and icons will come from `<file found>`, so the cards can't drift from the site and a new page gets one automatically."

Search hard for a single source of truth (nav config, route manifest, content collection, registry array). When none exists, offer (a) a small shared data module both the app and the generator import, or (b) reading frontmatter or the filesystem. Recommend (a); a list copied into the generator goes stale.

For the destination, reuse an existing image folder and its filenames so references keep working. Ask when there is no obvious home. Then check how the images are served, since it sets the render scale:

- Served raw (a `publicURL`, a `static/` copy, a direct path): render at the exact size, scale 1.
- Re-processed by an image pipeline (`gatsby-plugin-image`, `next/image`, an Astro image integration): render at scale 2.

## 5. Generate the tool

```
scripts/image-gen-tools/
├── generate-<artifact>.ts     # one per artifact family
└── lib/
    └── card-renderer.ts       # shared frame + Chromium runner
```

- Copy `assets/card-renderer.ts` into `lib/`. Replace its example `THEME` with the tokens from phase 2. Keep one shared frame even for a single artifact family.
- Read `references/rendering-guide.md` for font loading, asset inlining, encoding choice, icons, failing loudly, and variable-length text.
- Add `playwright-core`, `sharp`, and (unless using bun) `tsx` as dev dependencies explicitly, even if they already resolve transitively. Install Chromium, preferably from a `postinstall` so a fresh clone works. The runtime table in `references/project-detection.md` has the exact commands per package manager.
- Add a script to the right `package.json`, for example `"og": "tsx scripts/image-gen-tools/generate-og-images.ts"` (or `bun ...` in a bun project).

## 6. Verify by running it

Exiting 0 is not enough:

1. Run the script.
2. Execute `node ${CLAUDE_SKILL_DIR}/scripts/verify-images.mjs <destination> --expect <count> --width <w> --height <h> --scale <scale>`. It checks the file count, the pixel dimensions of every PNG, JPEG, and WebP, and flags suspiciously small files. Add `--max-kb <k>` when there is a size budget.
3. Look at two or three images, including the longest title. Text is what breaks: an extra wrapped line, a mid-word hyphen, overflow, or a fallback font.
4. Run the project's typecheck and build scripts, and confirm any page referencing the images still resolves after the build.

Show the user a few images and say what to tune.

## When to ask and when to decide

- **Ask, with options:** layout, dimensions, which artifacts, a destination with no existing home, whether to screenshot the live app, and any copy that would otherwise be invented.
- **Decide:** file organization, how to read the tokens, locator strategy, encoding, and every implementation detail.
- **Constraint conflicts:** when the user asks for something the stack cannot do, say so in one sentence, explain the constraint, and offer the nearest thing that works.
