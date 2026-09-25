#!/usr/bin/env bash

# ------------------------------------------------------------------------------
# install.sh
#
# Install all or selected Agentry Labs components into the current project's
# .claude directory, or install globally when requested.
#
# Usage:
#   ./install.sh [options] [selector ...]
#
# Selectors:
#   TYPE                    Install every component of a type
#   TYPE/NAME               Install one named component
#   all                     Install every available component
#
# Options:
#   -t, --type TYPE         Install all components of TYPE; may be repeated
#   -c, --component ITEM    Install TYPE/NAME; may be repeated
#   -a, --all               Install every available component
#   -l, --list              List available component selectors and exit
#   -g, --global            Install globally under ~/.claude
#       --target DIR        Install under a custom directory
#   -h, --help              Show this help message and exit
#
# Available types:
#   skills, rules, agents, claude-md-files
#
# Examples:
#   ./install.sh
#   ./install.sh --list
#   ./install.sh skills
#   ./install.sh --global skills
#   ./install.sh --type skills --type rules
#   ./install.sh skills/run-fallow
#   ./install.sh --component agents/super-planner.agent.md
#   ./install.sh rules agents/super-planner.agent.md
#   ./install.sh claude-md-files/BASIC_CLAUDE.md
#   ./install.sh --all
#   ./install.sh --global --all
#   ./install.sh all --target "$HOME/.config/my-agent"
#   curl -sSL https://raw.githubusercontent.com/ersanyamarya/agentry-labs/main/scripts/install.sh | bash
#   curl -sSL https://raw.githubusercontent.com/ersanyamarya/agentry-labs/main/scripts/install.sh | bash -s -- skills/run-fallow
#   curl -sSL https://raw.githubusercontent.com/ersanyamarya/agentry-labs/main/scripts/install.sh | bash -s -- --global --type rules
#
# Notes:
#   - The default target is ./.claude in the current working directory.
#   - With no selectors, an interactive terminal shows a chooser. In a
#     non-interactive environment, skills are installed.
#   - Selectors may be singular or plural: skill and skills are equivalent.
#   - A missing .md suffix is accepted for an individual Markdown component.
#   - Each installed component replaces its previous copy, so files removed
#     upstream disappear too. Unrelated installed components remain.
#   - --global and --target cannot be used together.
# ------------------------------------------------------------------------------

set -euo pipefail

# =========================
# SIGNAL HANDLING
# =========================

trap 'echo -e "\nAborted by user (Ctrl+C). Exiting."; exit 130' INT

# =========================
# SOURCE UTILITIES
# =========================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" && pwd)"
# shellcheck disable=SC2034
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
UTILS_SH="$SCRIPT_DIR/utils.sh"
UTILS_URL="${AGENTRY_LABS_UTILS_URL:-https://raw.githubusercontent.com/ersanyamarya/agentry-labs/main/scripts/utils.sh}"
INSTALL_URL="${AGENTRY_LABS_INSTALL_URL:-https://raw.githubusercontent.com/ersanyamarya/agentry-labs/main/scripts/install.sh}"
BOOTSTRAP_DIR=""

if [[ ! -f "$UTILS_SH" ]]; then
  command -v curl >/dev/null 2>&1 || {
    echo "[ERROR] utils.sh is unavailable and curl is required to download it. Exiting." >&2
    exit 1
  }
  BOOTSTRAP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/agentry-labs-bootstrap.XXXXXX")"
  trap 'rm -rf "$BOOTSTRAP_DIR"' EXIT
  UTILS_SH="$BOOTSTRAP_DIR/utils.sh"
  curl -fsSL "$UTILS_URL" -o "$UTILS_SH"
fi
# shellcheck disable=SC1090
source "$UTILS_SH"

print_help() {
  local source_path=${BASH_SOURCE[0]:-}

  if [[ -n $source_path && -f $source_path ]]; then
    awk 'NR == 1 && /^#!/ {next} /^#/{sub(/^# ?/,""); print; next} /^$/{if (NR>1) print ""; next} {exit}' "$source_path"
  else
    curl -fsSL "$INSTALL_URL" | awk 'NR == 1 && /^#!/ {next} /^#/{sub(/^# ?/,""); print; next} /^$/{if (NR>1) print ""; next} {exit}'
  fi
}

# =========================
# ARGUMENT PARSING
# =========================

COMPONENT_TYPES="skills rules agents claude-md-files"
TARGET_DIR="$PWD/.claude"
INSTALL_ALL="false"
LIST_ONLY="false"
GLOBAL_INSTALL="false"
CUSTOM_TARGET="false"
SELECTORS=()

while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      print_help
      exit 0
      ;;
    -a|--all)
      INSTALL_ALL="true"
      shift
      ;;
    -l|--list)
      LIST_ONLY="true"
      shift
      ;;
    -g|--global)
      GLOBAL_INSTALL="true"
      shift
      ;;
    -t|--type|-c|--component|--target)
      if [[ $# -lt 2 || -z $2 ]]; then
        log_error "$1 requires a value."
        print_help
        exit 1
      fi
      case $1 in
        -t|--type) SELECTORS+=("$2") ;;
        -c|--component) SELECTORS+=("$2") ;;
        --target)
          TARGET_DIR="$2"
          CUSTOM_TARGET="true"
          ;;
      esac
      shift 2
      ;;
    -*)
      log_error "Unknown option: $1"
      print_help
      exit 1
      ;;
    *)
      if [[ $1 == "all" ]]; then
        INSTALL_ALL="true"
      else
        SELECTORS+=("$1")
      fi
      shift
      ;;
  esac
