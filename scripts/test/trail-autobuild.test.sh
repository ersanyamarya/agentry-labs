#!/bin/bash
# Tests global/helpers/trail-autobuild.sh with a fake `trail` that only records where `trail build` ran.
# Run: bash scripts/test/trail-autobuild.test.sh   (also under /bin/bash 3.2)
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$HERE/../../global/helpers/trail-autobuild.sh"
T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/home"
# shellcheck disable=SC2016
printf '#!/bin/sh\n[ "$1" = build ] && echo "$PWD" >> "%s/builds.log"\nexit 0\n' "$T" > "$T/bin/trail"
chmod +x "$T/bin/trail"
export PATH="$T/bin:$PATH" HOME="$T/home"
fail=0
ok() { echo "  ok   $1"; }
bad() { echo "  FAIL $1"; fail=$((fail + 1)); }
check() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1 (got '$2', want '$3')"; fi; }

newrepo() {
  mkdir -p "$T/$1" && (cd "$T/$1" && git init -q && echo 'x' > a.ts)
}
run() { # run <dir> [stdin]: run the hook the Claude way, then wait for the background build
  : > "$T/builds.log"
  CLAUDE_PROJECT_DIR="$1" sh "$SCRIPT" < /dev/null
  i=0; while [ $i -lt 30 ] && [ ! -s "$T/builds.log" ]; do sleep 0.1; i=$((i + 1)); done
  sleep 0.2
}
built() { [ -s "$T/builds.log" ] && echo yes || echo no; }

echo "fresh repo"
newrepo fresh; run "$T/fresh"
check "creates .trail/cache" "$([ -d "$T/fresh/.trail/cache" ] && echo yes || echo no)" yes
check "builds" "$(built)" yes
check "no graft/" "$([ -d "$T/fresh/graft" ] && echo yes || echo no)" no

echo "already indexed"
run "$T/fresh"
check "rebuilds" "$(built)" yes

echo "old untracked graft/ index"
newrepo legacy; mkdir "$T/legacy/graft"; echo idx > "$T/legacy/graft/INDEX.md"; run "$T/legacy"
check "graft/ removed" "$([ -d "$T/legacy/graft" ] && echo yes || echo no)" no
check "now .trail/cache" "$([ -d "$T/legacy/.trail/cache" ] && echo yes || echo no)" yes
check "builds" "$(built)" yes

echo "tracked graft/ is kept"
newrepo tracked; mkdir "$T/tracked/graft"; echo idx > "$T/tracked/graft/INDEX.md"
(cd "$T/tracked" && git add graft && git -c user.name=t -c user.email=t@t commit -qm x); run "$T/tracked"
check "graft/ kept" "$([ -d "$T/tracked/graft" ] && echo yes || echo no)" yes
check "no build" "$(built)" no

echo "graft/ that is not trail's map is kept"
newrepo foreign; mkdir "$T/foreign/graft"; echo y > "$T/foreign/graft/notes.txt"; run "$T/foreign"
check "graft/ kept" "$([ -d "$T/foreign/graft" ] && echo yes || echo no)" yes
check "no build" "$(built)" no

echo "not a repo root, and the home folder"
mkdir -p "$T/plain/sub"; run "$T/plain"
check "plain folder: no build" "$(built)" no
run "$T/fresh/.trail"
check "subfolder of a repo: no build" "$(built)" no
run "$HOME"
check "home: no build" "$(built)" no

echo "Copilot: folder comes from the cwd in stdin JSON"
newrepo copilot; : > "$T/builds.log"
printf '{"hook_event_name":"SessionStart","cwd":"%s","source":"new"}' "$T/copilot" | env -u CLAUDE_PROJECT_DIR sh "$SCRIPT"
i=0; while [ $i -lt 30 ] && [ ! -s "$T/builds.log" ]; do sleep 0.1; i=$((i + 1)); done
check "builds in that folder" "$([ -d "$T/copilot/.trail/cache" ] && echo yes || echo no)" yes

echo
if [ "$fail" -eq 0 ]; then echo "all passed"; else echo "$fail failed"; exit 1; fi
