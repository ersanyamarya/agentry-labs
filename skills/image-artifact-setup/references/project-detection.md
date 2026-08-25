# Project Detection

How to identify the stack, where generated images belong, and where the design tokens live.

## Contents

- [Detection signals](#detection-signals)
- [Where images belong, per stack](#where-images-belong-per-stack)
- [Where design tokens live](#where-design-tokens-live)
- [Finding the data source](#finding-the-data-source)
- [Non-JS projects](#non-js-projects)
- [Monorepos](#monorepos)

## Detection signals

Check for these files before reading `package.json` dependencies — a config file is a stronger signal than a dependency, which may be transitive.

| Stack                | Signal                                                |
| -------------------- | ----------------------------------------------------- |
| Next.js              | `next.config.{js,ts,mjs}`, `app/` or `pages/`         |
| Gatsby               | `gatsby-config.{js,ts}`, `gatsby-node.{js,ts}`        |
| Astro                | `astro.config.{mjs,ts}`, `src/content/`               |
| SvelteKit            | `svelte.config.js`, `src/routes/`                     |
| Remix / React Router | `remix.config.js`, or `@remix-run/*` deps             |
| Vite + React/Vue     | `vite.config.{js,ts}` without a meta-framework config |
| Nuxt                 | `nuxt.config.{js,ts}`                                 |
| Docusaurus           | `docusaurus.config.js`                                |
| Flutter              | `pubspec.yaml`, `lib/main.dart`                       |
| Swift / iOS          | `*.xcodeproj`, `Package.swift`, `Info.plist`          |
| Android              | `build.gradle{,.kts}`, `AndroidManifest.xml`          |
| Rust                 | `Cargo.toml`                                          |
| Go                   | `go.mod`                                              |

Also note the **package manager** so the install command matches the project: `bun.lock`/`bun.lockb` → bun, `pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, `package-lock.json` → npm. The generator itself always runs under `bun`, but dependencies should be installed with whatever the repo uses, so the lockfile stays coherent.

## Where images belong, per stack

Look for an existing folder of images first and match it. Only fall back to these defaults if there is none.

| Stack | Typical destination | Notes |
| --- | --- | --- |
| Next.js | `public/og/` | Served raw at `/og/*`. Note: Next also supports runtime OG generation via `next/og` + `ImageResponse` — if the user wants images generated _per request_ rather than committed, that's a different tool and worth mentioning. |
| Gatsby | `src/images/open-graph/` | If queried via `publicURL`, served raw; if via `childImageSharp`, re-processed. Check which. |
| Astro | `public/og/` or `src/assets/og/` | `public/` is raw; `src/assets/` goes through the image integration. |
| SvelteKit | `static/og/` | Served raw. |
| Vite SPA | `public/og/` | Served raw. |
| Docusaurus | `static/img/og/` | Served raw. |
| Flutter | `assets/images/generated/` | Must be declared under `flutter: assets:` in `pubspec.yaml` — add it if missing. |
| iOS | into an `.xcassets` catalog, or a plain `Resources/` folder | Writing into an asset catalog means also writing a `Contents.json`; a plain folder is usually simpler unless the user wants catalog behaviour. |
| Android | `app/src/main/res/drawable-nodpi/` | `nodpi` avoids density-bucket scaling. Filenames must be lowercase `a-z0-9_` — enforce this, since Android resource names are stricter than most and a hyphen breaks the build. |

**Always check how they're served** before choosing a render scale — see phase 4 in SKILL.md.

## Where design tokens live

In priority order:

1. **A design-system doc**: `docs/design-system.md`, `DESIGN.md`, `BRANDING.md`, `.storybook/`. Best case — usually states the palette and type roles with intent.
2. **Tailwind v4**: an `@theme` block in the main CSS file. Tokens are CSS custom properties; take the literal values.
3. **Tailwind v3**: `tailwind.config.{js,ts}` under `theme.extend.colors` / `fontFamily`.
4. **Plain CSS / CSS modules**: custom properties on `:root` in a global stylesheet. Also check for a `.dark` block — if the project is dark-only, the `:root` values _are_ the dark palette and there's no light variant to honour.
5. **CSS-in-JS**: a `theme.ts`, `createTheme`, `defineVars`, styled-components `ThemeProvider`.
6. **shadcn/ui**: `components.json` names the style; the tokens are the CSS custom properties.
7. **Flutter**: `ThemeData` in `lib/`, often `lib/theme/`. `colorScheme`, `textTheme`.
8. **iOS**: `Assets.xcassets/*.colorset/Contents.json`, or a `Color+Extensions.swift`.
9. **Android**: `res/values/colors.xml`, `themes.xml`, `type.kt` for Compose.

**Fonts**: find both the family names _and_ the loading mechanism. If they're Google Fonts, the generated card can link the same stylesheet, which is the easiest path to matching type exactly. If they're self-hosted or licensed (`@font-face` against local files, `next/font/local`), embed the font file as a base64 data URI in the card CSS — a `file://` reference from a string-rendered page won't resolve. If a font can't be obtained at all, say so and propose the closest available substitute rather than silently rendering a fallback.

**Icons**: check dependencies for `lucide-react`, `@heroicons/react`, `react-icons`, `@tabler/icons`, `phosphor-react`, or a local `components/icons/` directory. Projects often have both a library and a few hand-rolled brand icons — handle both, since they usually share the same `currentColor` stroke convention.

## Finding the data source

Search for an existing registry before concluding there isn't one. High-value greps:

```bash
# exported config arrays
grep -rn "export const .*\(CONFIG\|ITEMS\|TOOLS\|PROJECTS\|NAV\|ROUTES\|LINKS\)" src/ --include=*.ts --include=*.tsx
# navigation components often hold the canonical list
find src -iname "*nav*" -o -iname "*sidebar*" -o -iname "*menu*"
# content collections
ls src/content 2>/dev/null; ls content 2>/dev/null
```

A navigation config is often the real source of truth, because it already has the title, description, category and icon for every page — everything a card needs.

**Importing a `.tsx` config from a bun script works** even when it imports UI libraries, as long as the script only reads the exported data and never renders the components. Bun resolves `tsconfig.json` `paths` aliases, so `@/components/...` imports resolve without extra config. Verify with a one-line probe before building on it:

```bash
bun -e "import { NAV } from './src/components/nav'; console.log(NAV.length)"
```

If the config holds React elements (an `icon: <Calculator />` field), the component type is reachable as `(el as React.ReactElement).type` and can be re-rendered at any size with `renderToStaticMarkup`.

## Non-JS projects

There's no root `package.json` to extend, so the generator is self-contained:

```bash
mkdir -p scripts/image-gen-tools && cd scripts/image-gen-tools
bun init -y
bun add -d playwright-core sharp
bunx playwright-core install chromium
```

Add the run script to `scripts/image-gen-tools/package.json`, and tell the user the invocation includes the `cd`. Add `node_modules/` under that path to `.gitignore` if the repo's ignore file doesn't already cover it.

Design tokens have to be transcribed rather than imported — you can't import `ThemeData` from Dart or a `.colorset` from Swift into TypeScript. Put them in one `theme.ts` in the generator with a comment naming the file they were copied from, so a future reader knows where to re-sync from. Flag to the user that this is the one place where drift is possible, and that the comment is the mitigation.

## Monorepos

If there are several apps (`apps/*`, `packages/*`), ask which one the artifacts are for rather than guessing — and check whether tokens live in a shared `packages/ui` or `packages/tokens`, which is the better import target than the app itself. Put the generator in the app that owns the images unless tokens and data are both shared, in which case the repo root is defensible.
