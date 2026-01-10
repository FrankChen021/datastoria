import { ModelManager } from "@/components/settings/models/model-manager";
import { SERVER_TOOL_NAMES } from "@/lib/ai/agent/server-tools";
import { CLIENT_TOOL_NAMES, ClientToolExecutors } from "@/lib/ai/client-tools";
import type { AppUIMessage } from "@/lib/ai/common-types";
import { MODELS } from "@/lib/ai/llm/llm-provider-factory";
import { Connection } from "@/lib/connection/connection";
import { ConnectionManager } from "@/lib/connection/connection-manager";
import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { v7 as uuidv7 } from "uuid";
import { ChatContext, type DatabaseContext } from "./chat-context";
import type { Message } from "./chat-message-types";
import { chatStorage } from "./storage/chat-storage";

/**
 * Extract title from message text: first 10 tokens, maximum 64 characters
 */
function extractTitleFromMessage(message: Message): string | undefined {
  // Get text from message parts
  const textParts = message.parts.filter(
    (p): p is { type: "text"; text: string } => p.type === "text"
  );
  if (textParts.length === 0) return undefined;

  const fullText = textParts
    .map((p) => p.text)
    .join(" ")
    .trim();
  if (!fullText) return undefined;

  // Split into tokens (words) and take first 10
  const tokens = fullText.split(/\s+/).filter((t) => t.length > 0);
  const titleTokens = tokens.slice(0, 10);
  let title = titleTokens.join(" ");

  // Limit to 64 characters
  if (title.length > 64) {
    title = title.slice(0, 64).trim();
    // Don't cut in the middle of a word if possible
    const lastSpace = title.lastIndexOf(" ");
    if (lastSpace > 0 && lastSpace > 32) {
      title = title.slice(0, lastSpace);
    }
  }

  return title || undefined;
}

