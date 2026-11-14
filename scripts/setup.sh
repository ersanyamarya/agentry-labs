#!/usr/bin/env bash
# shellcheck disable=SC2034,SC2329
# agentry-labs machine setup: installs agentry, trail and context-mode, then wires them.
# Runs on macOS /bin/bash 3.2 and Linux bash. Run with --help for usage.
set -euo pipefail

REPO_URL="${AGENTRY_LABS_REPO_URL:-https://github.com/ersanyamarya/agentry-labs.git}"
UTILS_URL="${AGENTRY_LABS_UTILS_URL:-https://raw.githubusercontent.com/ersanyamarya/agentry-labs/main/scripts/utils.sh}"
SETUP_URL="https://raw.githubusercontent.com/ersanyamarya/agentry-labs/main/scripts/setup.sh"
ALL_PARTS="agentry trail context-mode config"
MIN_NODE="24.15.0"

usage() {
  cat <<EOF
agentry-labs setup: install agentry, trail and context-mode, then wire them for Claude Code.

Usage:
  curl -sSL $SETUP_URL | bash
  curl -sSL $SETUP_URL | bash -s -- install --all --yes
  bash scripts/setup.sh [install|uninstall|status] [options]

Commands:
  install      Install the selected parts (default when options are given)
  uninstall    Remove what install added
  status       Show what is installed

Parts (--only, repeatable):
  agentry        the agentry CLI (npm: @ersanyamarya/agentry-cli)
  trail          the trail code-map CLI (npm: @trailhq/trail-code)
  context-mode   the context-mode plugin CLI (npm: context-mode)
  config         user-level rules, settings, hooks, status line and MCP entry

Options:
  --all            all four parts
  --only <part>    one part; repeat for several
  --yes            never ask questions
  --dry-run        show what would happen, change nothing
  --no-color       plain output (NO_COLOR is honored too)
  --remove-tools   uninstall also removes the CLIs
  --source <dir>   use this checkout instead of cloning (config part)
  -h, --help       this text

With no arguments on a terminal, a menu opens. Tools install at @latest through mise if it is on PATH, else npm.
Test hook: SETUP_TTY=<file> answers the menu from a file instead of /dev/tty.
EOF
}

# ---------- argument parsing (before any colored output) ----------
ORIG_ARGS="$*"
CMD=""
SEL=""
YES=false
DRY_RUN=false
REMOVE_TOOLS=false
SOURCE_DIR=""

die_usage() {
  printf '%s\n' "setup.sh: $*" >&2
  printf '%s\n' "Run with --help for usage." >&2
  exit 2
}

valid_part() {
  case " $ALL_PARTS " in *" $1 "*) return 0 ;; esac
  return 1
}

add_part() {
  valid_part "$1" || die_usage "unknown part '$1'. Valid parts: $ALL_PARTS"
  case " $SEL " in *" $1 "*) ;; *) SEL="$SEL $1" ;; esac
}

while [ $# -gt 0 ]; do
  case "$1" in
    install | uninstall | status)
      [ -z "$CMD" ] || die_usage "only one command allowed"
      CMD="$1" ;;
    --all) for p in $ALL_PARTS; do add_part "$p"; done ;;
    --only)
      [ $# -ge 2 ] || die_usage "--only needs a part"
      add_part "$2"; shift ;;
    --yes) YES=true ;;
    --dry-run) DRY_RUN=true ;;
    --no-color) export SETUP_NO_COLOR=1 ;;
    --remove-tools) REMOVE_TOOLS=true ;;
    --source)
      [ $# -ge 2 ] || die_usage "--source needs a directory"
      SOURCE_DIR="$2"; shift ;;
    -h | --help) usage; exit 0 ;;
    *) die_usage "unknown argument '$1'" ;;
  esac
  shift
done

# ---------- scratch space and cleanup ----------
TMP_ROOT=""
cleanup() {
  if [ -n "$TMP_ROOT" ] && [ -d "$TMP_ROOT" ]; then rm -rf "$TMP_ROOT"; fi
}
trap cleanup EXIT
trap 'cleanup; exit 130' INT
trap 'cleanup; exit 143' TERM

