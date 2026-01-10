import { LocalStorage } from "@/lib/local-storage";
import type { QueryContext } from "./query-context";

const QUERY_CONTEXT_STORAGE_KEY = "query-context";

class QueryContextManager {
  private static instance: QueryContextManager;
  private defaultContext: QueryContext = {
    opentelemetry_start_trace_probability: false,
    output_format_pretty_row_numbers: true,
    output_format_pretty_max_rows: 1000,
    max_execution_time: 60,
  };

  public static getInstance(): QueryContextManager {
    if (!QueryContextManager.instance) {
      QueryContextManager.instance = new QueryContextManager();
    }
    return QueryContextManager.instance;
  }

  public getContext(): QueryContext {
    const stored = this.getStoredContext();
    // Merge defaults with stored values (defaults are applied when reading)
    return { ...this.defaultContext, ...stored };
  }

  public getStoredContext(): Partial<QueryContext> {
    // Get stored context without defaults (for editing)
    return LocalStorage.getInstance().getAsJSON<Partial<QueryContext>>(
      QUERY_CONTEXT_STORAGE_KEY,
      () => ({})
    );
  }

  public setContext(context: Partial<QueryContext>): void {
    // Save exactly what is passed, without merging with defaults
    // Defaults will be applied when reading via getContext()
    LocalStorage.getInstance().setJSON(QUERY_CONTEXT_STORAGE_KEY, context);
  }

  public updateContext(updates: Partial<QueryContext>): void {
    // Get stored context without defaults, merge updates, then save
    const stored = this.getStoredContext();
    this.setContext({ ...stored, ...updates });
  }
}

export { QueryContextManager };
