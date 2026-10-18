#!/usr/bin/env python3
"""Survey a Flutter/Dart project's logging state.

Emits a markdown report: dependency state, ad-hoc log sites, silent catch
blocks, global error handlers, the expensive logging knobs, possible secret
exposure, and docs/scaffolds whose logging claims may be stale.

Everything here is a *heuristic*. The output is a worklist for a human or an
agent to triage, not a verdict — a flagged silent catch is often correct, and
the report says so rather than pretending otherwise.

Usage:
    python3 audit_logging.py [project-root [extra-docs-root ...]]
"""

from __future__ import annotations

import os
import re
import sys
from collections import defaultdict

# Directories that never contain hand-written source worth auditing.
SKIP_DIRS = {
    "build", ".dart_tool", ".git", ".idea", "ios", "android", "macos",
    "windows", "linux", "web", "node_modules", ".pub-cache", "Pods",
}
# Hidden dirs are skipped by default, but agent instructions and code-generating
# scaffolds live in them — and a scaffold that emits print() is precisely the
# finding this script exists to surface.
ALLOW_HIDDEN_DIRS = {".claude", ".cursor", ".github", ".agent", ".windsurf"}
# Generated files: findings here are not actionable by hand.
SKIP_FILE_SUFFIXES = (".g.dart", ".freezed.dart", ".mocks.dart", ".config.dart")

# Packages that mean "this project already logs somehow".
KNOWN_LOG_PACKAGES = [
    "logging", "logger", "talker", "talker_flutter", "loggy", "flutter_loggy",
    "simple_logger", "fimber", "catcher", "sentry_flutter", "firebase_crashlytics",
]

AD_HOC = [
    (re.compile(r"(?<![\w.])print\s*\("), "print()"),
    (re.compile(r"(?<![\w.])debugPrint(Stack)?\s*\("), "debugPrint()"),
    (re.compile(r"(?<![\w.])(developer|dev)\.log\s*\("), "dart:developer log()"),
    (re.compile(r"(?<![\w.])(stdout|stderr)\.write(ln)?\s*\("), "stdout/stderr"),
]

# Matching log calls needs care in both directions. Bare `.d(` or `.e(` collide
# with ordinary code, so short-form APIs are only recognized on a receiver we
# know is a logger. But guessing receiver names from a "must contain log"
# heuristic silently misses the common case where loggers are named after their
# subsystem — `net`, `ui`, `db`. So receivers are *discovered* from their
# declarations first, and the heuristic is only a fallback for names declared
# somewhere this scan can't see.
LOGGER_DECL = re.compile(
    r"(?:final|late|static|var|const)\s+(?:Logger\??\s+)?(\w+)\s*=\s*"
    r"(?:Logger|Talker\w*)\s*\("
)
HEURISTIC_RECEIVER = r"\w*[Ll][Oo][Gg]\w*|_?[Tt]alker\w*"

# `logging`'s long names plus the short forms from logger/talker/loggy.
LEVEL_METHODS = (
    r"(?:finest|finer|fine|config|info|warning|severe|shout"
    r"|verbose|debug|trace|error|fatal|warn|wtf|[tvdiwef])"
)
GATED_METHODS = r"(?:finest|finer|fine|config|verbose|debug|trace|[tvd])"

# Long-form `logging` method names are distinctive enough to match on any
# receiver. This is the safety net for loggers whose declaration wasn't found —
# an occasional false positive in a triage report beats a silent miss.
LONGFORM_CALL = re.compile(
    r"\.\s*(?:finest|finer|fine|config|info|warning|severe|shout)\s*\("
)
LONGFORM_GATED = re.compile(r"\.\s*(?:finest|finer|fine|config)\s*\(")


