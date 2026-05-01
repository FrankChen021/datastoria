import type { LocalStorage } from "@/lib/storage/local-storage-provider";
import { StorageManager } from "@/lib/storage/storage-provider-manager";

export type AgentMode = "v2" | "legacy";

const STORAGE_KEY = "settings:ai:agent";

// See clickhouse-error-code.ts
export const DEFAULT_AUTO_EXPLAIN_BLACKLIST = [
  "62", // SYNTAX_ERROR
  "194", // REQUIRED_PASSWORD
];

/** BCP-47 tags supported by AI response-language settings (default: English). */
export const AI_RESPONSE_LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "zh-CN", label: "简体中文" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "ja", label: "日本語" },
  { value: "ko", label: "한국어" },
  { value: "es", label: "Español" }, // Spanish (ISO 639-1)
  { value: "fr", label: "Français" },
  { value: "de", label: "Deutsch" },
] as const;

export type ResponseLanguage = (typeof AI_RESPONSE_LANGUAGE_OPTIONS)[number]["value"];
export type AIResponseLanguage = ResponseLanguage;

export const DEFAULT_AI_RESPONSE_LANGUAGE: AIResponseLanguage = "en";

export function normalizeAIResponseLanguage(raw: string | undefined): AIResponseLanguage {
  if (!raw) {
    return DEFAULT_AI_RESPONSE_LANGUAGE;
  }
  const option = AI_RESPONSE_LANGUAGE_OPTIONS.find((o) => o.value === raw);
  return option ? option.value : DEFAULT_AI_RESPONSE_LANGUAGE;
}

export const normalizeAutoExplainLanguage = normalizeAIResponseLanguage;
export const normalizeSqlReviewLanguage = normalizeAIResponseLanguage;

export type AgentConfiguration = {
  mode: AgentMode;
  /** Whether to prune successful validate_sql tool calls from history. Default true. */
  pruneValidateSql?: boolean;
  /** Whether to request reasoning summaries from models that support them. Default true. */
  outputReasoning?: boolean;
  /** Whether eligible ClickHouse errors should auto-trigger an inline AI explanation. */
  autoExplainClickHouseErrors?: boolean;
  /** ClickHouse error codes that should never auto-trigger inline explanation. */
  autoExplainBlacklist?: string[];
  /** Language for AI responses in SQL editor actions (BCP-47). Default English. */
  aiResponseLanguage?: AIResponseLanguage;
  /** @deprecated use aiResponseLanguage */
  autoExplainLanguage?: ResponseLanguage;
  /** @deprecated use aiResponseLanguage */
  sqlReviewLanguage?: ResponseLanguage;
};

export class AgentConfigurationManager {
  private static configuration: AgentConfiguration | null = null;

  private static getStorage(): LocalStorage {
    return StorageManager.getInstance().getStorageProvider().subStorage(STORAGE_KEY);
  }

  public static getConfiguration(): AgentConfiguration {
    if (!this.configuration) {
      const storage = this.getStorage();
      const stored = storage.getAsJSON<AgentConfiguration>(() => ({
        mode: "v2",
        pruneValidateSql: true,
        outputReasoning: true,
        autoExplainClickHouseErrors: true,
        autoExplainBlacklist: DEFAULT_AUTO_EXPLAIN_BLACKLIST,
        aiResponseLanguage: DEFAULT_AI_RESPONSE_LANGUAGE,
      }));
      this.configuration = {
        ...stored,
        aiResponseLanguage: normalizeAIResponseLanguage(
          stored.aiResponseLanguage ?? stored.sqlReviewLanguage ?? stored.autoExplainLanguage
        ),
      };
    }
    return this.configuration!;
  }

  public static setConfiguration(cfg: AgentConfiguration) {
    const {
      autoExplainLanguage: _legacyAutoExplain,
      sqlReviewLanguage: _legacySqlReview,
      ...rest
    } = cfg;
    const normalized = {
      ...rest,
      aiResponseLanguage: normalizeAIResponseLanguage(cfg.aiResponseLanguage),
    };
    this.configuration = normalized;
    this.getStorage().setJSON(normalized);
  }
}
