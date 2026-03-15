import type { LocalStorage } from "@/lib/storage/local-storage-provider";
import { StorageManager } from "@/lib/storage/storage-provider-manager";

export type AgentMode = "v2" | "legacy";

const STORAGE_KEY = "settings:ai:agent";

// See clickhouse-error-code.ts
export const DEFAULT_AUTO_EXPLAIN_BLACKLIST = [
  "62", // SYNTAX_ERROR
  "194", // REQUIRED_PASSWORD
];

export type AgentConfiguration = {
  mode: AgentMode;
  /** Whether to prune successful validate_sql tool calls from history. Default true. */
  pruneValidateSql?: boolean;
  /** Whether eligible ClickHouse errors should auto-trigger an inline AI explanation. */
  autoExplainClickHouseErrors?: boolean;
  /** ClickHouse error codes that should never auto-trigger inline explanation. */
  autoExplainBlacklist?: string[];
};

export class AgentConfigurationManager {
  private static configuration: AgentConfiguration | null = null;

  private static getStorage(): LocalStorage {
    return StorageManager.getInstance().getStorageProvider().subStorage(STORAGE_KEY);
  }

  public static getConfiguration(): AgentConfiguration {
    if (!this.configuration) {
      const storage = this.getStorage();
      this.configuration = storage.getAsJSON<AgentConfiguration>(() => {
        return {
          mode: "v2",
          pruneValidateSql: true,
          autoExplainClickHouseErrors: false,
          autoExplainBlacklist: DEFAULT_AUTO_EXPLAIN_BLACKLIST,
        };
      });
    }
    return this.configuration!;
  }

  public static setConfiguration(cfg: AgentConfiguration) {
    this.configuration = cfg;
    this.getStorage().setJSON(cfg);
  }
}
