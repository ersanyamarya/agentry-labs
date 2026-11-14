#!/usr/bin/env bash
# shellcheck disable=SC2034,SC2153,SC2329
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
TOOLS_INSTALLED=""
CM_RAN=false
TRAIL_KEPT=false
TRAIL_RAN=false
CONFIG_RAN=false

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
  if [ -z "$SOURCE_DIR" ] && ! command -v git >/dev/null 2>&1; then
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
  TOOLS_INSTALLED="$tools"
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

# Clones the repo into the scratch dir unless --source was given. Sets SOURCE_DIR.
ensure_source() {
  [ -z "$SOURCE_DIR" ] || return 0
  make_tmp
  exec_cmd git clone --depth 1 "$REPO_URL" "$TMP_ROOT/repo" || return 1
  SOURCE_DIR="$TMP_ROOT/repo"
}

step_fetch_source() {
  if [ -n "$SOURCE_DIR" ]; then STEP_REASON="using --source $SOURCE_DIR"; return 3; fi
  if [ "$DRY_RUN" = true ]; then
    show_cmd git clone --depth 1 "$REPO_URL" "<temp dir>"
    STEP_REASON="dry run"; return 3
  fi
  ensure_source
}

stub() { STEP_REASON="not implemented yet"; return 3; }

config_dir() { echo "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"; }

# True when context-mode's own doctor reports PASS for claude-code (its exit code is 0 even when claude is missing).
cm_wired() {
  context-mode doctor --json --no-input --agents claude-code </dev/null 2>/dev/null | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try { process.exit(JSON.parse(s).agents.some((a) => a.id === "claude-code" && a.status === "PASS") ? 0 : 1); }
      catch { process.exit(1); }
    });'
}

# True when trail's user-level files exist and its recorded dist folder is still there (the statusline needs it).
trail_wired() {
  [ -f "$HOME/.claude/helpers/graft-hooks.cjs" ] && [ -f "$HOME/.claude/skills/trail/SKILL.md" ] \
    && [ -f "$(config_dir)/helpers/trail-statusline.cjs" ] || return 1
  node -e 'const fs = require("fs"); process.exit(fs.existsSync(JSON.parse(fs.readFileSync(process.argv[1], "utf8")).claudeDist) ? 0 : 1)' \
    "$HOME/.trail/install.json" 2>/dev/null
}

step_wire_context_mode() {
  has_part context-mode || { STEP_REASON="not selected"; return 3; }
  if ! command -v claude >/dev/null 2>&1; then
    say "    ${RED}Claude Code (claude) is not on PATH.${NC} Install Claude Code first, then run this again."
    return 1
  fi
  if cm_wired; then STEP_REASON="already wired"; return 3; fi
  exec_cmd context-mode setup --yes --no-input --agents claude-code || return 1
  [ "$DRY_RUN" = true ] && { STEP_REASON="dry run"; return 3; }
  CM_RAN=true
  return 0
}

step_wire_trail() {
  has_part trail || { STEP_REASON="not selected"; return 3; }
  if trail_wired; then STEP_REASON="already wired"; return 3; fi
  make_tmp
  local scratch="$TMP_ROOT/scratch" settings="$HOME/.claude/settings.json"
  show_cmd "cd <scratch dir> && DO_NOT_TRACK=1 trail init --agents claude --no-build"
  if [ "$DRY_RUN" = true ]; then STEP_REASON="dry run"; return 3; fi
  mkdir -p "$scratch"
  if [ -f "$settings" ]; then cp "$settings" "$TMP_ROOT/settings.before.json"; else echo '{}' > "$TMP_ROOT/settings.before.json"; fi
  (cd "$scratch" && DO_NOT_TRACK=1 trail init --agents claude --no-build </dev/null) || return 1
  if [ -f "$HOME/.claude/settings.json" ]; then cp "$HOME/.claude/settings.json" "$TMP_ROOT/settings.after.json"; fi
  if [ -f "$scratch/.trail/statusline.cjs" ]; then
    mkdir -p "$(config_dir)/helpers"
    cp "$scratch/.trail/statusline.cjs" "$(config_dir)/helpers/trail-statusline.cjs"
    say "    status line script copied to $(config_dir)/helpers/trail-statusline.cjs"
  fi
  TRAIL_RAN=true
  return 0
}

