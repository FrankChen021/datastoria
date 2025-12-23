import { generateSqlTool, generateVisualizationTool } from "@/lib/ai/server-tools";
import { tools as clientTools, CLIENT_TOOL_NAMES } from "@/lib/ai/client-tools";
import { getLanguageModel } from "@/lib/ai/provider";
import { buildSystemPrompt } from "@/lib/ai/system-prompt";
import type { ChatContext } from "@/lib/chat/types";
import { streamText, convertToModelMessages } from "ai";
import { v7 as uuidv7 } from "uuid";

// Force dynamic rendering (no static generation)
export const dynamic = "force-dynamic";

// Increase body size limit for this route to handle large tool results
// This is needed when get_table_columns returns 1500+ columns (e.g., system.metric_log)
export const maxDuration = 60; // 60 seconds timeout

/**
 * POST /api/chat-agent
 *
 * New agent-based chat endpoint with orchestrator + sub-agents
 * The original /api/chat endpoint is kept for debugging purposes
 *
 * This endpoint uses the Agent API to coordinate:
 * 1. SQL generation (via generate_sql tool → SQL sub-agent)
 * 2. SQL execution (via run_sql tool → client-side)
 * 3. Visualization planning (via generate_visualization tool → viz sub-agent)
 */
export async function POST(req: Request) {
  try {
    // Parse request body with size validation
    let body: { messages?: unknown[]; chatId?: string; id?: string; context?: ChatContext; body?: { context?: ChatContext } };
    try {
      const text = await req.text();
      const sizeInMB = (text.length / 1024 / 1024).toFixed(2);
      console.log(`📦 Request body size: ${sizeInMB}MB`);
      
      if (text.length > 10 * 1024 * 1024) { // 10MB limit
        console.error(`❌ Request body too large: ${sizeInMB}MB (limit: 10MB)`);
        return new Response("Request body too large. Please reduce the amount of data being sent.", { 
          status: 413,
          headers: { "Content-Type": "text/plain" }
        });
      }
      
      body = JSON.parse(text) as typeof body;
    } catch (error) {
      console.error("Failed to parse request body:", error);
      return new Response("Invalid JSON in request body", { status: 400 });
    }

    let chatId: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let messages: any[];
    let context: ChatContext | undefined;

    // Handle different request formats (same as original /api/chat)
    if (Array.isArray(body.messages)) {
      messages = body.messages;
      chatId = body.chatId || body.id || "default-chat";
      context = body.context || body.body?.context;
    } else if (body.chatId && body.messages) {
      ({ chatId, messages, context } = body);
    } else {
      console.error("Unrecognized request format:", Object.keys(body));
      return new Response("Invalid request format", { status: 400 });
    }

    if (!chatId) {
      return new Response("Missing chatId", { status: 400 });
    }

    if (!messages || messages.length === 0) {
      return new Response("Missing messages", { status: 400 });
    }

    // Get the appropriate model (mock or real based on USE_MOCK_LLM env var)
    let model;
    try {
      model = getLanguageModel();
    } catch (error) {
      return new Response(
        error instanceof Error
          ? error.message
          : "No AI API key configured. Set OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, or ANTHROPIC_API_KEY",
        { status: 500 }
      );
    }

    // Build orchestrator system prompt
    const baseSystemPrompt = buildSystemPrompt(context);

    const orchestratorPrompt = `${baseSystemPrompt}
## ClickHouse Orchestrator (Tool-Routing Contract)

You route requests to tools and MUST follow these rules.

### Tools
- generate_sql: generates ClickHouse SQL. This tool performs its own multi-turn logic for schema discovery and validation.
- execute_sql: execute ClickHouse query to fetch data.
- generate_visualization: produce a visualization plan (based on SQL and intent).
- get_tables: list tables.
- get_table_columns: list columns. **IMPORTANT**: When calling this tool, always split fully qualified table names (e.g., "system.metric_log") into separate database and table fields: {database: "system", table: "metric_log"}.

### Routing (STRICT)
1) Visualization intent (any of: "visualize", "chart", "plot", "graph", "time series", "trend", "over time")
   → MUST call generate_visualization.
2) Schema questions
   → get_tables / get_table_columns (no SQL execution unless asked).
3) Data results requests (e.g., "show me", "list", "what are")
   → **WORKFLOW**:
      a) If schema info needed: call get_table_columns or get_tables
      b) Once you have schema: call generate_sql with the schema context
      c) If generate_sql returns 'needs_clarification' with "validating SQL syntax":
         → Call validate_sql with the SQL being validated
      d) After validation passes: call execute_sql
      e) If visualization requested: call generate_visualization

### Constraints (MANDATORY)
- **Schema Discovery**: YOU handle schema discovery (get_tables, get_table_columns).
- **SQL Generation**: Call generate_sql ONLY after you have the necessary schema context.
- **Validation Support**: If generate_sql needs validation, YOU call validate_sql and pass results back.
- **SQL Execution**: Only execute SQL after successful validation.
- **Visualization Integration**: Call generate_visualization ONLY when SQL is available.
- You MUST NOT describe a visualization without calling generate_visualization.
- If a SQL query is present in context, reuse it (do NOT call generate_sql).
- generate_visualization should be called with the SQL string, NOT wait for execute_sql results.

### Final response format
- Brief explanation of what was run in markdown format.
- Results summary (if executed) in markdown format.
- DO NOT repeat or explain the visualization plan if generate_visualization was called. The UI will render it automatically.

### Self-check
Before final answer: if user asked for visualization and generate_visualization was not called → call generate_visualization.
`;

    // Convert UIMessages to ModelMessages
    const modelMessages = convertToModelMessages(messages);
    
    // Log the messages being sent to the LLM for debugging
    console.log(`🔍 Sending ${modelMessages.length} messages to LLM`);
    if (modelMessages.length > 0) {
      const lastMsg = modelMessages[modelMessages.length - 1];
      console.log(`📝 Last message role: ${lastMsg.role}, parts: ${JSON.stringify(lastMsg).substring(0, 200)}...`);
    }

    // Note: We're NOT extracting history for generate_sql anymore
    // The orchestrator will handle tool calls directly, and the conversation
    // context in modelMessages already contains all the tool results
    // This avoids the complex nested tool calling scenario

    // Use streamText with all tools (both server-side and client-side)
    const result = streamText({
      model,
      messages: [
        {
          role: "system",
          content: orchestratorPrompt,
        },
        ...modelMessages,
      ],
      tools: {
        // Server-side tools
        [CLIENT_TOOL_NAMES.GENERATE_SQL]: generateSqlTool,
        [CLIENT_TOOL_NAMES.GENEREATE_VISUALIZATION]: generateVisualizationTool,
        // Client-side tools (no execute function)
        [CLIENT_TOOL_NAMES.GET_TABLES]: clientTools.get_tables,
        [CLIENT_TOOL_NAMES.GET_TABLE_COLUMNS]: clientTools.get_table_columns,
        [CLIENT_TOOL_NAMES.VALIDATE_SQL]: clientTools.validate_sql,
        [CLIENT_TOOL_NAMES.EXECUTE_SQL]: clientTools.execute_sql,
      },
    });

    // Convert to UI message stream (same format as original API)
    const stream = result.toUIMessageStream({
      originalMessages: messages,
      generateMessageId: () => uuidv7(),
      // Extract message metadata (usage) and send it to the client
    //   messageMetadata: async ({ part }) => {
    //     // Only add metadata on finish events
    //     if (part.type === "finish") {
    //       return {
    //         usage: part.totalUsage,
    //       };
    //     }
    //   },
      onFinish: async () => {
        // Stream completed successfully
      },
      onError: (error) => {
        console.error("Agent error:", error);
        return "Sorry, I encountered an error. Please try again.";
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
    console.error("Chat agent API error:", error);
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
