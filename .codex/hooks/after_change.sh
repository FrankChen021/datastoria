#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

state_dir="$repo_root/.codex/tmp"
stamp_file="$state_dir/after-change.sha256"
mkdir -p "$state_dir"

tracked_fingerprint="$(
  git diff --no-ext-diff --binary HEAD -- . | shasum -a 256 | awk '{print $1}'
)"
untracked_listing="$(git ls-files --others --exclude-standard)"
if [ -n "$untracked_listing" ]; then
  untracked_fingerprint="$(
    while IFS= read -r path; do
      shasum -a 256 "$path"
    done <<< "$untracked_listing" | shasum -a 256 | awk '{print $1}'
  )"
else
  untracked_fingerprint="none"
fi
current_fingerprint="$(printf '%s\n%s\n' "$tracked_fingerprint" "$untracked_fingerprint" | shasum -a 256 | awk '{print $1}')"

if git diff --quiet && git diff --cached --quiet && [ -z "$untracked_listing" ]; then
  rm -f "$stamp_file"
  printf '{"continue":true}\n'
  exit 0
fi

if [ -f "$stamp_file" ] && [ "$(cat "$stamp_file")" = "$current_fingerprint" ]; then
  printf '{"continue":true}\n'
  exit 0
fi

npm run format
npm run typecheck
npm run lint

printf '%s\n' "$current_fingerprint" > "$stamp_file"
printf '{"continue":true}\n'
