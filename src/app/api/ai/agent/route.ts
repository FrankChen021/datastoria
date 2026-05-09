import { getAuthenticatedUserEmail } from "@/auth";
import type { ServerDatabaseContext } from "@/lib/ai/agent/common-types";
import { buildOrchestratorSystemPrompt } from "@/lib/ai/agent/orchestrator-prompt";
import {
  SessionTitleGenerator,
  type SessionTitleGenerationResponse,
} from "@/lib/ai/agent/session-title-generator";
import type { AgentContext, AppUIMessage, MessageMetadata } from "@/lib/ai/ai-types";
import { CommandManager } from "@/lib/ai/commands/command-manager";
import {
  LanguageModelProviderFactory,
  resolveModelConfig,
  resolveModelSupportsImageInput,
} from "@/lib/ai/llm/llm-provider-factory";
import { MentionContext } from "@/lib/ai/mention-context";
import { MessagePruner } from "@/lib/ai/message-pruner";
import {
  hasCompletedToolOutputs,
  replaceOrAppendMessageById,
  validateRemoteChatRequest,
} from "@/lib/ai/session/remote-chat-request";
import {
  persistedMessageToAppUIMessage,
  sanitizeMessageForPersistence,
} from "@/lib/ai/session/serialization";
import {
  getServerSessionRepository,
  getSessionRepositoryType,
} from "@/lib/ai/session/server-session-repository-factory";
import { resolveSessionAccess, SessionAccessError } from "@/lib/ai/session/session-access";
import { SESSION_SHARE_CODE_HEADER } from "@/lib/ai/session/session-share-constants";
import { createSkillAvailabilityFilter } from "@/lib/ai/skills/skill-availability";
import { SkillProviderFactory } from "@/lib/ai/skills/skill-provider-factory";
import { normalizeUsage, sumTokenUsage } from "@/lib/ai/token-usage-utils";
import {
  ClickHouseTools,
  createServerClickHouseTools,
  getClickHouseConnectionValidationError,
  hasClickHouseConnection,
  type ClickHouseConnection,
} from "@/lib/ai/tools/clickhouse/clickhouse-tools";
import { ClientTools } from "@/lib/ai/tools/client/client-tools";
import { getRuntimeAvailableToolNames } from "@/lib/ai/tools/server/runtime-tools";
import { SERVER_TOOL_NAMES } from "@/lib/ai/tools/server/server-tool-names";
import { createServerTools } from "@/lib/ai/tools/server/server-tools";
import { defaultCodeSearchFactory } from "@/lib/code-search/code-search-factory";
import { APICallError } from "@ai-sdk/provider";
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  RetryError,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai";
import { v7 as uuidv7 } from "uuid";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

interface AgentRequest {
  messages?: UIMessage[];
  context?: ServerDatabaseContext;
  connection?: ClickHouseConnection;
  model?: { provider: string; modelId: string; apiKey?: string };
  generateTitle?: boolean;
  agentContext?: AgentContext;
}

const TITLE_WAIT_MS = 3000;

function messageHasImageParts(message: UIMessage): boolean {
  return (message.parts ?? []).some((part) => {
    const candidate = part as { type?: string; mediaType?: string };
    return candidate.type === "file" && candidate.mediaType?.startsWith("image/");
  });
}

function messagesHaveImageParts(messages: UIMessage[]): boolean {
  return messages.some(messageHasImageParts);
}

function modelSupportsImageInput(model: { provider: string; modelId: string }): boolean {
  return resolveModelSupportsImageInput(model);
}

function shouldOutputReasoning(
  model: { provider: string; modelId: string },
  agentContext: AgentContext | undefined
): boolean {
  return (
    agentContext?.outputReasoning === true &&
    LanguageModelProviderFactory.supportsReasoning(model.provider, model.modelId)
  );
}