step_apply_config() {
  has_part config || { STEP_REASON="not selected"; return 3; }
  if [ -z "$SOURCE_DIR" ]; then STEP_REASON="dry run: repo not cloned"; return 3; fi
  command -v node >/dev/null 2>&1 || { say "    ${RED}node is required.${NC}"; return 1; }
  make_tmp
  local out rc=0 flag="--write"
  [ "$DRY_RUN" = true ] && flag=""
  show_cmd node "$SOURCE_DIR/scripts/apply-global.mjs" "${flag:-(preview)}" --report "$TMP_ROOT/apply-report.json"
  # shellcheck disable=SC2086
  out="$(node "$SOURCE_DIR/scripts/apply-global.mjs" $flag --report "$TMP_ROOT/apply-report.json" </dev/null 2>&1)" || rc=$?
  printf '%s\n' "$out" | sed 's/^/    /'
  [ "$rc" -eq 0 ] || return 1
  case "$out" in *"Nothing to add."*) STEP_REASON="already applied"; return 3 ;; esac
  [ "$DRY_RUN" = true ] && { STEP_REASON="dry run"; return 3; }
  CONFIG_RAN=true
  return 0
}

# ---------- manifest ----------
mf() { node "$SOURCE_DIR/scripts/setup-manifest.mjs" --config "$(config_dir)" "$@"; }
manifest_file() { echo "$(config_dir)/agentry/install-manifest.json"; }
# manifest_get <part> <dotted.key>: prints the value, or nothing
manifest_get() {
  [ -f "$(manifest_file)" ] || return 0
  node -e 'const fs = require("fs"); const m = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); let v = m.parts[process.argv[2]];
    for (const k of process.argv[3] ? process.argv[3].split(".") : []) v = v == null ? v : v[k];
    if (v != null) console.log(typeof v === "object" ? JSON.stringify(v) : v);' "$(manifest_file)" "$1" "${2:-}" 2>/dev/null || true
}
manifest_has() { [ -n "$(manifest_get "$1" "${2:-}")" ]; } # <part> [dotted.key]

step_manifest() {
  if [ "$DRY_RUN" = true ]; then STEP_REASON="dry run"; return 3; fi
  [ -n "$SOURCE_DIR" ] || { STEP_REASON="no repo source"; return 3; }
  command -v node >/dev/null 2>&1 || { STEP_REASON="node missing"; return 3; }
  make_tmp
  local changed=false t pkg f="$TMP_ROOT/record.json"
  for t in $TOOLS_INSTALLED; do
    pkg="$(pkg_of "$t")"
    printf '{"tools":{"manager":"%s","packages":{"%s":"latest"}}}\n' "$MANAGER" "$pkg" > "$f"
    mf record "$t" "$f" || return 1
    say "    recorded $t ($MANAGER)"; changed=true
  done
  if [ "$CONFIG_RAN" = true ] && [ -f "$TMP_ROOT/apply-report.json" ]; then
    mf record config "$TMP_ROOT/apply-report.json" || return 1
    say "    recorded config"; changed=true
  fi
  if [ "$TRAIL_RAN" = true ] && [ -f "$TMP_ROOT/settings.before.json" ]; then
    mf diff-settings "$TMP_ROOT/settings.before.json" "$HOME/.claude/settings.json" > "$TMP_ROOT/trail-diff.json" || return 1
    node -e 'const fs = require("fs"), crypto = require("crypto"); const [diff, sl, out, settings] = process.argv.slice(1);
      const d = JSON.parse(fs.readFileSync(diff, "utf8")); const entry = { settingsFile: settings, hooks: d.hooks, files: [] };
      if (fs.existsSync(sl)) entry.files.push({ path: sl, sha256: crypto.createHash("sha256").update(fs.readFileSync(sl)).digest("hex") });
      fs.writeFileSync(out, JSON.stringify(entry));' "$TMP_ROOT/trail-diff.json" "$(config_dir)/helpers/trail-statusline.cjs" "$f" "$HOME/.claude/settings.json" || return 1
    mf record trail "$f" || return 1
    say "    recorded trail wiring"; changed=true
  fi
  if [ "$CM_RAN" = true ]; then
    echo '{"wired":true}' > "$f"
    mf record context-mode "$f" || return 1
    say "    recorded context-mode wiring"; changed=true
  fi
  if [ "$changed" = false ]; then STEP_REASON="nothing new"; return 3; fi
  return 0
}

