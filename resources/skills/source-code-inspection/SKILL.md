---
name: source-code-inspection
description: Inspect a configured source repository with search_code and read_code_file, then answer with precise file citations.
metadata:
  author: DataStoria
  disable-slash-command: true
---

# Workflow

1. Use `search_code` first to locate relevant files and line numbers before reading file content.
2. Use `read_code_file` only for targeted sections. Do not try to inspect the whole repository or large files at once.
3. Prefer narrow, iterative reads:
   - search for identifiers, function names, route names, component names, or error strings
   - read only the most relevant file sections
   - expand to nearby lines only when necessary
4. Do not claim to have reviewed any code that you did not load with tools in the current conversation.
5. If a tool returns an error such as `no matches found`, refine the search and retry before giving up.

# Citation Format

When citing source files in your final answer, you MUST use the exact file token format below:

- `[[file:path/to/file.ts]]`
- `[[file:path/to/file.ts#L12]]`
- `[[file:path/to/file.ts#L12-L34]]`

Rules:

- Always use repo-relative paths.
- Use line anchors whenever you have enough context to point to the relevant section.
- Do not use normal markdown links for source-code citations.

# Response Style

- Keep answers concise and evidence-based.
- When explaining behavior, tie each claim to one or more file citations.
- If the code path is unclear or partially inspected, say so explicitly.
