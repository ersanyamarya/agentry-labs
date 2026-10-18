---
name: flutter-logging-strategy
description: Establish, audit, and enforce a consistent logging strategy in any Flutter/Dart project using package:logging — installs the dependency if missing, builds a named-logger hierarchy with a documented level budget and redaction policy, migrates ad-hoc print/debugPrint/logger calls, finds silent catch blocks that destroy diagnostics, and audits project docs and skills so the documented strategy matches the code. Use this whenever the user mentions logging, log levels, debugPrint, print statements, diagnostics, observability, tracing, noisy logs, missing logs, "I can't tell why this failed", redacting secrets or tokens from logs, or asks to set up, clean up, standardize, or review logging — even if they never name a package or say the word "strategy".
---

# Flutter logging strategy

> The Flutter app lives in `apps/<app>/`. Run `flutter`/`dart` commands from that directory; `lib/`, `test/`, and `assets/` paths below are relative to it; shell scripts live in the repo-root `scripts/`. `docs/` stays at the repo root.

Most Flutter projects don't lack logging — they lack a *strategy*. The typical state is a few dozen `debugPrint` calls with no levels, no way to turn them down, no rule about what is safe to print, and a handful of `catch (_)` blocks quietly destroying the one error message that would have explained a bug. Adding a logging package doesn't fix that. What fixes it is a level budget people can actually apply, a single sink, and an audit that finds where diagnostics are being thrown away.

This skill does four things, in order: **survey** what's there, **establish** the logger, **migrate and close holes**, then **align the docs** so the written strategy and the code agree.

Work through the phases in order. Phase 0 is not optional — the survey is what tells you whether this is a greenfield install or a cleanup, and those need different amounts of work.

## Phase 0 — Survey before you touch anything

Run the bundled audit script. It has no dependencies beyond Python 3 and reports everything the later phases need:

```bash
python3 ${CLAUDE_SKILL_DIR}/scripts/audit_logging.py <project-root> [extra-docs-root ...]
```

In this monorepo: `python3 ${CLAUDE_SKILL_DIR}/scripts/audit_logging.py apps/<app> docs .claude/skills` (run from the repo root, so the root `docs/` and the skills are also checked for stale logging claims).

It reports: whether `logging` is already a direct or transitive dependency, which other logging packages are present, every ad-hoc log site, eagerly-interpolated gated calls, silent `catch` blocks, which global error handlers are wired, whether the expensive knobs have been touched, log lines that may expose secrets, and doc/skill files whose logging claims may now be stale.

Read the report before proposing anything. Two things you learn here change the plan:

- **`logging` may already be in `pubspec.lock` as a transitive dependency.** Many common packages pull it in. If so, adding it as a direct dependency costs *zero* new packages and cannot cause version churn — worth saying out loud, because "add another dependency" is the objection you'll otherwise get.
- **The project may already use a different logger** (`logger`, `talker`, `loggy`). This skill standardizes on `package:logging`, so that means a migration — see `references/migration.md`. Tell the user the scope before you start; a logger swap touches every call site and they may reasonably want to stage it.

## Phase 1 — Install

```bash
flutter pub add logging
```

Then `flutter pub get` if the project's tooling needs it separately (`pub add` normally runs resolution itself).

Two things to check after, because both fail the build later rather than here:

- If the project's analysis options enable `sort_pub_dependencies`, the new entry must sit in alphabetical position. `pub add` normally handles this; `flutter analyze` is the check.
- If `logging` was previously transitive, confirm the output says it moved from transitive to direct rather than resolving a *new* version. A surprise version bump means something else constrained it.

## Phase 2 — One file owns the whole surface

Create a single module — `lib/core/logging/app_logger.dart` or wherever the project's shared infrastructure lives. Copy `assets/app_logger.dart.template` and adapt the logger names to the project's actual subsystems.

Three properties make this file work, and all three are worth preserving when you adapt it:

**It is the only file that imports `package:logging`.** Everything else imports *this* file and gets a ready-made logger. That keeps the level policy, the sink format, and the redaction rule in one reviewable place instead of spread across every feature.

**It is the only remaining legal `print`/`debugPrint` site, because it *is* the sink.** This sounds contradictory until you state it plainly: the ban applies to call sites, not to the implementation of the sink. Say so in the file, or the next person will "fix" it. Prefer `debugPrint` over `print` — it throttles output, so Android's logcat doesn't drop lines under bursty logging, and it satisfies the `avoid_print` lint that most strict lint sets enable.

