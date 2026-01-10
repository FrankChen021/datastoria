import { auth } from "@/auth";
import type { DatabaseContext } from "@/components/chat/chat-context";
import { createOrchestratorAgent } from "@/lib/ai/agent/orchestrator-agent";
import { LanguageModelProviderFactory } from "@/lib/ai/llm/llm-provider-factory";
import { APICallError } from "@ai-sdk/provider";
import { RetryError } from "ai";
import { v7 as uuidv7 } from "uuid";

// Force dynamic rendering (no static generation)
export const dynamic = "force-dynamic";

// Increase body size limit for this route to handle large tool results
// This is needed when get_table_columns returns 1500+ columns (e.g., system.metric_log)
export const maxDuration = 60; // 60 seconds timeout

interface ChatRequest {
  messages?: unknown[];
  context?: DatabaseContext;
  model?: {
    provider: string;
    modelId: string;
    apiKey: string;
  };
}

/**
 * Extracts error message from response body.
 * Tries to extract the raw message from metadata, falls back to error message.
 */
function extractErrorMessageFromLLMProvider(
  responseBody: string | undefined,
  fallbackMessage?: string
): string | undefined {
  if (!responseBody || typeof responseBody !== "string") {
    return fallbackMessage;
  }

  try {
    const parsed = JSON.parse(responseBody) as {
      error?: {
        metadata?: { raw?: string };
        message?: string;
      };
    };

    return parsed.error?.metadata?.raw || parsed.error?.message || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

/**
 * Extracts a meaningful error message from various error types.
 * Handles RetryError, APICallError, and standard Error instances.
 */
function extractErrorMessage(error: unknown): string {
  const defaultMessage = "Sorry, I encountered an error. Please try again.";

  // Handle RetryError (contains lastError with the actual API error)
  if (RetryError.isInstance(error)) {
    const lastError = error.lastError;
    if (!lastError) {
      return error.message || defaultMessage;
    }

    // Check if lastError is an APICallError-like object with statusCode 429
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

    // For other errors, use the error message
    if (
      typeof lastError === "object" &&
      "message" in lastError &&
      typeof lastError.message === "string"
    ) {
      return lastError.message;
    }

    return error.message || defaultMessage;
  }

  // Handle direct APICallError
  if (APICallError.isInstance(error)) {
    return extractErrorMessageFromLLMProvider(error.responseBody, error.message) || defaultMessage;
  }

  // Fallback to error message for any Error instance
  if (error instanceof Error) {
    return error.message || defaultMessage;
  }

  // Handle string errors
  if (typeof error === "string") {
    return error;
  }

  return defaultMessage;
}

/**
 * POST /api/chat
 *
 * Agent-based chat endpoint with orchestrator + sub-agents
 *
 * This endpoint uses the Agent API to coordinate:
 * 1. SQL generation (via generate_sql tool → SQL sub-agent)
 * 2. SQL execution (via run_sql tool → client-side)
 * 3. Visualization planning (via generate_visualization tool → viz sub-agent)
 */
export async function POST(req: Request) {
  try {
    // Get user ID from next-auth session cookie
    let _userId: string | undefined;
    try {
      const session = await auth();
      // Extract user ID from session (email is stored in token subject)
      _userId = session?.user?.email || undefined;
    } catch (error) {
      // If auth is not enabled or session is invalid, _userId will be undefined
      console.log("Could not get user from session:", error);
    }

    // Parse request body with size validation
    let apiRequest: ChatRequest;
    try {
      const text = await req.text();
      if (text.length > 10 * 1024 * 1024) {
        // 10MB limit
        return new Response(
          "Request body too large. Please reduce the amount of data being sent.",
          {
            status: 413,
            headers: { "Content-Type": "text/plain" },
          }
        );
      }

      apiRequest = JSON.parse(text) as ChatRequest;
    } catch (error) {
      console.error("Failed to parse request body:", error);
      return new Response("Invalid JSON in request body", { status: 400 });
    }

    // Extract messages and context from request body
    if (!Array.isArray(apiRequest.messages)) {
      return new Response("Invalid request format: messages must be an array", { status: 400 });
    }

    // Validate clickHouseUser is provided in context
    const context: DatabaseContext | undefined = apiRequest.context;
    if (!context?.clickHouseUser || typeof context.clickHouseUser !== "string") {
      return new Response("Missing or invalid clickHouseUser in context (required string)", {
        status: 400,
      });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const messages: any[] = apiRequest.messages;
    if (!messages || messages.length === 0) {
      return new Response("Missing messages", { status: 400 });
    }

    // Get the appropriate model (mock or real based on USE_MOCK_LLM env var)
    // Use provided model config if available, otherwise auto-select
    let modelConfig: { provider: string; modelId: string; apiKey: string } | undefined;
    try {
      if (apiRequest.model) {
        // If modelConfig is provided, all 3 properties must be present
        if (!apiRequest.model.provider || !apiRequest.model.modelId || !apiRequest.model.apiKey) {
          return new Response(
            "Invalid model config: provider, modelId, and apiKey are all required when model config is provided",
            { status: 400 }
          );
        }
        modelConfig = {
          provider: apiRequest.model.provider,
          modelId: apiRequest.model.modelId,
          apiKey: apiRequest.model.apiKey,
        };
      } else {
        // Auto-select a model if no model config is provided
        const autoSelected = LanguageModelProviderFactory.autoSelectModel();
        modelConfig = {
          provider: autoSelected.provider,
          modelId: autoSelected.modelId,
          apiKey: autoSelected.apiKey,
        };
      }
    } catch (error) {
      return new Response(
        error instanceof Error
          ? error.message
          : "No AI API key configured. Set OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, ANTHROPIC_API_KEY, OPENROUTER_API_KEY, or GROQ_API_KEY",
        { status: 500 }
      );
    }

    // Create orchestrator agent with all tools (both server-side and client-side)
    const result = await createOrchestratorAgent({
      messages,
      modelConfig,
      context,
    });

    // Convert to UI message stream (same format as original API)
    const stream = result.toUIMessageStream({
      originalMessages: messages,
      generateMessageId: () => uuidv7(),
      // Extract message metadata (usage) and send it to the client
      messageMetadata: ({ part }) => {
        // Only add metadata on finish events
        if (part.type === "finish") {
          return {
            usage: {
              inputTokens: part.totalUsage.inputTokens || 0,
              outputTokens: part.totalUsage.outputTokens || 0,
              totalTokens: part.totalUsage.totalTokens || 0,
              reasoningTokens: part.totalUsage.reasoningTokens || 0,
              cachedInputTokens: part.totalUsage.cachedInputTokens || 0,
            },
          };
        }
      },
      onFinish: async () => {
        // Stream completed successfully
      },
      onError: (error) => {
        console.error("Chat error:", error);
        try {
          return extractErrorMessage(error);
        } catch (parseError) {
          // If anything goes wrong during error extraction, log and use default
          console.error("Error extracting error message:", parseError);
          return "Sorry, I encountered an error. Please try again.";
        }
      },
    });

    // Return SSE stream (same format as original API)
    const sseStream = stream
      .pipeThrough(
        new TransformStream({
          transform(chunk, controller) {
            const data = JSON.stringify(chunk);
            controller.enqueue(`data: ${data}\n\n`);
          },
        })
      )
      .pipeThrough(new TextEncoderStream());

    return new Response(sseStream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    console.error("Chat API error:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");

    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
        location: "API route handler",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
