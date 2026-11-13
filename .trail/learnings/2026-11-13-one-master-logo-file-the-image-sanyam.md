---
title: "One master logo file; the image tools' sync script copies it into the web package and the cover"
author: Sanyam
date: 2026-11-13
branch: main
cost: { minutes: 1, tokens: 14717 }
id: l-83ace946
scope: repo
status: active
replaces: l-78474cd0
src: agent
touches:
  - cli/packages/web/package.json
  - ".github/assets/logo.svg"
  - scripts/image-gen-tools/sync-logo.mjs
  - scripts/image-gen-tools/generate-cover.ts
  - ".github/assets/cover.jpg"
---

## Decided
The only hand-edited logo is the repo-level SVG. The sync script in the image tools folder copies it where needed: the web package runs it before dev and build, and the cover command runs it and inlines the logo in the cover image. The web package's copy is generated and not committed. The README has no separate logo block; the cover carries the icon.

## Tried and ruled out
Importing the logo straight from the repo-level folder inside the web package: the package is built and packed on its own. Two committed copies: they drift.

## Watch out
A new place that needs the logo goes in the script's target list. Regenerate the cover after changing the logo.

In the code: .github/assets/logo.svg (master), scripts/image-gen-tools/sync-logo.mjs (targets), scripts/image-gen-tools/generate-cover.ts (inlines it), cli/packages/web/package.json (predev, prebuild).
