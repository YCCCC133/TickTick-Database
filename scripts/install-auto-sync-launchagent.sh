#!/bin/bash
set -Eeuo pipefail

ROOT_DIR="${COZE_WORKSPACE_PATH:-$(pwd)}"
REMOTE_NAME="${REMOTE_NAME:-origin}"
POLL_INTERVAL="${POLL_INTERVAL:-3}"
IDLE_SECONDS="${IDLE_SECONDS:-8}"
LABEL="com.ycccc.ticktick-database.autosync"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"
APP_SUPPORT_DIR="$HOME/Library/Application Support/TickTick-Database"
WRAPPER_PATH="$APP_SUPPORT_DIR/auto-sync-wrapper.sh"

cd "$ROOT_DIR"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a git repository. Initialize git first." >&2
  exit 1
fi

if [[ ! -x "$ROOT_DIR/scripts/auto-sync-github.sh" ]]; then
  echo "Missing or non-executable scripts/auto-sync-github.sh" >&2
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$APP_SUPPORT_DIR"

cat > "$WRAPPER_PATH" <<EOF
#!/bin/bash
set -Eeuo pipefail

ROOT_DIR="${ROOT_DIR}"
REMOTE_NAME="${REMOTE_NAME}"
POLL_INTERVAL="${POLL_INTERVAL}"
IDLE_SECONDS="${IDLE_SECONDS}"
COMMIT_PREFIX="sync: auto"

if ! git -C "\$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a git repository: \$ROOT_DIR" >&2
  exit 1
fi

echo "[auto-sync] watching \$(git -C "\$ROOT_DIR" branch --show-current) -> \$REMOTE_NAME in \$ROOT_DIR"
echo "[auto-sync] poll=\$POLL_INTERVAL s idle=\$IDLE_SECONDS s"

last_signature=""
dirty_since=0

sync_once() {
  echo "[auto-sync] syncing changes..."
  if git -C "\$ROOT_DIR" add -A && \
    if git -C "\$ROOT_DIR" diff --cached --quiet; then
      echo "[auto-sync] no changes to sync."
      return 0
    fi && \
    git -C "\$ROOT_DIR" commit -m "\${COMMIT_PREFIX}: \$(date '+%Y-%m-%d %H:%M:%S')" && \
    git -C "\$ROOT_DIR" pull --rebase --autostash "\$REMOTE_NAME" "\$(git -C "\$ROOT_DIR" branch --show-current)" && \
    git -C "\$ROOT_DIR" push -u "\$REMOTE_NAME" "\$(git -C "\$ROOT_DIR" branch --show-current)"; then
    echo "[auto-sync] sync completed."
    return 0
  fi

  echo "[auto-sync] sync failed; will retry on the next stable window." >&2
  return 1
}

while true; do
  status="\$(git -C "\$ROOT_DIR" status --porcelain=v1 --untracked-files=all || true)"

  if [[ -n "\$status" ]]; then
    signature="\$(printf '%s' "\$status" | shasum -a 256 | awk '{print \$1}')"
    now="\$(date +%s)"

    if [[ "\$signature" != "\$last_signature" ]]; then
      last_signature="\$signature"
      dirty_since="\$now"
      echo "[auto-sync] changes detected; waiting for idle window..."
    elif (( now - dirty_since >= IDLE_SECONDS )); then
      if sync_once; then
        last_signature=""
        dirty_since=0
      else
        dirty_since="\$now"
      fi
    fi
  else
    last_signature=""
    dirty_since=0
  fi

  sleep "\$POLL_INTERVAL"
done
EOF

chmod +x "$WRAPPER_PATH"

cat > "$PLIST_PATH" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${WRAPPER_PATH}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/ticktick-auto-sync.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/ticktick-auto-sync.log</string>
</dict>
</plist>
EOF

launchctl bootout "gui/$(id -u)" "$PLIST_PATH" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST_PATH"
launchctl enable "gui/$(id -u)/${LABEL}" >/dev/null 2>&1 || true

echo "Auto sync launch agent installed:"
echo "  ${PLIST_PATH}"
echo "Log file:"
echo "  /tmp/ticktick-auto-sync.log"
