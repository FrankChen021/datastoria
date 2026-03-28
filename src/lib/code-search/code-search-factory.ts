import "server-only";
import { getCodeSearchConfig } from "./config";
import { LocalFileCodeSearch } from "./local-file-search";
import type { CodeSearch, CodeSearchConfig } from "./types";

export interface CodeSearchContext {
  config: CodeSearchConfig;
  provider: CodeSearch;
}

export class CodeSearchFactory {
  async getCodeSearchContext(): Promise<CodeSearchContext | null> {
    const config = await getCodeSearchConfig();
    if (!config.enabled) {
      return null;
    }

    return {
      config,
      provider: new LocalFileCodeSearch(config),
    };
  }
}

export const defaultCodeSearchFactory = new CodeSearchFactory();
