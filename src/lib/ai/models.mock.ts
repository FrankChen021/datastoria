import type { LanguageModel } from "ai";
import { simulateReadableStream } from "ai";

/**
 * Mock tool call responses for sequential tool execution
 */
const MOCK_TOOL_RESPONSES = {
  get_tables: {
    database: "system",
    result: [
      { database: "system", table: "metric_log", engine: "MergeTree", comment: "System metrics log" },
      { database: "system", table: "query_log", engine: "MergeTree", comment: "Query execution log" },
      { database: "system", table: "trace_log", engine: "MergeTree", comment: "Trace log" },
    ],
  },
  get_table_columns: {
    tablesAndSchemas: [{ database: "system", table: "metric_log" }],
    result: [
      { database: "system", table: "metric_log", name: "event_date", type: "Date", comment: "Event date" },
      { database: "system", table: "metric_log", name: "event_time", type: "DateTime", comment: "Event timestamp" },
      { database: "system", table: "metric_log", name: "ProfileEvent_Query", type: "UInt64", comment: "Query count metric" },
      { database: "system", table: "metric_log", name: "CurrentMetric_Query", type: "UInt64", comment: "Current query count" },
    ],
  },
  generate_sql: {
    sql: `SELECT
  toStartOfInterval(event_time, INTERVAL 60 SECOND)::INT as t,
  avg(ProfileEvent_Query) AS query_qps
FROM system.metric_log
WHERE event_date >= toDate(now() - 3600)
  AND event_time >= now() - 3600
GROUP BY t
ORDER BY t WITH FILL STEP 60`,
    notes: "Query calculates average queries per second over 1-minute intervals for the last hour",
    assumptions: ["Using ProfileEvent_Query metric for QPS calculation", "Aggregating to 60-second intervals"],
    needs_clarification: false,
    questions: [],
  },
  validate_sql: {
    valid: true,
    error: undefined,
  },
  generate_visualization: {
    type: "line",
    titleOption: {
      title: "Queries/second",
      align: "center",
    },
    width: 6,
    legendOption: {
      placement: "none",
      values: ["min", "max", "last"],
    },
    query: {
      sql: `SELECT
  toStartOfInterval(event_time, INTERVAL 60 SECOND)::INT as t,
  avg(ProfileEvent_Query) AS query_qps
FROM system.metric_log
WHERE event_date >= toDate(now() - 3600)
  AND event_time >= now() - 3600
GROUP BY t
ORDER BY t WITH FILL STEP 60`,
    },
  },
};

/**
 * Creates a mock language model that simulates LLM responses without making API calls.
 * Useful for development and testing to avoid API costs.
 * 
 * Implemented manually to avoid importing from 'ai/test' which depends on MSW/Vitest.
 */
const createMockModel = (modelName: string): LanguageModel => {
  return {
    specificationVersion: "v2",
    provider: "mock",
    modelId: modelName,
    supportedUrls: {},
    doGenerate: async () => ({
      rawCall: { rawPrompt: null, rawSettings: {} },
      finishReason: "stop",
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      content: [
        {
          type: "text",
          text: `[MOCK RESPONSE] This is a mock response from ${modelName}. \n\`\`\`sql\nSELECT version();\n\`\`\`\nIn production, this would be a real AI response. You can customize this in src/lib/ai/models.mock.ts`,
        },
      ],
      warnings: [],
    }),
    doStream: async (options: { 
      prompt?: unknown;
      tools?: unknown[];
      [key: string]: unknown;
    }) => {
      const textId = "mock-text-id";
      
      type StreamChunk = 
        | { type: "text-start"; id: string }
        | { type: "text-delta"; id: string; delta: string }
        | { type: "text-end"; id: string }
        | { type: "tool-call"; toolCallId: string; toolName: string; args: unknown }
        | { type: "finish"; finishReason: "stop" | "tool-calls"; usage: { inputTokens: number; outputTokens: number; totalTokens: number } };
      
      const chunks: StreamChunk[] = [];
      
      // Debug: Log what we receive
      console.log('🔍 Mock doStream called with options keys:', Object.keys(options || {}));
      
      // Check if tools are available in the request
      const hasTools = options?.tools && 
        Array.isArray(options.tools) && 
        options.tools.length > 0;
      
      // Determine if we should generate tool calls or final text based on conversation history
      let shouldGenerateToolCalls = hasTools;
      
      // Check the prompt to see the last message role
      const prompt = options?.prompt;
      let lastMessageRole = 'user';
      
      if (prompt && Array.isArray(prompt)) {
         const last = prompt[prompt.length - 1];
         if (last && 'role' in last) {
             lastMessageRole = last.role;
         }
      } else if (prompt && typeof prompt === 'object' && 'messages' in prompt) {
         const messages = (prompt as { messages: unknown[] }).messages;
         if (Array.isArray(messages) && messages.length > 0) {
             const last = messages[messages.length - 1] as { role?: string };
             if (last && typeof last === 'object' && 'role' in last && typeof last.role === 'string') {
                 lastMessageRole = last.role;
             }
         }
      }
      
      console.log('🔍 Mock: Last message role:', lastMessageRole);
      
      // If the last message was a tool result, we should generate the final text response
      if (lastMessageRole === 'tool') {
        shouldGenerateToolCalls = false;
      }
      
      console.log('🔍 Should simulate tools:', shouldGenerateToolCalls, 'hasTools:', hasTools);
      
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
          `[MOCK] This is a streaming mock response from ${modelName}. \n\`\`\`sql\nSELECT version();\n\`\`\`\nThe response is simulated and doesn't make real API calls. Set USE_MOCK_LLM=false in your .env to use real providers.\n` +
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
        finishReason: shouldGenerateToolCalls ? "tool-calls" : "stop",
        usage: { inputTokens: 10, outputTokens: 100, totalTokens: 110 },
      });

      return {
        stream: simulateReadableStream({
          chunkDelayInMs: 50,
          initialDelayInMs: 100,
          chunks,
        }),
        rawCall: { rawPrompt: null, rawSettings: {} },
      };
    },
  } as LanguageModel;
};

export const mockOpenAIModel: LanguageModel = createMockModel("gpt-4o");
export const mockGoogleModel: LanguageModel = createMockModel("gemini-2.5-pro");
export const mockAnthropicModel: LanguageModel = createMockModel("claude-sonnet-4-20250514");
