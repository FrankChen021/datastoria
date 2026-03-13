import { AgentConfigurationManager } from "@/components/settings/agent/agent-manager";
import { ModelManager } from "@/components/settings/models/model-manager";
import type { PlanToolOutput } from "@/lib/ai/agent/plan/planning-types";
import type { AppUIMessage, Message, MessageMetadata } from "@/lib/ai/chat-types";
import type { StageStatus, ToolProgressCallback } from "@/lib/ai/tools/client/client-tool-types";
import { ClientToolExecutors } from "@/lib/ai/tools/client/client-tools";
import { useToolProgressStore } from "@/lib/ai/tools/client/tool-progress-store";
import { SERVER_TOOL_NAMES } from "@/lib/ai/tools/server/server-tool-names";
import { BasePath } from "@/lib/base-path";
import { Connection, type QueryResponse } from "@/lib/connection/connection";
import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { v7 as uuidv7 } from "uuid";
import { ChatContext } from "./chat-context";
import { ChatUIContext } from "./chat-ui-context";
import { SessionManager } from "./session/session-manager";

type AbortableQueryResult<TResponse extends QueryResponse | Response> = {
  response: Promise<TResponse>;
  abortController: AbortController;
};
type ClientToolName = keyof typeof ClientToolExecutors;
const PROVISIONAL_SESSION_TITLE_WORDS = 8;

function extractTextFromMessage(
  message: Pick<Message, "parts"> | Pick<AppUIMessage, "parts">
): string {
  return message.parts
    .filter(
      (
        part
      ): part is {
        type: "text";
        text: string;
      } => part.type === "text" && typeof part.text === "string"
    )
    .map((part) => part.text.trim())
    .filter((text) => text.length > 0)
    .join(" ")
    .trim();
}

function buildProvisionalSessionTitle(text: string): string | undefined {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return undefined;
  }

  const truncatedWords = words.slice(0, PROVISIONAL_SESSION_TITLE_WORDS);
  const title = truncatedWords.join(" ").trim();
  return title || undefined;
}

