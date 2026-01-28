import { auth } from "@/auth";
import type { DatabaseContext } from "@/components/chat/chat-context";
import {
  callPlanAgent,
  SERVER_TOOL_PLAN,
  SUB_AGENTS,
  type InputModel,
  type Intent,
  type IntentMetadata,
  type SubAgent,
} from "@/lib/ai/agent/planner-agent";
import type { ServerDatabaseContext, TokenUsage } from "@/lib/ai/common-types";
import { LanguageModelProviderFactory } from "@/lib/ai/llm/llm-provider-factory";
import { APICallError } from "@ai-sdk/provider";
import { convertToModelMessages, RetryError, type ModelMessage, type UIMessage } from "ai";
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
 * This endpoint implements a Two-Step Dispatcher Pattern:
 * 1. Intent Routing (Call 1): Identifies the user's goal (SQL gen, optimization, viz, etc.)
 * 2. Expert Delegation (Call 2): Streams the response from a specialized sub-agent.
 */
export async function POST(req: Request) {
  try {
    // Ensure user is authenticated (middleware should handle this, but double-check for safety)
    const session = await auth();
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
      ? { ...apiRequest.context, userEmail }
      : { userEmail };
    if (!context.clickHouseUser || typeof context.clickHouseUser !== "string") {
      return new Response("Missing or invalid clickHouseUser in context (required string)", {
        status: 400,
      });
    }

    // 2. Convert UIMessages to ModelMessages (CoreMessage[]) early
    // This is needed for identifyIntent and determining if it's a continuation
    const modelMessages = await convertToModelMessages(apiRequest.messages as any[]);
    // Detect continuation: if the last message is a tool result
    const isContinuation =
      modelMessages.length > 0 && modelMessages[modelMessages.length - 1].role === "tool";

    // IMPORTANT: If this is a continuation (tool result), we MUST reuse the previous assistant's message ID.
    // This ensures the turnaround is attributed to the same message turn in the UI and history.
    const rawMessages = apiRequest.messages as any[];
    const lastAssistant = [...rawMessages].reverse().find((m) => m.role === "assistant");
    const messageId = isContinuation && lastAssistant?.id ? lastAssistant.id : uuidv7();

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

    const encoder = new TextEncoder();

    // Create a stream that sends early status updates then pipes the real stream
    const responseStream = new ReadableStream({
      async start(controller) {
        let agent: SubAgent;
        let routerUsage: TokenUsage | undefined;

        try {
          if (isContinuation) {
            // 1. Skip Thinking UI for continuations but still send start event
            const messageStart = JSON.stringify({ type: "start", messageId });
            controller.enqueue(encoder.encode(`data: ${messageStart}\n\n`));

            // Find the latest identify_intent tool call from getIntent
            // Search backwards through messages to find the most recent identify_intent tool result
            let foundIntent: Intent | undefined;

            for (let i = modelMessages.length - 1; i >= 0; i--) {
              const msg = modelMessages[i];
              if (msg.role === "tool") {
                // Handle both array and single tool message formats
                const toolParts = Array.isArray(msg.content) ? msg.content : [msg.content];
                for (const toolPart of toolParts) {
                  const toolMsg = toolPart as {
                    type?: string;
                    toolName?: string;
                    toolCallId?: string;
                    output?: { type?: string; value?: unknown } | unknown;
                    result?: unknown;
                    content?: unknown;
                  };

                  // Check if this is an identify_intent tool call
                  if (
                    toolMsg.toolName === SERVER_TOOL_PLAN ||
                    toolMsg.toolCallId?.startsWith("router-")
                  ) {
                    // Extract output - handle different formats
                    let output: { intent?: string; usage?: TokenUsage } | undefined;

                    if (toolMsg.output) {
                      // AI SDK format: output can be { type: "json", value: {...} } or just the value
                      if (
                        typeof toolMsg.output === "object" &&
                        "type" in toolMsg.output &&
                        "value" in toolMsg.output
                      ) {
                        output = toolMsg.output.value as {
                          intent?: string;
                          usage?: TokenUsage;
                        };
                      } else {
                        output = toolMsg.output as { intent?: string; usage?: TokenUsage };
                      }
                    } else if (toolMsg.result) {
                      output = toolMsg.result as { intent?: string; usage?: TokenUsage };
                    } else if (toolMsg.content) {
                      // Try parsing content if it's a string
                      if (typeof toolMsg.content === "string") {
                        try {
                          output = JSON.parse(toolMsg.content) as {
                            intent?: string;
                            usage?: TokenUsage;
                          };
                        } catch {
                          // Ignore parse errors
                        }
                      } else {
                        output = toolMsg.content as { intent?: string; usage?: TokenUsage };
                      }
                    }

                    if (output?.intent) {
                      foundIntent = output.intent as Intent;
                      break;
                    }
                  }
                }
                if (foundIntent) break;
              }
            }

            // Fallback to general agent if intent not found
            if (!foundIntent) {
              foundIntent = "general";
            }

            agent = SUB_AGENTS[foundIntent] || SUB_AGENTS.general;
          } else {
            // 1. Send start events
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: "start", messageId })}\n\n`)
            );

            const result = await doPlan(controller, encoder, messageId, modelMessages, modelConfig);
            agent = result.agent;
            routerUsage = result.usage;
          }

          // 2. Delegate to Expert Sub-Agent
          // The selected agent (returned from getIntent) now takes over the conversation turn.
          const subAgentResult = await agent.stream({
            messages: modelMessages,
            modelConfig,
            context,
          });

          // 4. Convert to UI message stream
          // We use sendStart: false and sendReasoning: false because we already handled that part
          const stream = subAgentResult.toUIMessageStream({
            originalMessages: apiRequest.messages,
            generateMessageId: () => messageId,
            sendStart: false,
            // Extract message metadata (usage) and send it to the client
            messageMetadata: ({ part }: { part: any }) => {
              // Only add metadata on finish events
              if (part.type === "finish") {
                // Combine router usage (from identifyIntent) with sub-agent usage
                const subAgentUsage = part.totalUsage || {};
                return {
                  // Sum router and agent usage together
                  usage: {
                    inputTokens: (subAgentUsage.inputTokens || 0) + (routerUsage?.inputTokens || 0),
                    outputTokens:
                      (subAgentUsage.outputTokens || 0) + (routerUsage?.outputTokens || 0),
                    totalTokens: (subAgentUsage.totalTokens || 0) + (routerUsage?.totalTokens || 0),
                    reasoningTokens:
                      (subAgentUsage.reasoningTokens || 0) + (routerUsage?.reasoningTokens || 0),
                    cachedInputTokens:
                      (subAgentUsage.cachedInputTokens || 0) +
                      (routerUsage?.cachedInputTokens || 0),
                  },

                  // Track router usage separately for debugging purpose
                  routerUsage: routerUsage,

                  // Track the agent that generated the response
                  // Client side can prune history message, we can use this info to find out the latest used agent
                  intent: { intent: agent.id } as IntentMetadata,
                };
              }
            },
            onError: (error: any) => {
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
          const reader = stream.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(value)}\n\n`));
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
          const errorChunk = JSON.stringify({ type: "error", errorText: errorMsg });

          try {
            controller.enqueue(encoder.encode(`data: ${errorChunk}\n\n`));
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

/**
 * The output that will be sent to client side
 */
export interface PlanOutput {
  intent: Intent;
  title: string | undefined;
  usage: TokenUsage | undefined;
}

/**
 * Helper to handle the "Thinking" phase of the request.
 * Performs the first LLM call to identify intent and streams reasoning status to the client.
 */
async function doPlan(
  controller: ReadableStreamDefaultController<any>,
  encoder: TextEncoder,
  messageId: string,
  messages: ModelMessage[],
  modelConfig: InputModel
): Promise<{ intent: Intent; agent: any; usage?: TokenUsage }> {
  // The length MUST be <= 40
  const toolCallId = `router-${uuidv7().replace(/-/g, "")}`;

  // 2. Send simulated tool call start
  controller.enqueue(
    encoder.encode(
      `data: ${JSON.stringify({
        type: "tool-input-available",
        toolCallId,
        toolName: SERVER_TOOL_PLAN,
        input: {},
        dynamic: true,
      })}\n\n`
    )
  );

  // 3. Identify Intent (this performs the FIRST LLM call)
  const { intent, title, agent, usage, reasoning } = await callPlanAgent(messages, modelConfig);

  // 4. Send tool call result with metadata
  controller.enqueue(
    encoder.encode(
      `data: ${JSON.stringify({
        type: "tool-output-available",
        toolCallId,
        output: {
          intent,
          title: title || undefined,
          usage: usage || undefined,
          reasoning: reasoning || undefined,
        } as PlanOutput,
        dynamic: true,
      })}\n\n`
    )
  );

  return { intent, agent, usage };
}