function getMessageIdFromMessages(messages: UIMessage[]): string {
  const isContinuation =
    messages.length > 0 &&
    messages[messages.length - 1].role === "assistant" &&
    Array.isArray(messages[messages.length - 1].parts) &&
    (messages[messages.length - 1].parts?.at(-1) as { state?: string } | undefined)?.state ===
      "output-available";
  const lastAssistant = isContinuation ? (messages[messages.length - 1] as UIMessage) : undefined;
  const id =
    lastAssistant && "id" in lastAssistant && typeof lastAssistant.id === "string"
      ? lastAssistant.id
      : undefined;
  return id ?? uuidv7();
}

function extractTextContent(message: UIMessage): string {
  return (message.parts ?? [])
    .filter(
      (
        part
      ): part is {
        type: "text";
        text: string;
      } => part.type === "text" && typeof part.text === "string"
    )
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

function buildProvisionalTitle(message: UIMessage): string | null {
  const words = extractTextContent(message).split(/\s+/).filter(Boolean).slice(0, 8);
  return words.length > 0 ? words.join(" ") : null;
}

function extractErrorMessageFromLLMProvider(
  responseBody: string | undefined,
  fallbackMessage?: string
): string | undefined {
  if (!responseBody || typeof responseBody !== "string") return fallbackMessage;
  try {
    const parsed = JSON.parse(responseBody) as {
      error?: { metadata?: { raw?: string }; message?: string };
      message?: string;
    };
    return (
      parsed.error?.metadata?.raw || parsed.error?.message || parsed.message || fallbackMessage
    );
  } catch {
    return fallbackMessage;
  }
}

function extractErrorMessage(error: unknown): string {
  const defaultMessage = "Sorry, I encountered an error. Please try again.";
  if (RetryError.isInstance(error)) {
    const lastError = error.lastError;
    if (!lastError) return error.message || defaultMessage;
    if (typeof lastError === "object" && "statusCode" in lastError && "responseBody" in lastError) {
      return (
        extractErrorMessageFromLLMProvider(
          lastError.responseBody as string | undefined,
          "message" in lastError && typeof lastError.message === "string"
            ? lastError.message
            : undefined
        ) || defaultMessage
      );
    }
    if (
      typeof lastError === "object" &&
      "message" in lastError &&
      typeof lastError.message === "string"
    ) {
      return lastError.message;
    }
    return error.message || defaultMessage;
  }
  if (APICallError.isInstance(error)) {
    return extractErrorMessageFromLLMProvider(error.responseBody, error.message) || defaultMessage;
  }
  if (error instanceof Error) return error.message || defaultMessage;
  if (typeof error === "string") return error;
  return defaultMessage;
}

function expandCommand(messages: UIMessage[], commandManager: CommandManager): UIMessage[] {
  let lastUserIdx = -1;
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index].role === "user") {
      lastUserIdx = index;
      break;
    }
  }
  if (lastUserIdx === -1) return messages;

  const lastUser = messages[lastUserIdx];
  const textPart = lastUser.parts?.find((part) => part.type === "text");
  if (!textPart || textPart.type !== "text") return messages;

  const expanded = commandManager.expand(textPart.text);
  if (!expanded) return messages;

  const newParts = lastUser.parts.map((part) =>
    part.type === "text" ? { ...part, text: expanded } : part
  );
  const result = [...messages];
  result[lastUserIdx] = { ...lastUser, parts: newParts };
  return result;
}

function getRequestUsage(messages: UIMessage[], messageId: string) {
  let continuedAssistant: UIMessage | undefined;
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    if (message.role === "assistant" && message.id === messageId) {
      continuedAssistant = message;
      break;
    }
  }

  return continuedAssistant
    ? normalizeUsage(
        (continuedAssistant as { metadata?: { usage?: unknown } }).metadata?.usage as Record<
          string,
          unknown
        >
      )
    : undefined;
}

function withModelMetadata(
  message: AppUIMessage,
  modelConfig: { provider: string; modelId: string }
): AppUIMessage {
  return {
    ...message,
    metadata: {
      ...(message.metadata ?? {}),
      model: {
        provider: modelConfig.provider,
        modelId: modelConfig.modelId,
      },
    } satisfies MessageMetadata,
  };
}

