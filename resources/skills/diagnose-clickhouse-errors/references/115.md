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
4. Present: error `115` / `UNKNOWN_SETTING` and the unknown setting name; best one to three matches from `system.settings` (or your knowledge) and whether to use the closest valid setting or remove the override; if the fix is in the query, one fenced SQL with the corrected query (otherwise omit Example).