def build_call_matchers(receivers: set[str]):
    """Return (any_log_call, gated_call) predicates over a single line."""
    names = "|".join(sorted((re.escape(r) for r in receivers), key=len, reverse=True))
    alts = f"{names}|{HEURISTIC_RECEIVER}" if names else HEURISTIC_RECEIVER
    recv_any = re.compile(rf"\b(?:{alts})\s*\.\s*{LEVEL_METHODS}\s*\(")
    recv_gated = re.compile(rf"\b(?:{alts})\s*\.\s*{GATED_METHODS}\s*\(")

    def any_log_call(line: str):
        return recv_any.search(line) or LONGFORM_CALL.search(line)

    def gated_call(line: str):
        return recv_gated.search(line) or LONGFORM_GATED.search(line)

    return any_log_call, gated_call

SECRET_HINTS = re.compile(
    r"password|passwd|secret|token|credential|authorization|apikey|api_key"
    r"|privatekey|private_key|\.headers|payload|\bemail\b|bearer",
    re.IGNORECASE,
)

CATCH_UNDERSCORE = re.compile(r"catch\s*\(\s*_\s*[,)]")
CATCH_NAMED = re.compile(r"catch\s*\(\s*(\w+)\s*(?:,\s*(\w+)\s*)?\)")
# Requires the `}` that closes the `try`, so `extension X on Y {` and
# `mixin X on Y {` don't match. dart format always emits `} on Foo {` on one
# line; an `on` clause split across lines is missed, which is the right way
# round for a report a human has to triage.
ON_NO_CATCH = re.compile(r"\}\s*on\s+[\w<>?.]+\s*\{")

HANDLERS = {
    "FlutterError.onError": re.compile(r"FlutterError\.onError\s*="),
    "PlatformDispatcher.onError": re.compile(r"PlatformDispatcher\.instance\.onError\s*="),
    "runZonedGuarded": re.compile(r"runZonedGuarded\s*[(<]"),
    "ErrorWidget.builder": re.compile(r"ErrorWidget\.builder\s*="),
}

# Client-side HTTP logging that never passes through the app's loggers.
HTTP_LOGGERS = re.compile(
    r"\b(LogInterceptor|PrettyDioLogger|TalkerDioLogger|HttpLoggingInterceptor"
    r"|DioLoggingInterceptor|ChuckerDio|Alice\b|LoggyDioInterceptor)\b"
    r"|log(Request|Response)Body\s*[:=]",
)

KNOBS = {
    "recordStackTraceAtLevel": re.compile(r"recordStackTraceAtLevel\s*="),
    "hierarchicalLoggingEnabled": re.compile(r"hierarchicalLoggingEnabled\s*="),
}

# Prose that a landed logging strategy usually makes false.
STALE_DOC_CLAIMS = re.compile(
    r"no structured logging|not present in pubspec|uses `?debugPrint`?|uses `?print`?"
    r"|logging.{0,30}\[TODO\]|\[TODO\].{0,40}(logging|redaction|observability)"
    r"|no formal redaction|redaction policy is not",
    re.IGNORECASE,
)


# This skill's own files describe the patterns it hunts for, so scanning them
# produces confusing self-referential findings.
SELF_SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def walk(root: str, exts: tuple[str, ...], subdirs: list[str] | None = None):
    """Yield (relpath, lines) for matching files, skipping generated/vendor trees."""
    bases = [os.path.join(root, s) for s in subdirs] if subdirs else [root]
    for base in bases:
        if not os.path.isdir(base):
            continue
        for dirpath, dirnames, filenames in os.walk(base):
            dirnames[:] = [
                d for d in dirnames
                if d not in SKIP_DIRS
                and (not d.startswith(".") or d in ALLOW_HIDDEN_DIRS)
            ]
            for name in sorted(filenames):
                if not name.endswith(exts) or name.endswith(SKIP_FILE_SUFFIXES):
                    continue
                path = os.path.join(dirpath, name)
                if os.path.abspath(path).startswith(SELF_SKILL_DIR + os.sep):
                    continue
                try:
                    with open(path, encoding="utf-8", errors="replace") as fh:
                        yield os.path.relpath(path, root), fh.read().splitlines()
                except OSError:
                    continue


