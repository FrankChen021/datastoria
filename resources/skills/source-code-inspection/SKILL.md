---
name: source-code-inspection
description: Investigate application or repository source code with search_file and read_file to explain behavior, trace root causes of runtime or query errors, and answer with precise file citations.
metadata:
  author: DataStoria
  tools: search_file, read_file
---

## When To Use

Use this skill when the user wants to:

- investigate source-code causes of runtime failures or query errors
- trace where SQL, configuration, or request parameters were built in code
- find the code path that led to an error such as `UNKNOWN_TABLE`
- explain behavior with file-cited evidence from the repository

## Workflow

1. Use `search_file` first to locate relevant files and line numbers before reading content.
2. Use `read_file` only for targeted sections; do not read entire files or large ranges.
3. Prefer narrow, iterative reads: search identifiers, function names, or error strings, then expand only when necessary.
4. Do not claim to have reviewed code that was not loaded with tools in this conversation.
5. If `no matches found`, refine the search and retry before giving up.

## Citation Format

Always use this exact format for source-file citations:

- `[[file:path/to/file.ts]]`
- `[[file:path/to/file.ts#L12]]`
- `[[file:path/to/file.ts#L12-L34]]`

Use repo-relative paths and line anchors whenever possible. Do not use normal markdown links for source-code citations.
Do not wrap file citation tokens in backticks, inline code, or fenced code blocks in your final answer. Use them as plain citation tokens in normal prose or list items so the UI can render them as clickable links.

## Response Style

- Keep answers concise and evidence-based.
- Tie each claim to one or more file citations.
- If the code path is unclear or partially inspected, say so explicitly.
