# Code 42: NUMBER_OF_ARGUMENTS_DOESNT_MATCH

The query calls a ClickHouse function with the wrong number of arguments.

## Workflow

1. Extract the function name from the error text.
2. Call `execute_sql` with the SQL below, replacing `FUNCTION_NAME` with the actual name as a single-quoted string (e.g. `'toDate'`). Do not modify the query or call `execute_sql` again.

    ```sql
    select arguments from system.functions where name = 'FUNCTION_NAME'
    ```

3. If `execute_sql` fails or returns no rows, use your own knowledge of the function's signature.
4. Present: error `42` / `NUMBER_OF_ARGUMENTS_DOESNT_MATCH` and the function name; expected arguments (from `arguments` or your knowledge) and the corrected argument count; one fenced SQL with the user's query fixed.
