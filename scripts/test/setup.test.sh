#!/usr/bin/env bash
# Tests for scripts/setup.sh. Every case runs in a temp HOME with fakes on PATH. Run: bash scripts/test/setup.test.sh
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
FAKES="$HERE/fakes"
REAL_NODE="$(node -p process.execPath 2>/dev/null || command -v node)" # not the mise shim: it hangs under a fake HOME
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
  cp "$FAKES/_common.sh" "$FAKES/_tool.sh" "$T/bin/"
  : > "$T/log"
}
# run <args...>: runs setup.sh under this interpreter; sets OUT and RC. Extra env via ENVX (space separated KEY=VAL).
run() {
  # shellcheck disable=SC2086
  OUT="$(env -i HOME="$T/home" CLAUDE_CONFIG_DIR="$T/home/.claude" PATH="$T/bin:/usr/bin:/bin" TMPDIR="$T/tmp" \
    FAKE_LOG="$T/log" FAKE_BIN="$T/bin" FAKE_REPO="$REPO" LANG=C ${ENVX:-} "$BASH" "$REPO/scripts/setup.sh" "$@" </dev/null 2>&1)"
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
new_env x mise npm realnode git claude
run --source "$REPO" install --all
assert_eq "exit 0" "$RC" 0
assert_has "mise use argv" "$(logged)" "mise use -g $MISE_PKGS"
assert_lacks "npm not used" "$(logged)" "npm install"
echo "second run: already installed"
: > "$T/log"
run --source "$REPO" install --all
assert_has "reports already installed" "$OUT" "already installed"
assert_lacks "no installer calls" "$(logged)" "mise use"
done_env

echo "mise absent, npm present"
new_env x npm realnode git claude
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
new_env x mise npm realnode git claude
BEFORE="$(find "$T/home" | sort)"
run --source "$REPO" install --all --dry-run
assert_eq "exit 0" "$RC" 0
assert_eq "fake log empty" "$(logged)" ""
assert_eq "HOME unchanged" "$(find "$T/home" | sort)" "$BEFORE"
assert_has "prints the command" "$OUT" "mise use -g"
done_env

echo "no color"
new_env x npm realnode git claude
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
new_env x mise npm realnode git claude
printf '1\n' > "$T/ans"
ENVX="SETUP_TTY=$T/ans" run --source "$REPO"
assert_eq "install everything: exit 0" "$RC" 0
assert_has "install everything: all packages" "$(logged)" "mise use -g $MISE_PKGS"
done_env
new_env x mise npm realnode git claude
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
new_env x npm realnode git claude
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
  FAKE_BIN="$T/bin" FAKE_REPO="$REPO" FAKE_NPM_SLEEP=2 LANG=C \
  run_with_deadline 20 perl -e '$SIG{INT}="DEFAULT"; exec @ARGV' "$BASH" "$REPO/scripts/setup.sh" install --all >/dev/null 2>&1 </dev/null &
PID=$!
sleep 1
kill -INT "$PID" 2>/dev/null
wait "$PID" 2>/dev/null
assert_eq "INT: tmp empty" "$(ls -A "$T/tmp")" ""
done_env

echo "full install with wiring"
new_env x npm realnode git claude
run --source "$REPO" install --all
assert_eq "exit 0" "$RC" 0
L="$(logged)"
assert_has "context-mode setup argv" "$L" "context-mode setup --yes --no-input --agents claude-code"
assert_has "trail init argv" "$L" "trail init --agents claude --no-build"
CM_LINE="$(printf '%s\n' "$L" | grep -n 'context-mode setup' | head -1 | cut -d: -f1)"
TR_LINE="$(printf '%s\n' "$L" | grep -n 'trail init' | head -1 | cut -d: -f1)"
if [ "$CM_LINE" -lt "$TR_LINE" ]; then pass "context-mode wired before trail"; else fail "wiring order" "$CM_LINE vs $TR_LINE"; fi
assert_eq "scratch gone" "$(ls -A "$T/tmp")" ""
STRAY="$(cd "$T/home" && find . -maxdepth 1 -mindepth 1 | sort | tr "\n" " ")"
assert_eq "nothing stray in HOME" "$STRAY" "./.claude ./.trail "
assert_eq "statusline copied" "$(cat "$T/home/.claude/helpers/trail-statusline.cjs")" "// fake statusline"
assert_has "config applied" "$(cat "$T/home/.claude/settings.json")" "trail-autobuild.sh"
assert_has "verify ran agentry doctor" "$L" "agentry doctor"
assert_lacks "scan skipped without ~/ws" "$L" "agentry scan"
assert_has "scan skipped message" "$OUT" "no ~/ws"
assert_has "next step: tui" "$OUT" "agentry tui"
echo "second run: wired and applied"
run --source "$REPO" install --all
assert_eq "exit 0" "$RC" 0
assert_has "context-mode already wired" "$OUT" "already wired"
assert_has "config already applied" "$OUT" "already applied"
assert_eq "trail init ran once" "$(logged | grep -c 'trail init')" 1
done_env

echo "verify failures and scan"
new_env x npm realnode git claude
mkdir -p "$T/home/ws"
ENVX="FAKE_AGENTRY_DOCTOR_EXIT=1" run --source "$REPO" install --all
assert_eq "failing doctor: exit 1" "$RC" 1
assert_has "names the failed check" "$OUT" "agentry doctor"
assert_has "scan ran with ~/ws" "$(logged)" "agentry scan"
done_env

echo "claude missing"
new_env x npm realnode git
run --source "$REPO" install --all
assert_eq "exit 1" "$RC" 1
assert_has "names Claude Code" "$OUT" "Claude Code"
done_env

echo "next steps follow agentry --help"
new_env x npm realnode git claude
ENVX="FAKE_AGENTRY_HELP_MIN=1" run --source "$REPO" install --all
assert_has "lists tui" "$OUT" "agentry tui"
assert_lacks "omits catalog list" "$OUT" "agentry catalog list"
done_env

echo "---"
echo "$PASS passed, $FAILN failed"
[ "$FAILN" -eq 0 ]
