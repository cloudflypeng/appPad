#!/usr/bin/env bash
set -euo pipefail

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or stash changes before running release."
  exit 1
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  echo "Git remote 'origin' is not configured."
  exit 1
fi

pnpm version patch --no-git-tag-version

version="$(node -p "require('./package.json').version")"
tag="v${version}"

if git rev-parse "${tag}" >/dev/null 2>&1; then
  echo "Tag ${tag} already exists."
  exit 1
fi

git add package.json pnpm-lock.yaml
git commit -m "chore(release): ${tag}"
git tag "${tag}"
git push origin HEAD
git push origin "${tag}"

echo "Released ${tag}"
