import { CLIENT_TOOL_NAMES, type AppUIMessage } from "@/lib/ai/client-tools";
import { toolExecutors } from "@/lib/ai/client-tools";
import { Connection } from "@/lib/connection/connection";
import { ConnectionManager } from "@/lib/connection/connection-manager";
import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { v7 as uuidv7 } from "uuid";
import { chatStorage } from "./storage";
import type { ChatContext, Message } from "./types";

/**
 * TOOL IMPLEMENTATION GUIDE
 *
 * To implement the tools, you need to:
 *
 * 1. Access the current ClickHouse connection:
 *    - The connection is available through the ConnectionContext
 *    - You can extend the ChatContext type to include the connection
 *    - Or access it via ConnectionManager.getInstance().getLastSelectedOrFirst()
 *
 * 2. For the 'get_tables' tool:
 *    - Use Api.create(connection) to create an API instance
 *    - Execute: SELECT database, name FROM system.tables
 *              WHERE NOT startsWith(name, '.inner')
 *              [AND database = ?] -- if databaseName is provided
 *              ORDER BY database, name
 *    - Use api.executeAsync() for async execution
 *    - Format: { database: string, name: string }[]
 *
 * 3. For the 'get_table_columns' tool:
 *    - Accepts an array of tables to query in batch
 *    - Query: SELECT database, table, type, comment FROM system.columns
 *            WHERE (database = ? AND table IN (...)) OR (database = ? AND table IN (...))
 *    - Groups tables by database and uses IN clause for efficient batch querying
 *    - Map to the expected output schema
 *
 * 4. For the 'execute_select_query' tool:
 *    - Build SELECT query from input parameters
 *    - Execute and return results
 *
 * Example implementation pattern:
 * ```typescript
 * import { Api } from '@/lib/api'
 * import { ConnectionManager } from '@/lib/connection/ConnectionManager'
 *
 * const connection = ConnectionManager.getInstance().getLastSelectedOrFirst()
 * if (!connection) {
 *   throw new Error('No connection available')
 * }
 * const api = Api.create(connection)
 * const response = await api.executeAsync({
 *   sql: 'SELECT database, name FROM system.tables WHERE NOT startsWith(name, \'.inner\')',
 *   params: { default_format: 'JSONCompact' }
 * })
 * const tables = response.data.data.map((row: any[]) => ({
 *   database: row[0],
 *   name: row[1]
 * }))
 * ```
 */

// Cache chat instances to avoid recreating them
const chatsMap = new Map<string, Chat<AppUIMessage>>();

/**
 * Context builder function type
 * Should be provided by the application to build ClickHouse-specific context
 */
type BuildContextFn = () => ChatContext | undefined;

let contextBuilder: BuildContextFn | undefined;

/**
 * Set the context builder function
 * This allows the chat system to access current query and database schema
 */
export function setChatContextBuilder(builder: BuildContextFn) {
  contextBuilder = builder;
}

/**
 * Get the current context for chat
 */
function buildContext(): ChatContext | undefined {
  return contextBuilder?.();
}

/**
 * Create or retrieve a chat instance
 * Uses @ai-sdk/react Chat class with custom transport for API communication
 */