export class ChatFactory {
  /**
   * Get the current model configuration based on user settings
   */
  private static getCurrentModelConfig():
    | { provider: string; modelId: string; apiKey: string }
    | undefined {
    const modelManager = ModelManager.getInstance();
    const selectedModel = modelManager.getSelectedModel();

    if (
      !selectedModel ||
      (selectedModel.provider === "System" && selectedModel.modelId === "Auto")
    ) {
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

  /**
   * Create or retrieve a chat instance
   */
  static async create(options?: {
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
    const apiEndpoint = options?.apiEndpoint ?? "/api/chat";
    const getCurrentSessionId = options?.getCurrentSessionId;
    const getMessageSessionId = options?.getMessageSessionId;
    const modelConfig = options?.model;

    // Load existing messages from storage (skip for single-use chats)
    const existingMessages = skipStorage ? [] : await chatStorage.getMessages(chatId);

    // Create Chat instance
    const chat = new Chat<AppUIMessage>({
      id: chatId,
      generateId: uuidv7,
      // Automatically send tool results back to the API when all tool calls are complete
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,

      // Configure custom API endpoint with message filtering by sessionId
      transport: new DefaultChatTransport({
        api: apiEndpoint,
        prepareSendMessagesRequest: async ({
          messages,
          trigger,
          messageId,
          body,
          headers,
          credentials,
        }) => {
          // Get current model config dynamically if not provided in options
          const currentModel = modelConfig || ChatFactory.getCurrentModelConfig();

          // Save user messages that haven't been saved yet
          if (!skipStorage) {
            const userMessagesToSave = messages
              .filter((msg) => {
                // Only save user messages
                // Assistant messages are saved via onFinish callback
                return msg.role === "user";
              })
              .map((msg) => {
                const mAny = msg as any;
                const createdAt = mAny.createdAt
                  ? new Date(mAny.createdAt)
                  : mAny.metadata?.createdAt
                    ? new Date(mAny.metadata.createdAt)
                    : new Date();

                return {
                  id: msg.id,
                  chatId: chatId,
                  role: msg.role,
                  parts: msg.parts || [{ type: "text", text: mAny.content || "" }],
                  createdAt: createdAt,
                  updatedAt: new Date(),
                  usage: undefined,
                } as Message;
              });

            if (userMessagesToSave.length > 0) {
              await chatStorage.saveMessages(chatId, userMessagesToSave);

              let chatData = await chatStorage.getChat(chatId);

              if (!chatData) {
                const now = new Date();
                let title: string | undefined;

                const firstUserMessage = userMessagesToSave[0];
                if (firstUserMessage && firstUserMessage.role === "user") {
                  title = extractTitleFromMessage(firstUserMessage);
                }

                chatData = {
                  chatId: chatId,
                  databaseId: options?.databaseId,
                  title,
                  createdAt: now,
                  updatedAt: now,
                };
              }

              await chatStorage.saveChat({
                ...chatData,
                updatedAt: new Date(),
              });
            }
          }

          // Filter messages to only include those from the current session
          const currentSessionId = getCurrentSessionId?.();
          if (!currentSessionId) {
            return {
              body: {
                ...body,
                messages,
                trigger,
                messageId,
                ...(ChatContext.build() && { context: ChatContext.build() }),
                ...(currentModel && { model: currentModel }),
              },
              headers,
              credentials,
            };
          }

          const filteredMessages = messages.filter((msg) => {
            let msgSessionId = (msg as { sessionId?: string }).sessionId;
            if (!msgSessionId && getMessageSessionId) {
              msgSessionId = getMessageSessionId(msg.id);
            }
            return msgSessionId === currentSessionId;
          });

          const currentContext = ChatContext.build();
          const historicalContext = ChatContext.extractFromMessages(filteredMessages as any);

          const contextWithUser: DatabaseContext = {
            ...currentContext,
            tables: [...(currentContext?.tables || []), ...(historicalContext?.tables || [])],
          };

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

      messages: existingMessages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        parts: msg.parts,
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt,
        usage: msg.usage,
      })) as AppUIMessage[],

      onToolCall: async ({ toolCall }) => {
        const { toolName, toolCallId, input } = toolCall;

        if (
          toolName === SERVER_TOOL_NAMES.GENERATE_SQL ||
          toolName === SERVER_TOOL_NAMES.GENEREATE_VISUALIZATION
        ) {
          return;
        }

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

        const executor = ClientToolExecutors[toolName as keyof typeof ClientToolExecutors];
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
          const output = await executor(input as any, connection);
          const outputStr = JSON.stringify(output);
          const outputSizeKB = (outputStr.length / 1024).toFixed(2);
          console.log(`🔧 Tool ${toolName} output size: ${outputSizeKB}KB`);

          if (outputStr.length > 500 * 1024) {
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

      onFinish: skipStorage
        ? undefined
        : async ({ message }) => {
            const uiMessage = message as AppUIMessage;
            const messageAny = message as any;
            const usage = messageAny.metadata?.usage || messageAny.usage || uiMessage.usage;
            const messageCreatedAt = messageAny.createdAt
              ? new Date(messageAny.createdAt)
              : messageAny.metadata?.createdAt
                ? new Date(messageAny.metadata.createdAt)
                : new Date();

            const messageToSave: Message = {
              id: message.id,
              chatId,
              role: message.role,
              parts: message.parts as any,
              createdAt: messageCreatedAt,
              updatedAt: new Date(),
              usage: usage,
            };

            await chatStorage.saveMessage(messageToSave);

            let chat = await chatStorage.getChat(chatId);

            if (!chat) {
              const now = new Date();
              let title: string | undefined;

              if (messageToSave.role === "user") {
                title = extractTitleFromMessage(messageToSave);
              }

              chat = {
                chatId: chatId,
                databaseId: options?.databaseId,
                title,
                createdAt: now,
                updatedAt: now,
              };
            }

            await chatStorage.saveChat({
              ...chat,
              updatedAt: new Date(),
            });
          },
    });

    return chat;
  }
}
