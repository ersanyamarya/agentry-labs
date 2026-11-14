#!/usr/bin/env bash
# Tests for scripts/setup.sh. Every case runs in a temp HOME with fakes on PATH. Run: bash scripts/test/setup.test.sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
FAKES="$HERE/fakes"
REAL_NODE="$(command -v node || true)"
PASS=0; FAILN=0

pass() { PASS=$((PASS + 1)); printf '  ok   %s\n' "$1"; }
fail() { FAILN=$((FAILN + 1)); printf '  FAIL %s\n' "$1"; [ -z "${2:-}" ] || printf '       %s\n' "$2"; }
assert_eq() { if [ "$2" = "$3" ]; then pass "$1"; else fail "$1" "expected [$3] got [$2]"; fi; }
assert_has() { case "$2" in *"$3"*) pass "$1" ;; *) fail "$1" "missing [$3] in: $(printf '%s' "$2" | head -c 400)" ;; esac; }
assert_lacks() { case "$2" in *"$3"*) fail "$1" "unexpected [$3]" ;; *) pass "$1" ;; esac; }

# new_env <name> [fakes...]: makes $T (temp root), $T/bin with the chosen fakes, HOME, TMPDIR, FAKE_LOG.
new_env() {
  T="$(mktemp -d)"
  mkdir -p "$T/bin" "$T/home/.claude" "$T/tmp"
  shift
  local f
  for f in "$@"; do
    if [ "$f" = realnode ]; then ln -s "$REAL_NODE" "$T/bin/node"; else cp "$FAKES/$f" "$T/bin/$f"; fi
  done
  cp "$FAKES/_common.sh" "$T/bin/_common.sh"
  : > "$T/log"
}
# run <args...>: runs setup.sh under this interpreter; sets OUT and RC. Extra env via ENVX (space separated KEY=VAL).
run() {
  # shellcheck disable=SC2086
  OUT="$(env -i HOME="$T/home" CLAUDE_CONFIG_DIR="$T/home/.claude" PATH="$T/bin:/usr/bin:/bin" TMPDIR="$T/tmp" \
    FAKE_LOG="$T/log" FAKE_BIN="$T/bin" LANG=C ${ENVX:-} "$BASH" "$REPO/scripts/setup.sh" "$@" </dev/null 2>&1)"
  RC=$?
}
logged() { cat "$T/log"; }
done_env() { rm -rf "$T"; }
run_with_deadline() { # seconds cmd...  (macOS has no timeout)
  perl -e 'alarm shift; exec @ARGV' "$@"
}

MISE_PKGS="npm:@ersanyamarya/agentry-cli@latest npm:@trailhq/trail-code@latest npm:context-mode@latest"
NPM_PKGS="@ersanyamarya/agentry-cli@latest @trailhq/trail-code@latest context-mode@latest"

echo "mise present"
new_env x mise npm node git
run --source "$REPO" install --all
assert_eq "exit 0" "$RC" 0
assert_has "mise use argv" "$(logged)" "mise use -g $MISE_PKGS"
assert_lacks "npm not used" "$(logged)" "npm install"
echo "second run: already installed"
: > "$T/log"
run --source "$REPO" install --all
assert_has "reports already installed" "$OUT" "already installed"
assert_eq "no installer calls" "$(logged)" ""
done_env

echo "mise absent, npm present"
new_env x npm node git
run --source "$REPO" install --all
assert_eq "exit 0" "$RC" 0
assert_has "npm install argv" "$(logged)" "npm install -g $NPM_PKGS"
done_env

echo "neither present"
new_env x
run --source "$REPO" install --all
assert_eq "exit 1" "$RC" 1
assert_has "names Node 24.15" "$OUT" "Node 24.15"
done_env

echo "old node"
new_env x npm node git
ENVX="FAKE_NODE_VERSION=v24.14.0" run --source "$REPO" install --all
assert_eq "exit 1" "$RC" 1
assert_eq "nothing installed" "$(logged)" ""
done_env

