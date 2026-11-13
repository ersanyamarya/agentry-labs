---
title: The CLI build clears its output folder so old chunks never get published
author: Sanyam
date: 2026-11-13
branch: main
cost: { minutes: 3, tokens: 15571 }
id: l-1a20dd65
scope: repo
status: active
src: agent
touches:
  - cli/package.json
  - cli/scripts/pack-check.mjs
---

## Decided
The build deletes the bundle output folder before bundling. Every build wrote new hashed chunk files and never removed the old ones, so the package grew from about 4 MB to 6.3 MB unpacked and would have shipped stale code.

## Tried and ruled out
Raising the size budget in the pack check: it would have hidden the stale files instead of removing them.

## Watch out
In the code: cli/package.json build script runs a node one-liner that removes dist/bin before esbuild; npm run pack:check fails when the unpacked size passes the budget in cli/scripts/pack-check.mjs. If the size jumps, look for leftover files in dist/bin first.