VERIFY_FAILED=""
check_line() { # label, status(0=ok)
  if [ "$2" -eq 0 ]; then say "    ${GREEN}${G_OK}${NC} $1"; else say "    ${RED}${G_FAIL}${NC} $1"; VERIFY_FAILED="$VERIFY_FAILED
      - $1"; fi
}

step_verify() {
  if [ "$DRY_RUN" = true ]; then STEP_REASON="dry run"; return 3; fi
  local rc
  VERIFY_FAILED=""
  if has_part agentry; then
    rc=0; (cd "$HOME" && env -u AGENTRY_HOME agentry doctor) </dev/null >/dev/null 2>&1 || rc=$?
    check_line "agentry doctor" "$rc"
    if [ -d "$HOME/ws" ]; then
      rc=0; env -u AGENTRY_HOME agentry scan "$HOME/ws" </dev/null >/dev/null 2>&1 || rc=$?
      check_line "agentry scan ~/ws" "$rc"
    else
      say "    ${YELLOW}${G_SKIP}${NC} agentry scan skipped: no ~/ws"
    fi
  fi
  if has_part context-mode; then rc=0; cm_wired || rc=$?; check_line "context-mode doctor (claude-code PASS)" "$rc"; fi
  if has_part trail; then rc=0; command -v trail >/dev/null 2>&1 || rc=$?; check_line "trail on PATH" "$rc"; fi
  if [ -n "$VERIFY_FAILED" ]; then
    say "    ${RED}Failed checks:${NC}$VERIFY_FAILED"
    return 1
  fi
  return 0
}

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
  local help="" c
  if command -v agentry >/dev/null 2>&1; then help="$(env -u AGENTRY_HOME agentry --help </dev/null 2>&1 || true)"; fi
  say ""
  say "${BOLD}Next steps${NC}"
  say "  ${G_ARROW} Open a new Claude Code session."
  for c in "tui|agentry tui|pick skill bundles in the terminal UI" "ui|agentry ui|pick skill bundles in the web UI" \
    "catalog list|agentry catalog list|see the skill catalog" "shelf list|agentry shelf list|see the skill shelf" \
    "shelf on|agentry shelf on <group> [--global]|turn a bundle on"; do
    case "$help" in *"${c%%|*}"*) say "  ${G_ARROW} ${BOLD}$(echo "$c" | cut -d'|' -f2)${NC}: $(echo "$c" | cut -d'|' -f3)" ;; esac
  done
}

do_install() {
  [ -n "$SEL" ] || die_usage "choose parts with --all or --only <part>"
  build_install_steps
  print_plan
  run_steps || return 1
  [ "$DRY_RUN" = true ] || next_steps
}

# ---------- status ----------
status_line() { # symbol-color label state detail
  say "  $1 $2: $3${4:+ ${DIM}($4)${NC}}"
}

