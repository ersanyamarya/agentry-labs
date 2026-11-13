---
title: "Keyboard shortcut names in the web UI are lower case words, never capitalised keys"
author: Sanyam
date: 2026-11-13
branch: main
cost: { minutes: 1, tokens: 1158 }
id: l-fcc9b314
scope: repo
status: active
src: agent
touches:
  - cli/packages/web/src/hooks/use-shortcuts.ts
---

## Decided
Shortcut maps in the web UI use lower-case names (down, up, space, esc), mapped from the real key in one table.

## Tried and ruled out
A map entry named Escape. Biome reads a capitalised key holding a function as a component defined inside a component and fails the check (noNestedComponentDefinitions, noComponentHookFactories).

## Watch out
In the code: cli/packages/web/src/hooks/use-shortcuts.ts has the KEY_NAMES table; add new special keys there (Escape -> esc) and run npm run check from cli/ before committing.
