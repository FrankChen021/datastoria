import { createContext, useContext } from "react";

export type SqlExecutionMode = "tab" | "inline";

interface SqlExecutionContextValue {
  executionMode: SqlExecutionMode;
}

const SqlExecutionContext = createContext<SqlExecutionContextValue>({
  executionMode: "tab", // Default to legacy behavior
});

export const useSqlExecution = () => useContext(SqlExecutionContext);

export const SqlExecutionProvider = SqlExecutionContext.Provider;