part_status() {
  local p="$1" ver mgr detail
  case "$p" in
    agentry | trail | context-mode)
      if ! command -v "$(bin_of "$p")" >/dev/null 2>&1; then
        status_line "${YELLOW}${G_SKIP}${NC}" "$p" "missing" "not on PATH"; return 0
      fi
      ver="$("$(bin_of "$p")" --version </dev/null 2>&1 | head -1)"
      mgr="$(manifest_get "$p" tools.manager)"
      detail="$ver${mgr:+, installed by setup via $mgr}"
      if [ "$p" = trail ] && ! trail_wired; then
        status_line "${YELLOW}~${NC}" "$p" "partial" "$detail; not wired: run setup install --only trail"; return 0
      fi
      if [ "$p" = context-mode ]; then
        if ! command -v claude >/dev/null 2>&1; then status_line "${YELLOW}~${NC}" "$p" "partial" "$detail; claude is not on PATH"; return 0; fi
        if ! cm_wired; then status_line "${YELLOW}~${NC}" "$p" "partial" "$detail; not wired: run setup install --only context-mode"; return 0; fi
      fi
      status_line "${GREEN}${G_OK}${NC}" "$p" "installed" "$detail" ;;
    config)
      local js
      if [ -n "$SOURCE_DIR" ] && js="$(mf config-status 2>/dev/null)" && [ -n "$js" ]; then
        node -e 'const s = JSON.parse(process.argv[1]);
          if (!s.recorded) process.exit(3);
          const bad = s.missing.length + s.changed.length;
          console.log((bad === 0 ? "installed" : s.present === 0 ? "missing" : "partial") + "|" + s.present + "/" + s.total + " entries present" +
            (s.missing.length ? "; missing: " + s.missing.join(", ") : "") + (s.changed.length ? "; changed since install: " + s.changed.join(", ") : ""));' "$js" > "$TMP_ROOT/cfg.status" 2>/dev/null && {
          local st="${TMP_ROOT:+$(cut -d'|' -f1 "$TMP_ROOT/cfg.status")}" det
          det="$(cut -d'|' -f2- "$TMP_ROOT/cfg.status")"
          case "$st" in
            installed) status_line "${GREEN}${G_OK}${NC}" config installed "$det" ;;
            missing) status_line "${YELLOW}${G_SKIP}${NC}" config missing "$det" ;;
            *) status_line "${YELLOW}~${NC}" config partial "$det" ;;
          esac
          return 0; }
      fi
      if [ -f "$(config_dir)/helpers/trail-autobuild.sh" ]; then
        status_line "${YELLOW}~${NC}" config "present" "not recorded by setup, so uninstall will not touch it"
      else
        status_line "${YELLOW}${G_SKIP}${NC}" config missing "nothing recorded"
      fi ;;
  esac
}

do_status() {
  make_tmp
  ensure_source 2>/dev/null || true
  say "${BOLD}Status${NC}"
  local p parts="$SEL"
  [ -n "$parts" ] || parts="$ALL_PARTS"
  for p in $parts; do part_status "$p"; done
}

# ---------- uninstall ----------
SETUP_BACKUP=""
# backup_files <label> <file>...: copies the existing files into <config>/backups/agentry-setup/<stamp>-<label>/
backup_files() {
  local label="$1" f dest
  shift
  SETUP_BACKUP="$(config_dir)/backups/agentry-setup/$(date -u '+%Y-%m-%dT%H-%M-%S')-$label"
  for f in "$@"; do
    [ -f "$f" ] || continue
    dest="$SETUP_BACKUP/files$(dirname "$f")"
    mkdir -p "$dest" && cp -p "$f" "$dest/"
  done
  say "    backup: $SETUP_BACKUP"
}

step_remove_config() {
  has_part config || { STEP_REASON="not selected"; return 3; }
  if ! manifest_has config; then STEP_REASON="not installed (nothing recorded by setup)"; return 3; fi
  ensure_source || return 1
  local flag="--write" out rc=0
  [ "$DRY_RUN" = true ] && flag=""
  show_cmd node "$SOURCE_DIR/scripts/apply-global.mjs" --remove "$(manifest_file)" "${flag:-(preview)}"
  # shellcheck disable=SC2086
  out="$(node "$SOURCE_DIR/scripts/apply-global.mjs" --remove "$(manifest_file)" $flag </dev/null 2>&1)" || rc=$?
  printf '%s\n' "$out" | sed 's/^/    /'
  [ "$rc" -eq 0 ] || return 1
  if [ "$DRY_RUN" = true ]; then STEP_REASON="dry run"; return 3; fi
  mf forget config || return 1
}

