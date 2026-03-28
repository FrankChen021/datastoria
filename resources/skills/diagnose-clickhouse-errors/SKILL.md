---
name: diagnose-clickhouse-errors
description: Diagnose ClickHouse runtime query failures when the user wants database-level cause and fix guidance from an error or numeric error code, not source-code root cause analysis.
metadata:
  author: DataStoria
---

## When Not To Use

Do not use this skill when the user's primary goal is:

- investigating application or repository source code
- tracing where failing SQL was constructed in code
- finding code paths that produced the ClickHouse error

In those cases, prefer `source-code-inspection`. Do not start this skill's error-code intake flow unless the user is asking for database-level diagnosis.

## Workflow

1. Determine whether the user is asking for database-level diagnosis or source-code investigation. If the primary goal is source-code investigation or file-cited code analysis, stop and prefer `source-code-inspection`.
2. Extract the numeric ClickHouse error code from the conversation or error text (e.g. `Code: 60`).
3. If no numeric error code is detected and the user is asking for database-level diagnosis, call `ask_user_question` with exactly one question. Do NOT reply with natural-language text before the tool call.
   - `header`: `Please provide a ClickHouse error code for diagnosis`
   - `options`: `{ "id": "error_code", "label": "error code", "type": "text" }`
   - Treat the returned `value` as the numeric error code and continue.
4. Load `references/<code>.md` with `skill_resource` (e.g. `references/60.md`) and follow its workflow.
5. If the orchestrator provides database context facts, use them when they materially change the cause or fix.
6. If `skill_resource` returns nothing, use your ClickHouse knowledge to provide a best-effort response.

## Response format

- **## Cause** — One short sentence explaining why the error occurred.
- **## Fix** — Bullet list of concrete steps.
- **## Example** — A single fenced SQL block with the corrected query; omit if not applicable.

If the user message includes `Response language (BCP-47): …`, respond in that language. Keep SQL, codes, and identifiers as-is.

Keep answers brief and action-first. Do not repeat the raw error verbatim. Do not add extra headings.
