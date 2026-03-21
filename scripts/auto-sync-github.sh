#!/bin/bash
set -Eeuo pipefail

ROOT_DIR="${COZE_WORKSPACE_PATH:-$(pwd)}"
REMOTE_NAME="${REMOTE_NAME:-origin}"
POLL_INTERVAL="${POLL_INTERVAL:-3}"
IDLE_SECONDS="${IDLE_SECONDS:-8}"
COMMIT_PREFIX="${COMMIT_PREFIX:-sync: auto}"

cd "$ROOT_DIR"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a git repository. Initialize git first." >&2
  exit 1
fi

if ! git remote get-url "$REMOTE_NAME" >/dev/null 2>&1; then
  echo "Remote '$REMOTE_NAME' does not exist. Add it first." >&2
  exit 1
fi

CURRENT_BRANCH="$(git branch --show-current)"
if [[ -z "$CURRENT_BRANCH" ]]; then
  echo "Detached HEAD detected. Switch to a branch before auto sync." >&2
  exit 1
fi

echo "[auto-sync] watching ${CURRENT_BRANCH} -> ${REMOTE_NAME} in ${ROOT_DIR}"
echo "[auto-sync] poll=${POLL_INTERVAL}s idle=${IDLE_SECONDS}s"

last_signature=""
dirty_since=0

sync_once() {
  echo "[auto-sync] syncing changes..."
  if bash "$ROOT_DIR/scripts/sync-github.sh" -r "$REMOTE_NAME" -m "${COMMIT_PREFIX}: $(date '+%Y-%m-%d %H:%M:%S')"; then
    echo "[auto-sync] sync completed."
    return 0
  fi

  echo "[auto-sync] sync failed; will retry on the next stable window." >&2
  return 1
}

while true; do
  status="$(git status --porcelain=v1 --untracked-files=all || true)"

  if [[ -n "$status" ]]; then
    signature="$(printf '%s' "$status" | shasum -a 256 | awk '{print $1}')"
    now="$(date +%s)"

    if [[ "$signature" != "$last_signature" ]]; then
      last_signature="$signature"
      dirty_since="$now"
      echo "[auto-sync] changes detected; waiting for idle window..."
    elif (( now - dirty_since >= IDLE_SECONDS )); then
      if sync_once; then
        last_signature=""
        dirty_since=0
      else
        dirty_since="$now"
      fi
    fi
  else
    last_signature=""
    dirty_since=0
  fi

  sleep "$POLL_INTERVAL"
done
