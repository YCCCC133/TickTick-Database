#!/bin/bash
set -Eeuo pipefail

ROOT_DIR="${COZE_WORKSPACE_PATH:-$(pwd)}"

cd "${ROOT_DIR}"

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a git repository. Initialize git first:" >&2
  echo "  git init" >&2
  exit 1
fi

if [[ ! -f ".githooks/pre-commit" ]]; then
  echo "Missing .githooks/pre-commit" >&2
  exit 1
fi

chmod +x .githooks/pre-commit
git config core.hooksPath .githooks

echo "Git hooks installed. Current hooksPath: $(git config --get core.hooksPath)"