**The sink must format `error` and `stackTrace` itself.** This is the trap worth knowing about, because the broken version looks finished: `LogRecord.toString()` renders only `[LEVEL] loggerName: message`. It does **not** include the error or the stack. So a sink written as `onRecord.listen((r) => debugPrint('$r'))` silently discards both — every call site can be passing its exception correctly and nothing ever reaches the console. If someone reports "we log errors but there's never anything useful in there", check the sink before checking the call sites.

**Named loggers form a dotted hierarchy, one per subsystem.** `logging` uses dot-separated names as its hierarchy convention. Give the project a single root prefix (its name) plus one child per genuine subsystem — networking, persistence, auth, and whatever the app's core domain is. Keep the root logger too: global error handlers log things that belong to no subsystem.

Pick subsystems by *where you'd look during an incident*, not by folder structure. Five or six is plenty. A logger per feature folder is the failure mode — it produces names nobody remembers and no filtering benefit.

### `initLogging()`

The init function sets the root level and attaches exactly one listener. Two details matter:

**Guard against double-initialization.** A second call would attach a second listener and duplicate every line thereafter. A private bool and an early return is enough — and it makes the function safe to call from tests.

**Set the level from the build mode, not a constant.** Keep `WARNING` and above in release builds. This is the choice that pays off when a user reports a bug from a real device: `adb logcat` or Console.app will still carry the warnings and errors, while the chatty levels cost one integer comparison each. Turning logging fully off in release means field reports arrive with no diagnostic content at all.

## Phase 3 — Wire the bootstrap first, literally

`initLogging()` goes at the **top** of `main()`, before every other bootstrap step.

This ordering is load-bearing, not tidiness. Bootstrap code is exactly where destructive recovery lives — cache resets, corrupt-database deletion, migration fallbacks. Those paths log the only explanation the user will ever get for missing data, and they run *early*. A logger installed after them captures nothing. Find the project's bootstrap steps that can destroy or discard data on failure, and make sure the logger is installed before them.

Then wire the two global handlers, because most projects have neither or only one:

- **`FlutterError.onError`** — synchronous framework errors. Log at `SEVERE`, then delegate to `FlutterError.presentError` so the debug red screen still appears. Skip the delegation and you've made debugging worse, not better.
- **`PlatformDispatcher.instance.onError`** — uncaught async errors. If the project already has one that swallows certain error types deliberately, *keep the swallowing* and add the logging. Check whether it binds a stack trace it then discards; that is a common and free improvement.

## Phase 4 — The level budget

This is the part that decides whether the logs stay useful. Put this table in the logger file's doc comment so it is readable at the point of use, and in the project's contributor docs.

| Level | Means | Rough budget |
|---|---|---|
| `SEVERE` | A user action failed and did **not** recover; data may be lost | Rare. Carries the error object *and* a stack. |
| `WARNING` | Degraded but recovered — will retry, fell back, or was refused | Per failed operation. Survives into release. |
| `INFO` | Coarse lifecycle, once per *logical* operation | The ceiling for "leave it on" |
| `FINE` | Per-operation detail; dev builds only | State transitions |
| `FINER` | Per-row / per-message firehose | Bulk iteration, stream traffic |
| `FINEST` | Reserve it. An unused level is a feature — it leaves headroom | — |

**The one rule to carry:** *if a line would print more than once per user action, it belongs at `FINE` or below.* This is a better test than arguing about severity, because it is checkable. Also: never log inside `build()`, and never per frame.

`WARNING` vs `SEVERE` trips people up. The question is not "how bad does this feel" but **did the operation recover?** A failed network push that stays queued for retry is `WARNING` — the system handled it. A cache reset that deleted data is `SEVERE` — nothing recovers that.

See `references/level-budget.md` for the harder calls and worked examples.

## Phase 5 — Efficiency: four rules, one of which is the whole game

`Logger.log` checks `isLoggable(level)` before doing anything else, so a call at a disabled level costs one comparison. That gives you four rules:

1. **Pass a closure for any message that interpolates.** `log.fine(() => 'resolved $n of $m')`, never `log.fine('resolved $n of $m')`. Dart evaluates arguments eagerly, so the plain form builds that string on every call *even when the level is off* — which is exactly the cost gating is supposed to avoid. `logging` invokes a function message only after `isLoggable` passes. Plain strings are fine for `warning`/`severe`: they're rare and usually enabled.