/**
 * Create a progress callback for tool execution
 * Updates the progress store with stage informationÒ
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

export class ChatFactory {
  private static readonly clientToolAbortControllers = new Map<string, Set<AbortController>>();

  private static trackAbortController(chatId: string, abortController: AbortController): void {
    const controllers = this.clientToolAbortControllers.get(chatId) ?? new Set<AbortController>();
    controllers.add(abortController);
    this.clientToolAbortControllers.set(chatId, controllers);

    abortController.signal.addEventListener(
      "abort",
      () => {
        const currentControllers = this.clientToolAbortControllers.get(chatId);
        currentControllers?.delete(abortController);
        if (currentControllers && currentControllers.size === 0) {
          this.clientToolAbortControllers.delete(chatId);
        }
      },
      { once: true }
    );
  }

  private static untrackAbortController(chatId: string, abortController: AbortController): void {
    const controllers = this.clientToolAbortControllers.get(chatId);
    controllers?.delete(abortController);
    if (controllers && controllers.size === 0) {
      this.clientToolAbortControllers.delete(chatId);
    }
  }

  private static trackAbortableResult<TResponse extends QueryResponse | Response>(
    chatId: string,
    result: AbortableQueryResult<TResponse>
  ): AbortableQueryResult<TResponse> {
    ChatFactory.trackAbortController(chatId, result.abortController);
    void result.response.finally(() => {
      ChatFactory.untrackAbortController(chatId, result.abortController);
    });
    return result;
  }

  private static createClientToolConnection(chatId: string, connection: Connection): Connection {
    const wrappedConnection = Object.create(connection) as Connection;

    wrappedConnection.query = (sql, params, headers) =>
      ChatFactory.trackAbortableResult(chatId, connection.query(sql, params, headers));
    wrappedConnection.queryOnNode = (sql, params, headers) =>
      ChatFactory.trackAbortableResult(chatId, connection.queryOnNode(sql, params, headers));
    wrappedConnection.queryRawResponse = (sql, params, headers) =>
      ChatFactory.trackAbortableResult(chatId, connection.queryRawResponse(sql, params, headers));

    return wrappedConnection;
  }

  static stopClientTools(chatId: string): void {
    const controllers = this.clientToolAbortControllers.get(chatId);
    if (!controllers) {
      return;
    }

    for (const controller of [...controllers]) {
      controller.abort();
    }
    this.clientToolAbortControllers.delete(chatId);
  }

  /**
   * Get the current model configuration based on user settings
   */
  private static getCurrentModelConfig():
    | { provider: string; modelId: string; apiKey?: string }
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
    const providerSettings = modelManager.getProviderSettings();
    const providerSetting = providerSettings.find((p) => p.provider === provider);
    if (providerSetting?.apiKey) {
      return {
        provider,
        modelId,
        apiKey: providerSetting.apiKey,
      };
    }

    const model = modelManager
      .getAllModels()
      .find((candidate) => candidate.provider === provider && candidate.modelId === modelId);
    if (model?.source === "system") {
      return { provider, modelId };
    }

    return undefined;
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
      apiKey?: string;
    };
  }): Promise<Chat<AppUIMessage>> {
    const chatId = options.id || uuidv7();
    const skipStorage = options.skipStorage ?? false;
    const modelConfig = options.model;
    const connection = options.connection;
    const clientToolConnection = ChatFactory.createClientToolConnection(chatId, connection);

    // Clear all progress when a new session starts
    useToolProgressStore.getState().clearAllProgress();

    // Load existing messages from storage to restore chat history
    const historicalMessages = skipStorage ? [] : await SessionManager.getMessages(chatId);

    // Create Chat instance
    const chat = new Chat<AppUIMessage>({
      id: chatId,
      generateId: uuidv7,

      // Automatically send tool results back to the API when all tool calls are complete
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,

      transport: new DefaultChatTransport({
        fetch: async (input, init) => {
          const mode = AgentConfigurationManager.getConfiguration().mode;
          const endpoint = BasePath.getURL(mode === "v2" ? "/api/ai/chat/v2" : "/api/ai/chat");
          return fetch(endpoint, init);
        },

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
                const metadataCreatedAt =
                  typeof msg.metadata?.createdAt === "number"
                    ? new Date(msg.metadata.createdAt)
                    : undefined;
                const createdAt =
                  metadataCreatedAt && !Number.isNaN(metadataCreatedAt.getTime())
                    ? metadataCreatedAt
                    : new Date();
                const updatedAt = new Date();

                return {
                  id: msg.id,
                  chatId: chatId,
                  role: msg.role,
                  parts: msg.parts ?? [],
                  metadata: msg.metadata,
                  createdAt,
                  updatedAt,
                } as Message;
              });

            if (userMessagesToSave.length > 0) {
              let provisionalTitle: string | undefined;
              if (
                historicalMessages.length === 0 &&
                messages.length === 1 &&
                messages[0]?.role === "user"
              ) {
                provisionalTitle = buildProvisionalSessionTitle(
                  extractTextFromMessage(messages[0])
                );
                if (provisionalTitle) {
                  ChatUIContext.updateTitle(provisionalTitle);
                }
              }

              await SessionManager.saveMessages(chatId, userMessagesToSave);
              await SessionManager.touchSessionById(
                chatId,
                connection.connectionId,
                provisionalTitle
              );
            }
          }

          return {
            body: {
              ...body,
              messages,
              trigger,
              messageId,
              agentContext: {
                pruneValidateSql: AgentConfigurationManager.getConfiguration().pruneValidateSql,
              },
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
          toolName === SERVER_TOOL_NAMES.GENERATE_SQL ||
          toolName === SERVER_TOOL_NAMES.GENERATE_VISUALIZATION ||
          toolName === SERVER_TOOL_NAMES.OPTIMIZE_SQL ||
          toolName === SERVER_TOOL_NAMES.PLAN ||
          toolName === SERVER_TOOL_NAMES.SKILL ||
          toolName === SERVER_TOOL_NAMES.SKILL_RESOURCE
        ) {
          return;
        }

        if (!(toolName in ClientToolExecutors)) {
          console.error(`Unknown tool: ${toolName}`);
          chat.addToolOutput({
            tool: toolName as never,
            toolCallId,
            output: { error: `Unknown tool: ${toolName}` } as never,
          });
          return;
        }

        const executor = ClientToolExecutors[toolName as ClientToolName];

        try {
          // Create progress callback for all tools (tools that don't use it will simply ignore it)
          const progressCallback = createToolProgressCallback(
            toolCallId,
            toolName,
            useToolProgressStore.getState()
          );

          const output = await executor(input as never, clientToolConnection, progressCallback);
          chat.addToolOutput({
            tool: toolName as never,
            toolCallId,
            output: output as never,
          });
        } catch (error) {
          console.error(`Error executing tool ${toolName}:`, error);

          chat.addToolOutput({
            tool: toolName as never,
            toolCallId,
            output: {
              error: error instanceof Error ? error.message : "Unknown error occurred",
            } as never,
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
              parts: message.parts as Message["parts"],
              metadata: message.metadata as MessageMetadata,
              createdAt: now,
              updatedAt: now,
            };

            await SessionManager.saveMessage(chatId, messageToSave);
            let title: string | undefined;
            if (message.metadata?.title && typeof message.metadata.title.text === "string") {
              title = message.metadata.title.text;
              ChatUIContext.updateTitle(title);
            } else if (
              message.role === "assistant" &&
              message.parts.length > 1 &&
              message.parts[0].type === "dynamic-tool" &&
              message.parts[0].toolName === SERVER_TOOL_NAMES.PLAN
            ) {
              const output = message.parts[0].output as PlanToolOutput;
              if (output.title) {
                title = output.title;
                ChatUIContext.updateTitle(title);
              }
            }

            await SessionManager.touchSessionById(chatId, connection.connectionId, title);
          },
    });

    return chat;
  }
}