step_remove_trail() {
  has_part trail || { STEP_REASON="not selected"; return 3; }
  if ! command -v trail >/dev/null 2>&1; then
    if manifest_has trail && [ "$DRY_RUN" != true ]; then ensure_source && mf forget trail; fi
    STEP_REASON="not installed"; return 3
  fi
  if ! trail_wired && ! manifest_has trail settingsFile; then STEP_REASON="not installed (not wired)"; return 3; fi
  make_tmp
  local scratch="$TMP_ROOT/scratch-un" preview paths bad
  mkdir -p "$scratch"
  show_cmd "cd <scratch dir> && trail uninstall"
  preview="$(cd "$scratch" && DO_NOT_TRACK=1 trail uninstall </dev/null 2>&1)" || { printf '%s\n' "$preview" | sed 's/^/    /'; return 1; }
  # only "would remove: /path [machine-wide]" lines; trail also prints a legend line that names [machine-wide]
  paths="$(printf '%s\n' "$preview" | sed -n 's/^.*would remove: \(\/.*\) \[machine-wide\].*$/\1/p')"
  bad="$(printf '%s\n' "$paths" | grep -v '^$' | grep -v "^$HOME/.claude/" || true)"
  printf '%s\n' "$paths" | grep -v '^$' | sed 's/^/    would remove: /' || true
  if [ -n "$bad" ]; then
    say "    ${YELLOW}trail also wired other agents${NC}; setup will not remove those:"
    printf '%s\n' "$bad" | sed 's/^/      /'
    say "    Remove them yourself with: trail uninstall --yes"
    TRAIL_KEPT=true
    STEP_REASON="left alone (other agents wired)"; return 3
  fi
  if [ "$DRY_RUN" = true ]; then STEP_REASON="dry run"; return 3; fi
  backup_files trail-uninstall "$HOME/.claude/settings.json"
  show_cmd "cd <scratch dir> && trail uninstall --yes"
  (cd "$scratch" && DO_NOT_TRACK=1 trail uninstall --yes </dev/null) || return 1
  # the statusline copy setup made, only if still the file it recorded
  local sl rec
  sl="$(config_dir)/helpers/trail-statusline.cjs"
  rec="$(manifest_get trail files)"
  if [ -n "$rec" ] && [ -f "$sl" ]; then
    case "$rec" in *"$(node -e 'process.stdout.write(require("crypto").createHash("sha256").update(require("fs").readFileSync(process.argv[1])).digest("hex"))' "$sl")"*) rm -f "$sl"; say "    removed $sl" ;; *) say "    kept $sl (changed since install)" ;; esac
    rmdir "$(config_dir)/helpers" 2>/dev/null || true
  fi
  ensure_source && mf forget trail settingsFile hooks files
  return 0
}

# context-mode's own remove leaves its marketplace entry in settings.json, pointing at the npm folder; drop it only when that folder is gone.
clean_cm_marketplace() {
  local f
  f="$(config_dir)/settings.json"
  [ -f "$f" ] || return 0
  node -e 'const fs = require("fs"); const f = process.argv[1]; const s = JSON.parse(fs.readFileSync(f, "utf8"));
    const m = s.extraKnownMarketplaces && s.extraKnownMarketplaces["context-mode"]; if (!m) process.exit(0);
    const dir = (m.source && (m.source.path || m.source.url)) || ""; if (dir && fs.existsSync(dir)) process.exit(0);
    delete s.extraKnownMarketplaces["context-mode"];
    if (!Object.keys(s.extraKnownMarketplaces).length) delete s.extraKnownMarketplaces;
    if (s.enabledPlugins && !Object.keys(s.enabledPlugins).length) delete s.enabledPlugins;
    if (Object.keys(s).length) fs.writeFileSync(f, JSON.stringify(s, null, 2) + "\n"); else fs.unlinkSync(f);
    console.log("    removed the leftover context-mode marketplace entry from " + f);' "$f" || true
}

