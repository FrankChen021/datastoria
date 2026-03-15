---
name: clickhouse-error-diagnosis
description: Index of supported ClickHouse error handbooks. Use this when the user asks why a ClickHouse query failed and provides a numeric error code, symbolic error name such as UNKNOWN_SETTING, or raw DB::Exception text and wants an explanation or fix.
metadata:
  author: DataStoria
---

# ClickHouse Error Diagnosis

This skill is an index of supported ClickHouse error-code handbooks. All responses must use the same structure.

## Response format

Always respond with exactly these sections (omit ## Example only when no corrected SQL is useful):

- **## Cause** — One short sentence explaining why the error occurred.
- **## Fix** — Bullet list of concrete steps or changes (e.g. correct signature, valid setting name).
- **## Example** — A single fenced SQL block with corrected query; omit this section if no example applies.

Keep the answer brief and action-first. Do not repeat the raw error verbatim unless necessary. Do not add long background sections or extra headings (e.g. "Diagnosis and Fixes").

## How to use handbooks

When the user provides a supported numeric error code or symbolic error name for a failed ClickHouse query, load the matching handbook file with `skill_resource` and follow that file's workflow. The workflow tells you what to do (e.g. call `execute_sql`, look up a function) and what to put in Cause, Fix, and Example for that error type.

If the code is not listed here, state that no dedicated handbook is available, then use the error message and your general ClickHouse knowledge to provide a best-effort diagnosis in the same Cause / Fix / Example format.

## Covered Error Codes

- `42` -> `handbook/42-number-of-arguments-doesnt-match.md`
- `115` -> `handbook/115-unknown-setting.md`
