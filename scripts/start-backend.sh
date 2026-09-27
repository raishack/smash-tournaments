#!/bin/sh
set -eu

update_wacli() {
  if [ "${WACLI_AUTO_UPDATE:-false}" != "true" ]; then
    echo "[wacli] auto-update disabled"
    return
  fi

  mkdir -p /root/.wacli
  STAMP_FILE="/root/.wacli/last_update_check"
  NOW="$(date +%s)"
  INTERVAL="${WACLI_AUTO_UPDATE_INTERVAL_SECONDS:-43200}"
  LAST_CHECK="0"
  if [ -f "$STAMP_FILE" ]; then
    LAST_CHECK="$(cat "$STAMP_FILE" 2>/dev/null || echo 0)"
  fi
  ELAPSED=$((NOW - LAST_CHECK))
  if [ "$ELAPSED" -lt "$INTERVAL" ]; then
    echo "[wacli] skipped auto-update (last check ${ELAPSED}s ago)"
    return
  fi
  echo "$NOW" > "$STAMP_FILE"

  echo "[wacli] checking latest version"
  if ! apk add --no-cache --virtual .wacli-update-deps go git gcc musl-dev sqlite-dev >/dev/null; then
    echo "[wacli] dependency install failed, keeping current binary"
    return
  fi
  TMP_OUT="$(mktemp -d)"
  TMP_GOCACHE="$(mktemp -d)"
  TMP_GOMODCACHE="$(mktemp -d)"

  cleanup() {
    rm -rf "$TMP_OUT" "$TMP_GOCACHE" "$TMP_GOMODCACHE"
    apk del .wacli-update-deps >/dev/null 2>&1 || true
  }
  trap cleanup EXIT

  GOBIN="$TMP_OUT" \
  GOCACHE="$TMP_GOCACHE" \
  GOMODCACHE="$TMP_GOMODCACHE" \
  CGO_ENABLED=1 \
  go install -tags sqlite_fts5 github.com/steipete/wacli/cmd/wacli@main || {
    echo "[wacli] update failed, keeping current binary"
    return
  }

  if [ -f "$TMP_OUT/wacli" ]; then
    install -m 0755 "$TMP_OUT/wacli" /usr/local/bin/wacli
    echo "[wacli] updated successfully"
    /usr/local/bin/wacli --version || true
  else
    echo "[wacli] update failed: binary not produced, keeping current binary"
  fi
}

periodic_wacli_updates() {
  if [ "${WACLI_AUTO_UPDATE:-false}" != "true" ]; then
    return
  fi

  INTERVAL="${WACLI_AUTO_UPDATE_INTERVAL_SECONDS:-43200}"
  while true; do
    sleep "$INTERVAL"
    update_wacli || true
  done
}

update_wacli
periodic_wacli_updates &
UPDATE_PID="$!"

cleanup() {
  if [ -n "${UPDATE_PID:-}" ]; then
    kill "$UPDATE_PID" >/dev/null 2>&1 || true
  fi
  if [ -n "${APP_PID:-}" ]; then
    kill "$APP_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup INT TERM EXIT

npm run start:backend &
APP_PID="$!"
wait "$APP_PID"
APP_STATUS="$?"
cleanup
exit "$APP_STATUS"
