# Sourced by the fakes. FAKE_LOG gets one line per call; FAKE_BIN is the fake PATH dir.
fake_log() { [ -z "${FAKE_LOG:-}" ] || printf '%s\n' "$*" >> "$FAKE_LOG"; }
# Creates fake tool binaries for npm package specs like @scope/pkg@latest or pkg@latest.
fake_install_tools() {
  local spec name
  for spec in "$@"; do
    spec="${spec#npm:}"
    name="${spec%@latest}"
    case "$name" in
      @ersanyamarya/agentry-cli) name=agentry ;;
      @trailhq/trail-code) name=trail ;;
    esac
    printf '#!/bin/sh\nexec sh "$FAKE_BIN/_tool.sh" %s "$@"\n' "$name" > "$FAKE_BIN/$name"
    chmod +x "$FAKE_BIN/$name"
  done
}
# Removes the fake binaries for package specs (npm:@scope/pkg, @scope/pkg or pkg).
fake_uninstall_tools() {
  local spec name
  for spec in "$@"; do
    name="${spec#npm:}"; name="${name%@latest}"
    case "$name" in
      @ersanyamarya/agentry-cli) name=agentry ;;
      @trailhq/trail-code) name=trail ;;
    esac
    rm -f "$FAKE_BIN/$name"
  done
}
