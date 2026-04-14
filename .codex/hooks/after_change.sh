#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

state_dir="$repo_root/.codex/tmp"
stamp_file="$state_dir/after-change.sha256"
mkdir -p "$state_dir"

hash_stream() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 | awk '{print $1}'
  else
    openssl dgst -sha256 | awk '{print $NF}'
  fi
}

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -- "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 -- "$1" | awk '{print $1}'
  else
    openssl dgst -sha256 "$1" | awk '{print $NF}'
  fi
}

compute_fingerprint() {
  local tracked_fingerprint
  local untracked_listing
  local untracked_fingerprint

  tracked_fingerprint="$(
    git diff --no-ext-diff --binary HEAD -- . | hash_stream
  )"
  untracked_listing="$(git ls-files --others --exclude-standard)"
  if [ -n "$untracked_listing" ]; then
    untracked_fingerprint="$(
      while IFS= read -r path; do
        if [ -r "$path" ] && [ ! -d "$path" ]; then
          hash_file "./$path"
        elif [ -L "$path" ]; then
          printf 'symlink:%s:%s\n' "$path" "$(readlink "./$path" 2>/dev/null || printf '<unreadable>')"
        else
          printf 'unreadable:%s\n' "$path"
        fi
      done <<< "$untracked_listing" | hash_stream
    )"
  else
    untracked_fingerprint="none"
  fi

  printf '%s\n%s\n' "$tracked_fingerprint" "$untracked_fingerprint" | hash_stream
}

current_fingerprint="$(compute_fingerprint)"
untracked_listing="$(git ls-files --others --exclude-standard)"

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

if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  rm -f "$stamp_file"
else
  printf '%s\n' "$(compute_fingerprint)" > "$stamp_file"
fi
printf '{"continue":true}\n'
