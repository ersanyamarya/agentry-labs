---
title: One master logo file; a script copies it into the web package at build
author: Sanyam
date: 2026-11-13
branch: main
cost: { minutes: 1, tokens: 4770 }
id: l-78474cd0
scope: repo
status: active
src: agent
touches:
  - ".github/assets/logo.svg"
  - cli/packages/web/package.json
---

## Decided
The only hand-edited logo is the repo-level SVG. A small script copies it where it is needed, and the web package runs that script before dev and build. The copy inside the web package is generated and not committed.

## Tried and ruled out
Importing the logo straight from the repo-level folder inside the web package: the package is built and packed on its own, so it must not reach outside itself. Keeping two committed copies: they drift.

## Watch out
A new place that needs the logo goes in the script's target list, not a hand-made copy.

In the code: .github/assets/logo.svg (master), scripts/sync-logo.mjs (targets list), cli/packages/web/package.json (predev, prebuild), .gitignore (generated copy).
