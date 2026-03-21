#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

cd "${COZE_WORKSPACE_PATH}"

echo "Installing dependencies..."
if [[ -d node_modules ]]; then
  echo "Dependencies already installed, skipping install."
elif command -v pnpm >/dev/null 2>&1; then
  pnpm install --prefer-frozen-lockfile --prefer-offline --loglevel debug --reporter=append-only
else
  npm install --no-fund --no-audit
fi

echo "Building the project..."
npx next build

echo "Build completed successfully!"
