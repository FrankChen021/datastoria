import { getRuntimeConfig } from "@/components/runtime-config-provider";
import { AgentConfigurationManager } from "@/components/settings/agent/agent-manager";
import { ModelManager } from "@/components/settings/models/model-manager";
import type { PlanToolOutput } from "@/lib/ai/agent/plan/planning-types";
import type { AppUIMessage, Message, MessageMetadata } from "@/lib/ai/chat-types";
import type { StageStatus, ToolProgressCallback } from "@/lib/ai/tools/client/client-tool-types";
import { CLIENT_TOOL_NAMES, ClientToolExecutors } from "@/lib/ai/tools/client/client-tools";
import { useToolProgressStore } from "@/lib/ai/tools/client/tool-progress-store";
import { SERVER_TOOL_NAMES } from "@/lib/ai/tools/server/server-tool-names";
import { BasePath } from "@/lib/base-path";
import { Connection, type QueryResponse } from "@/lib/connection/connection";
import { Chat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { v7 as uuidv7 } from "uuid";
import { ChatContext, type DatabaseContext } from "./chat-context";
import { ChatUIContext } from "./chat-ui-context";
import { toSessionRepositoryConnectionId } from "./session/session-connection-id";
import { SessionManager } from "./session/session-manager";

type AbortableQueryResult<TResponse extends QueryResponse | Response> = {
  response: Promise<TResponse>;
  abortController: AbortController;
};
type ClientToolName = keyof typeof ClientToolExecutors;
const PROVISIONAL_SESSION_TITLE_WORDS = 8;

type ChatFactoryCreateOptions = {
  sessionId?: string;
  connection: Connection;
  apiEndpoint?: string;
  context?: DatabaseContext;
  ephemeral?: boolean;
  initialMessages: AppUIMessage[];
  model?: {
    provider: string;
    modelId: string;
    apiKey?: string;
  };
};
type PrepareSendMessagesRequestArgs = {
  sessionId: string;
  connection: Connection;
  historicalMessages: AppUIMessage[];
  messages: AppUIMessage[];
};
type FinishMessageArgs = {
  sessionId: string;
  connection: Connection;
  message: AppUIMessage;
};
type CreateInternalOptions = ChatFactoryCreateOptions & {
  initialMessages: AppUIMessage[];
  generateTitle: boolean;
  onPrepareSendMessagesRequest?: (args: PrepareSendMessagesRequestArgs) => Promise<void> | void;
  onFinish?: (args: FinishMessageArgs) => Promise<void> | void;
};

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

function newUniqueSessionId(): string {
  return uuidv7().replace(/-/g, "");
}

export class ChatFactory {
  private static readonly clientToolAbortControllers = new Map<string, Set<AbortController>>();

  private static trackAbortController(sessionId: string, abortController: AbortController): void {
    const controllers =
      this.clientToolAbortControllers.get(sessionId) ?? new Set<AbortController>();
    controllers.add(abortController);
    this.clientToolAbortControllers.set(sessionId, controllers);

    abortController.signal.addEventListener(
      "abort",
      () => {
        const currentControllers = this.clientToolAbortControllers.get(sessionId);
        currentControllers?.delete(abortController);
        if (currentControllers && currentControllers.size === 0) {
          this.clientToolAbortControllers.delete(sessionId);
        }
      },
      { once: true }
    );
  }

  private static untrackAbortController(sessionId: string, abortController: AbortController): void {
    const controllers = this.clientToolAbortControllers.get(sessionId);
    controllers?.delete(abortController);
    if (controllers && controllers.size === 0) {
      this.clientToolAbortControllers.delete(sessionId);
    }
  }

  private static trackAbortableResult<TResponse extends QueryResponse | Response>(
    sessionId: string,
    result: AbortableQueryResult<TResponse>
  ): AbortableQueryResult<TResponse> {
    ChatFactory.trackAbortController(sessionId, result.abortController);
    void result.response.finally(() => {
      ChatFactory.untrackAbortController(sessionId, result.abortController);
    });
    return result;
  }

  private static createClientToolConnection(sessionId: string, connection: Connection): Connection {
    const wrappedConnection = Object.create(connection) as Connection;

    wrappedConnection.query = (sql, params, headers) =>
      ChatFactory.trackAbortableResult(sessionId, connection.query(sql, params, headers));
    wrappedConnection.queryOnNode = (sql, params, headers) =>
      ChatFactory.trackAbortableResult(sessionId, connection.queryOnNode(sql, params, headers));
    wrappedConnection.queryRawResponse = (sql, params, headers) =>
      ChatFactory.trackAbortableResult(
        sessionId,
        connection.queryRawResponse(sql, params, headers)
      );

    return wrappedConnection;
  }

  static stopClientTools(sessionId: string): void {
    const controllers = this.clientToolAbortControllers.get(sessionId);
    if (!controllers) {
      return;
    }

    for (const controller of [...controllers]) {
      controller.abort();
    }
    this.clientToolAbortControllers.delete(sessionId);
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
   * Create or retrieve a persisted chat instance
   */
  static async create(options: ChatFactoryCreateOptions): Promise<Chat<AppUIMessage>> {
    const sessionId = options.sessionId || newUniqueSessionId();
    const historicalMessages = options.initialMessages;

    // A full chat session should start with a clean tool-progress timeline.
    useToolProgressStore.getState().clearAllProgress();

    return ChatFactory.createInternal({
      ...options,
      sessionId,
      initialMessages: historicalMessages,
      generateTitle: true,
      onPrepareSendMessagesRequest: async ({
        messages,
        connection,
        sessionId,
        historicalMessages,
      }) => {
        const chatPersistenceMode = getRuntimeConfig().sessionRepositoryType;
        if (chatPersistenceMode === "remote") {
          let provisionalTitle: string | undefined;
          if (
            historicalMessages.length === 0 &&
            messages.length === 1 &&
            messages[0]?.role === "user"
          ) {
            provisionalTitle = buildProvisionalSessionTitle(extractTextFromMessage(messages[0]));
            if (provisionalTitle) {
              ChatUIContext.updateTitle(provisionalTitle);
            }
          }

          await SessionManager.touchSessionById(
            sessionId,
            connection.connectionId,
            provisionalTitle
          );
          return;
        }

        const userMessagesToSave = messages
          .filter((msg) => msg.role === "user")
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
              chatId: sessionId,
              role: msg.role,
              parts: msg.parts ?? [],
              metadata: msg.metadata,
              createdAt,
              updatedAt,
            } as Message;
          });

        if (userMessagesToSave.length === 0) {
          return;
        }

        let provisionalTitle: string | undefined;
        if (
          historicalMessages.length === 0 &&
          messages.length === 1 &&
          messages[0]?.role === "user"
        ) {
          provisionalTitle = buildProvisionalSessionTitle(extractTextFromMessage(messages[0]));
          if (provisionalTitle) {
            ChatUIContext.updateTitle(provisionalTitle);
          }
        }

        await SessionManager.saveMessages(sessionId, userMessagesToSave);
        await SessionManager.touchSessionById(sessionId, connection.connectionId, provisionalTitle);
      },
      onFinish: async ({ message, connection, sessionId }) => {
        const chatPersistenceMode = getRuntimeConfig().sessionRepositoryType;
        const now = new Date();

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

        if (chatPersistenceMode === "local") {
          const messageToSave: Message = {
            id: message.id,
            role: message.role,
            parts: message.parts as Message["parts"],
            metadata: message.metadata as MessageMetadata,
            createdAt: now,
            updatedAt: now,
          };

          await SessionManager.saveMessage(sessionId, messageToSave);
        }

        await SessionManager.touchSessionById(sessionId, connection.connectionId, title);
      },
    });
  }

  /**
   * Create an ephemeral chat instance for one-off UI surfaces.
   * Does not load history, persist messages, or request a generated title.
   */
  static async createEphemeral(options: ChatFactoryCreateOptions): Promise<Chat<AppUIMessage>> {
    return ChatFactory.createInternal({
      ...options,
      ephemeral: true,
      initialMessages: options.initialMessages,
      generateTitle: false,
    });
  }

  private static async createInternal(options: CreateInternalOptions): Promise<Chat<AppUIMessage>> {
    const sessionId = options.sessionId || newUniqueSessionId();
    const modelConfig = options.model;
    const connection = options.connection;
    const clientToolConnection = ChatFactory.createClientToolConnection(sessionId, connection);

    // Create Chat instance
    const chat = new Chat<AppUIMessage>({
      id: sessionId,
      generateId: newUniqueSessionId,

      // Automatically send tool results back to the API when all tool calls are complete
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,

      transport: new DefaultChatTransport({
        fetch: async (_input, init) => {
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

          await options.onPrepareSendMessagesRequest?.({
            sessionId,
            connection,
            historicalMessages: options.initialMessages,
            messages: messages as AppUIMessage[],
          });

          const requestContext = options.context ?? ChatContext.build();
          const chatPersistenceMode = getRuntimeConfig().sessionRepositoryType;

          if (chatPersistenceMode === "remote") {
            const currentMessages = messages as AppUIMessage[];
            const lastMessage = currentMessages[currentMessages.length - 1];
            const sessionRepositoryConnectionId = toSessionRepositoryConnectionId(
              connection.connectionId
            );
            const continuation = lastAssistantMessageIsCompleteWithToolCalls({
              messages: currentMessages,
            });

            return {
              body: {
                sessionId,
                // Keep payload naming aligned with backend API contract.
                connectionId: sessionRepositoryConnectionId,
                message: lastMessage,
                ...(continuation ? { continuation: true } : {}),
                ...(!continuation ? { generateTitle: options.generateTitle } : {}),
                ...(options.ephemeral ? { ephemeral: true } : {}),
                agentContext: {
                  pruneValidateSql: AgentConfigurationManager.getConfiguration().pruneValidateSql,
                },
                ...(requestContext && { context: requestContext }),
                ...(currentModel && { model: currentModel }),
              },
              headers,
              credentials,
            };
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
              generateTitle: options.generateTitle,
              ...(requestContext && { context: requestContext }),
              ...(currentModel && { model: currentModel }),
            },
            headers,
            credentials,
          };
        },
      }),

      messages: options.initialMessages,

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

        if (toolName === CLIENT_TOOL_NAMES.ASK_USER_QUESTION) {
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

      onFinish: options.onFinish
        ? async ({ message }) => {
            await options.onFinish?.({
              sessionId,
              connection,
              message: message as AppUIMessage,
            });
          }
        : undefined,
    });

    return chat;
  }
}
