#!/bin/bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/sync-github.sh [-r remote] [-m "commit message"]

Behavior:
  - Verifies the current directory is a git repository
  - Verifies the remote exists
  - Pulls with rebase when an upstream branch exists
  - Stages all tracked changes
  - Creates a commit only when there are staged changes
  - Pushes the current branch to the selected remote

Examples:
  scripts/sync-github.sh
  scripts/sync-github.sh -m "feat: update docs"
  scripts/sync-github.sh -r origin -m "chore: sync to GitHub"
EOF
}

REMOTE_NAME="origin"
COMMIT_MESSAGE=""

while getopts ":r:m:h" opt; do
  case "$opt" in
    r) REMOTE_NAME="$OPTARG" ;;
    m) COMMIT_MESSAGE="$OPTARG" ;;
    h)
      usage
      exit 0
      ;;
    :)
      echo "Missing value for -$OPTARG" >&2
      usage >&2
      exit 1
      ;;
    \?)
      echo "Unknown option: -$OPTARG" >&2
      usage >&2
      exit 1
      ;;
  esac
done

shift $((OPTIND - 1))

if [[ $# -gt 0 ]]; then
  if [[ -n "$COMMIT_MESSAGE" ]]; then
    echo "Commit message provided both by -m and positional args." >&2
    usage >&2
    exit 1
  fi
  COMMIT_MESSAGE="$*"
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Not a git repository. Run: git init && git remote add ${REMOTE_NAME} <github-url>" >&2
  exit 1
fi

if ! git remote get-url "$REMOTE_NAME" >/dev/null 2>&1; then
  echo "Remote '$REMOTE_NAME' does not exist. Add it first:" >&2
  echo "  git remote add ${REMOTE_NAME} <github-url>" >&2
  exit 1
fi

CURRENT_BRANCH="$(git branch --show-current)"
if [[ -z "$CURRENT_BRANCH" ]]; then
  echo "Detached HEAD detected. Switch to a branch before syncing." >&2
  exit 1
fi

if git rev-parse --abbrev-ref --symbolic-full-name @{u} >/dev/null 2>&1; then
  echo "Pulling latest changes from ${REMOTE_NAME}/${CURRENT_BRANCH}..."
  git pull --rebase --autostash "$REMOTE_NAME" "$CURRENT_BRANCH"
else
  echo "No upstream branch set yet. Skipping pull."
fi

git add -A

if git diff --cached --quiet; then
  echo "No changes to sync."
  exit 0
fi

if [[ -z "$COMMIT_MESSAGE" ]]; then
  COMMIT_MESSAGE="sync: update $(date '+%Y-%m-%d %H:%M:%S')"
fi

echo "Committing changes..."
git commit -m "$COMMIT_MESSAGE"

echo "Pushing ${CURRENT_BRANCH} to ${REMOTE_NAME}..."
git push -u "$REMOTE_NAME" "$CURRENT_BRANCH"

echo "GitHub sync completed."
