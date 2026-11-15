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
assert_has "lists valid parts" "$OUT" "agentry trail context-mode config copilot"
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

# snap: files under HOME (no backups, .bak copies or the manifest) plus the canonical settings.json
snap() {
  (cd "$T/home" && find . -type f ! -path './.claude/backups/*' ! -name '*.bak-*' ! -path './.claude/agentry/*' | sort)
  [ ! -f "$T/home/.claude/settings.json" ] || node -e 'const o = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); const s = (v) => Array.isArray(v) ? v.map(s) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, s(v[k])])) : v; console.log(JSON.stringify(s(o)))' "$T/home/.claude/settings.json"
}
FULL="new_env x npm realnode git claude"

echo "uninstall: install, uninstall, install again"
$FULL
run --source "$REPO" install --all
FIRST="$(snap)"
run --source "$REPO" uninstall --all --yes
assert_eq "uninstall exit 0" "$RC" 0
assert_lacks "config removed" "$(snap)" "trail-autobuild.sh"
assert_lacks "trail wiring removed" "$(snap)" "graft-hooks"
assert_has "tools kept by default" "$OUT" "kept"
if [ -x "$T/bin/agentry" ]; then pass "tools still installed"; else fail "tools still installed"; fi
run --source "$REPO" install --all
assert_eq "same state as one install" "$(snap)" "$FIRST"
done_env

echo "uninstall: hand-made entries survive, backups are made"
$FULL
mkdir -p "$T/home/.claude"
printf '{"myKey":"x","hooks":{"Stop":[{"hooks":[{"type":"command","command":"mine"}]}]}}\n' > "$T/home/.claude/settings.json"
run --source "$REPO" install --all
assert_has "mcp added" "$(cat "$T/home/.claude/.claude.json")" context7
node -e 'const fs = require("fs"); const p = process.argv[1]; const o = JSON.parse(fs.readFileSync(p, "utf8")); o.mcpServers.mine = { command: "mine" }; fs.writeFileSync(p, JSON.stringify(o));' "$T/home/.claude/.claude.json"
run --source "$REPO" uninstall --all --yes
assert_eq "exit 0" "$RC" 0
assert_has "hand-made setting kept" "$(cat "$T/home/.claude/settings.json")" '"myKey"'
assert_has "hand-made hook kept" "$(cat "$T/home/.claude/settings.json")" '"mine"'
assert_has "hand-made MCP server kept" "$(cat "$T/home/.claude/.claude.json")" '"mine"'
assert_lacks "context7 removed" "$(cat "$T/home/.claude/.claude.json")" 'context7'
assert_eq "backup set exists" "$(find "$T/home/.claude/backups/agentry-setup" -mindepth 1 -maxdepth 1 | wc -l | tr -d ' ' | sed 's/^0$/none/;s/^[1-9][0-9]*$/some/')" "some"
done_env

echo "uninstall: dry run changes nothing"
$FULL
run --source "$REPO" install --all
BEFORE="$(snap)"
BEFORE_LOG="$(logged)"
run --source "$REPO" uninstall --all --dry-run
assert_eq "exit 0" "$RC" 0
assert_eq "state unchanged" "$(snap)" "$BEFORE"
assert_lacks "no uninstall commands ran" "$(logged | tail -n +"$(( $(printf '%s\n' "$BEFORE_LOG" | wc -l) + 1 ))")" "uninstall --yes"
assert_has "preview printed" "$OUT" "would remove"
done_env

echo "uninstall: not installed"
$FULL
rm -f "$T/bin/trail"
run --source "$REPO" uninstall --only trail
assert_eq "exit 0" "$RC" 0
assert_has "reports not installed" "$OUT" "not installed"
done_env

echo "uninstall: other agents wired by trail are left alone"
$FULL
run --source "$REPO" install --all
ENVX="FAKE_TRAIL_CODEX=1" run --source "$REPO" uninstall --only trail --yes
assert_eq "exit 0" "$RC" 0
assert_has "names the other agent file" "$OUT" ".codex/config.toml"
assert_has "trail wiring kept" "$(snap)" "graft-hooks"
done_env

