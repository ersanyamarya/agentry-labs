#!/bin/sh
# SessionStart (Claude Code) and sessionStart (Copilot): keep trail's index fresh. Runs in the background; never blocks
# or fails the session.
# - repo already indexed (.trail/cache): rebuild incrementally (about 1s)
# - git repo root with no index: create .trail/cache first (otherwise trail 0.29 writes the old graft/ folder), then build
# - git repo root with trail's old, untracked graft/ index (graft/INDEX.md): delete it, then as above
# - skipped: not a git repo root, $HOME, a tracked or foreign graft/ folder, or more than 20000 tracked files
# The folder is $CLAUDE_PROJECT_DIR (Claude), else the "cwd" Copilot sends as JSON on stdin, else $PWD.
d="${CLAUDE_PROJECT_DIR:-}"
if [ -z "$d" ] && [ ! -t 0 ]; then
  d=$(sed -n 's/.*"cwd" *: *"\([^"]*\)".*/\1/p' | head -n 1)
fi
[ -n "$d" ] || d="$PWD"
[ -d "$d" ] || exit 0
command -v trail >/dev/null 2>&1 || exit 0
if [ ! -d "$d/.trail/cache" ]; then
  [ "$d" = "$HOME" ] && exit 0
  [ "$(git -C "$d" rev-parse --show-toplevel 2>/dev/null)" = "$(cd "$d" && pwd -P)" ] || exit 0
  if [ -d "$d/graft" ]; then
    [ -f "$d/graft/INDEX.md" ] || exit 0
    [ -z "$(git -C "$d" ls-files -- graft 2>/dev/null | head -n 1)" ] || exit 0
    rm -rf "$d/graft"
  fi
  [ "$(git -C "$d" ls-files 2>/dev/null | head -n 20001 | wc -l)" -gt 20000 ] && exit 0
  mkdir -p "$d/.trail/cache"
fi
(cd "$d" && nohup trail build >/dev/null 2>&1 &)
exit 0
