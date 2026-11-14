#!/bin/sh
# SessionStart: keep trail's index fresh. Runs in the background; never blocks or fails the session.
# - repo already indexed (.trail/cache): rebuild incrementally (about 1s)
# - git repo root with no index: create .trail/cache first (otherwise trail 0.29 writes the old graft/ folder), then build
# - skipped: not a git repo root, $HOME, a repo with an old graft/ index, or more than 20000 tracked files
d="${CLAUDE_PROJECT_DIR:-$PWD}"
[ -d "$d" ] || exit 0
command -v trail >/dev/null 2>&1 || exit 0
if [ ! -d "$d/.trail/cache" ]; then
  [ "$d" = "$HOME" ] && exit 0
  [ "$(git -C "$d" rev-parse --show-toplevel 2>/dev/null)" = "$(cd "$d" && pwd -P)" ] || exit 0
  [ -d "$d/graft" ] && exit 0
  [ "$(git -C "$d" ls-files 2>/dev/null | head -20001 | wc -l)" -gt 20000 ] && exit 0
  mkdir -p "$d/.trail/cache"
fi
(cd "$d" && nohup trail build >/dev/null 2>&1 &)
exit 0