export async function createChat(options?: {
  id?: string;
  databaseId?: string;
  skipStorage?: boolean;
  apiEndpoint?: string;
}): Promise<Chat<AppUIMessage>> {
  const chatId = options?.id || uuidv7();
  const skipStorage = options?.skipStorage ?? false;
  const apiEndpoint = options?.apiEndpoint ?? "/api/chat-agent";

  // Return cached instance if exists
  if (chatsMap.has(chatId)) {
    return chatsMap.get(chatId)!;
  }

  // Load existing messages from storage (skip for single-use chats)
  const existingMessages = skipStorage ? [] : await chatStorage.getMessages(chatId);

  // Ensure chat record exists (skip for single-use chats)
  let existingChat = skipStorage ? null : await chatStorage.getChat(chatId);
  if (!existingChat && !skipStorage) {
    const now = new Date();
    existingChat = {
      id: chatId,
      databaseId: options?.databaseId,
      title: undefined,
      createdAt: now,
      updatedAt: now,
    };
    await chatStorage.saveChat(existingChat);
  }

  // Create Chat instance
  const chat = new Chat<AppUIMessage>({
    id: chatId,
    generateId: uuidv7,
    // Automatically send tool results back to the API when all tool calls are complete
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,

    // Configure custom API endpoint
    transport: new DefaultChatTransport({
      api: apiEndpoint,
    }),

    // Initial messages from storage
    messages: existingMessages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      parts: msg.parts,
      createdAt: msg.createdAt,
      updatedAt: msg.updatedAt,
    })) as AppUIMessage[],


    // Handle tool calls from LLM using registry pattern
    onToolCall: async ({ toolCall }) => {
      const { toolName, toolCallId, input } = toolCall;

      // Ignore server-side reasoning tools (they are executed on the server)
      if (toolName === CLIENT_TOOL_NAMES.GENERATE_SQL || toolName === CLIENT_TOOL_NAMES.GENEREATE_VISUALIZATION) {
        return;
      }


      // Type guard to ensure toolName is a valid key
      if (!(toolName in toolExecutors)) {
        console.error(`Unknown tool: ${toolName}`);
        chat.addToolResult({
          tool: toolName as
            | typeof CLIENT_TOOL_NAMES.GET_TABLE_COLUMNS
            | typeof CLIENT_TOOL_NAMES.GET_TABLES
            | typeof CLIENT_TOOL_NAMES.EXECUTE_SQL,
          toolCallId,
          output: { error: `Unknown tool: ${toolName}` } as any,
        });
        return;
      }

      // Get the executor for this tool from the registry
      const executor = toolExecutors[toolName as keyof typeof toolExecutors];

      // Get the current connection
      const config = ConnectionManager.getInstance().getLastSelectedOrFirst();
      if (!config) {
        console.error("No ClickHouse connection available");
        chat.addToolResult({
          tool: toolName as any,
          toolCallId,
          output: { error: "No ClickHouse connection available" },
        });
        return;
      }

      const connection = Connection.create(config);

      try {
        // Execute the tool using the registry
        // TypeScript will properly infer the types based on toolName
        const output = await executor(input as any, connection);

        // Log output size for monitoring
        const outputStr = JSON.stringify(output);
        const outputSizeKB = (outputStr.length / 1024).toFixed(2);
        console.log(`🔧 Tool ${toolName} output size: ${outputSizeKB}KB`);
        
        if (outputStr.length > 500 * 1024) { // Warn if > 500KB
          console.warn(`⚠️ Large tool output detected for ${toolName}: ${outputSizeKB}KB`);
        }

        chat.addToolResult({
          tool: toolName as any,
          toolCallId,
          output,
        });
      } catch (error) {
        console.error(`Error executing tool ${toolName}:`, error);
        chat.addToolResult({
          tool: toolName as any,
          toolCallId,
          output: {
            error: error instanceof Error ? error.message : "Unknown error occurred",
          },
        });
      }
    },

    // Save assistant responses to storage (skip for single-use chats)
    onFinish: skipStorage
      ? undefined
      : async ({ message }) => {
        const messageToSave: Message = {
          id: message.id,
          chatId,
          role: message.role,
          parts: message.parts as any,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        await chatStorage.saveMessage(messageToSave);

        // Update chat timestamp
        const chat = await chatStorage.getChat(chatId);
        if (chat) {
          await chatStorage.saveChat({
            ...chat,
            updatedAt: new Date(),
          });
        }
      },
  });

  // Cache the instance
  chatsMap.set(chatId, chat);

  return chat;
}

/**
 * Clear a chat from cache
 * Useful when you want to force reload from storage
 */
export function clearChatCache(chatId: string) {
  chatsMap.delete(chatId);
}

/**
 * Clear all chats from cache
 */
export function clearAllChatCache() {
  chatsMap.clear();
}
