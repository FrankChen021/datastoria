import { CLIENT_TOOL_NAMES, ClientToolExecutors } from "@/lib/ai/client-tools";
import { SERVER_TOOL_NAMES } from "@/lib/ai/server-tools";
import type { AppUIMessage } from "@/lib/ai/common-types";
import { Connection } from "@/lib/connection/connection";
import { ConnectionManager } from "@/lib/connection/connection-manager";
import { ModelManager } from "@/lib/models/model-manager";
import { MODELS } from "@/lib/ai/llm-provider-factory";
import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { v7 as uuidv7 } from "uuid";
import { chatStorage } from "./storage";
import type { DatabaseContext, Message } from "./types";

/**
 * Get the current model configuration based on user settings
 */
function getCurrentModelConfig(): { provider: string; modelId: string; apiKey: string } | undefined {
  const modelManager = ModelManager.getInstance();
  const selectedModel = modelManager.getSelectedModel();

  // If no model selected, or it's set to Auto, return undefined to let backend handle auto-selection
  if (!selectedModel || (selectedModel.provider === "System" && selectedModel.modelId === "Auto")) {
    return undefined;
  }

  const { provider, modelId } = selectedModel;

  const modelProps = MODELS.find((m) => m.modelId === modelId && m.provider === provider);
  if (!modelProps) return undefined;

  const providerSettings = modelManager.getProviderSettings();
  const providerSetting = providerSettings.find((p) => p.provider === provider);
  if (!providerSetting?.apiKey) return undefined;

  return {
    provider,
    modelId,
    apiKey: providerSetting.apiKey,
  };
}

// Cache chat instances to avoid recreating them
const chatsMap = new Map<string, Chat<AppUIMessage>>();

/**
 * Context builder function type
 * Should be provided by the application to build ClickHouse-specific context
 */
type BuildContextFn = () => DatabaseContext | undefined;

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
 * Note: Currently unused but kept for potential future use
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function buildContext(): DatabaseContext | undefined {
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
  getCurrentSessionId?: () => string | undefined;
  getMessageSessionId?: (messageId: string) => string | undefined;
  model?: {
    provider: string;
    modelId: string;
    apiKey: string;
  };
}): Promise<Chat<AppUIMessage>> {
  const chatId = options?.id || uuidv7();
  const skipStorage = options?.skipStorage ?? false;
  const apiEndpoint = options?.apiEndpoint ?? "/api/chat-agent";
  const getCurrentSessionId = options?.getCurrentSessionId;
  const getMessageSessionId = options?.getMessageSessionId;
  const modelConfig = options?.model;

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

    // Configure custom API endpoint with message filtering by sessionId
    transport: new DefaultChatTransport({
      api: apiEndpoint,
      prepareSendMessagesRequest: ({ messages, trigger, messageId, body, headers, credentials }) => {
        // Get current model config dynamically if not provided in options
        const currentModel = modelConfig || getCurrentModelConfig();

        // Filter messages to only include those from the current session
        const currentSessionId = getCurrentSessionId?.();
        if (!currentSessionId) {
          // If no sessionId, send all messages (fallback behavior)
          return {
            body: {
              ...body,
              messages,
              trigger,
              messageId,
              ...(contextBuilder?.() && { context: contextBuilder() }),
              ...(currentModel && { model: currentModel }),
            },
            headers,
            credentials,
          };
        }

        // Filter messages by sessionId
        // Messages without sessionId metadata will be excluded from new sessions
        const filteredMessages = messages.filter((msg) => {
          // Try to get sessionId from message metadata first
          let msgSessionId = (msg as { sessionId?: string }).sessionId;

          // If not found in metadata, try to look it up by message ID
          if (!msgSessionId && getMessageSessionId) {
            msgSessionId = getMessageSessionId(msg.id);
          }

          // Include message if it has the current sessionId
          // For new conversations, we only want messages with the current sessionId
          return msgSessionId === currentSessionId;
        });

        // Get context from context builder and ensure clickHouseUser is included
        const currentContext = contextBuilder?.();
        const contextWithUser = currentContext ? { ...currentContext } : undefined;

        return {
          body: {
            ...body,
            messages: filteredMessages,
            trigger,
            messageId,
            ...(contextWithUser && { context: contextWithUser }),
            ...(currentModel && { model: currentModel }),
          },
          headers,
          credentials,
        };
      },
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
      if (toolName === SERVER_TOOL_NAMES.GENERATE_SQL || toolName === SERVER_TOOL_NAMES.GENEREATE_VISUALIZATION) {
        return;
      }

      // Type guard to ensure toolName is a valid key
      if (!(toolName in ClientToolExecutors)) {
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
      const executor = ClientToolExecutors[toolName as keyof typeof ClientToolExecutors];

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

        if (outputStr.length > 500 * 1024) {
          // Warn if > 500KB
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
          const uiMessage = message as AppUIMessage & {
            usage?: {
              inputTokens: number;
              outputTokens: number;
              totalTokens: number;
            };
          };
          const messageToSave: Message = {
            id: message.id,
            chatId,
            role: message.role,
            parts: message.parts as any,
            createdAt: new Date(),
            updatedAt: new Date(),
            usage: uiMessage.usage,
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
