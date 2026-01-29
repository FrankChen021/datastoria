
export interface DatabaseContext {
  currentQuery?: string;
  database?: string;
  tables?: Array<{
    name: string;
    columns: Array<{ name: string; type: string }> | string[];
    totalColumns?: number;
  }>;

  /**
   * Used for SQL generation
   */
  clickHouseUser?: string;
}

/**
 * Context builder function type
 */
export type BuildContextFn = () => DatabaseContext | undefined;

export class ChatContext {
  private static builder: BuildContextFn | undefined;

  /**
   * Set the context builder function
   */
  static setBuilder(builder: BuildContextFn) {
    ChatContext.builder = builder;
  }

  /**
   * Get the current context using the builder
   */
  static build(): DatabaseContext | undefined {
    return ChatContext.builder?.();
  }
}
