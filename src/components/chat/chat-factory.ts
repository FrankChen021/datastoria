import { ModelManager } from "@/components/settings/models/model-manager";
import { SERVER_TOOL_PLAN } from "@/lib/ai/agent/plan/planning-agent";
import type { PlanToolOutput } from "@/lib/ai/agent/plan/planning-types";
import { SERVER_TOOL_GENERATE_SQL } from "@/lib/ai/agent/sql-generation-agent";
import { SERVER_TOOL_OPTIMIZE_SQL } from "@/lib/ai/agent/sql-optimization-agent";
import { SERVER_TOOL_GENEREATE_VISUALIZATION } from "@/lib/ai/agent/visualization-agent";
import type { AppUIMessage, Message, MessageMetadata } from "@/lib/ai/chat-types";
import { MODELS } from "@/lib/ai/llm/llm-provider-factory";
import type { StageStatus, ToolProgressCallback } from "@/lib/ai/tools/client/client-tool-types";
import { CLIENT_TOOL_NAMES, ClientToolExecutors } from "@/lib/ai/tools/client/client-tools";
import { useToolProgressStore } from "@/lib/ai/tools/client/tool-progress-store";
import { Connection } from "@/lib/connection/connection";
import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { v7 as uuidv7 } from "uuid";
import { ChatContext } from "./chat-context";
import { chatStorage } from "./storage/chat-storage";

/**
 * Create a progress callback for tool execution
 * Updates the progress store with stage information
 */
function createToolProgressCallback(
  toolCallId: string,
  toolName: string,
  progressStore: ReturnType<typeof useToolProgressStore.getState>
): ToolProgressCallback {
  return (stage: string, progress: number, status: StageStatus, error?: string) => {
    progressStore.updateProgress(toolCallId, {
      toolName,
      stage,
      progress,
      stageStatus: status, // This will add to stages history
      stageError: error,
    });
  };
}

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
  static async create(options: {
    id?: string;
    connection: Connection;
    skipStorage?: boolean;
    apiEndpoint?: string;
    model?: {
      provider: string;
      modelId: string;
      apiKey: string;
    };
  }): Promise<Chat<AppUIMessage>> {
    const chatId = options.id || uuidv7();
    const skipStorage = options.skipStorage ?? false;
    const apiEndpoint = options.apiEndpoint ?? "/api/chat";
    const modelConfig = options.model;
    const connection = options.connection;

    // Clear all progress when a new session starts
    useToolProgressStore.getState().clearAllProgress();

    // Load existing messages from storage to restore chat history
    const historicalMessages = skipStorage ? [] : await chatStorage.getMessages(chatId);

    // Create Chat instance
    const chat = new Chat<AppUIMessage>({
      id: chatId,
      generateId: uuidv7,

      // Automatically send tool results back to the API when all tool calls are complete
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,

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
                // Use current local time for createdAt (only used for display, not sorting)
                // Messages are sorted by UUIDv7 message ID, which maintains chronological order
                const now = new Date();

                return {
                  id: msg.id,
                  chatId: chatId,
                  role: msg.role,
                  parts: msg.parts || [{ type: "text", text: mAny.content || "" }],
                  metadata: msg.metadata,
                  createdAt: now,
                  updatedAt: now,
                  usage: undefined,
                } as Message;
              });

            if (userMessagesToSave.length > 0) {
              await chatStorage.saveMessages(chatId, userMessagesToSave);

              let chatData = await chatStorage.getChat(chatId);

              if (!chatData) {
                const now = new Date();
                let title: string | undefined;

                chatData = {
                  chatId: chatId,
                  databaseId: connection.connectionId,
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
        },
      }),

      messages: historicalMessages.map((msg) => ({
        id: msg.id,
        role: msg.role,
        parts: msg.parts,
        createdAt: msg.createdAt,
        updatedAt: msg.updatedAt,
        metadata: msg.metadata,
      })) as AppUIMessage[],

      onToolCall: async ({ toolCall }) => {
        const { toolName, toolCallId, input } = toolCall;
        if (
          toolName === SERVER_TOOL_GENERATE_SQL ||
          toolName === SERVER_TOOL_GENEREATE_VISUALIZATION ||
          toolName === SERVER_TOOL_OPTIMIZE_SQL ||
          toolName === SERVER_TOOL_PLAN
        ) {
          return;
        }

        if (!(toolName in ClientToolExecutors)) {
          console.error(`Unknown tool: ${toolName}`);
          chat.addToolOutput({
            tool: toolName as
              | typeof CLIENT_TOOL_NAMES.EXPLORE_SCHEMA
              | typeof CLIENT_TOOL_NAMES.GET_TABLES
              | typeof CLIENT_TOOL_NAMES.EXECUTE_SQL,
            toolCallId,
            output: { error: `Unknown tool: ${toolName}` } as any,
          });
          return;
        }

        const executor = ClientToolExecutors[toolName as keyof typeof ClientToolExecutors];

        try {
          // Create progress callback for all tools (tools that don't use it will simply ignore it)
          const progressCallback = createToolProgressCallback(
            toolCallId,
            toolName,
            useToolProgressStore.getState()
          );

          const output = await executor(input as any, connection, progressCallback);
          chat.addToolOutput({
            tool: toolName as any,
            toolCallId,
            output,
          });
        } catch (error) {
          console.error(`Error executing tool ${toolName}:`, error);

          chat.addToolOutput({
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
            // Use current local time for createdAt (only used for display, not sorting)
            // Messages are sorted by UUIDv7 message ID, which maintains chronological order
            const now = new Date();

            const messageToSave: Message = {
              id: message.id,
              role: message.role,
              parts: message.parts as any,
              metadata: message.metadata as MessageMetadata,
              createdAt: now,
              updatedAt: now,
            };

            await chatStorage.saveMessage(chatId, messageToSave);
            let chat = await chatStorage.getChat(chatId);
            if (!chat) {
              const now = new Date();
              chat = {
                chatId: chatId,
                databaseId: connection.connectionId,
                createdAt: now,
                updatedAt: now,
              };
            }

            if (
              message.role === "assistant" &&
              message.parts.length > 1 &&
              message.parts[0].type === "dynamic-tool" &&
              message.parts[0].toolName === SERVER_TOOL_PLAN
            ) {
              const output = message.parts[0].output as PlanToolOutput;
              if (output.title) {
                chat.title = output.title;
              }
            }

            // Always update the chat's updatedAt timestamp when a message is saved.
            // This ensures:
            // 1. The chat appears at the top of the history list (sorted by updatedAt)
            // 2. The "last updated" time displayed in the UI is accurate
            // 3. Chats are correctly grouped by time periods (Today, Yesterday, etc.)
            await chatStorage.saveChat({
              ...chat,
              updatedAt: new Date(),
            });
          },
    });

    return chat;
  }
}
