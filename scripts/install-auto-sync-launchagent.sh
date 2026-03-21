#!/bin/bash
set -Eeuo pipefail

ROOT_DIR="${COZE_WORKSPACE_PATH:-$(pwd)}"
REMOTE_NAME="${REMOTE_NAME:-origin}"
POLL_INTERVAL="${POLL_INTERVAL:-3}"
IDLE_SECONDS="${IDLE_SECONDS:-8}"
LABEL="com.ycccc.ticktick-database.autosync"
PLIST_PATH="$HOME/Library/LaunchAgents/${LABEL}.plist"

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
    <string>${ROOT_DIR}/scripts/auto-sync-github.sh</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>COZE_WORKSPACE_PATH</key>
    <string>${ROOT_DIR}</string>
    <key>REMOTE_NAME</key>
    <string>${REMOTE_NAME}</string>
    <key>POLL_INTERVAL</key>
    <string>${POLL_INTERVAL}</string>
    <key>IDLE_SECONDS</key>
    <string>${IDLE_SECONDS}</string>
  </dict>
  <key>WorkingDirectory</key>
  <string>${ROOT_DIR}</string>
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
