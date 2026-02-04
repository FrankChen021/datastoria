import type { LocalStorage } from "@/lib/storage/local-storage-provider";
import { StorageManager } from "@/lib/storage/storage-provider-manager";

export type AgentMode = "v2" | "legacy";

const STORAGE_KEY = "settings:ai:agent";

export type AgentConfiguration = {
  mode: AgentMode;
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