echo "uninstall: tools"
$FULL
run --source "$REPO" install --all
run --source "$REPO" uninstall --all --yes --remove-tools
assert_eq "exit 0" "$RC" 0
assert_has "npm uninstall argv" "$(logged)" "npm uninstall -g @ersanyamarya/agentry-cli"
# removing the wiring must not forget the tool record of the same part
assert_has "trail CLI removed too" "$(logged)" "npm uninstall -g @trailhq/trail-code"
assert_has "context-mode CLI removed too" "$(logged)" "npm uninstall -g context-mode"
if [ ! -e "$T/bin/agentry" ]; then pass "agentry removed"; else fail "agentry removed"; fi
# trail's preview ends with a legend line naming [machine-wide]; it is not a path, so the wiring still goes
assert_lacks "trail wiring removed" "$(snap)" "graft-hooks"
assert_lacks "no foreign path reported" "$OUT" "Entries marked"
assert_eq "manifest empty" "$(node "$REPO/scripts/setup-manifest.mjs" --config "$T/home/.claude" show | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(Object.keys(JSON.parse(s).parts).join(",")))')" ""
done_env
new_env x mise npm realnode git claude
run --source "$REPO" install --all
run --source "$REPO" uninstall --all --yes --remove-tools
assert_has "mise unuse argv" "$(logged)" "mise unuse -g -y npm:@ersanyamarya/agentry-cli"
assert_has "mise unuse trail" "$(logged)" "mise unuse -g -y npm:@trailhq/trail-code"
assert_has "mise unuse context-mode" "$(logged)" "mise unuse -g -y npm:context-mode"
done_env
$FULL
run --source "$REPO" install --all
printf 'y\n' > "$T/ans"
ENVX="SETUP_TTY=$T/ans" run --source "$REPO" uninstall --all
assert_has "prompt answered yes removes tools" "$(logged)" "npm uninstall -g"
done_env
$FULL
run --source "$REPO" install --all
printf '\n' > "$T/ans"
ENVX="SETUP_TTY=$T/ans" run --source "$REPO" uninstall --all
assert_lacks "prompt default keeps tools" "$(logged)" "npm uninstall -g"
done_env

echo "uninstall: leftovers"
$FULL
run --source "$REPO" install --all
node -e 'const fs = require("fs"); const p = process.argv[1]; const o = JSON.parse(fs.readFileSync(p, "utf8")); o.extraKnownMarketplaces = { "context-mode": { source: { source: "directory", path: "/nonexistent/context-mode" } } }; o.enabledPlugins = {}; fs.writeFileSync(p, JSON.stringify(o));' "$T/home/.claude/settings.json"
run --source "$REPO" uninstall --all --yes --remove-tools
assert_eq "exit 0" "$RC" 0
assert_lacks "marketplace entry cleaned" "$(cat "$T/home/.claude/settings.json" 2>/dev/null)" "context-mode"
assert_eq "manifest and helpers folder gone" "$(find "$T/home/.claude" -path '*/agentry*' -o -path '*/helpers*' | grep -vc backups)" "0"
done_env
$FULL
run --source "$REPO" install --all
ENVX="FAKE_TRAIL_CODEX=1" run --source "$REPO" uninstall --all --yes --remove-tools
assert_eq "exit 0" "$RC" 0
assert_has "says it kept trail" "$OUT" "kept the trail CLI"
if [ -x "$T/bin/trail" ]; then pass "trail CLI kept"; else fail "trail CLI kept"; fi
if [ ! -x "$T/bin/agentry" ]; then pass "other CLIs removed"; else fail "other CLIs removed"; fi
done_env

echo "status"
$FULL
run --source "$REPO" install --all
run --source "$REPO" status
assert_eq "exit 0" "$RC" 0
assert_has "agentry installed" "$OUT" "agentry: installed"
assert_has "trail installed" "$OUT" "trail: installed"
assert_has "context-mode installed" "$OUT" "context-mode: installed"
assert_has "config installed" "$OUT" "config: installed"
run --source "$REPO" uninstall --only config --yes
run --source "$REPO" status
assert_has "config no longer installed" "$OUT" "config: missing"
rm -f "$T/home/.claude/helpers/graft-hooks.cjs"
run --source "$REPO" status
assert_has "trail partial when its files are gone" "$OUT" "trail: partial"
done_env

