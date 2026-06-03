#!/bin/bash
set -e

if [ -z "$GITHUB_TOKEN" ]; then
  echo "ERROR: GITHUB_TOKEN secret is not set. Please add it in the Secrets tab."
  exit 1
fi

REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
if [ -z "$REMOTE_URL" ]; then
  echo "ERROR: No 'origin' remote configured."
  exit 1
fi

REPO_PATH=$(echo "$REMOTE_URL" | sed 's|https://github.com/||' | sed 's|git@github.com:||' | sed 's|\.git$||')
AUTH_URL="https://${GITHUB_TOKEN}@github.com/${REPO_PATH}.git"

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")

echo "Pushing branch '$BRANCH' to GitHub (andersnn1/CYG-SYSTEM)..."
git push "$AUTH_URL" "$BRANCH" --quiet
echo "Successfully pushed to GitHub."