function hasClickHouseClusterContext(context: ServerDatabaseContext): boolean {
  return typeof context.clickHouseUser === "string" && context.clickHouseUser.length > 0;
}

export async function POST(req: Request) {
  try {
    const userEmail = getAuthenticatedUserEmail(req);

    let payload: unknown;
    try {
      const text = await req.text();
      if (text.length > 10 * 1024 * 1024) {
        return new Response("Request body too large.", {
          status: 413,
          headers: { "Content-Type": "text/plain" },
        });
      }
      payload = JSON.parse(text) as unknown;
    } catch {
      return new Response("Invalid JSON in request body", { status: 400 });
    }

    const resolvedUserIdForRemote = userEmail ?? null;
    const repositoryType = getSessionRepositoryType(resolvedUserIdForRemote);

    let context: ServerDatabaseContext;
    let modelConfig: { provider: string; modelId: string; apiKey: string };
    let agentContext: AgentContext | undefined;
    let generateTitle = true;
    let originalMessages: UIMessage[];
    let clickHouseConnection: ClickHouseConnection | undefined;
    let messageId: string;
    let sessionRepositoryUserId: string | null = null;
    let sessionRepositoryChatId: string | null = null;
    let sessionRepositoryAllowMissingSession = false;
    let isSharedSessionAccess = false;
    const sessionRepository: ReturnType<typeof getServerSessionRepository> | null =
      repositoryType === "remote" ? getServerSessionRepository() : null;
    let titlePromise: Promise<SessionTitleGenerationResponse | undefined> | undefined;
    const skillProvider = SkillProviderFactory.getProvider({ userId: userEmail ?? null });
    const codeSearchContext = await defaultCodeSearchFactory.getCodeSearchContext();
    const availableTools = getRuntimeAvailableToolNames({
      codeSearchEnabled: codeSearchContext != null,
    });
    const availableSkills = await skillProvider.listSkills(
      createSkillAvailabilityFilter(availableTools)
    );
    const serverTools = createServerTools(skillProvider, availableSkills, codeSearchContext);
    const commandManager = CommandManager.fromSkills(availableSkills);

    if (repositoryType === "remote") {
      const apiRequest = validateRemoteChatRequest(payload);
      if (!apiRequest) {
        return new Response("Invalid request format", { status: 400 });
      }

      sessionRepositoryUserId = resolvedUserIdForRemote;
      if (!sessionRepositoryUserId) {
        return new Response("Authentication required", { status: 401 });
      }
      const shareCode = req.headers.get(SESSION_SHARE_CODE_HEADER);

      context = apiRequest.context
        ? ({ ...apiRequest.context, userEmail } as ServerDatabaseContext)
        : ({ userEmail } as ServerDatabaseContext);
      context.clusterAvailable = hasClickHouseClusterContext(context);

      try {
        modelConfig = resolveModelConfig(apiRequest.model, {
          imageInput: messageHasImageParts(apiRequest.message as UIMessage),
        });
      } catch (error) {
        return new Response(error instanceof Error ? error.message : "Unknown error", {
          status: 500,
        });
      }

      agentContext = apiRequest.agentContext;
      if (apiRequest.connection !== undefined) {
        const connectionValidationError = getClickHouseConnectionValidationError(
          apiRequest.connection
        );
        if (connectionValidationError) {
          return new Response(connectionValidationError, { status: 400 });
        }
      }
      clickHouseConnection = hasClickHouseConnection(apiRequest.connection)
        ? apiRequest.connection
        : undefined;
      if (clickHouseConnection) {
        context.clickHouseUser ??= clickHouseConnection.user;
        context.clusterAvailable = true;
      }
      generateTitle = !apiRequest.continuation && apiRequest.generateTitle !== false;
      messageId = apiRequest.continuation ? apiRequest.message.id : uuidv7().replace(/-/g, "");

      if (apiRequest.ephemeral) {
        const incomingMessage = apiRequest.message as AppUIMessage;
        const persistedIncomingMessage =
          incomingMessage.role === "assistant"
            ? withModelMetadata(sanitizeMessageForPersistence(incomingMessage), modelConfig)
            : sanitizeMessageForPersistence(incomingMessage);
        await sessionRepository!.upsertMessage({
          session_id: apiRequest.sessionId,
          user_id: sessionRepositoryUserId,
          message: persistedIncomingMessage,
          allowMissingSession: true,
        });
        originalMessages = expandCommand([apiRequest.message as UIMessage], commandManager);
        sessionRepositoryChatId = apiRequest.sessionId;
        sessionRepositoryAllowMissingSession = true;
      } else {
        let existingSession;
        if (shareCode) {
          try {
            const access = await resolveSessionAccess({
              repository: sessionRepository!,
              authenticatedUserId: sessionRepositoryUserId,
              sessionId: apiRequest.sessionId,
              shareCode,
            });
            sessionRepositoryUserId = access.ownerId;
            existingSession = access.session;
            isSharedSessionAccess = access.kind === "share";
          } catch (error) {
            if (error instanceof SessionAccessError) {
              return new Response(error.message, { status: error.status });
            }
            throw error;
          }
        } else {
          existingSession = await sessionRepository!.getSession(
            sessionRepositoryUserId,
            apiRequest.sessionId
          );
        }

        if (!existingSession) {
          await sessionRepository!.createSession({
            id: apiRequest.sessionId,
            user_id: sessionRepositoryUserId,
            connection_id: apiRequest.connectionId,
            title:
              !apiRequest.continuation && apiRequest.message.role === "user"
                ? buildProvisionalTitle(apiRequest.message as UIMessage)
                : null,
          });
        } else if (existingSession.connection_id !== apiRequest.connectionId) {
          return new Response("Session connectionId mismatch", { status: 409 });
        }

        if (isSharedSessionAccess) {
          clickHouseConnection = undefined;
          context = { userEmail, clusterAvailable: false };
        }

        const persistedMessages = (
          await sessionRepository!.getMessages(sessionRepositoryUserId, apiRequest.sessionId)
        ).map(persistedMessageToAppUIMessage);

        if (apiRequest.continuation) {
          if (apiRequest.message.role !== "assistant") {
            return new Response("Continuation requests must send an assistant message", {
              status: 400,
            });
          }
          if (!hasCompletedToolOutputs(apiRequest.message)) {
            return new Response("Continuation assistant message is missing completed tool output", {
              status: 400,
            });
          }
          const hasPersistedAssistant = persistedMessages.some(
            (message) => message.id === apiRequest.message.id && message.role === "assistant"
          );
          if (!hasPersistedAssistant) {
            return new Response("Continuation assistant message does not exist", { status: 409 });
          }
        } else if (apiRequest.message.role !== "user") {
          return new Response("Initial requests must send a user message", { status: 400 });
        }

        const incomingMessage = apiRequest.message as AppUIMessage;
        const persistedIncomingMessage =
          incomingMessage.role === "assistant"
            ? withModelMetadata(sanitizeMessageForPersistence(incomingMessage), modelConfig)
            : sanitizeMessageForPersistence(incomingMessage);
        const mergedMessages = replaceOrAppendMessageById(persistedMessages, incomingMessage);
        await sessionRepository!.upsertMessage({
          session_id: apiRequest.sessionId,
          user_id: sessionRepositoryUserId,
          message: persistedIncomingMessage,
        });

        originalMessages = expandCommand(mergedMessages as UIMessage[], commandManager);
        sessionRepositoryChatId = apiRequest.sessionId;
        sessionRepositoryAllowMissingSession = false;
      }

      titlePromise =
        !apiRequest.continuation && generateTitle
          ? SessionTitleGenerator.generate(originalMessages, modelConfig)
          : undefined;
    } else {
      const apiRequest = payload as AgentRequest;
      if (!Array.isArray(apiRequest.messages)) {
        return new Response("Invalid request format: messages must be an array", { status: 400 });
      }

      context = apiRequest.context
        ? ({ ...apiRequest.context, userEmail } as ServerDatabaseContext)
        : ({ userEmail } as ServerDatabaseContext);
      context.clusterAvailable = hasClickHouseClusterContext(context);

      agentContext = apiRequest.agentContext;
      if (apiRequest.connection !== undefined) {
        const connectionValidationError = getClickHouseConnectionValidationError(
          apiRequest.connection
        );
        if (connectionValidationError) {
          return new Response(connectionValidationError, { status: 400 });
        }
      }
      clickHouseConnection = hasClickHouseConnection(apiRequest.connection)
        ? apiRequest.connection
        : undefined;
      if (clickHouseConnection) {
        context.clickHouseUser ??= clickHouseConnection.user;
        context.clusterAvailable = true;
      }
      generateTitle = apiRequest.generateTitle !== false;
      originalMessages = expandCommand(apiRequest.messages ?? [], commandManager);
      messageId = getMessageIdFromMessages(apiRequest.messages);
      try {
        modelConfig = resolveModelConfig(apiRequest.model, {
          imageInput: messagesHaveImageParts(originalMessages),
        });
      } catch (error) {
        return new Response(error instanceof Error ? error.message : "Unknown error", {
          status: 500,
        });
      }
      titlePromise = generateTitle
        ? SessionTitleGenerator.generate(originalMessages, modelConfig)
        : undefined;
    }

    if (messagesHaveImageParts(originalMessages) && !modelSupportsImageInput(modelConfig)) {
      return new Response(
        `Selected model ${modelConfig.provider} | ${modelConfig.modelId} does not support image input.`,
        { status: 400 }
      );
    }

    const model = LanguageModelProviderFactory.createModel(
      modelConfig.provider,
      modelConfig.modelId,
      modelConfig.apiKey
    );
    const temperature = LanguageModelProviderFactory.getDefaultTemperature(
      modelConfig.modelId,
      modelConfig.provider
    );
    const requestUsage = getRequestUsage(originalMessages, messageId);
    const messagesWithSystemAddedContext = MentionContext.inject(
      MessagePruner.prune(originalMessages, agentContext)
    );
    const modelMessages = await convertToModelMessages(messagesWithSystemAddedContext);
    const orchestratorSystemPrompt = buildOrchestratorSystemPrompt(context, {
      responseLanguage: agentContext?.responseLanguage,
    });
    const outputReasoning = shouldOutputReasoning(modelConfig, agentContext);
    const tools = {
      [SERVER_TOOL_NAMES.SKILL]: serverTools.skill,
      [SERVER_TOOL_NAMES.SKILL_RESOURCE]: serverTools.skill_resource,
      ...(codeSearchContext
        ? {
            [SERVER_TOOL_NAMES.SEARCH_FILE]: serverTools.search_file,
            [SERVER_TOOL_NAMES.READ_FILE]: serverTools.read_file,
          }
        : {}),
      ask_user_question: ClientTools.ask_user_question,
    };
    if (context.clusterAvailable) {
      Object.assign(
        tools,
        clickHouseConnection ? createServerClickHouseTools(clickHouseConnection) : ClickHouseTools
      );
    }
    const result = streamText({
      model,
      system: orchestratorSystemPrompt,
      messages: modelMessages,
      providerOptions: LanguageModelProviderFactory.buildProviderOptions({
        modelConfig,
        outputReasoning,
        reasoningLevel: agentContext?.reasoningLevel,
        instructions: orchestratorSystemPrompt,
        responseLanguage: agentContext?.responseLanguage,
      }),
      tools,
      stopWhen: stepCountIs(10),
      temperature,
    });

    const responseStream = result.toUIMessageStream({
      originalMessages: originalMessages as UIMessage[],
      generateMessageId: () => messageId,
      sendReasoning: outputReasoning,
      onFinish:
        repositoryType === "remote" &&
        sessionRepository &&
        sessionRepositoryUserId &&
        sessionRepositoryChatId
          ? async ({ responseMessage }) => {
              const persistedResponseMessage = withModelMetadata(
                sanitizeMessageForPersistence(responseMessage as AppUIMessage),
                modelConfig
              );
              await sessionRepository.upsertMessage({
                session_id: sessionRepositoryChatId,
                user_id: sessionRepositoryUserId,
                message: persistedResponseMessage,
                allowMissingSession: sessionRepositoryAllowMissingSession,
              });
            }
          : undefined,
      messageMetadata: ({
        part,
      }: {
        part: { type: string; totalUsage?: unknown; usage?: unknown };
      }) => {
        if (part.type !== "finish") return undefined;
        const responseUsage = normalizeUsage(
          (part.totalUsage ?? part.usage) as Record<string, unknown>
        );

        const usage = sumTokenUsage([requestUsage, responseUsage]);
        return {
          usage,
        } as MessageMetadata;
      },
      onError: (error: unknown) => {
        try {
          return extractErrorMessage(error);
        } catch {
          return "Sorry, I encountered an error. Please try again.";
        }
      },
    });

    return createUIMessageStreamResponse({
      stream: responseStream.pipeThrough(
        new TransformStream({
          async transform(chunk, controller) {
            if (chunk.type !== "finish") {
              controller.enqueue(chunk);
              return;
            }
            if (titlePromise === undefined) {
              controller.enqueue(chunk);
              return;
            }

            let timeoutId: ReturnType<typeof setTimeout> | undefined;
            let didTitleGenerationTimeout = false;
            const titleResult = await Promise.race([
              titlePromise,
              new Promise<undefined>((resolve) => {
                timeoutId = setTimeout(() => {
                  didTitleGenerationTimeout = true;
                  resolve(undefined);
                }, TITLE_WAIT_MS);
              }),
            ]).finally(() => {
              if (timeoutId !== undefined) {
                clearTimeout(timeoutId);
              }
            });

            if (didTitleGenerationTimeout) {
              console.warn("Chat title generation timed out", {
                timeoutMs: TITLE_WAIT_MS,
                provider: modelConfig.provider,
                modelId: modelConfig.modelId,
              });

              if (
                repositoryType === "remote" &&
                sessionRepository &&
                sessionRepositoryUserId &&
                sessionRepositoryChatId &&
                !sessionRepositoryAllowMissingSession
              ) {
                void titlePromise.then(async (lateTitleResult) => {
                  const lateTitle = lateTitleResult?.title?.trim();
                  if (lateTitle) {
                    await sessionRepository.updateSessionTitle(
                      sessionRepositoryUserId,
                      sessionRepositoryChatId,
                      lateTitle
                    );
                  }
                });
              }
            }

            const metadata = ((chunk as { messageMetadata?: MessageMetadata }).messageMetadata ??
              {}) as MessageMetadata;
            const titleText = titleResult?.title?.trim();
            const titleMetadata =
              titleText && titleResult?.usage
                ? {
                    title: {
                      text: titleText,
                      usage: titleResult.usage,
                    },
                  }
                : {};

            if (
              titleText &&
              repositoryType === "remote" &&
              sessionRepository &&
              sessionRepositoryUserId &&
              sessionRepositoryChatId &&
              !sessionRepositoryAllowMissingSession
            ) {
              await sessionRepository.updateSessionTitle(
                sessionRepositoryUserId,
                sessionRepositoryChatId,
                titleText
              );
            }

            controller.enqueue({
              ...chunk,
              messageMetadata: {
                ...metadata,
                usage: sumTokenUsage([metadata.usage, titleResult?.usage]),
                ...titleMetadata,
              } satisfies MessageMetadata,
            });
          },
        })
      ),
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
        location: "API route handler",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
