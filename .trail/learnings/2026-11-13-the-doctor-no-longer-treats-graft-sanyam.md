---
title: The doctor no longer treats graft as an old name for trail
author: Sanyam
date: 2026-11-13
branch: main
cost: { minutes: 1, tokens: 1093 }
id: l-c8e9e06e
scope: repo
status: active
src: agent
touches:
  - cli/packages/core/src/renames.json
  - cli/packages/core/src/fix-rules.ts
---

## Decided
The doctor's list of stale names is empty. Trail still ships files and hook matchers under the old graft name, so flagging them was wrong and its fix would have pointed hooks at files that do not exist.

## Tried and ruled out
Keeping the graft to trail pair and silencing only some findings: too many places use the old name. Reading the list once at module load: the scan tests set the override after import, so the fix rules saw an empty list.

## Watch out
In the code: cli/packages/core/src/renames.json holds real renames; AGENTRY_RENAMES (a JSON object) overrides it and the test fixture sets it. The fix rules call defaultRenames() when they run, never at import. Do not re-add graft to renames.json while trail still writes graft-named helper files.
