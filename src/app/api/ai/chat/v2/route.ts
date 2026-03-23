import { getAuthenticatedUserEmail } from "@/auth";
import type { ServerDatabaseContext } from "@/lib/ai/agent/common-types";
import { ORCHESTRATOR_SYSTEM_PROMPT } from "@/lib/ai/agent/orchestrator-prompt";
import {
  SessionTitleGenerator,
  type SessionTitleGenerationResponse,
} from "@/lib/ai/agent/session-title-generator";
import type { AgentContext, AppUIMessage, MessageMetadata } from "@/lib/ai/chat-types";
import { CommandManager } from "@/lib/ai/commands/command-manager";
import {
  LanguageModelProviderFactory,
  resolveModelConfig,
} from "@/lib/ai/llm/llm-provider-factory";
import { MessagePruner } from "@/lib/ai/message-pruner";
import {
  hasCompletedToolOutputs,
  replaceOrAppendMessageById,
  validateRemoteChatRequest,
} from "@/lib/ai/session/remote-chat-request";
import { persistedMessageToAppUIMessage } from "@/lib/ai/session/serialization";
import {
  getServerSessionRepository,
  getSessionRepositoryType,
} from "@/lib/ai/session/server-session-repository-factory";
import { SkillManager } from "@/lib/ai/skills/skill-manager";
import { normalizeUsage, sumTokenUsage } from "@/lib/ai/token-usage-utils";
import { ClientTools } from "@/lib/ai/tools/client/client-tools";
import { SERVER_TOOL_NAMES } from "@/lib/ai/tools/server/server-tool-names";
import { ServerTools } from "@/lib/ai/tools/server/server-tools";
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

interface ChatV2Request {
  messages?: UIMessage[];
  context?: ServerDatabaseContext;
  model?: { provider: string; modelId: string; apiKey?: string };
  generateTitle?: boolean;
  agentContext?: AgentContext;
}

const TITLE_WAIT_MS = 3000;

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

