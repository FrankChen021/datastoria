import { auth } from "@/auth";
import type { ServerDatabaseContext } from "@/lib/ai/agent/common-types";
import { ORCHESTRATOR_SYSTEM_PROMPT } from "@/lib/ai/agent/orchestrator-prompt";
import type { MessageMetadata } from "@/lib/ai/chat-types";
import { LanguageModelProviderFactory } from "@/lib/ai/llm/llm-provider-factory";
import { ClientTools } from "@/lib/ai/tools/client/client-tools";
import { SERVER_TOOL_NAMES, ServerTools } from "@/lib/ai/tools/server/server-tools";
import { APICallError } from "@ai-sdk/provider";
import { convertToModelMessages, RetryError, stepCountIs, streamText, type UIMessage } from "ai";
import type { Session } from "next-auth";
import { v7 as uuidv7 } from "uuid";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Request body for chat/v2 (same shape as chat for compatibility). */
interface ChatV2Request {
  messages?: UIMessage[];
  context?: ServerDatabaseContext;
  model?: { provider: string; modelId: string; apiKey: string };
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
  return id ?? uuidv7().replace(/-/g, "");
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

/**
 * POST /api/chat/v2
 *
 * Skill-based orchestrator: single agent with skill tool + validate_sql +
 * execute_sql + explore_schema + get_tables + optimization tools.
 * Use maxSteps so the model can load a skill, plan, execute, and retry in one request where possible.
 */
export async function POST(req: Request) {
  try {
    const session = (await auth()) as Session;
    if (!session?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", message: "Authentication required" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const userEmail = session.user.email ?? undefined;

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

    const messageId = getMessageIdFromMessages(apiRequest.messages);

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
    } catch {
      return new Response(
        "No AI API key configured. Set OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or GROQ_API_KEY",
        { status: 500 }
      );
    }

    const [model] = LanguageModelProviderFactory.createModel(
      modelConfig.provider,
      modelConfig.modelId,
      modelConfig.apiKey
    );
    const temperature = LanguageModelProviderFactory.getDefaultTemperature(modelConfig.modelId);

    const originalMessages = apiRequest.messages ?? [];
    const modelMessages = await convertToModelMessages(originalMessages);

    const result = streamText({
      model,
      system: ORCHESTRATOR_SYSTEM_PROMPT,
      messages: modelMessages,
      tools: {
        [SERVER_TOOL_NAMES.SKILL]: ServerTools.skill,
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

    return result.toUIMessageStreamResponse({
      originalMessages: originalMessages as UIMessage[],
      generateMessageId: () => messageId,
      messageMetadata: ({ part }: { part: { type: string; totalUsage?: unknown } }) => {
        if (part.type !== "finish") return undefined;
        const usage = part.totalUsage as MessageMetadata["usage"] | undefined;
        return { usage } as MessageMetadata;
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