echo "menu: Uninstall, then Choose parts"
$FULL
run --source "$REPO" install --all
printf '4\n2\n4\n' > "$T/ans"
ENVX="SETUP_TTY=$T/ans" run --source "$REPO" --yes
assert_eq "exit 0" "$RC" 0
assert_lacks "config removed" "$(snap)" "trail-autobuild.sh"
assert_has "trail wiring remains" "$(snap)" "graft-hooks"
done_env

echo "copilot part"
new_env x npm realnode git claude
run --source "$REPO" install --only copilot
assert_has "skipped without copilot" "$OUT" "Copilot not found"
done_env
new_env x npm realnode git claude copilot
mkdir -p "$T/home/.copilot"
run --source "$REPO" install --only copilot
assert_eq "exit 0" "$RC" 0
assert_has "co-author setting added" "$(cat "$T/home/.copilot/settings.json")" '"includeCoAuthoredBy": false'
assert_has "context7 entry added" "$(cat "$T/home/.copilot/mcp-config.json")" "mcp.context7.com"
assert_eq "trail hook added" "$(cmp -s "$T/home/.copilot/hooks/trail-autobuild.json" "$REPO/global/copilot/hooks/trail-autobuild.json" && echo same)" same
assert_eq "context7 rule mirrored" "$(test -f "$T/home/.copilot/instructions/context7.instructions.md" && echo yes)" yes
run --source "$REPO" install --only copilot
assert_has "second run applied nothing" "$OUT" "already applied"
run --source "$REPO" status --only copilot
assert_has "status installed" "$OUT" "copilot: installed"
run --source "$REPO" uninstall --only copilot --yes
assert_eq "exit 0 on uninstall" "$RC" 0
assert_eq "rule removed" "$(test -f "$T/home/.copilot/instructions/context7.instructions.md" && echo yes || echo no)" no
assert_lacks "context7 entry removed" "$(cat "$T/home/.copilot/mcp-config.json")" "mcp.context7.com"
assert_lacks "co-author setting removed" "$(cat "$T/home/.copilot/settings.json")" "includeCoAuthoredBy"
run --source "$REPO" status --only copilot
assert_has "status missing after uninstall" "$OUT" "copilot: missing"
done_env

echo "copilot trusted folders"
new_env x npm realnode git claude copilot
mkdir -p "$T/home/.copilot"
printf '// managed automatically\n{\n  "host": "h"\n}\n' > "$T/home/.copilot/config.json"
run --source "$REPO" install --only copilot --yes --trust "$T/my repo"
assert_eq "exit 0" "$RC" 0
assert_has "folder with a space trusted" "$(cat "$T/home/.copilot/config.json")" "my repo"
assert_has "comment kept" "$(cat "$T/home/.copilot/config.json")" "// managed automatically"
run --source "$REPO" uninstall --only copilot --yes
assert_lacks "trust removed on uninstall" "$(cat "$T/home/.copilot/config.json")" "my repo"
assert_has "comment kept after uninstall" "$(cat "$T/home/.copilot/config.json")" "// managed automatically"
CFG_BEFORE="$(cat "$T/home/.copilot/config.json")"
run --source "$REPO" install --only copilot --yes
assert_eq "--yes without --trust adds nothing" "$(cat "$T/home/.copilot/config.json")" "$CFG_BEFORE"
run --source "$REPO" uninstall --only copilot --yes
printf '2\n5\n/tmp/typed one\n\n' > "$T/ans"
ENVX="SETUP_TTY=$T/ans" run --source "$REPO"
assert_has "menu answer adds typed folder" "$(cat "$T/home/.copilot/config.json")" "typed one"
run --source "$REPO" install --only copilot --yes --trust relative
assert_eq "relative --trust is a usage error" "$RC" 2
done_env

echo "---"
echo "$PASS passed, $FAILN failed"
[ "$FAILN" -eq 0 ]