2. **Move work that exists only for the log message inside the closure.** This is the one people miss, and it's often the bigger win. If a log line needs a lookup, a count, or a `join` to build its message, that work runs unconditionally when it sits above the log call. Inside the closure it runs only when the level is on. Look for this specifically during the audit — computed-for-logging-only locals are common in code that was instrumented under pressure.

3. **Leave `recordStackTraceAtLevel` at its `Level.OFF` default.** It is a *top-level* variable in the logging package, not a static, so it's easy to set casually. Lowering it makes every record at or above that level call `StackTrace.current`; the package's own comment says "Because this is expensive, this is off by default." Pass stacks explicitly at the few sites that have one.

4. **Leave `hierarchicalLoggingEnabled` at `false` unless per-subsystem runtime control is genuinely needed.** At `false` each record publishes once to the root. At `true` a record walks the parent chain publishing at each level, and non-root loggers become individually settable. Turn it on only if the project actually wants "crank one subsystem to FINEST, leave the rest alone" — and if it does, that's a real feature worth the cost.

Pass errors and stacks as the **second and third arguments**, not folded into the message string: `log.warning('Push failed for $id', error, stackTrace)`. The sink formats them, so the output stays consistent and the error object survives as an object.

## Phase 6 — Audit the code

The script gives you findings. Your job is triage, because **not every silent path is a bug.** Present findings grouped by severity and let the user choose before editing — auto-instrumenting everything produces exactly the noise this strategy exists to prevent.

Rank findings like this:

**Highest value: errors that are caught and discarded.** `catch (_)`, or `on SomeException catch` with no variable bound, in a path a user can reach. These are worse than missing logs — the information existed and was deliberately thrown away. The pattern to look for hardest: a layer that throws a *deliberate, informative* exception, and a caller that swallows it and reports a generic failure state. The user sees "failed" and the reason exists nowhere. Fix by binding the error and logging it; leave the control flow exactly as it was.

**High value: silent drops with no signal to the caller.** A function that returns early when a precondition fails, returning `void` or a default, gives the caller nothing to report. If a user action can trigger it, that early return needs a log.

**High value: the one place a reason is readable.** Some failures are only explicable at a specific line — a status object populated after a call returns, a response code available before it's discarded. Log *there*, even if the failure is handled elsewhere.

**Then: find the choke point instead of instrumenting every call site.** Before adding N log lines for N transitions, look for the single method they all flow through — a setter every state change funnels into, one notify method, one central dispatch. One log statement at a funnel often covers an entire subsystem's lifecycle, including paths you'd never have found by hand (retries, reconnects, library-driven callbacks). This is the single highest-leverage move in the whole audit; do it before bulk instrumentation, not after.

**Leave alone: paths that are silent by design.** A fallback documented as "never throws" that runs per-item per-frame. A default-value substitution whose entire purpose is absorbing unknown input without failing. A cancel path where the exception *is* the expected outcome. If instrumenting it would fire more than once per user action and tell you nothing you didn't know, it belongs at `FINER` at most, or not at all. When you skip one, say so and why — that reasoning is the deliverable, and it stops the next audit from re-litigating it.

### Redaction

Establish this as an explicit list, because "don't log secrets" is too vague to apply. Never pass to a logger:

- Credentials of any kind — passwords, usernames paired with them, API keys
- Certificate and key material, including base64-encoded bundles
- Auth tokens and the headers carrying them. In a network interceptor, log method, path, and status code — **never the whole header map**
- Message or request payloads. They carry user and device data; log a topic/endpoint and a byte length instead
- User identifiers a human would recognize — email, display name, phone
- Amounts, balances, and account or card numbers in anything financial
- **Free text the user typed** — notes, memos, merchant or payee names, custom category labels. This is the least obvious entry and the one most often missed: no field name flags it as sensitive, it reads as harmless application data, and it is exactly what someone interpolates while debugging. Treat user-authored strings as personal by default

**Then check what logs *around* your loggers.** An HTTP client's own logging interceptor — Dio's `LogInterceptor`, `PrettyDioLogger`, a Chopper `HttpLoggingInterceptor` — prints full request and response bodies and headers, and never passes through your loggers at all. Neither the level budget nor the redaction rule applies to it. A project can do everything in this skill correctly and still ship tokens and payloads to the console through one line of client setup, so the audit looks for these specifically (§13 of the report).

