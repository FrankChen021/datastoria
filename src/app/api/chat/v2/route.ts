import { getAuthenticatedUserEmail } from "@/auth";
import type { ServerDatabaseContext } from "@/lib/ai/agent/common-types";
import { generateChatTitle } from "@/lib/ai/agent/generate-chat-title";
import { ORCHESTRATOR_SYSTEM_PROMPT } from "@/lib/ai/agent/orchestrator-prompt";
import type { AgentContext, MessageMetadata } from "@/lib/ai/chat-types";
import { LanguageModelProviderFactory } from "@/lib/ai/llm/llm-provider-factory";
import { MessagePruner } from "@/lib/ai/message-pruner";
import { normalizeUsage, sumTokenUsage } from "@/lib/ai/token-usage-utils";
import { ClientTools } from "@/lib/ai/tools/client/client-tools";
import { SERVER_TOOL_NAMES } from "@/lib/ai/tools/server/server-tool-names";
import { ServerTools } from "@/lib/ai/tools/server/server-tools";
import { APICallError } from "@ai-sdk/provider";
import { convertToModelMessages, RetryError, stepCountIs, streamText, type UIMessage } from "ai";
import { v7 as uuidv7 } from "uuid";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
// Force this route to run on the Node.js runtime (not Edge) so Node APIs like fs/path work for dynamic skill loading.
export const runtime = "nodejs";

/** Request body for chat/v2 (same shape as chat for compatibility). */
interface ChatV2Request {
  messages?: UIMessage[];
  context?: ServerDatabaseContext;
  model?: { provider: string; modelId: string; apiKey: string };
  /** Whether to request LLM-generated chat title for new conversations. Default true. */
  generateTitle?: boolean;
  agentContext?: AgentContext;
}

/**
 * Derives the message ID for the assistant response from messages (same logic as original chat API / PlanningInput).
 * Continuation (last message is assistant with tool-result): use that assistant's id. Otherwise generate a new id.
 */
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

/** Time to wait for title generation before building the response (ms). */
const TITLE_WAIT_MS = 3000;

/**
 * POST /api/chat/v2
 *
 * Skill-based orchestrator: single agent with skill tool + validate_sql +
 * execute_sql + explore_schema + get_tables + optimization tools.
 * Use maxSteps so the model can load a skill, plan, execute, and retry in one request where possible.
 */
export async function POST(req: Request) {
  try {
    const userEmail = getAuthenticatedUserEmail(req);

    console.log("userEmail", userEmail);

    let apiRequest: ChatV2Request;
    try {
      const text = await req.text();
      if (text.length > 10 * 1024 * 1024) {
        return new Response("Request body too large.", {
          status: 413,
          headers: { "Content-Type": "text/plain" },
        });
      }
      apiRequest = JSON.parse(text) as ChatV2Request;
    } catch {
      return new Response("Invalid JSON in request body", { status: 400 });
    }

    if (!Array.isArray(apiRequest.messages)) {
      return new Response("Invalid request format: messages must be an array", { status: 400 });
    }

    const context: ServerDatabaseContext = apiRequest.context
      ? ({ ...apiRequest.context, userEmail } as ServerDatabaseContext)
      : ({ userEmail } as ServerDatabaseContext);
    if (!context.clickHouseUser || typeof context.clickHouseUser !== "string") {
      return new Response("Missing or invalid clickHouseUser in context (required string)", {
        status: 400,
      });
    }

    let modelConfig: { provider: string; modelId: string; apiKey: string };
    try {
      if (apiRequest.model?.provider && apiRequest.model?.modelId && apiRequest.model?.apiKey) {
        modelConfig = {
          provider: apiRequest.model.provider,
          modelId: apiRequest.model.modelId,
          apiKey: apiRequest.model.apiKey,
        };
      } else {
        const auto = LanguageModelProviderFactory.autoSelectModel();
        modelConfig = {
          provider: auto.provider,
          modelId: auto.modelId,
          apiKey: auto.apiKey,
        };
      }
    } catch (e) {
      return new Response(e instanceof Error ? e.message : "Unknown error", { status: 500 });
    }

    const model = LanguageModelProviderFactory.createModel(
      modelConfig.provider,
      modelConfig.modelId,
      modelConfig.apiKey
    );
    const temperature = LanguageModelProviderFactory.getDefaultTemperature(modelConfig.modelId);

    const originalMessages = apiRequest.messages ?? [];

    // Request usage: only when continuing an assistant (messageId in request); else undefined for new message
    const messageId = getMessageIdFromMessages(apiRequest.messages);
    const msgs = originalMessages;
    let continuedAssistant: UIMessage | undefined;
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (m.role === "assistant" && m.id === messageId) {
        continuedAssistant = m;
        break;
      }
    }
    const requestUsage = continuedAssistant
      ? normalizeUsage(
          (continuedAssistant as { metadata?: { usage?: unknown } }).metadata?.usage as Record<
            string,
            unknown
          >
        )
      : undefined;

    const titlePromise =
      apiRequest.generateTitle !== false
        ? generateChatTitle(originalMessages, modelConfig, {
            timeoutMs: TITLE_WAIT_MS,
          })
        : undefined;

    const modelMessages = await convertToModelMessages(
      MessagePruner.prune(originalMessages, apiRequest.agentContext)
    );

    const result = streamText({
      model,
      system: ORCHESTRATOR_SYSTEM_PROMPT,
      messages: modelMessages,
      tools: {
        [SERVER_TOOL_NAMES.SKILL]: ServerTools.skill,
        [SERVER_TOOL_NAMES.SKILL_RESOURCE]: ServerTools.skill_resource,
        get_tables: ClientTools.get_tables,
        explore_schema: ClientTools.explore_schema,
        validate_sql: ClientTools.validate_sql,
        execute_sql: ClientTools.execute_sql,
        collect_sql_optimization_evidence: ClientTools.collect_sql_optimization_evidence,
        find_expensive_queries: ClientTools.find_expensive_queries,
      },
      stopWhen: stepCountIs(10),
      temperature,
    });

    const titleResult = titlePromise !== undefined ? await titlePromise : undefined;

    const response = result.toUIMessageStreamResponse({
      originalMessages: originalMessages as UIMessage[],
      generateMessageId: () => messageId,
      messageMetadata: ({
        part,
      }: {
        part: { type: string; totalUsage?: unknown; usage?: unknown };
      }) => {
        if (part.type !== "finish") return undefined;
        const responseUsage = normalizeUsage(
          (part.totalUsage ?? part.usage) as Record<string, unknown>
        );

        // Accumulate token usage on this message id
        const usage = sumTokenUsage([requestUsage, responseUsage, titleResult?.usage]);
        return {
          usage,
          title: titleResult?.title?.trim() && {
            text: titleResult.title.trim(),
            usage: titleResult.usage,
          },
        } as MessageMetadata;
      },
      onError: (error: unknown) => {
        try {
          return extractErrorMessage(error);
        } catch {
          return "Sorry, I encountered an error. Please try again.";
        }
      },
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });

    return response;
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