step_remove_context_mode() {
  has_part context-mode || { STEP_REASON="not selected"; return 3; }
  if ! command -v context-mode >/dev/null 2>&1; then STEP_REASON="not installed"; return 3; fi
  if ! cm_wired && ! manifest_has context-mode wired; then STEP_REASON="not installed (not wired)"; return 3; fi
  say "    ${YELLOW}note:${NC} context-mode setup --remove undoes every agent it was set up for, not only Claude Code."
  if [ "$DRY_RUN" = true ]; then
    show_cmd context-mode setup --remove --dry-run --yes --no-input --agents claude-code
    context-mode setup --remove --dry-run --yes --no-input --agents claude-code </dev/null 2>&1 | sed 's/^/    /' || true
    STEP_REASON="dry run"; return 3
  fi
  backup_files context-mode-remove "$(config_dir)/settings.json" "$(config_dir)/.claude.json"
  exec_cmd context-mode setup --remove --yes --no-input --agents claude-code || return 1
  clean_cm_marketplace
  ensure_source && mf forget context-mode wired
  return 0
}

tools_remove_confirmed() {
  [ "$REMOVE_TOOLS" = true ] && return 0
  [ "$YES" = true ] && return 1
  tty_ok || return 1
  [ -n "${MENU_FD:-}" ] || exec 3<"${SETUP_TTY:-/dev/tty}"
  ask "Also remove the CLIs (agentry, trail, context-mode) that setup installed? [y/N]: "
  case "$ANSWER" in y | Y | yes) return 0 ;; esac
  return 1
}

step_remove_tools() {
  local t mgr pkg any=false
  for t in $(selected_tools); do manifest_has "$t" tools && any=true; done
  if [ "$any" = false ]; then STEP_REASON="no tools recorded as installed by setup"; return 3; fi
  if ! tools_remove_confirmed; then STEP_REASON="kept (use --remove-tools to remove them)"; return 3; fi
  for t in $(selected_tools); do
    mgr="$(manifest_get "$t" tools.manager)"
    [ -n "$mgr" ] || continue
    if [ "$t" = trail ] && [ "$TRAIL_KEPT" = true ]; then
      say "    ${YELLOW}kept the trail CLI${NC}: its hooks for other agents still point at it"
      continue
    fi
    pkg="$(pkg_of "$t")"
    if [ "$mgr" = mise ]; then exec_cmd mise unuse -g -y "npm:$pkg" || return 1
    else exec_cmd npm uninstall -g "$pkg" || return 1; fi
    [ "$DRY_RUN" = true ] || mf forget "$t" tools
  done
  [ "$DRY_RUN" = true ] && { STEP_REASON="dry run"; return 3; }
  return 0
}

do_uninstall() {
  [ -n "$SEL" ] || die_usage "choose parts with --all or --only <part>"
  make_tmp
  if [ "$DRY_RUN" != true ]; then ensure_source || return 1; fi
  add_step "Remove config entries" "only what the manifest lists and that still matches" step_remove_config
  add_step "Remove trail wiring" "<config>/ hooks and skill of trail" step_remove_trail
  add_step "Remove context-mode wiring" "plugin registration" step_remove_context_mode
  add_step "Remove tools" "global CLIs, only with --remove-tools or a yes" step_remove_tools
  print_plan
  run_steps
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
  MENU_FD=3
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
    4)
      CMD=uninstall
      say "  1) Everything"; say "  2) Choose parts"
      ask "Uninstall [1-2]: "
      if [ "$ANSWER" = 1 ]; then for p in $ALL_PARTS; do add_part "$p"; done; else pick_parts || return 2; fi
      do_uninstall ;;
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
