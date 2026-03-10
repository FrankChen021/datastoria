---
name: clickhouse-error-diagnosis
description: Index of supported ClickHouse error handbooks. Use this when the user asks why a ClickHouse query failed and provides a numeric error code, symbolic error name such as UNKNOWN_SETTING, or raw DB::Exception text and wants an explanation or fix.
metadata:
  author: DataStoria
---

# ClickHouse Error Diagnosis

This skill is only an index of supported ClickHouse error-code handbooks.

When a user provides a supported numeric error code or symbolic error name for a failed ClickHouse query, load the matching handbook file with `skill_resource` and follow that file's instructions.

If the code is not listed here, say that no dedicated handbook is available, then use the error message and your general ClickHouse knowledge to provide a best-effort diagnosis and likely fixes.

## Covered Error Codes

- `42` -> `handbook/42-number-of-arguments-doesnt-match.md`
- `115` -> `handbook/115-unknown-setting.md`
