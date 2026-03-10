# Code 115: UNKNOWN_SETTING

The query or session uses a setting name that this ClickHouse server does not recognize.

## Workflow

1. Extract the unknown setting name from the error text.
2. Call `execute_sql` with the SQL below, replacing `SETTING_NAME` with the actual name as a single-quoted string (e.g. `'max_memory_usage'`). Do not modify the query or call `execute_sql` again.

    ```sql
    SELECT name, levenshteinDistance(name, 'SETTING_NAME') AS dist
    FROM system.settings
    ORDER BY dist
    LIMIT 3
    ```

3. If `execute_sql` fails or returns no rows, use your own knowledge of valid ClickHouse settings to suggest the closest match.
4. Use the returned matches (or your own knowledge) to suggest the fix.

## Output

- State this is error `115` / `UNKNOWN_SETTING` and name the unknown setting.
- List the best one to three matches from `system.settings`.
- Give the fix: use the closest valid setting or remove the unsupported override.