make_tmp() {
  [ -n "$TMP_ROOT" ] || TMP_ROOT="$(mktemp -d)"
}

# ---------- logging helpers (utils.sh) ----------
if [ -n "$SOURCE_DIR" ] && [ -f "$SOURCE_DIR/scripts/utils.sh" ]; then
  # shellcheck disable=SC1091
  . "$SOURCE_DIR/scripts/utils.sh"
elif [ -f "$(dirname "${BASH_SOURCE[0]:-$0}")/utils.sh" ]; then
  # shellcheck disable=SC1091
  . "$(dirname "${BASH_SOURCE[0]:-$0}")/utils.sh"
else
  command -v curl >/dev/null 2>&1 || { printf '%s\n' "curl is required to download utils.sh." >&2; exit 1; }
  make_tmp
  curl -fsSL "$UTILS_URL" -o "$TMP_ROOT/utils.sh" </dev/null || { printf '%s\n' "Could not download utils.sh from $UTILS_URL" >&2; exit 1; }
  # shellcheck disable=SC1091
  . "$TMP_ROOT/utils.sh"
fi

say() { printf '%b\n' "$*"; }
dim() { printf '%b\n' "${DIM}$*${NC}"; }

# ---------- tool facts ----------
pkg_of() {
  case "$1" in
    agentry) echo "@ersanyamarya/agentry-cli" ;;
    trail) echo "@trailhq/trail-code" ;;
    context-mode) echo "context-mode" ;;
  esac
}
bin_of() { echo "$1"; }
is_tool() { case "$1" in agentry | trail | context-mode) return 0 ;; esac; return 1; }
has_part() { case " $SEL " in *" $1 "*) return 0 ;; esac; return 1; }
selected_tools() {
  local out="" p
  for p in agentry trail context-mode; do has_part "$p" && out="$out $p"; done
  echo "$out"
}

ver_ge() { # ver_ge 24.15.1 24.15.0 -> 0 when $1 >= $2
  local IFS=. a b i
  # shellcheck disable=SC2206
  a=($1) b=($2)
  for i in 0 1 2; do
    local x="${a[$i]:-0}" y="${b[$i]:-0}"
    [ "$x" -gt "$y" ] && return 0
    [ "$x" -lt "$y" ] && return 1
  done
  return 0
}

# ---------- step engine ----------
STEP_TITLE=(); STEP_CHG=(); STEP_FN=()
STEP_REASON=""
N_DONE=0; N_SKIP=0; N_FAIL=0
MANAGER=""

