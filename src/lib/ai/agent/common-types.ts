import type { DatabaseContext } from "@/components/chat/chat-context";

/**
 * Server-side database context that extends DatabaseContext with server-specific fields.
 */
export interface ServerDatabaseContext extends DatabaseContext {
  /**
   * User email from authentication session. Undefined for anonymous users.
   */
  userEmail?: string;
}
