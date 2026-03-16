---
name: diagnose-clickhouse-errors
description: Diagnose ClickHouse query failures when the user provides a numeric error code, symbolic error name such as UNKNOWN_SETTING, or raw DB::Exception text and wants a cause and fix.
metadata:
  author: DataStoria
---

# Diagnose ClickHouse Errors

This skill is an index of supported ClickHouse error-code references. All responses must use the same structure.

## Response format

Always respond with exactly these sections (omit ## Example only when no corrected SQL is useful):

- **## Cause** — One short sentence explaining why the error occurred.
- **## Fix** — Bullet list of concrete steps or changes (e.g. correct signature, valid setting name).
- **## Example** — A single fenced SQL block with corrected query; omit this section if no example applies.

Keep the answer brief and action-first. Do not repeat the raw error verbatim unless necessary. Do not add long background sections or extra headings (e.g. "Diagnosis and Fixes").

## How to use references

When the user provides a supported numeric error code or symbolic error name for a failed ClickHouse query, load the matching reference file with `skill_resource` and follow that file's workflow. The workflow tells you what to do (e.g. call `execute_sql`, look up a function) and what to put in Cause, Fix, and Example for that error type.

If the code is not listed here, state that no dedicated reference is available, then use the error message and your general ClickHouse knowledge to provide a best-effort diagnosis in the same Cause / Fix / Example format.

## Covered Error Codes

- `42` -> `references/42-number-of-arguments-doesnt-match.md`
- `115` -> `references/115-unknown-setting.md`
