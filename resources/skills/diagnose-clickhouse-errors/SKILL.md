---
name: diagnose-clickhouse-errors
description: Diagnose ClickHouse query failures when the user provides a numeric error code and wants a cause and fix.
metadata:
  author: DataStoria
---

## Workflow

1. Extract the numeric ClickHouse error code from the conversation or error text (e.g. `Code: 60`).
2. If no numeric error code is detected or extracted, you MUST call `ask_user_question` immediately with exactly one question. Do NOT reply with natural-language text. Do NOT output **Cause**, **Fix**, or **Example** before the tool call.
   - `header`: `Please provide a ClickHouse error code for diagnosis`
   - `options`:
     - `{ "id": "error_code", "label": "error code", "type": "text" }`
   After the tool returns:
   - Treat `value` as the numeric ClickHouse error code and continue.
3. Load `references/<code>.md` with `skill_resource` (e.g. `references/60.md`) and follow its workflow.
4. If the orchestrator provides database context facts such as cluster name, server version, or ClickHouse user, use them when they materially change the cause or fix. Treat missing values as unknown; do not infer them.
5. If `skill_resource` returns nothing, use the error message and your ClickHouse knowledge to provide a best-effort Cause / Fix / Example response.

## Response format

When an error code is available, respond with exactly these sections (omit ## Example only when no corrected SQL is useful):

- **## Cause** — One short sentence explaining why the error occurred.
- **## Fix** — Bullet list of concrete steps or changes.
- **## Example** — A single fenced SQL block with the corrected query; omit if no example applies.

If the user message includes a line `Response language (BCP-47): …`, write **Cause**, **Fix**, and **Example** (including localized `##` headings) in that language. Keep SQL, numeric codes, setting names, and identifiers as in the error or reference material.

Keep answers brief and action-first after an error code is available. Do not repeat the raw error verbatim. Do not add extra headings. If no error code is available yet, output only the `ask_user_question` tool call and nothing else.
