# Migrating onto `package:logging`

Read this when the Phase 0 audit found `print`/`debugPrint` sites to convert, or another logging package already in the pubspec.

## Scope it out loud first

A logger swap touches every call site. Before editing anything, tell the user the count from the audit report and let them decide whether to do it in one pass or stage it. Two reasons this matters: a large logging diff buried inside a feature branch is genuinely hard to review, and a project that already adopted `logger` or `talker` may have had a reason.

If they'd rather stage it, the useful seam is **new code first**: create the sink module, wire the bootstrap and global handlers, add the convention to the docs, and convert the noisiest files. The two loggers can coexist during the transition — awkward but not broken — as long as the end state is written down.

## Level mappings

Short-form APIs don't map one-to-one, and the mismatch is where meaning gets lost.

**From `logger`:**

| `logger` | `logging` | Note |
|---|---|---|
| `log.t(…)` / `log.v(…)` | `finer` or `finest` | Trace/verbose is per-item; don't land it at `fine` |
| `log.d(…)` | `fine` | |
| `log.i(…)` | `info` | Recount these — `logger`'s `i` is often used per-item, which `info` shouldn't be |
| `log.w(…)` | `warning` | |
| `log.e(…)` | `severe` **or** `warning` | Split on whether it recovered. `logger` has no such distinction, so this needs a per-site decision |
| `log.f(…)` / `log.wtf(…)` | `severe` | `logging` has `SHOUT` above `SEVERE`; don't bother |

**From `talker`:** `verbose`→`finer`, `debug`→`fine`, `info`→`info`, `warning`→`warning`, `error`→`warning` or `severe` (same split), `critical`→`severe`. If the project used talker's error *tracking* or its UI viewer, say plainly that `logging` has neither — that's a capability being removed, not just renamed.

**From `dart:developer`:** `developer.log(msg, name: 'x', level: n, error: e)` maps directly, and `name:` usually tells you which named logger it belongs to. The integer `level:` follows the same scale as `Level.value`, so it converts numerically.

**From `print`/`debugPrint`:** there's no level to carry over, so infer from call frequency and consequence. Default to `fine` when unsure and let the "more than once per user action" test pull it down. Don't default to `info` — that's how the `INFO` tier gets flooded.

The two mappings that need real attention are `e`→(`warning`|`severe`) and `i`→`info`. Everything else is mechanical.

## Mechanical steps

1. **Remove the old dependency last**, not first. While it's still declared, the analyzer keeps finding unconverted call sites for you.
2. **Convert file by file**, not with a global find-replace. Each site needs a level decision, and the closure question below only shows up when you read the line.
3. **Add closures as you go.** Any converted message that interpolates needs `() => …`. This is the easiest thing to skip in a bulk migration and the main efficiency benefit you're migrating *for*.
4. **Move log-only work into the closure.** If a line above the log call computes a count or does a lookup used only in the message, it belongs inside.
5. **Errors and stacks become arguments.** `log.e('failed: $error')` becomes `apiLog.warning('Push failed for $id', error, stackTrace)` — the error leaves the string.
6. **Drop the manual tag prefixes.** Hand-rolled `[Subsystem]` prefixes are what `loggerName` is for. Losing them is the point; if the remaining name isn't specific enough, that's a signal the subsystem split is wrong.
7. **Delete the old import** and let the analyzer confirm nothing else referenced it.

## Two things that will bite

**Unused imports after conversion.** Removing the last `debugPrint` from a file often makes `package:flutter/foundation.dart` unused — but not always, since `kDebugMode`, `@immutable`, and `@visibleForTesting` live there too. Check before deleting the import rather than assuming.

**Auto-fix tooling and import order.** If the project runs `dart fix --apply` or an import sorter on save or on a hook, add the new import and use it in the same edit. An import added without a usage can be stripped before you get to the second half of the change.

## Verifying the migration is complete

Re-run the audit script. §2 should list only the sink file, plus any standalone CLI entry point under `tool/`/`bin/` where stdout genuinely *is* the output channel — those are legitimate and worth calling out explicitly rather than converting.

Then check the things the script can't see:

- Does anything still reference the removed package? `flutter analyze` catches it.
- Did test output get quieter or noisier? A migration usually makes it *quieter*, because tests that never call `initLogging()` have no listener attached and print nothing. That's worth confirming rather than assuming — and it means tests which previously relied on seeing `debugPrint` output will now show nothing.
- Do any tests assert on log output? They'll need the sink-capture approach (swap the global `debugPrint`) instead of reading stdout.
