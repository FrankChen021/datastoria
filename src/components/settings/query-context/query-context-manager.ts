import { StorageManager } from "@/lib/storage/storage-provider-manager";
import type { QueryContext } from "./query-context";

class QueryContextManager {
  private static instance: QueryContextManager;

  private get storage() {
    return StorageManager.getInstance().getStorageProvider().subStorage("settings:query-context");
  }

  public static getInstance(): QueryContextManager {
    if (!QueryContextManager.instance) {
      QueryContextManager.instance = new QueryContextManager();
    }
    return QueryContextManager.instance;
  }

  public getContext(): QueryContext {
    return this.getStoredContext();
  }

  public getStoredContext(): Partial<QueryContext> {
    // Get stored context without defaults (for editing)
    return this.storage.getAsJSON<Partial<QueryContext>>(() => ({
      //
      // Default context values
      //
      // opentelemetry_start_trace_probability: 1,
      // output_format_pretty_row_numbers: true,
      // output_format_pretty_max_rows: 1000,
      max_execution_time: 60,
    }));
  }

  public setContext(context: Partial<QueryContext>): void {
    // Save exactly what is passed, without merging with defaults
    // Defaults will be applied when reading via getContext()
    this.storage.setJSON(context);
  }

  public updateContext(updates: Partial<QueryContext>): void {
    // Get stored context without defaults, merge updates, then save
    const stored = this.getStoredContext();
    this.setContext({ ...stored, ...updates });
  }
}

export { QueryContextManager };
