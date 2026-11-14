#!/bin/sh
# One implementation behind the fake agentry, trail and context-mode binaries. Usage: _tool.sh <name> args...
. "$(dirname "$0")/_common.sh"
name="$1"; shift
[ "$1" = "--version" ] && { echo "$name 1.0.0"; exit 0; }
fake_log "$name $*"
case "$name" in
  trail)
    if [ "$1" = init ]; then
      mkdir -p "$HOME/.claude/helpers" "$HOME/.claude/skills/trail" "$HOME/.trail" .trail
      : > "$HOME/.claude/helpers/graft-hooks.cjs"
      : > "$HOME/.claude/skills/trail/SKILL.md"
      printf '{"claudeDist":"%s"}\n' "$FAKE_BIN" > "$HOME/.trail/install.json"
      [ -f "$HOME/.claude/settings.json" ] || printf '{"hooks":{"Stop":[{"hooks":[{"type":"command","command":"node graft-hooks.cjs Stop"}]}]}}\n' > "$HOME/.claude/settings.json"
      echo '// fake statusline' > .trail/statusline.cjs
    fi
    if [ "$1" = uninstall ]; then
      apply=false
      for a in "$@"; do [ "$a" = "--yes" ] && apply=true; done
      echo "claude:"
      echo "  - would remove: $HOME/.claude/helpers/graft-hooks.cjs [machine-wide] (hooks shim (user level), deleted)"
      echo "  - would remove: $HOME/.claude/skills/trail/SKILL.md [machine-wide] (trail skill, deleted)"
      [ -z "${FAKE_TRAIL_CODEX:-}" ] || echo "  - would remove: $HOME/.codex/config.toml [machine-wide] (codex config)"
      if [ "$apply" = true ]; then
        rm -f "$HOME/.claude/helpers/graft-hooks.cjs" "$HOME/.trail/install.json"
        rm -rf "$HOME/.claude/skills/trail"
        grep -q 'graft-hooks.cjs' "$HOME/.claude/settings.json" 2>/dev/null && rm -f "$HOME/.claude/settings.json"
      else
        echo "Dry run: nothing was touched. Re-run with -y to remove."
      fi
    fi ;;
  context-mode)
    case "$1" in
      doctor)
        if [ -f "$FAKE_BIN/.cm-wired" ] && [ -z "${FAKE_CM_DOCTOR_FAIL:-}" ]; then
          echo '{"command":"doctor","exitCode":0,"agents":[{"id":"claude-code","status":"PASS"}]}'
        else
          echo '{"command":"doctor","exitCode":0,"agents":[{"id":"claude-code","status":"FAIL"}]}'
        fi ;;
      setup)
        case " $* " in
          *" --dry-run "*) echo "would remove context-mode wiring" ;;
          *" --remove "*) rm -f "$FAKE_BIN/.cm-wired" ;;
          *) touch "$FAKE_BIN/.cm-wired" ;;
        esac ;;
    esac ;;
  agentry)
    case "$1" in
      doctor) exit "${FAKE_AGENTRY_DOCTOR_EXIT:-0}" ;;
      --help)
        echo "  tui    Open the terminal UI"
        [ -n "${FAKE_AGENTRY_HELP_MIN:-}" ] || {
          echo "  ui    Serve the web UI"; echo "  catalog list  List"; echo "  shelf list  List"; echo "  shelf on <target>  Link"; } ;;
    esac ;;
esac
exit 0
