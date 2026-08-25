#!/bin/bash

# Color codes
RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Timestamp function
_timestamp() {
    date '+%Y-%m-%d %H:%M:%S'
}

log_info() {
    echo -e "${GREEN}[$(_timestamp)] [INFO]${NC} $*"
}

log_warn() {
    echo -e "${YELLOW}[$(_timestamp)] [WARN]${NC} $*" >&2
}

log_error() {
    echo -e "${RED}[$(_timestamp)] [ERROR]${NC} $*" >&2
}