add_step() { # title, changes text, function
  STEP_TITLE[${#STEP_TITLE[@]}]="$1"
  STEP_CHG[${#STEP_CHG[@]}]="$2"
  STEP_FN[${#STEP_FN[@]}]="$3"
}

show_cmd() { dim "    \$ $*"; }

# Prints the command; runs it unless --dry-run. Returns the command's status.
exec_cmd() {
  show_cmd "$@"
  [ "$DRY_RUN" = true ] && return 0
  "$@" </dev/null
}

print_plan() {
  local total=${#STEP_TITLE[@]} i
  say "${BOLD}Plan${NC} ($total steps)"
  [ "$DRY_RUN" = true ] && say "${YELLOW}dry run: nothing will be changed${NC}"
  for ((i = 0; i < total; i++)); do
    say "  $((i + 1)). ${STEP_TITLE[$i]}  ${DIM}(changes: ${STEP_CHG[$i]})${NC}"
  done
  say ""
}

run_steps() {
  local total=${#STEP_TITLE[@]} i rc
  for ((i = 0; i < total; i++)); do
    say "${BLUE}${BOLD}[$((i + 1))/$total]${NC} ${BOLD}${STEP_TITLE[$i]}${NC}"
    dim "    changes: ${STEP_CHG[$i]}"
    STEP_REASON=""
    if "${STEP_FN[$i]}"; then rc=0; else rc=$?; fi
    case "$rc" in
      0) N_DONE=$((N_DONE + 1)); say "    ${GREEN}${G_OK} done${NC}" ;;
      3) N_SKIP=$((N_SKIP + 1)); say "    ${YELLOW}${G_SKIP} skipped: ${STEP_REASON:-nothing to do}${NC}" ;;
      *)
        N_FAIL=$((N_FAIL + 1))
        say "    ${RED}${G_FAIL} failed${NC}"
        say ""
        say "${RED}Failed at step $((i + 1)): ${STEP_TITLE[$i]}.${NC} Fix the error above, then re-run: bash setup.sh $ORIG_ARGS"
        summary
        return 1 ;;
    esac
  done
  summary
}

summary() {
  say ""
  say "${BOLD}Summary${NC}: $N_DONE done, $N_SKIP skipped, $N_FAIL failed"
}

# ---------- install steps ----------
step_prereqs() {
  local missing="" v
  command -v node >/dev/null 2>&1 || missing="$missing node"
  command -v npm >/dev/null 2>&1 || missing="$missing npm"
  if [ -n "$missing" ]; then
    say "    ${RED}Missing:${NC}$missing"
    say "    Install Node $MIN_NODE or newer (or mise), then run this again."
    return 1
  fi
  v="$(node --version </dev/null)"; v="${v#v}"
  if ! ver_ge "$v" "$MIN_NODE"; then
    say "    ${RED}Node $v is too old.${NC} Install Node $MIN_NODE or newer (or mise), then run this again."
    return 1
  fi
  say "    node $v, npm $(command -v mise >/dev/null 2>&1 && echo "(mise found: will use it)" || echo "(no mise: will use npm)")"
  if [ -z "$SOURCE_DIR" ] && has_part config && ! command -v git >/dev/null 2>&1; then
    say "    ${RED}git is required to clone the repo.${NC} Install git or pass --source <dir>."
    return 1
  fi
  return 0
}

step_tools() {
  local tools t specs="" all_present=true
  tools="$(selected_tools)"
  if [ -z "$tools" ]; then STEP_REASON="no tools selected"; return 3; fi
  for t in $tools; do
    specs="$specs $(pkg_of "$t")@latest"
    command -v "$(bin_of "$t")" >/dev/null 2>&1 || all_present=false
  done
  if command -v mise >/dev/null 2>&1; then MANAGER="mise"; else MANAGER="npm"; fi
  if [ "$all_present" = true ]; then STEP_REASON="already installed"; return 3; fi
  local pkgs=""
  for t in $tools; do pkgs="$pkgs npm:$(pkg_of "$t")@latest"; done
  if [ "$MANAGER" = "mise" ]; then
    # shellcheck disable=SC2086
    exec_cmd mise use -g $pkgs || return 1
  else
    # shellcheck disable=SC2086
    exec_cmd npm install -g $specs || return 1
  fi
  if [ "$DRY_RUN" = true ]; then STEP_REASON="dry run"; return 3; fi
  for t in $tools; do
    if "$(bin_of "$t")" --version </dev/null >/dev/null 2>&1; then
      say "    $t $("$(bin_of "$t")" --version </dev/null 2>&1 | head -1)"
    else
      say "    ${RED}$t is not on PATH after install.${NC} Open a new shell or check $MANAGER's bin directory."
      return 1
    fi
  done
  return 0
}

step_fetch_source() {
  if ! has_part config; then STEP_REASON="not needed without the config part"; return 3; fi
  if [ -n "$SOURCE_DIR" ]; then STEP_REASON="using --source $SOURCE_DIR"; return 3; fi
  if [ "$DRY_RUN" = true ]; then
    show_cmd git clone --depth 1 "$REPO_URL" "<temp dir>"
    STEP_REASON="dry run"; return 3
  fi
  make_tmp
  exec_cmd git clone --depth 1 "$REPO_URL" "$TMP_ROOT/repo" || return 1
  SOURCE_DIR="$TMP_ROOT/repo"
}

stub() { STEP_REASON="not implemented yet"; return 3; }
step_wire_context_mode() { has_part context-mode || { STEP_REASON="not selected"; return 3; }; stub; }
step_wire_trail() { has_part trail || { STEP_REASON="not selected"; return 3; }; stub; }
step_apply_config() { has_part config || { STEP_REASON="not selected"; return 3; }; stub; }
step_manifest() { stub; }
step_verify() { stub; }

build_install_steps() {
  add_step "Check prerequisites" "nothing" step_prereqs
  add_step "Fetch repo" "a temporary clone, removed when setup ends" step_fetch_source
  add_step "Install tools ($(selected_tools | sed 's/^ //;s/ /, /g'))" "global npm or mise packages" step_tools
  add_step "Wire context-mode" "Claude Code plugin registration" step_wire_context_mode
  add_step "Wire trail" "<config>/ hooks and skill" step_wire_trail
  add_step "Apply config" "<config>/ rules, settings, helpers, MCP entry" step_apply_config
  add_step "Write manifest" "<config>/agentry/install-manifest.json" step_manifest
  add_step "Verify" "nothing" step_verify
}

next_steps() {
  say ""
  say "${BOLD}Next steps${NC}"
  say "  ${G_ARROW} Open a new Claude Code session."
  say "  ${G_ARROW} Pick skill bundles with ${BOLD}agentry tui${NC} (terminal UI) or ${BOLD}agentry ui${NC} (web UI)."
}

do_install() {
  [ -n "$SEL" ] || die_usage "choose parts with --all or --only <part>"
  build_install_steps
  print_plan
  run_steps || return 1
  [ "$DRY_RUN" = true ] || next_steps
}

do_status() {
  say "${BOLD}Status${NC}"
  local p v
  for p in agentry trail context-mode; do
    if command -v "$(bin_of "$p")" >/dev/null 2>&1; then
      v="$("$(bin_of "$p")" --version </dev/null 2>&1 | head -1)"
      say "  ${GREEN}${G_OK}${NC} $p $v"
    else
      say "  ${YELLOW}${G_SKIP}${NC} $p missing"
    fi
  done
}

do_uninstall() {
  say "${YELLOW}uninstall is not implemented yet.${NC}"
  return 1
}

# ---------- menu ----------
tty_ok() {
  local t="${SETUP_TTY:-/dev/tty}"
  [ -r "$t" ] && (: <"$t") 2>/dev/null
}

ask() { # prompt -> sets ANSWER from the menu stream (fd 3)
  printf '%s' "$1" >&2
  ANSWER=""
  IFS= read -r ANSWER <&3 || ANSWER="5"
}

pick_parts() { # prompt; sets SEL from numbers like "1 3"
  local i=1 p n
  for p in $ALL_PARTS; do say "  $i) $p"; i=$((i + 1)); done
  ask "Parts (numbers, e.g. 1 3): "
  SEL=""
  for n in $ANSWER; do
    i=1
    for p in $ALL_PARTS; do
      [ "$i" = "$n" ] && add_part "$p"
      i=$((i + 1))
    done
  done
  [ -n "$SEL" ] || { say "${RED}No parts chosen.${NC}"; return 1; }
}

run_menu() {
  exec 3<"${SETUP_TTY:-/dev/tty}"
  say "${BOLD}agentry-labs setup${NC}"
  say "  1) Install everything"
  say "  2) Choose parts"
  say "  3) Status"
  say "  4) Uninstall"
  say "  5) Quit"
  ask "Choice [1-5]: "
  case "$ANSWER" in
    1) CMD=install; for p in $ALL_PARTS; do add_part "$p"; done; do_install ;;
    2) CMD=install; pick_parts || return 2; do_install ;;
    3) do_status ;;
    4) do_uninstall ;;
    5 | "") say "Bye." ;;
    *) say "${RED}Not a choice: $ANSWER${NC}"; return 2 ;;
  esac
}

# ---------- main ----------
main() {
  if [ -z "$CMD" ] && [ -z "$SEL" ]; then
    if tty_ok; then run_menu; return $?; fi
    say "No terminal for the menu. Pass arguments, for example:"
    say "  curl -sSL $SETUP_URL | bash -s -- install --all --yes"
    return 2
  fi
  [ -n "$CMD" ] || CMD=install
  case "$CMD" in
    install) do_install ;;
    uninstall) do_uninstall ;;
    status) do_status ;;
  esac
}

rc=0
main || rc=$?
exit "$rc"
