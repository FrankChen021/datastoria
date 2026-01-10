import type { Message } from "./chat-message-types";

export interface DatabaseContext {
  currentQuery?: string;
  database?: string;
  tables?: Array<{
    name: string;
    columns: string[];
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

  /**
   * Extract historical database context from a list of messages
   * Aggregates all table schemas mentioned in the messages
   */
  static extractFromMessages(messages: Message[]): DatabaseContext | undefined {
    const allTables = new Map<string, { name: string; columns: string[] }>();

    for (const msg of messages) {
      if (msg.context?.tables) {
        for (const table of msg.context.tables) {
          allTables.set(table.name, table);
        }
      }
    }

    if (allTables.size === 0) return undefined;

    return {
      tables: Array.from(allTables.values()),
    };
  }
}