echo "dry run"
new_env x mise npm node git
BEFORE="$(find "$T/home" | sort)"
run --source "$REPO" install --all --dry-run
assert_eq "exit 0" "$RC" 0
assert_eq "fake log empty" "$(logged)" ""
assert_eq "HOME unchanged" "$(find "$T/home" | sort)" "$BEFORE"
assert_has "prints the command" "$OUT" "mise use -g"
done_env

echo "no color"
new_env x npm node git
ENVX="NO_COLOR=1" run --source "$REPO" install --all
assert_lacks "NO_COLOR: no escape bytes" "$OUT" "$(printf '\033')"
run --source "$REPO" install --all --no-color
assert_lacks "--no-color: no escape bytes" "$OUT" "$(printf '\033')"
done_env

echo "failing npm"
new_env x npm node git
ENVX="FAKE_NPM_FAIL=1" run --source "$REPO" install --all
assert_eq "exit 1" "$RC" 1
assert_has "names the step" "$OUT" "Failed at step"
assert_has "re-run hint" "$OUT" "re-run"
assert_lacks "stopped before later steps" "$OUT" "[4/8]"
done_env

echo "usage errors"
new_env x npm node git
run --only bogus
assert_eq "bogus part: exit 2" "$RC" 2
assert_has "lists valid parts" "$OUT" "agentry trail context-mode config"
ENVX="SETUP_TTY=$T/none" run
assert_eq "no tty no args: exit 2" "$RC" 2
assert_has "bash -s hint" "$OUT" "bash -s -- install --all --yes"
done_env

echo "menu"
new_env x mise npm node git
printf '1\n' > "$T/ans"
ENVX="SETUP_TTY=$T/ans" run --source "$REPO"
assert_eq "install everything: exit 0" "$RC" 0
assert_has "install everything: all packages" "$(logged)" "mise use -g $MISE_PKGS"
done_env
new_env x mise npm node git
printf '2\n1 3\n' > "$T/ans"
ENVX="SETUP_TTY=$T/ans" run --source "$REPO"
assert_eq "choose parts: exit 0" "$RC" 0
assert_has "choose parts: agentry and context-mode only" "$(logged)" "mise use -g npm:@ersanyamarya/agentry-cli@latest npm:context-mode@latest"
assert_lacks "choose parts: no trail" "$(logged)" "trail-code"
done_env
new_env x mise npm node git
printf '5\n' > "$T/ans"
ENVX="SETUP_TTY=$T/ans" run --source "$REPO"
assert_eq "quit: exit 0" "$RC" 0
assert_eq "quit: no installs" "$(logged)" ""
done_env

echo "temp clone cleanup"
new_env x npm node git
run install --all
assert_eq "success: exit 0" "$RC" 0
assert_has "cloned" "$(logged)" "git clone --depth 1"
assert_eq "success: tmp empty" "$(ls -A "$T/tmp")" ""
: > "$T/log"
rm -f "$T/bin/agentry" "$T/bin/trail" "$T/bin/context-mode"
ENVX="FAKE_NPM_FAIL=1" run install --all
assert_eq "failure: exit 1" "$RC" 1
assert_eq "failure: tmp empty" "$(ls -A "$T/tmp")" ""
rm -f "$T/bin/agentry" "$T/bin/trail" "$T/bin/context-mode"
# INT: the child must run with SIGINT at its default, or bash ignores the trap.
# shellcheck disable=SC2016
env -i HOME="$T/home" CLAUDE_CONFIG_DIR="$T/home/.claude" PATH="$T/bin:/usr/bin:/bin" TMPDIR="$T/tmp" FAKE_LOG="$T/log" \
  FAKE_BIN="$T/bin" FAKE_NPM_SLEEP=2 LANG=C \
  run_with_deadline 20 perl -e '$SIG{INT}="DEFAULT"; exec @ARGV' "$BASH" "$REPO/scripts/setup.sh" install --all >/dev/null 2>&1 </dev/null &
PID=$!
sleep 1
kill -INT "$PID" 2>/dev/null
wait "$PID" 2>/dev/null
assert_eq "INT: tmp empty" "$(ls -A "$T/tmp")" ""
done_env

echo "---"
echo "$PASS passed, $FAILN failed"
[ "$FAILN" -eq 0 ]