One nuance worth stating so the rule doesn't gut diagnostics: this governs fields *you choose to log*. Passing a caught exception object as the `error` argument is fine and expected, even though its message is text you didn't write. The rule is about not reaching into a model for a secret field, not about scrubbing exception text.

## Phase 7 — Audit the docs and skills

A strategy that isn't written down decays in a month, and one that's written down *wrongly* is worse than nothing. Check every file the script flagged, plus:

- **Contributor docs and agent instruction files** (`CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, architecture and convention docs). Look for claims that are now stale: "no structured logging framework", "logging uses print", TODO markers about a missing redaction policy. Replace them with the level budget, the closure rule, and the redaction list. Add the logger file to whatever evidence or file-index sections those docs keep.
- **Code-generating scaffolds and templates.** This is the one that bites: a skill, template, or generator that emits `print`/`debugPrint` will produce convention-violating code the day the convention lands. Grep the project's own skill and template directories, not just its prose.
- **Any per-turn quality checklist** the project runs. Add a logging section: the grep that should only hit the sink, the level test, the closure requirement, the redaction list, and "a new `catch` doesn't silently discard its error".
- **Honest gaps stay documented as gaps.** If there is no crash reporting, no log persistence, and no remote shipping, say so plainly. Console-only logging is a real limitation, and a doc that implies otherwise will mislead someone during an incident.

### Be honest about what enforces this

Two things people assume and neither is true:

**No lint rule covers `debugPrint`.** `avoid_print` catches `print` only, which is usually why a codebase drifted to `debugPrint` in the first place. So "everything goes through the sink" cannot be enforced by the analyzer — it needs a CI grep. Add one, and say in the docs that the grep *is* the enforcement.

**Promoting a rule's severity does not enable the rule.** An `analyzer: errors:` override only re-grades a diagnostic already being produced. Writing `avoid_print: error` when nothing enables `avoid_print` enforces nothing while reading, to every future contributor, like a mechanical guarantee. Before relying on any lint here, confirm the rule is actually on: the lint package is in `dev_dependencies` (an `include:` of a package that isn't installed silently resolves to nothing), or the rule is named under `linter: rules:`. The audit script checks this in §1.

### If the goal is diagnostics from other people's devices

Worth raising when that's the stated motivation, because `WARNING`-in-release only gets records into the local console — reachable with the device in hand, useless for a remotely filed bug report. A crash reporter is the real answer and is a vendor decision the user should make.

The cheap middle option is a bounded in-memory ring of the most recent records, fed from the same `onRecord` listener, that an "attach logs" affordance can read. Offer it, don't impose it: it is memory the app didn't previously hold, and it is only worth adding if something will actually read it. Whatever you do, don't let the docs imply logs are reaching you when they are sitting on a tester's phone.

Fix stale claims you can verify. If you find a doc error *adjacent* to logging but not caused by it, mention it rather than silently expanding scope.

## Phase 8 — Tests and verification

```bash
flutter analyze && flutter test
```

Plus the audit that proves the migration is complete: the ad-hoc-log grep should now hit **only** the sink file.

Two test concerns worth handling, both cheap:

- **Capture the sink without a mocking library.** Swap the global `debugPrint` in `setUp` and restore it in `tearDown`; records land in a list you can assert on. This needs no new dependency, which matters in projects that have deliberately avoided one. `onRecord` is a synchronous broadcast stream, so no pumping is needed.
- **Assert the efficiency claim, don't just document it.** A test that logs a closure at a disabled level and asserts the closure never ran is three lines and pins the property that most easily regresses. Also worth covering: repeat `initLogging()` calls produce one record per log call, and level gating drops what it should.
- **Silence tests that drive failure paths on purpose.** Set the root level to `OFF` in their setup so they don't spam output. Note that after migration, tests that never call `initLogging()` have no listener attached and are quiet already — so verify the noise is actually gone rather than assuming.

Report honestly what you could and couldn't verify. Anything needing a real device, a live network peer, or a release build is a hand-off: say what to run and what to expect, rather than implying it was checked.

## Bundled resources

- `scripts/audit_logging.py` — the Phase 0 survey. Run it before anything else.
- `assets/app_logger.dart.template` — starting point for Phase 2; adapt the logger names.
- `references/level-budget.md` — harder level calls, worked examples, and what to do about `CONFIG`/`SHOUT`.
- `references/migration.md` — mapping from `logger`, `talker`, and `dart:developer` onto `package:logging`, and how to stage a large migration.