def strip_comment(line: str) -> str:
    """Drop // comments so matches inside prose don't count as code."""
    idx = line.find("//")
    return line[:idx] if idx != -1 else line


def read(root: str, name: str) -> str:
    try:
        with open(os.path.join(root, name), encoding="utf-8", errors="replace") as fh:
            return fh.read()
    except OSError:
        return ""


def dependency_state(root: str) -> list[str]:
    out: list[str] = []
    spec, lock = read(root, "pubspec.yaml"), read(root, "pubspec.lock")
    if not spec:
        return ["- **No `pubspec.yaml` found** — is this a Flutter/Dart project root?"]

    direct = re.search(r"^\s{2}logging:\s*(.+)$", spec, re.MULTILINE)
    locked = re.search(r"^  logging:\n(?:.*\n)*?    version:\s*\"?([^\"\n]+)", lock, re.MULTILINE)
    transitive = bool(re.search(r"^  logging:\n\s+dependency:\s+transitive", lock, re.MULTILINE))

    if direct:
        out.append(f"- `logging` is already a **direct** dependency (`{direct.group(1).strip()}`).")
    elif transitive:
        v = locked.group(1) if locked else "unknown"
        out.append(
            f"- `logging` is already present **transitively** at `{v}`. Promoting it with "
            "`flutter pub add logging` adds **zero** new packages and cannot cause version "
            "churn — worth saying out loud when proposing the change."
        )
    else:
        out.append("- `logging` is **not present**. `flutter pub add logging` will add it.")

    others = [
        p for p in KNOWN_LOG_PACKAGES
        if p != "logging" and re.search(rf"^\s{{2}}{re.escape(p)}:", spec, re.MULTILINE)
    ]
    if others:
        out.append(
            f"- Other logging/reporting packages already declared: **{', '.join(others)}**. "
            "This skill standardizes on `package:logging`, so that implies a migration — "
            "see `references/migration.md`, and scope it with the user before starting."
        )
    else:
        out.append("- No other logging package declared; no migration needed.")

    # A lint include is inert unless the package is actually a dependency, and a
    # severity override under `analyzer: errors:` only re-grades a rule that is
    # already enabled. A rule everyone believes is enforced but isn't is worse
    # than a known gap, so verify rather than infer.
    opts = read(root, "analysis_options.yaml")
    inc = re.search(r"include:\s*package:(\w+)/", opts)
    rule_named = bool(re.search(r"^\s+-\s*avoid_print\s*$", opts, re.MULTILINE))
    severity_only = bool(re.search(r"avoid_print\s*:\s*\w+", opts))

    if inc:
        pkg = inc.group(1)
        declared = bool(re.search(rf"^\s{{2}}{re.escape(pkg)}:", spec, re.MULTILINE))
        if declared:
            out.append(
                f"- Analysis includes `package:{pkg}/…` and `{pkg}` **is** declared in "
                "pubspec, so its rules (usually including `avoid_print`) are live. That is "
                "often *why* a codebase drifted to `debugPrint` instead of `print`."
            )
        else:
            out.append(
                f"- **`analysis_options.yaml` includes `package:{pkg}/…` but `{pkg}` is NOT "
                "in pubspec dependencies**, so the include cannot resolve and its rules are "
                "inert. Anything assumed to be guarded by `avoid_print` is unguarded."
            )
    if rule_named:
        out.append("- `avoid_print` is enabled explicitly under `linter: rules:`.")
    elif severity_only and not rule_named:
        out.append(
            "- **`avoid_print` appears only as a severity override.** That re-grades a "
            "diagnostic already being produced; it does not enable the rule. Confirm the "
            "rule is on, or the override enforces nothing."
        )
    out.append(
        "- Note either way: **no lint rule covers `debugPrint`.** Routing everything "
        "through one sink has to be guarded by a CI grep, not by the analyzer."
    )
    if "sort_pub_dependencies" in opts:
        out.append("- `sort_pub_dependencies` is on: the new pubspec entry must be alphabetical.")
    return out


