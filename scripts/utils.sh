#!/bin/bash
# shellcheck disable=SC2034
# Shared logging helpers. Colors only on a TTY with NO_COLOR and SETUP_NO_COLOR unset. Works on bash 3.2.

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && [ -z "${SETUP_NO_COLOR:-}" ]; then
    RED='\033[0;31m'
    YELLOW='\033[0;33m'
    GREEN='\033[0;32m'
    BLUE='\033[0;34m'
    DIM='\033[2m'
    BOLD='\033[1m'
    NC='\033[0m'
else
    RED='' YELLOW='' GREEN='' BLUE='' DIM='' BOLD='' NC=''
fi

case "${LC_ALL:-${LC_CTYPE:-${LANG:-}}}" in
    *UTF-8* | *utf-8* | *UTF8* | *utf8*)
        G_OK='✓' G_SKIP='↷' G_FAIL='✗' G_ARROW='▸' ;;
    *)
        G_OK='ok' G_SKIP='skip' G_FAIL='FAIL' G_ARROW='>' ;;
esac

# Timestamp function
_timestamp() {
    date '+%Y-%m-%d %H:%M:%S'
}

log_info() {
    printf '%b\n' "${GREEN}[$(_timestamp)] [INFO]${NC} $*"
}

log_warn() {
    printf '%b\n' "${YELLOW}[$(_timestamp)] [WARN]${NC} $*" >&2
}

log_error() {
    printf '%b\n' "${RED}[$(_timestamp)] [ERROR]${NC} $*" >&2
}
