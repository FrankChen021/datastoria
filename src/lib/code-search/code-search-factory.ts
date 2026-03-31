import "server-only";
import { getCodeSearchConfig } from "./config";
import { LocalFileCodeSearch } from "./local-file-search";
import { isRipgrepAvailable, RipgrepCodeSearch } from "./ripgrep-code-search";
import type { CodeSearch, CodeSearchConfig } from "./types";

export interface CodeSearchContext {
  config: CodeSearchConfig;
  provider: CodeSearch;
}

interface CodeSearchFactoryOptions {
  isRipgrepAvailable?: () => Promise<boolean>;
  createLocalProvider?: (config: CodeSearchConfig) => CodeSearch;
  createRipgrepProvider?: (config: CodeSearchConfig) => CodeSearch;
}

export class CodeSearchFactory {
  constructor(private readonly options: CodeSearchFactoryOptions = {}) {}

  async getCodeSearchContext(): Promise<CodeSearchContext | null> {
    const config = await getCodeSearchConfig();
    if (!config.enabled) {
      return null;
    }

    const ripgrepAvailable = await (this.options.isRipgrepAvailable ?? isRipgrepAvailable)();
    console.info("[code-search]", "Provider selected", {
      provider: ripgrepAvailable ? "ripgrep" : "local-file",
      rootDir: config.rootDir,
    });
    const provider = ripgrepAvailable
      ? (
          this.options.createRipgrepProvider ??
          ((enabledConfig) => new RipgrepCodeSearch(enabledConfig))
        )(config)
      : (
          this.options.createLocalProvider ??
          ((enabledConfig) => new LocalFileCodeSearch(enabledConfig))
        )(config);

    return {
      config,
      provider,
    };
  }
}

export const defaultCodeSearchFactory = new CodeSearchFactory();