def find_catch_issues(lines: list[str]) -> list[tuple[int, str]]:
    """Locate catches that discard their error. Brace-scan is approximate on purpose."""
    issues: list[tuple[int, str]] = []
    for i, raw in enumerate(lines):
        line = strip_comment(raw)
        if CATCH_UNDERSCORE.search(line):
            issues.append((i + 1, "`catch (_)` — the error object is discarded entirely"))
            continue
        if ON_NO_CATCH.search(line) and "catch" not in line:
            issues.append((i + 1, "`on X {` with no `catch` clause — no error object is bound"))
            continue
        m = CATCH_NAMED.search(line)
        if not m:
            continue
        names = [n for n in m.groups() if n]
        depth, body, closed = 0, [], False
        for follow in lines[i:i + 60]:
            depth += follow.count("{") - follow.count("}")
            body.append(strip_comment(follow))
            if depth <= 0 and "{" in "".join(body):
                closed = True
                break
        text = "\n".join(body[1:] if len(body) > 1 else body)
        meaningful = [ln for ln in text.splitlines() if ln.strip() not in ("", "}", "{")]
        if closed and not meaningful:
            issues.append((i + 1, "catch body is empty (or comments only)"))
        elif not any(re.search(rf"(?<![\w.]){re.escape(n)}(?![\w])", text) for n in names):
            issues.append((
                i + 1,
                f"`{', '.join(names)}` bound but never referenced — likely discarded",
            ))
    return issues