function expandCommand(messages: UIMessage[]): UIMessage[] {
  SkillManager.listSkills();

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

  const expanded = CommandManager.expand(textPart.text);
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
    let messageId: string;
    let sessionRepositoryUserId: string | null = null;
    let sessionRepositoryChatId: string | null = null;
    let sessionRepositoryAllowMissingSession = false;
    const sessionRepository: ReturnType<typeof getServerSessionRepository> | null =
      repositoryType === "remote" ? getServerSessionRepository() : null;
    let titlePromise: Promise<SessionTitleGenerationResponse | undefined> | undefined;

    if (repositoryType === "remote") {
      const apiRequest = validateRemoteChatRequest(payload);
      if (!apiRequest) {
        return new Response("Invalid request format", { status: 400 });
      }

      sessionRepositoryUserId = resolvedUserIdForRemote;
      if (!sessionRepositoryUserId) {
        return new Response("Authentication required", { status: 401 });
      }

      context = apiRequest.context
        ? ({ ...apiRequest.context, userEmail } as ServerDatabaseContext)
        : ({ userEmail } as ServerDatabaseContext);
      if (!context.clickHouseUser || typeof context.clickHouseUser !== "string") {
        return new Response("Missing or invalid clickHouseUser in context (required string)", {
          status: 400,
        });
      }

      try {
        modelConfig = resolveModelConfig(apiRequest.model);
      } catch (error) {
        return new Response(error instanceof Error ? error.message : "Unknown error", {
          status: 500,
        });
      }

      agentContext = apiRequest.agentContext;
      generateTitle = !apiRequest.continuation && apiRequest.generateTitle !== false;
      messageId = apiRequest.continuation ? apiRequest.message.id : uuidv7().replace(/-/g, "");

      if (apiRequest.ephemeral) {
        const ephemeralSessionId = "ephemeral-" + uuidv7().replace(/-/g, "");
        const incomingMessage = apiRequest.message as AppUIMessage;
        const persistedIncomingMessage =
          incomingMessage.role === "assistant"
            ? withModelMetadata(incomingMessage, modelConfig)
            : incomingMessage;
        await sessionRepository!.upsertMessage({
          session_id: ephemeralSessionId,
          user_id: sessionRepositoryUserId,
          message: persistedIncomingMessage,
          allowMissingSession: true,
        });
        originalMessages = expandCommand([apiRequest.message as UIMessage]);
        sessionRepositoryChatId = ephemeralSessionId;
        sessionRepositoryAllowMissingSession = true;
      } else {
        const existingSession = await sessionRepository!.getSession(
          sessionRepositoryUserId,
          apiRequest.sessionId
        );
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
            ? withModelMetadata(incomingMessage, modelConfig)
            : incomingMessage;
        const mergedMessages = replaceOrAppendMessageById(
          persistedMessages,
          persistedIncomingMessage
        );
        await sessionRepository!.upsertMessage({
          session_id: apiRequest.sessionId,
          user_id: sessionRepositoryUserId,
          message: persistedIncomingMessage,
        });

        originalMessages = expandCommand(mergedMessages as UIMessage[]);
        sessionRepositoryChatId = apiRequest.sessionId;
        sessionRepositoryAllowMissingSession = false;
      }

      titlePromise =
        !apiRequest.continuation && generateTitle
          ? SessionTitleGenerator.generate(originalMessages, modelConfig)
          : undefined;
    } else {
      const apiRequest = payload as ChatV2Request;
      if (!Array.isArray(apiRequest.messages)) {
        return new Response("Invalid request format: messages must be an array", { status: 400 });
      }

      context = apiRequest.context
        ? ({ ...apiRequest.context, userEmail } as ServerDatabaseContext)
        : ({ userEmail } as ServerDatabaseContext);
      if (!context.clickHouseUser || typeof context.clickHouseUser !== "string") {
        return new Response("Missing or invalid clickHouseUser in context (required string)", {
          status: 400,
        });
      }

      try {
        modelConfig = resolveModelConfig(apiRequest.model);
      } catch (error) {
        return new Response(error instanceof Error ? error.message : "Unknown error", {
          status: 500,
        });
      }

      agentContext = apiRequest.agentContext;
      generateTitle = apiRequest.generateTitle !== false;
      originalMessages = expandCommand(apiRequest.messages ?? []);
      messageId = getMessageIdFromMessages(apiRequest.messages);
      titlePromise = generateTitle
        ? SessionTitleGenerator.generate(originalMessages, modelConfig)
        : undefined;
    }

    const model = LanguageModelProviderFactory.createModel(
      modelConfig.provider,
      modelConfig.modelId,
      modelConfig.apiKey
    );
    const temperature = LanguageModelProviderFactory.getDefaultTemperature(modelConfig.modelId);
    const requestUsage = getRequestUsage(originalMessages, messageId);
    const modelMessages = await convertToModelMessages(
      MessagePruner.prune(originalMessages, agentContext)
    );

    const result = streamText({
      model,
      system: ORCHESTRATOR_SYSTEM_PROMPT,
      messages: modelMessages,
      tools: {
        [SERVER_TOOL_NAMES.SKILL]: ServerTools.skill,
        [SERVER_TOOL_NAMES.SKILL_RESOURCE]: ServerTools.skill_resource,
        ask_user_question: ClientTools.ask_user_question,
        get_tables: ClientTools.get_tables,
        explore_schema: ClientTools.explore_schema,
        validate_sql: ClientTools.validate_sql,
        execute_sql: ClientTools.execute_sql,
        collect_sql_optimization_evidence: ClientTools.collect_sql_optimization_evidence,
        search_query_log: ClientTools.search_query_log,
        collect_cluster_status: ClientTools.collect_cluster_status,
      },
      stopWhen: stepCountIs(10),
      temperature,
    });

    const responseStream = result.toUIMessageStream({
      originalMessages: originalMessages as UIMessage[],
      generateMessageId: () => messageId,
      onFinish:
        repositoryType === "remote" &&
        sessionRepository &&
        sessionRepositoryUserId &&
        sessionRepositoryChatId
          ? async ({ responseMessage }) => {
              await sessionRepository.upsertMessage({
                session_id: sessionRepositoryChatId,
                user_id: sessionRepositoryUserId,
                message: withModelMetadata(responseMessage as AppUIMessage, modelConfig),
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
