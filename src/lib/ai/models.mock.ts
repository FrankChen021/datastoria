import type { LanguageModel } from "ai";
import { simulateReadableStream } from "ai";

/**
 * Creates a mock language model that simulates LLM responses without making API calls.
 * Useful for development and testing to avoid API costs.
 *
 * Implemented manually to avoid importing from 'ai/test' which depends on MSW/Vitest.
 */
const createMockModel = (): LanguageModel => {
  return {
    specificationVersion: "v3",
    provider: "mock",
    modelId: "mock-model",
    supportedUrls: {},
    doGenerate: async () => ({
      content: [
        {
          type: "text",
          text: `[MOCK RESPONSE] This is a mock response. \n\`\`\`sql\nSELECT version();\n\`\`\`\nIn production, this would be a real AI response. You can customize this in src/lib/ai/models.mock.ts`,
        },
      ],
      finishReason: { unified: "stop", raw: "stop" },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 20, text: 20, reasoning: 0 },
      },
      warnings: [],
    }),
    doStream: async (options: { prompt?: unknown; tools?: unknown[]; [key: string]: unknown }) => {
      const textId = "mock-text-id";

      type StreamChunk =
        | { type: "text-start"; id: string }
        | { type: "text-delta"; id: string; delta: string }
        | { type: "text-end"; id: string }
        | { type: "tool-call"; toolCallId: string; toolName: string; args: unknown }
        | {
            type: "finish";
            finishReason: { unified: "stop" | "tool-calls"; raw: string };
            usage: {
              inputTokens: { total: number; noCache: number; cacheRead: number; cacheWrite: number };
              outputTokens: { total: number; text: number; reasoning: number };
            };
          };

      const chunks: StreamChunk[] = [];

      // Debug: Log what we receive
      console.log("🔍 Mock doStream called with options keys:", Object.keys(options || {}));

      // Check if tools are available in the request
      const hasTools = options?.tools && Array.isArray(options.tools) && options.tools.length > 0;

      // Determine if we should generate tool calls or final text based on conversation history
      let shouldGenerateToolCalls = hasTools;

      // Check the prompt to see the last message role
      const prompt = options?.prompt;
      let lastMessageRole = "user";

      if (prompt && Array.isArray(prompt)) {
        const last = prompt[prompt.length - 1];
        if (last && "role" in last) {
          lastMessageRole = last.role;
        }
      } else if (prompt && typeof prompt === "object" && "messages" in prompt) {
        const messages = (prompt as { messages: unknown[] }).messages;
        if (Array.isArray(messages) && messages.length > 0) {
          const last = messages[messages.length - 1] as { role?: string };
          if (last && typeof last === "object" && "role" in last && typeof last.role === "string") {
            lastMessageRole = last.role;
          }
        }
      }

      console.log("🔍 Mock: Last message role:", lastMessageRole);

      // If the last message was a tool result, we should generate the final text response
      if (lastMessageRole === "tool") {
        shouldGenerateToolCalls = false;
      }

      console.log("🔍 Should simulate tools:", shouldGenerateToolCalls, "hasTools:", hasTools);

      if (shouldGenerateToolCalls) {
        // Simulate sequential tool calling
        // NOTE: We only return tool-call chunks here. The AI SDK's streamText function
        // will execute the tools and generate tool-result chunks automatically.
        const toolCallSequence = [
          // Simplified for debugging: Only call generate_sql
          { name: "generate_sql", args: { userQuestion: "Show queries per second", schemaHints: {} } },
        ];

        // Add tool call chunks (AI SDK will handle execution and results)
        for (const toolCall of toolCallSequence) {
          const toolCallId = `call_${Math.random().toString(36).substring(2, 9)}`;

          // Send atomic tool-call chunk with object args
          // We use object args because Zod validation expects object.
          // We use finishReason: "tool-calls" to signal tool execution.
          chunks.push({
            type: "tool-call",
            toolCallId,
            toolName: toolCall.name,
            args: toolCall.args,
          });
        }
      } else if (hasTools) {
        // Generate final text response for tool flow (after tools have run)
        chunks.push({ id: textId, type: "text-start" });
        const finalText = "Here's the query performance visualization based on the system metrics.";
        const words = finalText.split(" ");
        for (const word of words) {
          chunks.push({
            id: textId,
            type: "text-delta",
            delta: word + " ",
          });
        }
        chunks.push({ id: textId, type: "text-end" });
      } else {
        // Regular chat response (no tools available)
        const mockText =
          `[MOCK] This is a streaming mock response. \n\`\`\`sql\nSELECT version();\n\`\`\`\nThe response is simulated and doesn't make real API calls. Set USE_MOCK_LLM=false in your .env to use real providers.\n` +
          " mock_token".repeat(Math.floor(Math.random() * 200) + 50);

        const words = mockText.split(" ");

        chunks.push({ id: textId, type: "text-start" });
        for (const word of words) {
          chunks.push({
            id: textId,
            type: "text-delta",
            delta: word + " ",
          });
        }
        chunks.push({ id: textId, type: "text-end" });
      }

      // Add finish chunk
      chunks.push({
        type: "finish",
        finishReason: {
          unified: shouldGenerateToolCalls ? "tool-calls" : "stop",
          raw: shouldGenerateToolCalls ? "tool-calls" : "stop",
        },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 100, text: 100, reasoning: 0 },
        },
      });

      return {
        stream: simulateReadableStream({
          chunkDelayInMs: 50,
          initialDelayInMs: 100,
          chunks,
        }),
      };
    },
  } as LanguageModel;
};

export const mockModel: LanguageModel = createMockModel();