def main() -> int:
    root = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
    print(f"# Logging audit\n\n**Project:** `{root}`\n")

    print("## 1. Dependency state\n")
    for line in dependency_state(root):
        print(line)

    dart = list(walk(root, (".dart",), ["lib", "test", "tool", "bin"]))

    # Pass 1: discover what this project actually calls its loggers, so calls
    # through a subsystem-named receiver (`net.info(...)`) are not missed.
    receivers: set[str] = set()
    for _rel, lines in dart:
        for raw in lines:
            m = LOGGER_DECL.search(strip_comment(raw))
            if m:
                receivers.add(m.group(1))
    any_log_call, gated_call = build_call_matchers(receivers)

    ad_hoc: dict[str, list[str]] = defaultdict(list)
    eager: list[str] = []
    secrets: list[str] = []
    in_build: list[str] = []
    catches: list[str] = []
    handlers: dict[str, list[str]] = defaultdict(list)
    knobs: dict[str, list[str]] = defaultdict(list)
    logger_decls: list[str] = []
    sinks: list[str] = []
    interceptors: list[str] = []

    for rel, lines in dart:
        build_depth = None
        for n, raw in enumerate(lines, 1):
            line = strip_comment(raw)
            loc = f"`{rel}:{n}`"

            for pattern, label in AD_HOC:
                if pattern.search(line):
                    ad_hoc[label].append(loc)

            if re.search(r"=\s*Logger\s*\(", line) or re.search(r"Logger\s*\(\s*['\"]", line):
                logger_decls.append(f"{loc} — {line.strip()[:90]}")

            # A gated call whose message is a plain interpolated string is built
            # even when the level is off. Closure form avoids that.
            gm = gated_call(line)
            if gm:
                after = line[gm.end():].lstrip()
                if after[:1] in "'\"" and "$" in after:
                    eager.append(f"{loc} — {line.strip()[:100]}")

            if any_log_call(line) and SECRET_HINTS.search(line):
                secrets.append(f"{loc} — {line.strip()[:100]}")

            if re.search(r"\bWidget\s+build\s*\(", line):
                build_depth = 0
            if build_depth is not None:
                build_depth += line.count("{") - line.count("}")
                if any_log_call(line) or any(p.search(line) for p, _ in AD_HOC):
                    in_build.append(loc)
                if build_depth <= 0 and "{" in line:
                    build_depth = None

            for label, pattern in HANDLERS.items():
                if pattern.search(line):
                    handlers[label].append(loc)
            for label, pattern in KNOBS.items():
                if pattern.search(line):
                    knobs[label].append(f"{loc} — {line.strip()[:90]}")

        for n, msg in find_catch_issues(lines):
            catches.append(f"`{rel}:{n}` — {msg}")

        # A sink that never mentions `error`/`stackTrace` is dropping them,
        # because LogRecord.toString() omits both.
        for n, raw in enumerate(lines, 1):
            if "onRecord" not in raw:
                continue
            window = "\n".join(lines[n - 1:n + 14])
            if not re.search(r"\.\s*(error|stackTrace)\b", window):
                sinks.append(
                    f"`{rel}:{n}` — sink does not reference `.error` or `.stackTrace` "
                    "within the following lines"
                )

        for n, raw in enumerate(lines, 1):
            m = HTTP_LOGGERS.search(strip_comment(raw))
            if m:
                interceptors.append(f"`{rel}:{n}` — {m.group(0)}")

    total_adhoc = sum(len(v) for v in ad_hoc.values())
    print(f"\n## 2. Ad-hoc log sites ({total_adhoc})\n")
    if not total_adhoc:
        print("None. Either already migrated, or this project does not log at all.")
    for label, locs in sorted(ad_hoc.items()):
        print(f"\n**{label}** — {len(locs)}\n")
        for loc in locs[:40]:
            print(f"- {loc}")
        if len(locs) > 40:
            print(f"- …and {len(locs) - 40} more")
    if total_adhoc:
        print(
            "\n> After migration, the only surviving site should be the sink itself. "
            "Standalone CLI entry points under `tool/`/`bin/` are a legitimate exception: "
            "there, stdout/stderr *is* the output channel."
        )

    print(f"\n## 3. Existing named loggers ({len(logger_decls)})\n")
    if logger_decls:
        for d in logger_decls[:30]:
            print(f"- {d}")
        print("\n> Check these share one root prefix and map to subsystems, not folders.")
    else:
        print("None — no `Logger('...')` instances found.")

    print(f"\n## 4. Eagerly-built gated messages ({len(eager)})\n")
    if eager:
        print("These build their string even when the level is off. Wrap in `() => …`:\n")
        for e in eager[:40]:
            print(f"- {e}")
    else:
        print("None found. (Also check for work computed *above* a log call purely to")
        print("feed it — that pattern is real and this script cannot see it.)")

    print(f"\n## 5. Catches that may discard their error ({len(catches)})\n")
    if catches:
        print(
            "Triage required — **many of these are correct.** A documented `never throws` "
            "fallback, a user-cancel path, or an unknown-value default is meant to be "
            "silent. Prioritize any whose caught exception was thrown deliberately by a "
            "lower layer to explain a failure, since that information is being destroyed.\n"
        )
        for c in catches[:50]:
            print(f"- {c}")
        if len(catches) > 50:
            print(f"- …and {len(catches) - 50} more")
    else:
        print("None detected.")

    print("\n## 6. Global error handlers\n")
    for label in HANDLERS:
        locs = handlers.get(label)
        print(f"- **{label}**: {', '.join(locs) if locs else '_not wired_'}")
    if not handlers.get("FlutterError.onError"):
        print(
            "\n> `FlutterError.onError` is unset, so framework errors reach only the default "
            "console dump. Wire it, and delegate to `FlutterError.presentError` afterwards so "
            "the debug red screen survives."
        )

    print("\n## 7. Expensive knobs\n")
    for label in KNOBS:
        locs = knobs.get(label)
        print(f"- **{label}**: {'; '.join(locs) if locs else '_untouched (good — defaults are the cheap path)_'}")

    print(f"\n## 8. Possible secret exposure ({len(secrets)})\n")
    if secrets:
        print("Keyword matches near a log call. Verify each — false positives are expected:\n")
        for s in secrets[:40]:
            print(f"- {s}")
    else:
        print("No keyword matches near log calls.")

    print(f"\n## 9. Logging inside `build()` ({len(in_build)})\n")
    print("\n".join(f"- {b}" for b in in_build[:25]) if in_build
          else "None — good. `build()` can run many times per frame.")

    docs, scaffolds = [], []
    # Extra roots (argv[2:]) hold docs that live outside the project, e.g. a
    # monorepo's top-level docs/ and .claude/ when the project is apps/<name>.
    for doc_root in [root, *(os.path.abspath(a) for a in sys.argv[2:])]:
        for rel, lines in walk(doc_root, (".md", ".markdown")):
            for n, line in enumerate(lines, 1):
                if STALE_DOC_CLAIMS.search(line):
                    docs.append(f"`{os.path.relpath(os.path.join(doc_root, rel))}:{n}` — {line.strip()[:110]}")
    for rel, lines in walk(root, (".md", ".template", ".tmpl", ".dart")):
        if not any(k in rel for k in ("skill", "template", "scaffold", "generator", "assets")):
            continue
        for n, line in enumerate(lines, 1):
            if re.search(r"(?<![\w.])(print|debugPrint)\s*\(", strip_comment(line)):
                scaffolds.append(f"`{rel}:{n}` — {line.strip()[:100]}")

    print(f"\n## 10. Docs with possibly stale logging claims ({len(docs)})\n")
    print("\n".join(f"- {d}" for d in docs[:30]) if docs else "None matched.")

    print(f"\n## 11. Scaffolds/templates that emit print or debugPrint ({len(scaffolds)})\n")
    if scaffolds:
        print("**These generate convention-violating code the day the convention lands.**\n")
        for s in scaffolds[:30]:
            print(f"- {s}")
    else:
        print("None found.")

    print(f"\n## 12. Sinks that may discard `error` / `stackTrace` ({len(sinks)})\n")
    if sinks:
        print(
            "`LogRecord.toString()` renders only `[LEVEL] loggerName: message` — it does "
            "**not** include `error` or `stackTrace`. So a sink that interpolates the whole "
            "record throws both away, and every call site can be passing its exception "
            "correctly while nothing reaches the console. This is a common and very "
            "confusing cause of \"there's never anything useful in the logs\".\n"
        )
        for s in sinks:
            print(f"- {s}")
    elif handlers or logger_decls:
        print("None — the sink(s) found do reference `error`/`stackTrace`.")
    else:
        print("No `onRecord` listener found at all, so nothing is being written anywhere.")

    print(f"\n## 13. HTTP client logging that bypasses your loggers ({len(interceptors)})\n")
    if interceptors:
        print(
            "**These log request/response bodies and headers without passing through the "
            "app's loggers**, so neither the level budget nor the redaction policy applies "
            "to them. A project can do everything else here correctly and still ship tokens "
            "and payloads to the console through one of these.\n"
        )
        for i in interceptors:
            print(f"- {i}")
    else:
        print("None found.")

    print("\n---\n\n## Suggested order\n")
    print("1. Promote/install `logging`; create the single sink module.")
    print("2. Install `initLogging()` at the top of `main()`, before any destructive bootstrap step.")
    print("3. Wire the global handlers from §6.")
    print("4. Migrate §2 sites; fix §4 and §9 as you pass through.")
    print("5. Triage §5 — look for a shared choke point before instrumenting call sites one by one.")
    print("6. Fix §12 first if it fired — a sink that drops errors makes every other fix invisible.")
    print("7. Resolve §8 and §13, then §10 and §11 so docs and generators match the code.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
