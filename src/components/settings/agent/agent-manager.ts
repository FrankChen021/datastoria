import type { LocalStorage } from "@/lib/storage/local-storage-provider";
import { StorageManager } from "@/lib/storage/storage-provider-manager";

export type AgentMode = "v2" | "legacy";

const STORAGE_KEY = "settings:ai:agent";

// See clickhouse-error-code.ts
export const DEFAULT_AUTO_EXPLAIN_BLACKLIST = [
  "62", // SYNTAX_ERROR
  "194", // REQUIRED_PASSWORD
];

/** BCP-47 tags for inline error AI explanations only (default: English). */
export const AUTO_EXPLAIN_LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "zh-CN", label: "简体中文" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "es", label: "Español" }, // Spanish (ISO 639-1)
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
] as const;

export type AutoExplainLanguage = (typeof AUTO_EXPLAIN_LANGUAGE_OPTIONS)[number]["value"];

export const DEFAULT_AUTO_EXPLAIN_LANGUAGE: AutoExplainLanguage = "en";

export function normalizeAutoExplainLanguage(raw: string | undefined): AutoExplainLanguage {
  if (!raw) {
    return DEFAULT_AUTO_EXPLAIN_LANGUAGE;
  }
  const option = AUTO_EXPLAIN_LANGUAGE_OPTIONS.find((o) => o.value === raw);
  return option ? option.value : DEFAULT_AUTO_EXPLAIN_LANGUAGE;
}

export type AgentConfiguration = {
  mode: AgentMode;
  /** Whether to prune successful validate_sql tool calls from history. Default true. */
  pruneValidateSql?: boolean;
  /** Whether eligible ClickHouse errors should auto-trigger an inline AI explanation. */
  autoExplainClickHouseErrors?: boolean;
  /** ClickHouse error codes that should never auto-trigger inline explanation. */
  autoExplainBlacklist?: string[];
  /** Language for automatic inline error explanations only (BCP-47). Default English. */
  autoExplainLanguage?: AutoExplainLanguage;
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
          autoExplainClickHouseErrors: true,
          autoExplainBlacklist: DEFAULT_AUTO_EXPLAIN_BLACKLIST,
          autoExplainLanguage: DEFAULT_AUTO_EXPLAIN_LANGUAGE,
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