done

if [[ $GLOBAL_INSTALL == "true" && $CUSTOM_TARGET == "true" ]]; then
  log_error "--global and --target cannot be used together."
  print_help
  exit 1
fi

if [[ $GLOBAL_INSTALL == "true" ]]; then
  TARGET_DIR="$HOME/.claude"
fi

# =========================
# MAIN LOGIC
# =========================

TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/agentry-labs.XXXXXX")"
trap 'rm -rf "$TEMP_DIR" "$BOOTSTRAP_DIR"' EXIT

command -v git >/dev/null 2>&1 || {
  log_error "git is required. Install git and try again."
  exit 1
}

normalize_type() {
  case $1 in
    skill|skills) echo "skills" ;;
    rule|rules) echo "rules" ;;
    agent|agents) echo "agents" ;;
    claude-md-file|claude-md-files) echo "claude-md-files" ;;
    *) return 1 ;;
  esac
}

list_components() {
  local component_type
  local component_path

  echo "Available component selectors:"
  for component_type in $COMPONENT_TYPES; do
    echo ""
    echo "  $component_type"
    if [[ ! -d "$TEMP_DIR/$component_type" ]]; then
      echo "    (none)"
      continue
    fi
    while IFS= read -r component_path; do
      echo "    $component_type/$(basename "$component_path")"
    done < <(find "$TEMP_DIR/$component_type" -mindepth 1 -maxdepth 1 ! -name '.DS_Store' | sort)
  done
}

add_interactive_selectors() {
  local user_selection
  local selector

  list_components
  echo "" > /dev/tty
  echo "Choose comma-separated selectors." > /dev/tty
  echo "Examples: skills | agents/super-planner.agent.md | all" > /dev/tty
  printf "Selection [skills]: " > /dev/tty
  IFS= read -r user_selection < /dev/tty
  user_selection="${user_selection:-skills}"
  user_selection="${user_selection//,/ }"

  for selector in $user_selection; do
    if [[ $selector == "all" ]]; then
      INSTALL_ALL="true"
    else
      SELECTORS+=("$selector")
    fi
  done
}

validate_selector() {
  local selector=$1
  local raw_type=${selector%%/*}
  local component_name=""
  local component_type

  component_type="$(normalize_type "$raw_type")" || {
    log_error "Unknown component type '$raw_type'. Expected one of: $COMPONENT_TYPES."
    return 1
  }

  if [[ $selector == */* ]]; then
    component_name=${selector#*/}
    if [[ -z $component_name || $component_name == /* || $component_name == *..* ]]; then
      log_error "Invalid component selector: $selector"
      return 1
    fi
  fi
}

# Copy one component into destination_dir, replacing any previous copy of it,
# so files deleted upstream do not linger in old installs.
copy_component() {
  local source_path=$1
  local destination_dir=$2
  local name
  name="$(basename "$source_path")"

  if [[ -z $name || $name == "." || $name == ".." ]]; then
    log_error "Refusing to install an unnamed component from $source_path"
    return 1
  fi
  rm -rf "${destination_dir:?}/$name"
  cp -R "$source_path" "$destination_dir/"
}

install_type() {
  local component_type=$1
  local source_dir="$TEMP_DIR/$component_type"
  local destination_dir="$TARGET_DIR/$component_type"

  if [[ ! -d "$source_dir" ]]; then
    log_warn "No $component_type are available; skipping."
    return
  fi

  mkdir -p "$destination_dir"
  while IFS= read -r component_path; do
    copy_component "$component_path" "$destination_dir"
  done < <(find "$source_dir" -mindepth 1 -maxdepth 1 ! -name '.DS_Store' | sort)
  log_info "Installed all $component_type to $destination_dir"
}

install_component() {
  local component_type=$1
  local component_name=$2
  local source_path="$TEMP_DIR/$component_type/$component_name"
  local destination_dir="$TARGET_DIR/$component_type"

  if [[ ! -e "$source_path" && -f "$source_path.md" ]]; then
    source_path="$source_path.md"
  fi
  if [[ ! -e "$source_path" ]]; then
    log_error "Component not found: $component_type/$component_name"
    return 1
  fi

  mkdir -p "$destination_dir"
  copy_component "$source_path" "$destination_dir"
  log_info "Installed $component_type/$(basename "$source_path") to $destination_dir"
}

log_info "Downloading the Agentry Labs catalog..."
git clone --depth 1 https://github.com/ersanyamarya/agentry-labs.git "$TEMP_DIR" >/dev/null 2>&1

if [[ $LIST_ONLY == "true" ]]; then
  list_components
  exit 0
fi

if [[ $INSTALL_ALL == "false" && ${#SELECTORS[@]} -eq 0 ]]; then
  if [[ -t 1 && -r /dev/tty && -w /dev/tty ]]; then
    add_interactive_selectors
  else
    SELECTORS=("skills")
    log_warn "No interactive terminal detected; installing skills."
  fi
fi

if [[ $INSTALL_ALL == "true" ]]; then
  read -r -a SELECTORS <<< "$COMPONENT_TYPES"
fi

for selector in "${SELECTORS[@]}"; do
  validate_selector "$selector"
done

log_info "Installing into $TARGET_DIR"
for selector in "${SELECTORS[@]}"; do
  raw_type=${selector%%/*}
  component_type="$(normalize_type "$raw_type")"
  if [[ $selector == */* ]]; then
    install_component "$component_type" "${selector#*/}"
  else
    install_type "$component_type"
  fi
done

log_info "Installation complete."