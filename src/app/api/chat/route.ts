import { auth } from "@/auth";
import type { DatabaseContext } from "@/components/chat/chat-context";
import type { ServerDatabaseContext } from "@/lib/ai/agent/common-types";
import { PlanningAgent, SERVER_TOOL_PLAN } from "@/lib/ai/agent/plan/planning-agent";
import type { PlannerMetadata } from "@/lib/ai/agent/plan/planning-types";
import type { MessageMetadata } from "@/lib/ai/chat-types";
import { LanguageModelProviderFactory } from "@/lib/ai/llm/llm-provider-factory";
import { SseStreamer } from "@/lib/sse-streamer";
import { APICallError } from "@ai-sdk/provider";
import { convertToModelMessages, RetryError, type UIMessage } from "ai";
import type { Session } from "next-auth";

// Force dynamic rendering (no static generation)
export const dynamic = "force-dynamic";

// Increase body size limit for this route to handle large tool results
// This is needed when get_table_columns returns 1500+ columns (e.g., system.metric_log)
export const maxDuration = 60; // 60 seconds timeout

/** UI message with chat route metadata (planner, usage, routerUsage). */
export type ChatUIMessage = UIMessage<MessageMetadata>;

interface ChatRequest {
  messages?: ChatUIMessage[];
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

      message?: string;
    };

    return (
      parsed.error?.metadata?.raw || parsed.error?.message || parsed.message || fallbackMessage
    );
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
 * This endpoint implements a Two-Step Dispatcher Pattern:
 * 1. Intent Routing (Call 1): Identifies the user's goal (SQL gen, optimization, viz, etc.)
 * 2. Expert Delegation (Call 2): Streams the response from a specialized sub-agent.
 */
export async function POST(req: Request) {
  try {
    // Ensure user is authenticated (middleware should handle this, but double-check for safety)
    const session = (await auth()) as Session;
    if (!session?.user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", message: "Authentication required" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Extract user email from session
    const userEmail = session.user.email || undefined;

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

    // Validate clickHouseUser is provided in context and add userEmail
    const context: ServerDatabaseContext = apiRequest.context
      ? ({ ...apiRequest.context, userEmail } as ServerDatabaseContext)
      : ({ userEmail } as ServerDatabaseContext);
    if (!context.clickHouseUser || typeof context.clickHouseUser !== "string") {
      return new Response("Missing or invalid clickHouseUser in context (required string)", {
        status: 400,
      });
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
      return new Response(error instanceof Error ? error.message : String(error), { status: 500 });
    }

    // Create a stream that sends early status updates then pipes the real stream
    const responseStream = new ReadableStream({
      async start(controller) {
        const streamer = new SseStreamer(controller);
        try {
          const inputMessages = apiRequest.messages ?? [];

          // 1. Plan the intent
          const {
            agent,
            usage: plannerUsage,
            messageId,
          } = await PlanningAgent.plan(streamer, inputMessages, modelConfig);

          // Remove any plan tool parts from UI messages before converting to model messages.
          const prunedMessages = (inputMessages || []).map((m: any) => {
            const parts = Array.isArray(m.parts)
              ? m.parts.filter(
                  (p: any) => !(p.type === "dynamic-tool" && p.toolName === SERVER_TOOL_PLAN)
                )
              : m.parts;
            return { ...m, parts };
          });

          // 2. Delegate to Expert Sub-Agent
          const modelMessages = await convertToModelMessages(prunedMessages);
          const subAgentResult = await agent.stream({
            messages: modelMessages,
            modelConfig,
            context,
          });

          // 3. Convert to UI message stream
          // We use sendStart: false and sendReasoning: false because we already handled that part
          // Sub-agents all return streamText() result; assert shape for toUIMessageStream
          type SubAgentStreamResult = {
            toUIMessageStream: (opts?: object) => { getReader(): ReadableStreamDefaultReader };
          };
          const agentStream = (subAgentResult as SubAgentStreamResult).toUIMessageStream({
            originalMessages: apiRequest.messages,
            generateMessageId: () => messageId,

            // Since we start the streaming above, DISABLE the internal start message
            sendStart: false,

            //
            // Attach metadata in the message
            //
            messageMetadata: ({ part }: { part: any }) => {
              if (part.type === "finish") {
                // Only add metadata on finish events
                const subAgentUsage = part.totalUsage || {};

                return {
                  // Sum planner and agent usage together
                  usage: {
                    inputTokens:
                      (subAgentUsage.inputTokens || 0) + (plannerUsage?.inputTokens || 0),
                    outputTokens:
                      (subAgentUsage.outputTokens || 0) + (plannerUsage?.outputTokens || 0),
                    totalTokens:
                      (subAgentUsage.totalTokens || 0) + (plannerUsage?.totalTokens || 0),
                    reasoningTokens:
                      (subAgentUsage.reasoningTokens || 0) + (plannerUsage?.reasoningTokens || 0),
                    cachedInputTokens:
                      (subAgentUsage.cachedInputTokens || 0) +
                      (plannerUsage?.cachedInputTokens || 0),
                  },

                  // Track the agent that generated the response
                  // Client side can prune history message, we can use this info to find out the latest used agent
                  planner: { intent: agent.id, usage: plannerUsage } as PlannerMetadata,
                } as MessageMetadata;
              }
            },
            onError: (error: unknown) => {
              console.error("Chat error:", error);
              try {
                return extractErrorMessage(error);
              } catch (parseError) {
                console.error("Error extracting error message:", parseError);
                return "Sorry, I encountered an error. Please try again.";
              }
            },
          });

          // 5. Pipe the rest of the stream
          const reader = agentStream.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            try {
              streamer.streamObject(value);
            } catch (e) {
              // If the controller is closed (e.g. client disconnected), stop piping
              if (e instanceof TypeError && e.message.includes("closed")) {
                break;
              }
              throw e;
            }
          }
        } catch (error) {
          console.error("Chat API stream error:", error);
          const errorMsg = extractErrorMessage(error);
          try {
            streamer.streamObject({ type: "error", errorText: errorMsg });
          } catch {
            // Ignore errors if controller is already closed
          }
        } finally {
          try {
            controller.close();
          } catch {
            // Ignore errors if already closed
          }
        }
      },
    });

    return new Response(responseStream, {
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
