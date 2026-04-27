import type { DatabaseContext } from "@/components/chat/chat-context";

/**
 * Server-side database context that extends DatabaseContext with server-specific fields.
 */
export interface ServerDatabaseContext extends DatabaseContext {
  /**
   * User email from authentication session. Undefined for anonymous users.
   */
  userEmail?: string;

  /**
   * True when the chat has an active ClickHouse connection and may use cluster tools.
   */
  clusterAvailable?: boolean;
}
